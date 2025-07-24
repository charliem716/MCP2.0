/**
 * Event Cache Manager
 * 
 * Manages time-series event storage for Change Groups, enabling historical
 * queries and pattern analysis across Q-SYS control changes.
 */

import { EventEmitter } from 'events';
import { CircularBuffer } from './circular-buffer.js';
import type { QRWCClientAdapter } from '../../qrwc/adapter.js';
import { globalLogger as logger } from '../../../shared/utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { isSpilledEventFile, type ChangeGroupEvent, type ControlChange, type SpilledEventFile } from './types.js';
import { 
  isEventType, 
  isSerializedCachedEvent, 
  getMapValue,
  type ControlValue, 
  type EventType, 
  type SerializedCachedEvent
} from './event-types.js';

/**
 * Cached event with full metadata
 */
export interface CachedEvent {
  groupId: string;
  controlName: string;
  timestamp: bigint;
  timestampMs: number;
  value: ControlValue;
  string: string;
  previousValue?: ControlValue;
  previousString?: string;
  delta?: number;
  duration?: number;
  sequenceNumber: number;
  eventType?: EventType;
  threshold?: number;
}

/**
 * Query parameters for historical event searches
 */
export interface EventQuery {
  groupId?: string;
  startTime?: number;
  endTime?: number;
  controlNames?: string[];
  valueFilter?: {
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'changed_to' | 'changed_from';
    value?: ControlValue;
  };
  limit?: number;
  offset?: number;
  aggregation?: 'raw' | 'changes_only' | 'summary';
  eventTypes?: Array<'change' | 'threshold_crossed' | 'state_transition' | 'significant_change'>;
}

/**
 * Statistics for a change group's event cache
 */
export interface CacheStatistics {
  eventCount: number;
  oldestEvent?: number;
  newestEvent?: number;
  memoryUsage: number;
  controlsTracked: number;
  eventsPerSecond: number;
}

/**
 * Buffer information for memory management
 */
interface BufferInfo {
  groupId: string;
  memory: number;
  priority: 'low' | 'normal' | 'high';
}

/**
 * Spillover file data
 */
interface SpilloverFileData {
  groupId: string;
  filename: string;
  filepath: string;
  data: {
    groupId: string;
    timestamp: number;
    eventCount: number;
    startTime: number;
    endTime: number;
    events: Array<Omit<CachedEvent, 'timestamp'> & { timestamp: string }>;
  };
  eventCount: number;
}

/**
 * Configuration for event cache
 */
export interface EventCacheConfig {
  maxEvents: number;
  maxAgeMs: number;
  compressOldEvents?: boolean;
  persistToDisk?: boolean;
  cleanupIntervalMs?: number;
  globalMemoryLimitMB?: number;
  memoryCheckIntervalMs?: number;
  compressionConfig?: {
    enabled: boolean;
    checkIntervalMs?: number;
    recentWindowMs?: number;     
    mediumWindowMs?: number;     
    ancientWindowMs?: number;    
    significantChangePercent?: number;
    minTimeBetweenEventsMs?: number;
  };
  diskSpilloverConfig?: {
    enabled: boolean;
    directory?: string;
    thresholdMB?: number;
    maxFileSizeMB?: number;
  };
}

/**
 * Manages event caching for all change groups
 */
export class EventCacheManager extends EventEmitter {
  private buffers: Map<string, CircularBuffer<CachedEvent>>;
  private globalSequence = 0;
  private lastValues: Map<string, Map<string, ControlValue>>;
  private lastEventTimes: Map<string, Map<string, number>>;
  private eventRates: Map<string, number[]>;
  private isAttached = false;
  private cleanupInterval?: NodeJS.Timeout | undefined;
  private memoryCheckInterval?: NodeJS.Timeout | undefined;
  private compressionInterval?: NodeJS.Timeout | undefined;
  private globalMemoryLimitBytes: number;
  private lastMemoryPressure = 0;
  private groupPriorities: Map<string, 'high' | 'normal' | 'low'>;
  private compressionStats: Map<string, { original: number; compressed: number; lastRun: number }>;
  private diskSpilloverActive = false;
  
  constructor(
    private defaultConfig: EventCacheConfig = {
      maxEvents: 100000,
      maxAgeMs: 3600000 // 1 hour
    }
  ) {
    super();
    this.buffers = new Map();
    this.lastValues = new Map();
    this.lastEventTimes = new Map();
    this.eventRates = new Map();
    this.groupPriorities = new Map();
    this.compressionStats = new Map();
    this.globalMemoryLimitBytes = (this.defaultConfig.globalMemoryLimitMB ?? 500) * 1024 * 1024;
    
    // Apply default compression config
    this.defaultConfig.compressionConfig ??= {
        enabled: false,
        checkIntervalMs: 60000, // 1 minute
        recentWindowMs: 60000,  // 1 minute
        mediumWindowMs: 600000, // 10 minutes
        ancientWindowMs: 3600000, // 1 hour
        significantChangePercent: 5,
        minTimeBetweenEventsMs: 100
      };
    
    // Apply default disk spillover config
    this.defaultConfig.diskSpilloverConfig ??= {
        enabled: false,
        directory: './event-cache-spillover',
        thresholdMB: 400,  // Start spillover at 400MB
        maxFileSizeMB: 50
      };
    
    logger.info('EventCacheManager initialized', {
      maxEvents: this.defaultConfig.maxEvents,
      maxAgeMs: this.defaultConfig.maxAgeMs,
      globalMemoryLimitMB: this.defaultConfig.globalMemoryLimitMB ?? 500,
      compressionEnabled: this.defaultConfig.compressionConfig.enabled,
      diskSpilloverEnabled: this.defaultConfig.diskSpilloverConfig.enabled
    });
    
    // Start background cleanup timer if maxAge is configured
    if (this.defaultConfig.maxAgeMs && this.defaultConfig.maxAgeMs > 0) {
      this.startCleanupTimer();
    }
    
    // Start memory monitoring
    this.startMemoryMonitoring();
    
    // Start compression if enabled
    if (this.defaultConfig.compressionConfig.enabled) {
      this.startCompressionTimer();
    }
  }
  
  /**
   * Attach to a QRWC adapter to listen for change events
   */
  attachToAdapter(adapter: Pick<QRWCClientAdapter, 'on' | 'removeListener'>): void {
    if (this.isAttached) {
      logger.warn('EventCacheManager already attached to adapter');
      return;
    }
    
    adapter.on('changeGroup:changes', (event: ChangeGroupEvent) => {
      this.handleChangeEvent(event);
    });
    
    this.isAttached = true;
    logger.info('EventCacheManager attached to QRWCClientAdapter');
  }
  
  /**
   * Handle incoming change event from adapter
   */
  private handleChangeEvent(event: ChangeGroupEvent): void {
    const { groupId, changes, timestamp, timestampMs } = event;
    
    logger.debug('Processing change event', {
      groupId,
      changeCount: changes.length,
      timestampMs
    });
    
    this.ensureGroupBufferExists(groupId);
    const processedEvents = this.processChanges(groupId, changes, timestamp, timestampMs);
    this.finalizeChangeProcessing(groupId, processedEvents.length);
  }
  
  /**
   * Ensure buffer exists for a group
   */
  private ensureGroupBufferExists(groupId: string): void {
    if (!this.buffers.has(groupId)) {
      this.createBuffer(groupId);
    }
  }
  
  /**
   * Process individual changes and store events
   */
  private processChanges(
    groupId: string,
    changes: ControlChange[],
    timestamp: bigint,
    timestampMs: number
  ): CachedEvent[] {
    const buffer = this.buffers.get(groupId);
    if (!buffer) {
      logger.error('Buffer not found for groupId', { groupId });
      return [];
    }
    
    const groupLastValues = this.lastValues.get(groupId) ?? new Map<string, ControlValue>();
    const groupLastTimes = this.lastEventTimes.get(groupId) ?? new Map<string, number>();
    const processedEvents: CachedEvent[] = [];
    
    for (const change of changes) {
      const cachedEvent = this.createCachedEvent({
        groupId, change, timestamp, timestampMs,
        lastValues: groupLastValues, 
        lastTimes: groupLastTimes
      });
      
      buffer.add(cachedEvent, timestamp);
      groupLastValues.set(change.Name, change.Value);
      groupLastTimes.set(change.Name, timestampMs);
      processedEvents.push(cachedEvent);
    }
    
    this.lastValues.set(groupId, groupLastValues);
    this.lastEventTimes.set(groupId, groupLastTimes);
    
    return processedEvents;
  }
  
  /**
   * Create a cached event from a control change
   */
  private createCachedEvent(params: {
    groupId: string;
    change: ControlChange;
    timestamp: bigint;
    timestampMs: number;
    lastValues: Map<string, ControlValue>;
    lastTimes: Map<string, number>;
  }): CachedEvent {
    const { groupId, change, timestamp, timestampMs, lastValues, lastTimes } = params;
    const previousValue = getMapValue(lastValues, change.Name);
    const previousTime = getMapValue(lastTimes, change.Name);
    const eventType = this.detectEventType(change.Name, previousValue, change.Value);
    
    return {
      groupId,
      controlName: change.Name,
      timestamp,
      timestampMs,
      value: change.Value,
      string: change.String ?? String(change.Value),
      previousValue,
      previousString: previousValue !== undefined && previousValue !== null ? String(previousValue) : undefined,
      delta: this.calculateDelta(previousValue, change.Value),
      duration: previousTime ? timestampMs - previousTime : undefined,
      sequenceNumber: this.globalSequence++,
      eventType,
      threshold: eventType === 'threshold_crossed' 
        ? this.findCrossedThreshold(change.Name, previousValue, change.Value)
        : undefined
    };
  }
  
  /**
   * Finalize change processing with notifications and checks
   */
  private finalizeChangeProcessing(groupId: string, changeCount: number): void {
    this.updateEventRate(groupId, changeCount);
    
    const buffer = this.buffers.get(groupId);
    if (buffer) {
      this.emit('eventsStored', { 
        groupId, 
        count: changeCount,
        totalEvents: buffer.getSize()
      });
    }
    
    this.scheduleMemoryCheck();
  }
  
  /**
   * Schedule memory pressure check if needed
   */
  private scheduleMemoryCheck(): void {
    if (!this.defaultConfig.memoryCheckIntervalMs) return;
    
    const usage = this.getGlobalMemoryUsage();
    if (usage > this.globalMemoryLimitBytes) {
      setImmediate(() => void this.checkMemoryPressure());
    }
  }
  
  /**
   * Create a new buffer for a change group
   */
  private createBuffer(groupId: string): void {
    const buffer = new CircularBuffer<CachedEvent>(
      this.defaultConfig.maxEvents,
      this.defaultConfig.maxAgeMs
    );
    
    this.buffers.set(groupId, buffer);
    this.lastValues.set(groupId, new Map());
    this.lastEventTimes.set(groupId, new Map());
    this.eventRates.set(groupId, []);
    
    logger.info('Created event buffer for change group', { groupId });
  }
  
  /**
   * Calculate numeric delta between values
   */
  private calculateDelta(previousValue: ControlValue | undefined, currentValue: ControlValue): number | undefined {
    if (typeof previousValue === 'number' && typeof currentValue === 'number') {
      return currentValue - previousValue;
    }
    return undefined;
  }
  
  /**
   * Detect event type based on value changes
   */
  private detectEventType(
    controlName: string,
    previousValue: ControlValue | undefined,
    currentValue: ControlValue
  ): EventType | undefined {
    if (previousValue === undefined) {
      return 'change';
    }
    
    if (this.isStateTransition(previousValue, currentValue)) {
      return 'state_transition';
    }
    
    const numericEventType = this.detectNumericEventType(controlName, previousValue, currentValue);
    if (numericEventType) {
      return numericEventType;
    }
    
    return 'change';
  }
  
  /**
   * Check if value change is a state transition
   */
  private isStateTransition(previousValue: ControlValue, currentValue: ControlValue): boolean {
    // Boolean or string state change
    if (typeof currentValue === 'boolean' || typeof currentValue === 'string') {
      return previousValue !== currentValue;
    }
    
    // Binary numeric state (0/1)
    if (typeof previousValue === 'number' && typeof currentValue === 'number') {
      return this.isBinaryStateChange(previousValue, currentValue);
    }
    
    return false;
  }
  
  /**
   * Check for binary state change (0/1)
   */
  private isBinaryStateChange(prev: number, curr: number): boolean {
    return (prev === 0 || prev === 1) && 
           (curr === 0 || curr === 1) && 
           prev !== curr;
  }
  
  /**
   * Detect numeric-specific event types
   */
  private detectNumericEventType(
    controlName: string,
    previousValue: ControlValue,
    currentValue: ControlValue
  ): EventType | undefined {
    if (typeof previousValue !== 'number' || typeof currentValue !== 'number') {
      return undefined;
    }
    
    // Check threshold crossing
    const threshold = this.findCrossedThreshold(controlName, previousValue, currentValue);
    if (threshold !== undefined) {
      return 'threshold_crossed';
    }
    
    // Check significant change
    if (this.isSignificantChange(previousValue, currentValue)) {
      return 'significant_change';
    }
    
    return undefined;
  }
  
  /**
   * Check if numeric change is significant (5% threshold)
   */
  private isSignificantChange(previousValue: number, currentValue: number): boolean {
    if (previousValue === 0) {
      return currentValue !== 0;
    }
    
    const changePercent = Math.abs((currentValue - previousValue) / previousValue) * 100;
    return changePercent >= 5;
  }
  
  /**
   * Find if a threshold was crossed
   */
  private findCrossedThreshold(
    controlName: string,
    previousValue: ControlValue | undefined,
    currentValue: ControlValue
  ): number | undefined {
    if (typeof previousValue !== 'number' || typeof currentValue !== 'number') {
      return undefined;
    }
    
    // Common audio thresholds for level controls
    const thresholds = controlName.toLowerCase().includes('level') 
      ? [-20, -12, -6, -3, 0, 3, 6]
      : [0, 0.25, 0.5, 0.75, 1.0];
    
    // Check each threshold
    for (const threshold of thresholds) {
      const crossedUp = previousValue < threshold && currentValue >= threshold;
      const crossedDown = previousValue > threshold && currentValue <= threshold;
      
      if (crossedUp || crossedDown) {
        return threshold;
      }
    }
    
    return undefined;
  }
  
  /**
   * Update event rate tracking
   */
  private updateEventRate(groupId: string, eventCount: number): void {
    const rates = this.eventRates.get(groupId) ?? [];
    
    // Add current rate (events per second)
    rates.push(eventCount);
    
    // Keep only last 60 samples (1 minute at 1Hz)
    if (rates.length > 60) {
      rates.shift();
    }
    
    this.eventRates.set(groupId, rates);
  }
  
  /**
   * Query historical events
   */
  async query(params: EventQuery): Promise<CachedEvent[]> {
    const queryParams = this.normalizeQueryParams(params);
    this.logQueryStart(queryParams);
    
    // Collect events from memory and disk
    const memoryEvents = this.queryMemoryBuffers(queryParams);
    const diskEvents = await this.queryDiskStorage(queryParams);
    
    // Combine and process results
    let results = [...memoryEvents, ...diskEvents];
    results = this.sortEventsByTimestamp(results);
    results = this.applyAggregation(results, queryParams.aggregation);
    results = this.applyPagination(results, queryParams.offset, queryParams.limit);
    
    this.logQueryComplete(results, queryParams);
    return results;
  }
  
  /**
   * Normalize query parameters with defaults
   */
  private normalizeQueryParams(params: EventQuery): Required<EventQuery> {
    return {
      groupId: params.groupId,
      startTime: params.startTime ?? Date.now() - 60000,
      endTime: params.endTime ?? Date.now(),
      controlNames: params.controlNames ?? [],
      valueFilter: params.valueFilter,
      limit: params.limit ?? 1000,
      offset: params.offset ?? 0,
      aggregation: params.aggregation ?? 'raw',
      eventTypes: params.eventTypes ?? []
    };
  }
  
  /**
   * Log query start for debugging
   */
  private logQueryStart(params: Required<EventQuery>): void {
    logger.debug('Querying event cache', {
      groupId: params.groupId,
      startTime: new Date(params.startTime).toISOString(),
      endTime: new Date(params.endTime).toISOString(),
      controlNames: params.controlNames,
      valueFilter: params.valueFilter,
      limit: params.limit,
      offset: params.offset
    });
  }
  
  /**
   * Query events from memory buffers
   */
  private queryMemoryBuffers(params: Required<EventQuery>): CachedEvent[] {
    const buffers = this.getBuffersToQuery(params.groupId);
    if (buffers.length === 0) {
      logger.warn('No buffers found for query', { groupId: params.groupId });
      return [];
    }
    
    const results: CachedEvent[] = [];
    const startTimeNs = BigInt(params.startTime) * 1000000n;
    const endTimeNs = BigInt(params.endTime) * 1000000n;
    
    for (const buffer of buffers) {
      const events = buffer.queryTimeRange(startTimeNs, endTimeNs);
      const filtered = this.applyEventFilters(events, params);
      results.push(...filtered);
    }
    
    return results;
  }
  
  /**
   * Get buffers to query based on groupId
   */
  private getBuffersToQuery(groupId?: string): Array<CircularBuffer<CachedEvent>> {
    if (groupId) {
      const buffer = this.buffers.get(groupId);
      return buffer ? [buffer] : [];
    }
    return Array.from(this.buffers.values());
  }
  
  /**
   * Query events from disk storage
   */
  private async queryDiskStorage(params: Required<EventQuery>): Promise<CachedEvent[]> {
    if (!this.defaultConfig.diskSpilloverConfig?.enabled) {
      return [];
    }
    
    const results: CachedEvent[] = [];
    const groupsToCheck = params.groupId ? [params.groupId] : this.getGroupIds();
    
    for (const gid of groupsToCheck) {
      const diskEvents = await this.loadFromDisk(gid, params.startTime, params.endTime);
      const filtered = this.applyEventFilters(diskEvents, params);
      results.push(...filtered);
    }
    
    return results;
  }
  
  /**
   * Apply all filters to events
   */
  private applyEventFilters(events: CachedEvent[], params: Required<EventQuery>): CachedEvent[] {
    let filtered = events;
    
    if (params.controlNames.length > 0) {
      filtered = filtered.filter(e => params.controlNames.includes(e.controlName));
    }
    
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (params.valueFilter) {
      filtered = this.applyValueFilter(filtered, params.valueFilter);
    }
    
    if (params.eventTypes.length > 0) {
      filtered = filtered.filter(e => e.eventType && params.eventTypes.includes(e.eventType));
    }
    
    return filtered;
  }
  
  /**
   * Sort events by timestamp
   */
  private sortEventsByTimestamp(events: CachedEvent[]): CachedEvent[] {
    return events.sort((a, b) => {
      const diff = a.timestamp - b.timestamp;
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });
  }
  
  /**
   * Apply aggregation to results
   */
  private applyAggregation(events: CachedEvent[], aggregation: 'raw' | 'changes_only'): CachedEvent[] {
    if (aggregation === 'changes_only') {
      return this.filterChangesOnly(events);
    }
    return events;
  }
  
  /**
   * Apply pagination to results
   */
  private applyPagination(events: CachedEvent[], offset: number, limit: number): CachedEvent[] {
    if (offset > 0 || (limit > 0 && events.length > limit)) {
      const start = offset;
      const end = limit > 0 ? start + limit : events.length;
      return events.slice(start, end);
    }
    return events;
  }
  
  /**
   * Log query completion
   */
  private logQueryComplete(results: CachedEvent[], params: Required<EventQuery>): void {
    logger.debug('Query completed', {
      resultCount: results.length,
      offset: params.offset,
      limit: params.limit,
      firstEvent: results[0]?.timestampMs,
      lastEvent: results[results.length - 1]?.timestampMs
    });
  }
  
  /**
   * Apply value filter to events
   */
  private applyValueFilter(
    events: CachedEvent[], 
    filter: EventQuery['valueFilter']
  ): CachedEvent[] {
    if (!filter || filter.value === undefined) return events;
    
    const { operator, value } = filter;
    return events.filter(event => this.evaluateValueFilter(event, operator, value));
  }
  
  /**
   * Evaluate a single value filter condition
   */
  private evaluateValueFilter(
    event: CachedEvent,
    operator: NonNullable<EventQuery['valueFilter']>['operator'],
    value: ControlValue
  ): boolean {
    switch (operator) {
      case 'eq':
        return this.evaluateEquality(event.value, value);
      case 'neq':
        return !this.evaluateEquality(event.value, value);
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
        return this.evaluateNumericComparison(event.value, value, operator);
      case 'changed_to':
        return this.evaluateChangedTo(event, value);
      case 'changed_from':
        return this.evaluateChangedFrom(event, value);
      default:
        return true;
    }
  }
  
  /**
   * Evaluate equality between values
   */
  private evaluateEquality(eventValue: ControlValue, filterValue: ControlValue): boolean {
    return eventValue === filterValue;
  }
  
  /**
   * Evaluate numeric comparisons
   */
  private evaluateNumericComparison(
    eventValue: ControlValue,
    filterValue: ControlValue,
    operator: 'gt' | 'gte' | 'lt' | 'lte'
  ): boolean {
    if (typeof eventValue !== 'number' || typeof filterValue !== 'number') {
      return false;
    }
    
    switch (operator) {
      case 'gt': return eventValue > filterValue;
      case 'gte': return eventValue >= filterValue;
      case 'lt': return eventValue < filterValue;
      case 'lte': return eventValue <= filterValue;
    }
  }
  
  /**
   * Evaluate if value changed to a specific value
   */
  private evaluateChangedTo(event: CachedEvent, value: ControlValue): boolean {
    return event.value === value && 
           event.previousValue !== undefined &&
           event.previousValue !== value;
  }
  
  /**
   * Evaluate if value changed from a specific value
   */
  private evaluateChangedFrom(event: CachedEvent, value: ControlValue): boolean {
    return event.previousValue !== undefined &&
           event.previousValue === value && 
           event.value !== value;
  }
  
  /**
   * Filter to only show events where value actually changed
   */
  private filterChangesOnly(events: CachedEvent[]): CachedEvent[] {
    return events.filter(event => {
      return event.previousValue === undefined || 
             event.value !== event.previousValue;
    });
  }
  
  /**
   * Get statistics for a change group
   */
  getStatistics(groupId: string): CacheStatistics | null {
    const buffer = this.buffers.get(groupId);
    if (!buffer) return null;
    
    // Use getAll() to get all events for statistics
    const events = buffer.getAll();
    
    // Calculate unique controls from all events
    const uniqueControls = new Set<string>();
    for (const event of events) {
      uniqueControls.add(event.controlName);
    }
    
    // Get oldest and newest events
    const oldestEvent = events.length > 0 ? events[0] : undefined;
    const newestEvent = events.length > 0 ? events[events.length - 1] : undefined;
    
    // Calculate average events per second
    const rates = this.eventRates.get(groupId) ?? [];
    const avgRate = rates.length > 0 
      ? rates.reduce((a, b) => a + b, 0) / rates.length 
      : 0;
    
    return {
      eventCount: buffer.getSize(),
      oldestEvent: oldestEvent?.timestampMs,
      newestEvent: newestEvent?.timestampMs,
      memoryUsage: this.estimateMemoryUsage(buffer.getSize()),
      controlsTracked: uniqueControls.size,
      eventsPerSecond: avgRate
    };
  }
  
  /**
   * Get statistics for all groups
   */
  getAllStatistics(): Map<string, CacheStatistics> {
    const stats = new Map<string, CacheStatistics>();
    
    for (const groupId of this.buffers.keys()) {
      const groupStats = this.getStatistics(groupId);
      if (groupStats) {
        stats.set(groupId, groupStats);
      }
    }
    
    return stats;
  }
  
  /**
   * Clear events for a specific group
   */
  clearGroup(groupId: string): boolean {
    const buffer = this.buffers.get(groupId);
    if (!buffer) return false;
    
    // Remove the buffer completely
    this.buffers.delete(groupId);
    this.lastValues.delete(groupId);
    this.lastEventTimes.delete(groupId);
    this.eventRates.delete(groupId);
    
    logger.info('Cleared event cache for group', { groupId });
    return true;
  }
  
  /**
   * Clear all event caches
   */
  clearAll(): void {
    for (const groupId of this.buffers.keys()) {
      this.clearGroup(groupId);
    }
    this.buffers.clear();
    logger.info('Cleared all event caches');
  }
  
  /**
   * Estimate memory usage in bytes
   */
  private estimateMemoryUsage(eventCount: number): number {
    // Rough estimate: ~200 bytes per event
    return eventCount * 200;
  }
  
  /**
   * Start background cleanup timer
   */
  private startCleanupTimer(): void {
    const intervalMs = this.defaultConfig.cleanupIntervalMs ?? 30000; // Default 30 seconds
    
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, intervalMs);
    
    // Ensure timer doesn't prevent process exit
    this.cleanupInterval.unref();
    
    logger.debug('Started cleanup timer', { intervalMs });
  }
  
  /**
   * Perform cleanup of old events across all buffers
   */
  private performCleanup(): void {
    let totalEvicted = 0;
    
    for (const [groupId, buffer] of this.buffers) {
      const beforeSize = buffer.getSize();
      buffer.evictOldEvents();
      const evicted = beforeSize - buffer.getSize();
      
      if (evicted > 0) {
        totalEvicted += evicted;
        logger.debug('Evicted old events', { groupId, evicted });
      }
    }
    
    if (totalEvicted > 0) {
      this.emit('cleanup', { totalEvicted, timestamp: Date.now() });
    }
  }
  
  /**
   * Start compression timer
   */
  private startCompressionTimer(): void {
    const intervalMs = this.defaultConfig.compressionConfig?.checkIntervalMs ?? 60000;
    
    this.compressionInterval = setInterval(() => {
      this.performCompression();
    }, intervalMs);
    
    this.compressionInterval.unref();
    
    logger.debug('Started compression timer', { intervalMs });
  }
  
  /**
   * Perform event compression for all buffers
   */
  private performCompression(): void {
    const config = this.defaultConfig.compressionConfig;
    if (!config) {
      logger.warn('Compression config not set');
      return;
    }
    const now = Date.now();
    let totalCompressed = 0;
    
    for (const [groupId, buffer] of this.buffers) {
      const stats = this.compressionStats.get(groupId) ?? { original: 0, compressed: 0, lastRun: 0 };
      
      // Skip if recently compressed
      if (stats.lastRun && (now - stats.lastRun) < 30000) continue;
      
      const beforeSize = buffer.getSize();
      const compressed = this.compressBufferEvents(groupId, buffer, config);
      
      if (compressed > 0) {
        totalCompressed += compressed;
        stats.original += beforeSize;
        stats.compressed += compressed;
        stats.lastRun = now;
        this.compressionStats.set(groupId, stats);
        
        logger.debug('Compressed events', { 
          groupId, 
          original: beforeSize,
          compressed,
          ratio: `${((compressed / beforeSize) * 100).toFixed(1)}%`
        });
      }
    }
    
    if (totalCompressed > 0) {
      this.emit('compression', { totalCompressed, timestamp: now });
    }
  }
  
  /**
   * Compress events in a buffer based on age and significance
   */
  private compressBufferEvents(
    groupId: string, 
    buffer: CircularBuffer<CachedEvent>,
    config: NonNullable<EventCacheConfig['compressionConfig']>
  ): number {
    const events = buffer.getAll();
    if (events.length === 0) return 0;
    
    const controlEvents = this.groupEventsByControl(events);
    const eventsToKeep = this.selectEventsToKeep(controlEvents, config);
    const compressedCount = events.length - eventsToKeep.length;
    
    if (compressedCount > 0) {
      this.replaceBufferContents(buffer, eventsToKeep);
    }
    
    return compressedCount;
  }
  
  /**
   * Group events by control name
   */
  private groupEventsByControl(events: CachedEvent[]): Map<string, CachedEvent[]> {
    const controlEvents = new Map<string, CachedEvent[]>();
    for (const event of events) {
      const list = controlEvents.get(event.controlName) ?? [];
      list.push(event);
      controlEvents.set(event.controlName, list);
    }
    return controlEvents;
  }
  
  /**
   * Select events to keep based on compression rules
   */
  private selectEventsToKeep(
    controlEvents: Map<string, CachedEvent[]>,
    config: NonNullable<EventCacheConfig['compressionConfig']>
  ): CachedEvent[] {
    const eventsToKeep: CachedEvent[] = [];
    const now = Date.now();
    
    for (const [_controlName, eventList] of controlEvents) {
      const sortedEvents = this.sortEventsByTimestamp(eventList);
      const keptEvents = this.applyCompressionRules(sortedEvents, config, now);
      eventsToKeep.push(...keptEvents);
    }
    
    return eventsToKeep;
  }
  
  /**
   * Apply compression rules to a sorted list of events
   */
  private applyCompressionRules(
    events: CachedEvent[],
    config: NonNullable<EventCacheConfig['compressionConfig']>,
    now: number
  ): CachedEvent[] {
    const kept: CachedEvent[] = [];
    let lastKeptEvent: CachedEvent | null = null;
    
    for (const event of events) {
      const age = now - event.timestampMs;
      const shouldKeep = this.shouldKeepEvent(event, lastKeptEvent, age, config);
      
      if (shouldKeep) {
        kept.push(event);
        lastKeptEvent = event;
      }
    }
    
    return kept;
  }
  
  /**
   * Determine if an event should be kept based on age and significance
   */
  private shouldKeepEvent(
    event: CachedEvent,
    lastKeptEvent: CachedEvent | null,
    age: number,
    config: NonNullable<EventCacheConfig['compressionConfig']>
  ): boolean {
    if (age < config.recentWindowMs) {
      return true; // Keep all recent events
    }
    
    if (age < config.mediumWindowMs) {
      return this.shouldKeepMediumAgeEvent(event, lastKeptEvent, config);
    }
    
    if (age < config.ancientWindowMs) {
      return this.shouldKeepAncientEvent(event, lastKeptEvent);
    }
    
    return false; // Drop events older than ancient window
  }
  
  /**
   * Check if medium-age event should be kept
   */
  private shouldKeepMediumAgeEvent(
    event: CachedEvent,
    lastKeptEvent: CachedEvent | null,
    config: NonNullable<EventCacheConfig['compressionConfig']>
  ): boolean {
    if (!lastKeptEvent) return true; // Always keep first event
    
    const timeSinceLastKept = event.timestampMs - lastKeptEvent.timestampMs;
    if (timeSinceLastKept < config.minTimeBetweenEventsMs) {
      return false;
    }
    
    if (event.eventType === 'state_transition' || event.eventType === 'threshold_crossed') {
      return true;
    }
    
    return this.isSignificantChangeForCompression(event.value, lastKeptEvent.value, config.significantChangePercent);
  }
  
  /**
   * Check if ancient event should be kept
   */
  private shouldKeepAncientEvent(
    event: CachedEvent,
    lastKeptEvent: CachedEvent | null
  ): boolean {
    if (event.eventType === 'state_transition' || event.eventType === 'threshold_crossed') {
      return true;
    }
    
    return lastKeptEvent && event.value !== lastKeptEvent.value;
  }
  
  /**
   * Check if a value change is significant for compression
   */
  private isSignificantChangeForCompression(
    currentValue: ControlValue,
    previousValue: ControlValue,
    threshold: number
  ): boolean {
    if (typeof currentValue === 'number' && typeof previousValue === 'number') {
      const change = Math.abs(currentValue - previousValue);
      const percentChange = previousValue !== 0 
        ? (change / Math.abs(previousValue)) * 100
        : change > 0 ? 100 : 0;
      return percentChange >= threshold;
    }
    
    return currentValue !== previousValue;
  }
  
  /**
   * Replace buffer contents with compressed events
   */
  private replaceBufferContents(
    buffer: CircularBuffer<CachedEvent>,
    events: CachedEvent[]
  ): void {
    buffer.clear();
    const sortedEvents = this.sortEventsByTimestamp(events);
    
    for (const event of sortedEvents) {
      buffer.add(event, event.timestamp);
    }
  }
  
  /**
   * Stop cleanup timer and clean up resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = undefined;
    }
    
    if (this.compressionInterval) {
      clearInterval(this.compressionInterval);
      this.compressionInterval = undefined;
    }
    
    this.clearAll();
    this.removeAllListeners();
    logger.info('EventCacheManager destroyed');
  }
  
  /**
   * Get list of all cached group IDs
   */
  getGroupIds(): string[] {
    return Array.from(this.buffers.keys());
  }
  
  /**
   * Start memory monitoring
   */
  private startMemoryMonitoring(): void {
    if (this.defaultConfig.memoryCheckIntervalMs) {
      this.memoryCheckInterval = setInterval(() => {
        void this.checkMemoryPressure();
      }, this.defaultConfig.memoryCheckIntervalMs ?? 10000);
      
      this.memoryCheckInterval.unref();
    }
  }
  
  /**
   * Check and handle memory pressure
   */
  private async checkMemoryPressure(): Promise<void> {
    const usage = this.getGlobalMemoryUsage();
    const percentage = (usage / this.globalMemoryLimitBytes) * 100;
    
    // Emit warnings at thresholds
    if (percentage >= 80 && this.lastMemoryPressure < 80) {
      logger.warn('Event cache memory high', { usage, percentage });
      this.emit('memoryPressure', { level: 'high', percentage });
    }
    
    if (percentage >= 90 && this.lastMemoryPressure < 90) {
      logger.error('Event cache memory critical', { usage, percentage });
      this.emit('memoryPressure', { level: 'critical', percentage });
    }
    
    this.lastMemoryPressure = percentage;
    
    // Take action if over limit
    if (usage > this.globalMemoryLimitBytes) {
      await this.handleMemoryPressure(usage);
    }
  }
  
  /**
   * Calculate total memory usage across all buffers
   */
  private getGlobalMemoryUsage(): number {
    let total = 0;
    
    for (const [groupId, buffer] of this.buffers) {
      // More accurate memory calculation
      const events = buffer.getSize();
      const avgEventSize = this.calculateAverageEventSize(groupId);
      total += events * avgEventSize;
    }
    
    // Add overhead for indexes and metadata
    total *= 1.2; // 20% overhead estimate
    
    return total;
  }
  
  /**
   * Calculate average event size for a group
   */
  private calculateAverageEventSize(groupId: string): number {
    // Sample recent events to get accurate size
    const buffer = this.buffers.get(groupId);
    if (!buffer || buffer.isEmpty()) return 200; // Default estimate
    
    const sample = buffer.getNewest();
    if (!sample) return 200;
    
    // Calculate actual size including all fields
    // Create a serializable copy, converting BigInt to string
    const serializable = {
      ...sample,
      timestamp: sample.timestamp.toString()
    };
    
    const size = JSON.stringify(serializable).length * 2; // UTF-16 in memory
    return Math.max(size, 200); // Minimum 200 bytes
  }
  
  /**
   * Initialize disk spillover directory
   */
  private async initializeDiskSpillover(): Promise<void> {
    const spilloverConfig = this.defaultConfig.diskSpilloverConfig;
    if (!spilloverConfig?.enabled) return;
    
    const dir = spilloverConfig.directory;
    try {
      await fs.mkdir(dir, { recursive: true });
      logger.info('Disk spillover directory initialized', { directory: dir });
    } catch (error) {
      logger.error('Failed to create spillover directory', { error, directory: dir });
      // Disable spillover if we can't create directory
      spilloverConfig.enabled = false;
    }
  }
  
  /**
   * Spill events to disk when memory threshold is exceeded
   */
  private async spillToDisk(groupId: string, events: CachedEvent[]): Promise<boolean> {
    if (!this.canSpillToDisk(events)) {
      return false;
    }
    
    const spilloverFile = this.prepareSpilloverFile(groupId, events);
    const success = await this.writeSpilloverFile(spilloverFile);
    
    if (success) {
      this.notifyDiskSpillover(spilloverFile);
    }
    
    return success;
  }
  
  /**
   * Check if disk spillover is possible
   */
  private canSpillToDisk(events: CachedEvent[]): boolean {
    return this.defaultConfig.diskSpilloverConfig?.enabled === true && events.length > 0;
  }
  
  /**
   * Prepare spillover file data
   */
  private prepareSpilloverFile(
    groupId: string,
    events: CachedEvent[]
  ): SpilloverFileData {
    const timestamp = Date.now();
    const filename = `${groupId}-${timestamp}-${events.length}.json`;
    const spilloverConfig = this.defaultConfig.diskSpilloverConfig;
    if (!spilloverConfig) {
      throw new Error('Disk spillover config not initialized');
    }
    const filepath = path.join(spilloverConfig.directory, filename);
    
    const serializable = events.map(e => ({
      ...e,
      timestamp: e.timestamp.toString()
    }));
    
    const data = {
      groupId,
      timestamp,
      eventCount: events.length,
      startTime: events[0]?.timestampMs ?? 0,
      endTime: events[events.length - 1]?.timestampMs ?? 0,
      events: serializable
    };
    
    return { groupId, filename, filepath, data, eventCount: events.length };
  }
  
  /**
   * Write spillover file to disk
   */
  private async writeSpilloverFile(spilloverFile: SpilloverFileData): Promise<boolean> {
    try {
      const jsonData = JSON.stringify(spilloverFile.data);
      await fs.writeFile(spilloverFile.filepath, jsonData, 'utf8');
      
      logger.info('Spilled events to disk', {
        groupId: spilloverFile.groupId,
        filename: spilloverFile.filename,
        eventCount: spilloverFile.eventCount,
        sizeBytes: jsonData.length
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to spill events to disk', { 
        error, 
        groupId: spilloverFile.groupId, 
        filename: spilloverFile.filename 
      });
      return false;
    }
  }
  
  /**
   * Notify about disk spillover
   */
  private notifyDiskSpillover(spilloverFile: SpilloverFileData): void {
    this.emit('diskSpillover', { 
      groupId: spilloverFile.groupId, 
      filename: spilloverFile.filename, 
      eventCount: spilloverFile.eventCount 
    });
  }
  
  /**
   * Load spilled events from disk for a time range
   */
  private async loadFromDisk(
    groupId: string, 
    startTime: number, 
    endTime: number
  ): Promise<CachedEvent[]> {
    const spilloverConfig = this.defaultConfig.diskSpilloverConfig;
    if (!spilloverConfig?.enabled) {
      return [];
    }
    
    const dir = spilloverConfig.directory;
    const files = await this.getSpilloverFiles(dir, groupId);
    const events = await this.loadEventsFromFiles(files, dir, startTime, endTime);
    
    this.logDiskLoadComplete(groupId, files.length, events.length);
    return this.sortEventsByTimestamp(events);
  }
  
  /**
   * Get spillover files for a group
   */
  private async getSpilloverFiles(dir: string, groupId: string): Promise<string[]> {
    try {
      const files = await fs.readdir(dir);
      return files.filter(f => f.startsWith(`${groupId}-`) && f.endsWith('.json'));
    } catch (error) {
      logger.error('Failed to read spillover directory', { error, dir });
      return [];
    }
  }
  
  /**
   * Load events from spillover files
   */
  private async loadEventsFromFiles(
    files: string[],
    dir: string,
    startTime: number,
    endTime: number
  ): Promise<CachedEvent[]> {
    const events: CachedEvent[] = [];
    
    for (const file of files) {
      const fileEvents = await this.loadEventsFromFile(file, dir, startTime, endTime);
      events.push(...fileEvents);
    }
    
    return events;
  }
  
  /**
   * Load events from a single spillover file
   */
  private async loadEventsFromFile(
    file: string,
    dir: string,
    startTime: number,
    endTime: number
  ): Promise<CachedEvent[]> {
    try {
      const filepath = path.join(dir, file);
      const data = await fs.readFile(filepath, 'utf8');
      const parsed = this.parseSpilloverFile(data, file);
      
      if (!parsed || !this.isFileInTimeRange(parsed, startTime, endTime)) {
        return [];
      }
      
      return this.deserializeFileEvents(parsed.events, startTime, endTime);
    } catch (error) {
      logger.error('Failed to load spilled file', { error, file });
      return [];
    }
  }
  
  /**
   * Parse spillover file data
   */
  private parseSpilloverFile(data: string, file: string): SpilledEventFile | null {
    try {
      const parsed: unknown = JSON.parse(data);
      if (!isSpilledEventFile(parsed)) {
        logger.warn('Invalid spilled event file format', { file });
        return null;
      }
      return parsed;
    } catch (error) {
      logger.error('Failed to parse spillover file', { error, file });
      return null;
    }
  }
  
  /**
   * Check if file contains events in time range
   */
  private isFileInTimeRange(
    file: SpilledEventFile,
    startTime: number,
    endTime: number
  ): boolean {
    return !(file.endTime < startTime || file.startTime > endTime);
  }
  
  /**
   * Deserialize events from file
   */
  private deserializeFileEvents(
    events: unknown[],
    startTime: number,
    endTime: number
  ): CachedEvent[] {
    return events
      .filter((e): e is SerializedCachedEvent => isSerializedCachedEvent(e))
      .map(e => this.deserializeEvent(e))
      .filter(e => e.timestampMs >= startTime && e.timestampMs <= endTime);
  }
  
  /**
   * Deserialize a single event
   */
  private deserializeEvent(serialized: SerializedCachedEvent): CachedEvent {
    return {
      ...serialized,
      timestamp: BigInt(serialized.timestamp),
      eventType: serialized.eventType && isEventType(serialized.eventType) 
        ? serialized.eventType 
        : undefined,
      value: serialized.value,
      previousValue: serialized.previousValue
    };
  }
  
  /**
   * Log disk load completion
   */
  private logDiskLoadComplete(groupId: string, fileCount: number, eventCount: number): void {
    logger.debug('Loaded events from disk', {
      groupId,
      fileCount,
      eventCount
    });
  }
  
  /**
   * Clean up old spillover files
   */
  private async cleanupSpilloverFiles(): Promise<void> {
    const spilloverConfig = this.defaultConfig.diskSpilloverConfig;
    if (!spilloverConfig?.enabled) return;
    
    const dir = spilloverConfig.directory;
    const maxAge = this.defaultConfig.maxAgeMs;
    const now = Date.now();
    
    try {
      const files = await fs.readdir(dir);
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        try {
          const filepath = path.join(dir, file);
          const stats = await fs.stat(filepath);
          
          if ((now - stats.mtimeMs) > maxAge) {
            await fs.unlink(filepath);
            logger.debug('Deleted old spillover file', { file, age: now - stats.mtimeMs });
          }
        } catch (error) {
          logger.error('Failed to cleanup spillover file', { error, file });
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup spillover files', { error });
    }
  }
  
  /**
   * Handle memory pressure by evicting events
   */
  private async handleMemoryPressure(currentUsage: number): Promise<void> {
    logger.warn('Handling memory pressure', { 
      currentUsage, 
      limit: this.globalMemoryLimitBytes 
    });
    
    await this.checkDiskSpillover(currentUsage);
    
    const freed = this.performMemoryEviction(currentUsage);
    
    this.handleMemoryPressureResolution(currentUsage, freed);
  }
  
  /**
   * Check if disk spillover should be activated
   */
  private async checkDiskSpillover(currentUsage: number): Promise<void> {
    const spilloverEnabled = this.defaultConfig.diskSpilloverConfig?.enabled;
    if (!spilloverEnabled) return;
    
    const spilloverThresholdBytes = (this.defaultConfig.diskSpilloverConfig?.thresholdMB ?? 400) * 1024 * 1024;
    
    if (currentUsage > spilloverThresholdBytes && !this.diskSpilloverActive) {
      this.diskSpilloverActive = true;
      await this.performDiskSpillover();
    }
  }
  
  /**
   * Perform memory eviction with multiple passes
   */
  private performMemoryEviction(currentUsage: number): number {
    const bufferInfo = this.getBufferInfo();
    const target = currentUsage - (this.globalMemoryLimitBytes * 0.7);
    
    let freed = this.multiPassEviction(bufferInfo, target);
    
    if (currentUsage - freed > this.globalMemoryLimitBytes) {
      freed += this.criticalMemoryEviction(bufferInfo, currentUsage - freed);
    }
    
    return freed;
  }
  
  /**
   * Get buffer information sorted by priority and size
   */
  private getBufferInfo(): BufferInfo[] {
    return Array.from(this.buffers.entries())
      .map(([id, buffer]) => ({
        groupId: id,
        memory: buffer.getSize() * this.calculateAverageEventSize(id),
        priority: this.groupPriorities.get(id) ?? 'normal'
      }))
      .sort((a, b) => {
        const priorityOrder = { low: 0, normal: 1, high: 2 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return b.memory - a.memory;
      });
  }
  
  /**
   * Perform multi-pass eviction with increasing aggression
   */
  private multiPassEviction(bufferInfo: BufferInfo[], target: number): number {
    let freed = 0;
    
    for (let pass = 1; pass <= 3 && freed < target; pass++) {
      freed += this.evictionPass(bufferInfo, target - freed, pass);
      
      if (freed < target) {
        this.resortBufferInfo(bufferInfo);
      }
    }
    
    return freed;
  }
  
  /**
   * Perform a single eviction pass
   */
  private evictionPass(bufferInfo: BufferInfo[], remainingTarget: number, pass: number): number {
    let freed = 0;
    const evictionParams = this.getEvictionParams(pass);
    
    for (const info of bufferInfo) {
      if (freed >= remainingTarget) break;
      
      if (this.shouldSkipBuffer(info, pass, freed, remainingTarget)) continue;
      
      const evicted = this.evictFromBuffer(info, evictionParams);
      freed += evicted;
    }
    
    return freed;
  }
  
  /**
   * Get eviction parameters for a pass
   */
  private getEvictionParams(pass: number): { rate: number; minEvict: number } {
    switch (pass) {
      case 1: return { rate: 0.3, minEvict: 100 };
      case 2: return { rate: 0.5, minEvict: 200 };
      default: return { rate: 0.7, minEvict: 500 };
    }
  }
  
  /**
   * Check if buffer should be skipped in this pass
   */
  private shouldSkipBuffer(info: BufferInfo, pass: number, freed: number, target: number): boolean {
    return info.priority === 'high' && pass === 1 && freed < target * 0.5;
  }
  
  /**
   * Evict events from a single buffer
   */
  private evictFromBuffer(
    info: BufferInfo,
    params: { rate: number; minEvict: number }
  ): number {
    const buffer = this.buffers.get(info.groupId);
    if (!buffer || buffer.getSize() === 0) return 0;
    
    const currentSize = buffer.getSize();
    const toEvict = Math.min(
      Math.max(Math.floor(currentSize * params.rate), params.minEvict),
      currentSize
    );
    
    const evicted = buffer.forceEvict(toEvict);
    if (evicted > 0) {
      logger.info('Evicted events due to memory pressure', { 
        groupId: info.groupId, 
        evicted,
        remaining: buffer.getSize(),
        priority: info.priority
      });
    }
    
    return evicted * this.calculateAverageEventSize(info.groupId);
  }
  
  /**
   * Resort buffer info by current sizes
   */
  private resortBufferInfo(bufferInfo: BufferInfo[]): void {
    bufferInfo.sort((a, b) => {
      const aBuffer = this.buffers.get(a.groupId);
      const bBuffer = this.buffers.get(b.groupId);
      const aSize = aBuffer ? aBuffer.getSize() : 0;
      const bSize = bBuffer ? bBuffer.getSize() : 0;
      return bSize - aSize;
    });
  }
  
  /**
   * Perform critical memory eviction by clearing smallest buffers
   */
  private criticalMemoryEviction(bufferInfo: BufferInfo[], currentUsage: number): number {
    logger.warn('Memory pressure critical - clearing smallest groups');
    
    let freed = 0;
    const smallestFirst = bufferInfo.slice().reverse();
    const target = this.globalMemoryLimitBytes * 0.7;
    
    for (const { groupId } of smallestFirst) {
      if (currentUsage - freed <= target) break;
      
      const buffer = this.buffers.get(groupId);
      if (buffer && buffer.getSize() > 0) {
        const size = buffer.getSize();
        const memoryFreed = size * this.calculateAverageEventSize(groupId);
        buffer.clear();
        freed += memoryFreed;
        
        logger.warn('Cleared entire buffer due to critical memory pressure', { 
          groupId,
          eventsCleared: size
        });
      }
    }
    
    return freed;
  }
  
  /**
   * Handle resolution of memory pressure
   */
  private handleMemoryPressureResolution(currentUsage: number, freed: number): void {
    this.emit('memoryPressureResolved', { freed, currentUsage: currentUsage - freed });
    
    const newUsage = currentUsage - freed;
    const newPercentage = (newUsage / this.globalMemoryLimitBytes) * 100;
    this.lastMemoryPressure = newPercentage;
    
    const spilloverEnabled = this.defaultConfig.diskSpilloverConfig?.enabled;
    if (spilloverEnabled) {
      const spilloverThresholdBytes = (this.defaultConfig.diskSpilloverConfig?.thresholdMB ?? 400) * 1024 * 1024;
      if (newUsage < spilloverThresholdBytes * 0.8) {
        this.diskSpilloverActive = false;
      }
    }
  }
  
  /**
   * Perform disk spillover for oldest events
   */
  private async performDiskSpillover(): Promise<void> {
    await this.initializeDiskSpillover();
    
    if (!this.defaultConfig.diskSpilloverConfig?.enabled) return;
    
    logger.info('Starting disk spillover operation');
    
    // Spill oldest 50% of events from each buffer
    for (const [groupId, buffer] of this.buffers) {
      const events = buffer.getAll();
      if (events.length < 1000) continue; // Skip small buffers
      
      // Take oldest 50% of events
      const spillCount = Math.floor(events.length * 0.5);
      const eventsToSpill = events.slice(0, spillCount);
      
      if (await this.spillToDisk(groupId, eventsToSpill)) {
        // Remove spilled events from buffer
        buffer.forceEvict(spillCount);
      }
    }
    
    // Clean up old spillover files
    await this.cleanupSpilloverFiles();
  }
  
  /**
   * Set group priority for memory management
   */
  setGroupPriority(groupId: string, priority: 'high' | 'normal' | 'low'): void {
    this.groupPriorities.set(groupId, priority);
    logger.debug('Set group priority', { groupId, priority });
  }
  
  /**
   * Get current memory usage statistics
   */
  getMemoryStats(): {
    totalUsage: number;
    limit: number;
    percentage: number;
    groupStats: Array<{groupId: string; memory: number; events: number}>;
  } {
    const totalUsage = this.getGlobalMemoryUsage();
    const percentage = (totalUsage / this.globalMemoryLimitBytes) * 100;
    
    const groupStats = Array.from(this.buffers.entries()).map(([groupId, buffer]) => ({
      groupId,
      memory: buffer.getSize() * this.calculateAverageEventSize(groupId),
      events: buffer.getSize()
    }));
    
    return {
      totalUsage,
      limit: this.globalMemoryLimitBytes,
      percentage,
      groupStats
    };
  }
}