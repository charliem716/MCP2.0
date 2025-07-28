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
import {
  isSpilledEventFile,
  type ChangeGroupEvent,
  type ControlChange,
  type SpilledEventFile,
} from './types.js';
import {
  isEventType,
  isSerializedCachedEvent,
  getMapValue,
  type ControlValue,
  type EventType,
  type SerializedCachedEvent,
} from './event-types.js';
import { CompressionEngine } from './compression.js';
import { DiskSpilloverManager } from './disk-spillover.js';
import { QueryCache } from './query-cache.js';
import { validateEventCacheConfig, getConfigSummary } from './config-validator.js';

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
    operator:
      | 'eq'
      | 'neq'
      | 'gt'
      | 'gte'
      | 'lt'
      | 'lte'
      | 'changed_to'
      | 'changed_from';
    value?: ControlValue;
  };
  limit?: number;
  offset?: number;
  aggregation?: 'raw' | 'changes_only';
  eventTypes?: Array<
    'change' | 'threshold_crossed' | 'state_transition' | 'significant_change'
  >;
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
 * Health status of the event cache
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  errorCount: number;
  memoryUsagePercent: number;
  issues: string[];
  lastError?: {
    message: string;
    context: string;
    timestamp: number;
  };
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
  skipValidation?: boolean; // For test environments with minimal configs
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
  private compressionEngine: CompressionEngine;
  private diskSpillover: DiskSpilloverManager;
  private diskSpilloverActive = false;
  private adapter?: Pick<QRWCClientAdapter, 'on' | 'removeListener'>;
  private changeEventHandler?: (event: ChangeGroupEvent) => void;
  private queryCache: QueryCache;
  private errorCount = 0;
  private lastError?: { message: string; context: string; timestamp: number };

  constructor(
    private defaultConfig: EventCacheConfig = {
      maxEvents: 100000,
      maxAgeMs: 3600000, // 1 hour
    },
    adapter?: QRWCClientAdapter
  ) {
    super();
    
    // Validate configuration (skip if explicitly requested or in test environment)
    const shouldValidate = !this.defaultConfig.skipValidation && process.env.NODE_ENV !== 'test';
    if (shouldValidate) {
      const validation = validateEventCacheConfig(this.defaultConfig);
      if (!validation.valid) {
        throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
      }
      
      // Log warnings if any
      if (validation.warnings.length > 0) {
        logger.warn('EventCacheConfig warnings', { warnings: validation.warnings });
      }
    }
    
    // Log configuration summary
    logger.info('EventCache configuration', { 
      summary: getConfigSummary(this.defaultConfig).split('\n')
    });
    
    this.buffers = new Map();
    this.lastValues = new Map();
    this.lastEventTimes = new Map();
    this.eventRates = new Map();
    this.groupPriorities = new Map();
    this.compressionEngine = new CompressionEngine();
    this.diskSpillover = new DiskSpilloverManager(this.defaultConfig);
    this.globalMemoryLimitBytes =
      (this.defaultConfig.globalMemoryLimitMB ?? 500) * 1024 * 1024;
    this.queryCache = new QueryCache();
    
    // Initialize default configs
    this.initializeDefaultConfigs();

    logger.info('EventCacheManager initialized', {
      maxEvents: this.defaultConfig.maxEvents,
      maxAgeMs: this.defaultConfig.maxAgeMs,
      globalMemoryLimitMB: this.defaultConfig.globalMemoryLimitMB ?? 500,
      compressionEnabled: this.defaultConfig.compressionConfig?.enabled ?? false,
      diskSpilloverEnabled: this.defaultConfig.diskSpilloverConfig?.enabled ?? false,
    });

    // Start background cleanup timer if maxAge is configured
    if (this.defaultConfig.maxAgeMs && this.defaultConfig.maxAgeMs > 0) {
      this.startCleanupTimer();
    }

    // Start memory monitoring
    this.startMemoryMonitoring();

    // Start compression if enabled
    if (this.defaultConfig.compressionConfig?.enabled) {
      this.startCompressionTimer();
    }

    // Disk spillover will initialize itself when needed
    
    // If adapter provided, attach immediately
    if (adapter) {
      this.attachToAdapter(adapter);
    }
  }

  /**
   * Initialize default configurations
   */
  private initializeDefaultConfigs(): void {
    // Apply default compression config
    this.defaultConfig.compressionConfig ??= {
      enabled: false,
      checkIntervalMs: 60000, // 1 minute
      recentWindowMs: 60000, // 1 minute
      mediumWindowMs: 600000, // 10 minutes
      ancientWindowMs: 3600000, // 1 hour
      significantChangePercent: 5,
      minTimeBetweenEventsMs: 100,
    };

    // Apply default disk spillover config
    this.defaultConfig.diskSpilloverConfig ??= {
      enabled: false,
      directory: './event-cache-spillover',
      thresholdMB: 400, // Start spillover at 400MB
      maxFileSizeMB: 50,
    };
  }

  /**
   * Attach to a QRWC adapter to listen for change events
   */
  attachToAdapter(
    adapter: Pick<QRWCClientAdapter, 'on' | 'removeListener'>
  ): void {
    if (this.isAttached) {
      logger.warn('EventCacheManager already attached to adapter');
      return;
    }

    // Store references for cleanup
    this.adapter = adapter;
    this.changeEventHandler = (event: ChangeGroupEvent) => {
      this.handleChangeEvent(event);
    };

    adapter.on('changeGroup:changes', this.changeEventHandler);

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
      timestampMs,
    });

    this.ensureGroupBufferExists(groupId);
    const processedEvents = this.processChanges(
      groupId,
      changes,
      timestamp,
      timestampMs
    );
    
    // Invalidate query cache for this group when new events arrive
    this.queryCache.invalidate(groupId);
    
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

    const groupLastValues =
      this.lastValues.get(groupId) ?? new Map<string, ControlValue>();
    const groupLastTimes =
      this.lastEventTimes.get(groupId) ?? new Map<string, number>();
    const processedEvents: CachedEvent[] = [];

    for (const change of changes) {
      const cachedEvent = this.createCachedEvent({
        groupId,
        change,
        timestamp,
        timestampMs,
        lastValues: groupLastValues,
        lastTimes: groupLastTimes,
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
    const { groupId, change, timestamp, timestampMs, lastValues, lastTimes } =
      params;
    const previousValue = getMapValue(lastValues, change.Name);
    const previousTime = getMapValue(lastTimes, change.Name);
    const eventType = this.detectEventType(
      change.Name,
      previousValue,
      change.Value
    );

    const event: CachedEvent = {
      groupId,
      controlName: change.Name,
      timestamp,
      timestampMs,
      value: change.Value,
      string: change.String ?? String(change.Value),
      sequenceNumber: this.globalSequence++,
    };

    if (previousValue !== undefined) {
      event.previousValue = previousValue;
    }

    if (previousValue !== undefined && previousValue !== null) {
      event.previousString = String(previousValue);
    }

    const delta = this.calculateDelta(previousValue, change.Value);
    if (delta !== undefined) {
      event.delta = delta;
    }

    if (previousTime) {
      event.duration = timestampMs - previousTime;
    }

    if (eventType) {
      event.eventType = eventType;
    }

    if (eventType === 'threshold_crossed') {
      const threshold = this.findCrossedThreshold(
        change.Name,
        previousValue,
        change.Value
      );
      if (threshold !== undefined) {
        event.threshold = threshold;
      }
    }

    return event;
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
        totalEvents: buffer.getSize(),
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
  private calculateDelta(
    previousValue: ControlValue | undefined,
    currentValue: ControlValue
  ): number | undefined {
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

    const numericEventType = this.detectNumericEventType(
      controlName,
      previousValue,
      currentValue
    );
    if (numericEventType) {
      return numericEventType;
    }

    return 'change';
  }

  /**
   * Check if value change is a state transition
   */
  private isStateTransition(
    previousValue: ControlValue,
    currentValue: ControlValue
  ): boolean {
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
    return (
      (prev === 0 || prev === 1) && (curr === 0 || curr === 1) && prev !== curr
    );
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
    const threshold = this.findCrossedThreshold(
      controlName,
      previousValue,
      currentValue
    );
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
  private isSignificantChange(
    previousValue: number,
    currentValue: number
  ): boolean {
    if (previousValue === 0) {
      return currentValue !== 0;
    }

    const changePercent =
      Math.abs((currentValue - previousValue) / previousValue) * 100;
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
      const crossedDown =
        previousValue > threshold && currentValue <= threshold;

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
   * Query historical events (async version with disk spillover support)
   */
  async query(params: EventQuery): Promise<CachedEvent[]> {
    const queryParams = this.normalizeQueryParams(params);
    
    // Check cache first
    const cached = this.queryCache.get(params);
    if (cached) {
      logger.debug('Query cache hit', { 
        stats: this.queryCache.getStats() 
      });
      return cached;
    }

    this.logQueryStart(queryParams);

    // Collect events from memory and disk
    const memoryEvents = this.queryMemoryBuffers(queryParams);
    const diskEvents = await this.queryDiskStorage(queryParams);

    // Combine and process results
    let results = [...memoryEvents, ...diskEvents];
    results = this.sortEventsByTimestamp(results);
    results = this.applyAggregation(results, queryParams.aggregation);
    results = this.applyPagination(
      results,
      queryParams.offset,
      queryParams.limit
    );

    // Cache successful results if we have any
    if (results.length > 0) {
      this.queryCache.set(params, results);
    }

    this.logQueryComplete(results, queryParams);
    return results;
  }

  /**
   * Query historical events synchronously (memory only, for backwards compatibility)
   * @deprecated Use async query() method instead for full functionality including disk spillover
   */
  querySync(params: EventQuery): CachedEvent[] {
    logger.warn(
      'EventCacheManager.querySync() is deprecated. Use async query() method instead for full disk spillover support.'
    );

    const queryParams = this.normalizeQueryParams(params);
    this.logQueryStart(queryParams);

    // Query only memory buffers (synchronous)
    const memoryEvents = this.queryMemoryBuffers(queryParams);

    // Process results
    let results = [...memoryEvents];
    results = this.sortEventsByTimestamp(results);
    results = this.applyAggregation(results, queryParams.aggregation);
    results = this.applyPagination(
      results,
      queryParams.offset,
      queryParams.limit
    );

    this.logQueryComplete(results, queryParams);
    return results;
  }

  /**
   * Normalize query parameters with defaults
   */
  private normalizeQueryParams(params: EventQuery): Required<EventQuery> {
    return {
      groupId: params.groupId ?? '',
      startTime: params.startTime ?? Date.now() - 60000,
      endTime: params.endTime ?? Date.now(),
      controlNames: params.controlNames ?? [],
      valueFilter: params.valueFilter ?? { operator: 'eq' as const },
      limit: params.limit ?? 1000,
      offset: params.offset ?? 0,
      aggregation: params.aggregation ?? 'raw',
      eventTypes: params.eventTypes ?? [],
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
      offset: params.offset,
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
  private getBuffersToQuery(
    groupId?: string
  ): Array<CircularBuffer<CachedEvent>> {
    if (groupId) {
      const buffer = this.buffers.get(groupId);
      return buffer ? [buffer] : [];
    }
    return Array.from(this.buffers.values());
  }

  /**
   * Query events from disk storage
   */
  private async queryDiskStorage(
    params: Required<EventQuery>
  ): Promise<CachedEvent[]> {
    if (!this.defaultConfig.diskSpilloverConfig?.enabled) {
      return [];
    }

    const results: CachedEvent[] = [];
    const groupsToCheck = params.groupId
      ? [params.groupId]
      : this.getGroupIds();

    for (const gid of groupsToCheck) {
      const diskEvents = await this.loadFromDisk(
        gid,
        params.startTime,
        params.endTime
      );
      const filtered = this.applyEventFilters(diskEvents, params);
      results.push(...filtered);
    }

    return results;
  }

  /**
   * Apply all filters to events
   */
  private applyEventFilters(
    events: CachedEvent[],
    params: Required<EventQuery>
  ): CachedEvent[] {
    let filtered = events;

    if (params.controlNames.length > 0) {
      filtered = filtered.filter(e =>
        params.controlNames.includes(e.controlName)
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (params.valueFilter) {
      filtered = this.applyValueFilter(filtered, params.valueFilter);
    }

    if (params.eventTypes.length > 0) {
      filtered = filtered.filter(
        e => e.eventType && params.eventTypes.includes(e.eventType)
      );
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
  private applyAggregation(
    events: CachedEvent[],
    aggregation: 'raw' | 'changes_only'
  ): CachedEvent[] {
    if (aggregation === 'changes_only') {
      return this.filterChangesOnly(events);
    }
    // TODO: Implement 'summary' aggregation when needed
    return events;
  }

  /**
   * Apply pagination to results
   */
  private applyPagination(
    events: CachedEvent[],
    offset: number,
    limit: number
  ): CachedEvent[] {
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
  private logQueryComplete(
    results: CachedEvent[],
    params: Required<EventQuery>
  ): void {
    logger.debug('Query completed', {
      resultCount: results.length,
      offset: params.offset,
      limit: params.limit,
      firstEvent: results[0]?.timestampMs,
      lastEvent: results[results.length - 1]?.timestampMs,
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
    return events.filter(event =>
      this.evaluateValueFilter(event, operator, value)
    );
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
  private evaluateEquality(
    eventValue: ControlValue,
    filterValue: ControlValue
  ): boolean {
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
      case 'gt':
        return eventValue > filterValue;
      case 'gte':
        return eventValue >= filterValue;
      case 'lt':
        return eventValue < filterValue;
      case 'lte':
        return eventValue <= filterValue;
    }
  }

  /**
   * Evaluate if value changed to a specific value
   */
  private evaluateChangedTo(event: CachedEvent, value: ControlValue): boolean {
    return (
      event.value === value &&
      event.previousValue !== undefined &&
      event.previousValue !== value
    );
  }

  /**
   * Evaluate if value changed from a specific value
   */
  private evaluateChangedFrom(
    event: CachedEvent,
    value: ControlValue
  ): boolean {
    return (
      event.previousValue !== undefined &&
      event.previousValue === value &&
      event.value !== value
    );
  }

  /**
   * Filter to only show events where value actually changed
   */
  private filterChangesOnly(events: CachedEvent[]): CachedEvent[] {
    return events.filter(event => {
      return (
        event.previousValue === undefined || event.value !== event.previousValue
      );
    });
  }

  /**
   * Get statistics for a change group or all groups
   */
  // eslint-disable-next-line max-statements -- Comprehensive statistics calculation
  getStatistics(groupId?: string): CacheStatistics | null | { totalEvents: number; groups: Array<CacheStatistics & { groupId: string; totalEvents: number }>; memoryUsageMB: number; queryCache: unknown } {
    // If no groupId provided, return global statistics
    if (groupId === undefined) {
      const allStats = this.getAllStatistics();
      let totalEvents = 0;
      let totalMemoryUsage = 0;
      const groups: Array<CacheStatistics & { groupId: string; totalEvents: number }> = [];

      for (const [gId, stats] of allStats.entries()) {
        totalEvents += stats.eventCount;
        totalMemoryUsage += stats.memoryUsage;
        groups.push({ 
          groupId: gId, 
          ...stats,
          // Add totalEvents alias for backward compatibility
          totalEvents: stats.eventCount 
        });
      }

      return { 
        totalEvents, 
        groups,
        memoryUsageMB: totalMemoryUsage / (1024 * 1024),
        queryCache: this.queryCache.getStats()
      };
    }

    // Return statistics for specific group
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
    const newestEvent =
      events.length > 0 ? events[events.length - 1] : undefined;

    // Calculate average events per second
    const rates = this.eventRates.get(groupId) ?? [];
    const avgRate =
      rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;

    const stats: CacheStatistics = {
      eventCount: buffer.getSize(),
      memoryUsage: this.estimateMemoryUsage(buffer.getSize()),
      controlsTracked: uniqueControls.size,
      eventsPerSecond: avgRate,
    };

    if (oldestEvent) {
      stats.oldestEvent = oldestEvent.timestampMs;
    }

    if (newestEvent) {
      stats.newestEvent = newestEvent.timestampMs;
    }

    return stats;
  }

  /**
   * Get statistics for all groups
   */
  getAllStatistics(): Map<string, CacheStatistics> {
    const stats = new Map<string, CacheStatistics>();

    for (const groupId of this.buffers.keys()) {
      const groupStats = this.getStatistics(groupId);
      if (groupStats && typeof groupStats === 'object' && 'eventCount' in groupStats) {
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
    const intervalMs =
      this.defaultConfig.compressionConfig?.checkIntervalMs ?? 60000;

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
      // Skip if recently compressed
      if (!this.compressionEngine.shouldCompress(groupId, now)) continue;

      const beforeSize = buffer.getSize();
      const compressed = this.compressBufferEvents(groupId, buffer, config);

      if (compressed > 0) {
        totalCompressed += compressed;
        const stats = this.compressionEngine.getStats(groupId) ?? {
          original: 0,
          compressed: 0,
          lastRun: 0,
        };
        stats.original += beforeSize;
        stats.compressed += compressed;
        stats.lastRun = now;
        this.compressionEngine.setStats(groupId, stats);

        logger.debug('Compressed events', {
          groupId,
          original: beforeSize,
          compressed,
          ratio: `${((compressed / beforeSize) * 100).toFixed(1)}%`,
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

    const result = this.compressionEngine.compressEvents(events, config);

    if (result.compressed > 0) {
      this.replaceBufferContents(buffer, result.kept);
    }

    return result.compressed;
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
   * Manually trigger compression (useful for testing)
   * @param skipCooldown - Whether to skip the 30-second cooldown check
   */
  runCompression(skipCooldown = false): void {
    if (!this.defaultConfig.compressionConfig?.enabled) {
      return;
    }

    // Temporarily bypass cooldown if requested
    if (skipCooldown) {
      this.compressionEngine.clearStats();
    }

    this.performCompression();
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

    // Remove event listener if attached
    if (this.adapter && this.changeEventHandler) {
      this.adapter.removeListener(
        'changeGroup:changes',
        this.changeEventHandler
      );
      delete this.adapter;
      delete this.changeEventHandler;
      this.isAttached = false;
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
      timestamp: sample.timestamp.toString(),
    };

    const size = JSON.stringify(serializable).length * 2; // UTF-16 in memory
    return Math.max(size, 200); // Minimum 200 bytes
  }

  /**
   * Initialize disk spillover directory
   */
  private async initializeDiskSpillover(): Promise<void> {
    const spilloverConfig = this.defaultConfig.diskSpilloverConfig;
    if (!spilloverConfig?.enabled || !spilloverConfig.directory) return;

    const dir = spilloverConfig.directory;
    try {
      await fs.mkdir(dir, { recursive: true });
      logger.info('Disk spillover directory initialized', { directory: dir });
    } catch (error) {
      logger.error('Failed to create spillover directory', {
        error,
        directory: dir,
      });
      // Disable spillover if we can't create directory
      spilloverConfig.enabled = false;
    }
  }

  /**
   * Spill events to disk when memory threshold is exceeded
   */
  private async spillToDisk(
    groupId: string,
    events: CachedEvent[]
  ): Promise<boolean> {
    if (
      !this.defaultConfig.diskSpilloverConfig?.enabled ||
      events.length === 0
    ) {
      return false;
    }

    try {
      const success = await this.diskSpillover.spillToDisk(groupId, events);

      if (success) {
        this.emit('diskSpillover', {
          groupId,
          eventCount: events.length,
          sizeBytes: events.length * 100, // Rough estimate
        });
      }

      return success;
    } catch (error) {
      this.handleError(error as Error, `spillToDisk groupId:${groupId}`);
      return false;
    }
  }

  /**
   * Load spilled events from disk for a time range
   */
  private async loadFromDisk(
    groupId: string,
    startTime: number,
    endTime: number
  ): Promise<CachedEvent[]> {
    if (!this.defaultConfig.diskSpilloverConfig?.enabled) {
      return [];
    }

    try {
      return await this.diskSpillover.loadFromDisk(groupId, startTime, endTime);
    } catch (error) {
      this.handleError(error as Error, `loadFromDisk groupId:${groupId}`);
      return [];
    }
  }

  /**
   * Clean up old spillover files
   */
  private async cleanupSpilloverFiles(): Promise<void> {
    const spilloverConfig = this.defaultConfig.diskSpilloverConfig;
    if (!spilloverConfig?.enabled || !spilloverConfig.directory) return;

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

          if (now - stats.mtimeMs > maxAge) {
            await fs.unlink(filepath);
            logger.debug('Deleted old spillover file', {
              file,
              age: now - stats.mtimeMs,
            });
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
      limit: this.globalMemoryLimitBytes,
    });

    await this.checkDiskSpillover(currentUsage);

    const freed = this.performMemoryEviction(currentUsage);

    this.handleMemoryPressureResolution(currentUsage, freed);
  }

  /**
   * Handle errors with recovery strategies
   */
  private handleError(error: Error, context: string): void {
    logger.error(`Event cache error in ${context}`, { error });
    
    // Track error
    this.errorCount++;
    this.lastError = {
      message: error.message,
      context,
      timestamp: Date.now()
    };
    
    // Emit error event for monitoring
    this.emit('error', { 
      error, 
      context, 
      timestamp: Date.now(),
      groupId: context.includes('groupId:') ? context.split('groupId:')[1]?.split(' ')[0] : undefined
    });
    
    // Attempt recovery based on error type
    if (error.message.includes('ENOSPC') || error.message.includes('disk full')) {
      // Disk full - disable spillover
      logger.warn('Disk full, disabling spillover');
      if (this.defaultConfig.diskSpilloverConfig) {
        this.defaultConfig.diskSpilloverConfig.enabled = false;
      }
      this.diskSpilloverActive = false;
    } else if (error.message.includes('memory') || error.message.includes('ENOMEM')) {
      // Memory pressure - emergency eviction
      logger.warn('Memory error detected, triggering emergency eviction');
      this.emergencyEviction();
    } else if (error.message.includes('corrupt') || error.message.includes('invalid')) {
      // Corruption detected - clear affected group if identifiable
      const groupMatch = /groupId:(\S+)/.exec(context);
      if (groupMatch?.[1]) {
        logger.warn('Corruption detected, clearing affected group', { groupId: groupMatch[1] });
        this.clearGroup(groupMatch[1]);
      }
    }
  }

  /**
   * Emergency eviction - remove 50% of events across all groups
   */
  private emergencyEviction(): void {
    logger.warn('Starting emergency eviction - removing 50% of events');
    
    const bufferInfo = this.getBufferInfo();
    let totalEvicted = 0;
    
    for (const info of bufferInfo) {
      const buffer = this.buffers.get(info.groupId);
      if (!buffer) continue;
      
      const currentSize = buffer.getSize();
      const toEvict = Math.floor(currentSize * 0.5);
      
      if (toEvict > 0) {
        const evicted = buffer.forceEvict(toEvict);
        totalEvicted += evicted;
        
        logger.info('Emergency eviction performed', {
          groupId: info.groupId,
          evicted,
          remaining: buffer.getSize(),
          priority: info.priority
        });
      }
    }
    
    this.emit('emergencyEviction', {
      totalEvicted,
      timestamp: Date.now()
    });
  }

  /**
   * Check if disk spillover should be activated
   */
  private async checkDiskSpillover(currentUsage: number): Promise<void> {
    const spilloverEnabled = this.defaultConfig.diskSpilloverConfig?.enabled;
    if (!spilloverEnabled) return;

    const spilloverThresholdBytes =
      (this.defaultConfig.diskSpilloverConfig?.thresholdMB ?? 400) *
      1024 *
      1024;

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
    const target = currentUsage - this.globalMemoryLimitBytes * 0.7;

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
        priority: this.groupPriorities.get(id) ?? 'normal',
      }))
      .sort((a, b) => {
        const priorityOrder = { low: 0, normal: 1, high: 2 };
        const priorityDiff =
          priorityOrder[a.priority] - priorityOrder[b.priority];
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
  private evictionPass(
    bufferInfo: BufferInfo[],
    remainingTarget: number,
    pass: number
  ): number {
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
      case 1:
        return { rate: 0.3, minEvict: 100 };
      case 2:
        return { rate: 0.5, minEvict: 200 };
      default:
        return { rate: 0.7, minEvict: 500 };
    }
  }

  /**
   * Check if buffer should be skipped in this pass
   */
  private shouldSkipBuffer(
    info: BufferInfo,
    pass: number,
    freed: number,
    target: number
  ): boolean {
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
        priority: info.priority,
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
  private criticalMemoryEviction(
    bufferInfo: BufferInfo[],
    currentUsage: number
  ): number {
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
          eventsCleared: size,
        });
      }
    }

    return freed;
  }

  /**
   * Handle resolution of memory pressure
   */
  private handleMemoryPressureResolution(
    currentUsage: number,
    freed: number
  ): void {
    this.emit('memoryPressureResolved', {
      freed,
      currentUsage: currentUsage - freed,
    });

    const newUsage = currentUsage - freed;
    const newPercentage = (newUsage / this.globalMemoryLimitBytes) * 100;
    this.lastMemoryPressure = newPercentage;

    const spilloverEnabled = this.defaultConfig.diskSpilloverConfig?.enabled;
    if (spilloverEnabled) {
      const spilloverThresholdBytes =
        (this.defaultConfig.diskSpilloverConfig?.thresholdMB ?? 400) *
        1024 *
        1024;
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
    groupStats: Array<{ groupId: string; memory: number; events: number }>;
  } {
    const totalUsage = this.getGlobalMemoryUsage();
    const percentage = (totalUsage / this.globalMemoryLimitBytes) * 100;

    const groupStats = Array.from(this.buffers.entries()).map(
      ([groupId, buffer]) => ({
        groupId,
        memory: buffer.getSize() * this.calculateAverageEventSize(groupId),
        events: buffer.getSize(),
      })
    );

    return {
      totalUsage,
      limit: this.globalMemoryLimitBytes,
      percentage,
      groupStats,
    };
  }

  /**
   * Get health status of the event cache
   */
  getHealthStatus(): HealthStatus {
    const memoryStats = this.getMemoryStats();
    const issues: string[] = [];
    
    // Check memory usage
    if (memoryStats.percentage >= 90) {
      issues.push(`Critical memory usage: ${memoryStats.percentage.toFixed(1)}%`);
    } else if (memoryStats.percentage >= 80) {
      issues.push(`High memory usage: ${memoryStats.percentage.toFixed(1)}%`);
    }
    
    // Check disk spillover
    if (this.defaultConfig.diskSpilloverConfig?.enabled && this.diskSpilloverActive) {
      issues.push('Disk spillover is active');
    }
    
    // Check error count
    if (this.errorCount > 10) {
      issues.push(`High error count: ${this.errorCount} errors`);
    }
    
    // Check compression
    if (this.defaultConfig.compressionConfig?.enabled) {
      const compressionActive = Array.from(this.buffers.keys()).some(
        groupId => this.compressionEngine.getStats(groupId) !== undefined
      );
      if (compressionActive) {
        issues.push('Compression is active on some groups');
      }
    }
    
    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (memoryStats.percentage >= 90 || this.errorCount > 50) {
      status = 'unhealthy';
    } else if (memoryStats.percentage >= 80 || this.errorCount > 10 || issues.length > 0) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }
    
    const result: HealthStatus = {
      status,
      errorCount: this.errorCount,
      memoryUsagePercent: memoryStats.percentage,
      issues
    };
    
    if (this.lastError) {
      result.lastError = this.lastError;
    }
    
    return result;
  }
}
