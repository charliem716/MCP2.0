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
import type { ChangeGroupEvent, ControlChange, SpilledEventFile } from './types.js';
import { isChangeGroupEvent, isSpilledEventFile } from './types.js';
import type { 
  ControlValue, 
  EventType, 
  SerializedCachedEvent, 
  TypedQRWCAdapterEvents 
} from './event-types.js';
import { 
  EVENT_TYPES,
  isEventType, 
  isControlValue, 
  isSerializedCachedEvent, 
  parseSerializedEvents,
  getMapValue,
  getMapValueOrDefault
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
    this.globalMemoryLimitBytes = (this.defaultConfig.globalMemoryLimitMB || 500) * 1024 * 1024;
    
    // Apply default compression config
    if (!this.defaultConfig.compressionConfig) {
      this.defaultConfig.compressionConfig = {
        enabled: false,
        checkIntervalMs: 60000, // 1 minute
        recentWindowMs: 60000,  // 1 minute
        mediumWindowMs: 600000, // 10 minutes
        ancientWindowMs: 3600000, // 1 hour
        significantChangePercent: 5,
        minTimeBetweenEventsMs: 100
      };
    }
    
    // Apply default disk spillover config
    if (!this.defaultConfig.diskSpilloverConfig) {
      this.defaultConfig.diskSpilloverConfig = {
        enabled: false,
        directory: './event-cache-spillover',
        thresholdMB: 400,  // Start spillover at 400MB
        maxFileSizeMB: 50
      };
    }
    
    logger.info('EventCacheManager initialized', {
      maxEvents: this.defaultConfig.maxEvents,
      maxAgeMs: this.defaultConfig.maxAgeMs,
      globalMemoryLimitMB: this.defaultConfig.globalMemoryLimitMB || 500,
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
    const { groupId, changes, timestamp, timestampMs, sequenceNumber } = event;
    
    logger.debug('Processing change event', {
      groupId,
      changeCount: changes.length,
      timestampMs
    });
    
    // Ensure buffer exists for this group
    if (!this.buffers.has(groupId)) {
      this.createBuffer(groupId);
    }
    
    const buffer = this.buffers.get(groupId)!;
    const groupLastValues = this.lastValues.get(groupId) || new Map<string, ControlValue>();
    const groupLastTimes = this.lastEventTimes.get(groupId) || new Map<string, number>();
    
    // Process each change
    for (const change of changes) {
      const previousValue = getMapValue(groupLastValues, change.Name);
      const previousTime = getMapValue(groupLastTimes, change.Name);
      
      const eventType = this.detectEventType(change.Name, previousValue, change.Value);
      const threshold = eventType === 'threshold_crossed' 
        ? this.findCrossedThreshold(change.Name, previousValue, change.Value)
        : undefined;
      
      const cachedEvent: CachedEvent = {
        groupId,
        controlName: change.Name,
        timestamp,
        timestampMs,
        value: change.Value,
        string: change.String || String(change.Value),
        previousValue,
        previousString: previousValue !== undefined && previousValue !== null ? String(previousValue) : undefined,
        delta: this.calculateDelta(previousValue, change.Value),
        duration: previousTime ? timestampMs - previousTime : undefined,
        sequenceNumber: this.globalSequence++,
        eventType,
        threshold
      };
      
      buffer.add(cachedEvent, timestamp);
      groupLastValues.set(change.Name, change.Value);
      groupLastTimes.set(change.Name, timestampMs);
    }
    
    this.lastValues.set(groupId, groupLastValues);
    this.lastEventTimes.set(groupId, groupLastTimes);
    
    // Update event rate tracking
    this.updateEventRate(groupId, changes.length);
    
    this.emit('eventsStored', { 
      groupId, 
      count: changes.length,
      totalEvents: buffer.getSize()
    });
    
    // Check memory pressure immediately after adding events
    if (this.defaultConfig.memoryCheckIntervalMs) {
      const usage = this.getGlobalMemoryUsage();
      if (usage > this.globalMemoryLimitBytes) {
        // Use setImmediate to avoid blocking
        setImmediate(() => this.checkMemoryPressure());
      }
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
    // First event has no previous value
    if (previousValue === undefined) {
      return 'change';
    }
    
    // State transition for boolean/string values
    if (typeof currentValue === 'boolean' || typeof currentValue === 'string') {
      if (previousValue !== currentValue) {
        return 'state_transition';
      }
    }
    
    // Numeric analysis
    if (typeof previousValue === 'number' && typeof currentValue === 'number') {
      // Check threshold crossings (hardcoded common thresholds for now)
      const threshold = this.findCrossedThreshold(controlName, previousValue, currentValue);
      if (threshold !== undefined) {
        return 'threshold_crossed';
      }
      
      // Check significant change (5% by default)
      if (previousValue !== 0) {
        const changePercent = Math.abs((currentValue - previousValue) / previousValue) * 100;
        if (changePercent >= 5) {
          return 'significant_change';
        }
      }
    }
    
    return 'change';
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
    const rates = this.eventRates.get(groupId) || [];
    const now = Date.now();
    
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
    const {
      groupId,
      startTime = Date.now() - 60000, // Default: last minute
      endTime = Date.now(),
      controlNames,
      valueFilter,
      limit = 1000,
      offset = 0,
      aggregation = 'raw',
      eventTypes
    } = params;
    
    logger.debug('Querying event cache', {
      groupId,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      controlNames,
      valueFilter,
      limit,
      offset
    });
    
    let results: CachedEvent[] = [];
    
    // Determine which buffers to query
    const buffersToQuery: Array<CircularBuffer<CachedEvent>> = groupId 
      ? (this.buffers.has(groupId) ? [this.buffers.get(groupId)!] : [])
      : Array.from(this.buffers.values());
    
    if (buffersToQuery.length === 0) {
      logger.warn('No buffers found for query', { groupId });
      return [];
    }
    
    // Query each buffer
    for (const buffer of buffersToQuery) {
      // Convert millisecond timestamps to nanoseconds for queryTimeRange
      const startTimeNs = BigInt(startTime) * 1000000n;
      const endTimeNs = BigInt(endTime) * 1000000n;
      
      // Use queryTimeRange for efficient O(log n) time-based filtering
      const events = buffer.queryTimeRange(startTimeNs, endTimeNs);
      
      // Apply filters
      let filtered = events;
      
      if (controlNames && controlNames.length > 0) {
        filtered = filtered.filter((e: CachedEvent) => controlNames.includes(e.controlName));
      }
      
      if (valueFilter) {
        filtered = this.applyValueFilter(filtered, valueFilter);
      }
      
      if (eventTypes && eventTypes.length > 0) {
        filtered = filtered.filter((e: CachedEvent) => 
          e.eventType && eventTypes.includes(e.eventType)
        );
      }
      
      results.push(...filtered);
    }
    
    // Check disk spillover if enabled
    if (this.defaultConfig.diskSpilloverConfig?.enabled) {
      const groupsToCheck = groupId ? [groupId] : this.getGroupIds();
      
      for (const gid of groupsToCheck) {
        const diskEvents = await this.loadFromDisk(gid, startTime, endTime);
        
        // Apply same filters
        let filtered = diskEvents;
        
        if (controlNames && controlNames.length > 0) {
          filtered = filtered.filter((e: CachedEvent) => controlNames.includes(e.controlName));
        }
        
        if (valueFilter) {
          filtered = this.applyValueFilter(filtered, valueFilter);
        }
        
        if (eventTypes && eventTypes.length > 0) {
          filtered = filtered.filter((e: CachedEvent) => 
            e.eventType && eventTypes.includes(e.eventType)
          );
        }
        
        results.push(...filtered);
      }
    }
    
    // Sort by timestamp (oldest first)
    results.sort((a, b) => {
      const diff = a.timestamp - b.timestamp;
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });
    
    // Apply aggregation
    if (aggregation === 'changes_only') {
      results = this.filterChangesOnly(results);
    }
    
    // Apply offset and limit for pagination
    if (offset > 0 || (limit > 0 && results.length > limit)) {
      const start = offset;
      const end = limit > 0 ? start + limit : results.length;
      results = results.slice(start, end);
    }
    
    logger.debug('Query completed', {
      resultCount: results.length,
      offset,
      limit,
      firstEvent: results[0]?.timestampMs,
      lastEvent: results[results.length - 1]?.timestampMs
    });
    
    return results;
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
    
    return events.filter(event => {
      switch (operator) {
        case 'eq': 
          return event.value === value;
          
        case 'neq': 
          return event.value !== value;
          
        case 'gt': 
          return typeof event.value === 'number' && 
                 typeof value === 'number' && 
                 event.value > value;
                 
        case 'gte': 
          return typeof event.value === 'number' && 
                 typeof value === 'number' && 
                 event.value >= value;
                 
        case 'lt': 
          return typeof event.value === 'number' && 
                 typeof value === 'number' && 
                 event.value < value;
                 
        case 'lte': 
          return typeof event.value === 'number' && 
                 typeof value === 'number' && 
                 event.value <= value;
                 
        case 'changed_to': 
          return event.value === value && 
                 event.previousValue !== undefined &&
                 event.previousValue !== value;
                 
        case 'changed_from':
          return event.previousValue !== undefined &&
                 event.previousValue === value && 
                 event.value !== value;
                 
        default: 
          return true;
      }
    });
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
    const rates = this.eventRates.get(groupId) || [];
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
    const intervalMs = this.defaultConfig.cleanupIntervalMs || 30000; // Default 30 seconds
    
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, intervalMs);
    
    // Ensure timer doesn't prevent process exit
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
    
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
    const intervalMs = this.defaultConfig.compressionConfig?.checkIntervalMs || 60000;
    
    this.compressionInterval = setInterval(() => {
      this.performCompression();
    }, intervalMs);
    
    if (this.compressionInterval.unref) {
      this.compressionInterval.unref();
    }
    
    logger.debug('Started compression timer', { intervalMs });
  }
  
  /**
   * Perform event compression for all buffers
   */
  private performCompression(): void {
    const config = this.defaultConfig.compressionConfig!;
    const now = Date.now();
    let totalCompressed = 0;
    
    for (const [groupId, buffer] of this.buffers) {
      const stats = this.compressionStats.get(groupId) || { original: 0, compressed: 0, lastRun: 0 };
      
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
          ratio: ((compressed / beforeSize) * 100).toFixed(1) + '%'
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
    const now = Date.now();
    const events = buffer.getAll();
    if (events.length === 0) return 0;
    
    // Group events by control name
    const controlEvents = new Map<string, CachedEvent[]>();
    for (const event of events) {
      const list = controlEvents.get(event.controlName) || [];
      list.push(event);
      controlEvents.set(event.controlName, list);
    }
    
    let compressedCount = 0;
    const eventsToKeep: CachedEvent[] = [];
    
    for (const [controlName, eventList] of controlEvents) {
      // Sort by timestamp
      eventList.sort((a, b) => {
        const diff = a.timestamp - b.timestamp;
        return diff > 0n ? 1 : diff < 0n ? -1 : 0;
      });
      
      let lastKeptEvent: CachedEvent | null = null;
      
      for (const event of eventList) {
        const age = now - event.timestampMs;
        let keepEvent = false;
        
        if (age < config.recentWindowMs!) {
          // Recent window: keep all events
          keepEvent = true;
        } else if (age < config.mediumWindowMs!) {
          // Medium window: keep significant changes
          if (lastKeptEvent) {
            // Check time gap
            const timeSinceLastKept = event.timestampMs - lastKeptEvent.timestampMs;
            if (timeSinceLastKept < config.minTimeBetweenEventsMs!) {
              keepEvent = false;
            } else if (event.eventType === 'state_transition' || event.eventType === 'threshold_crossed') {
              keepEvent = true;
            } else if (typeof event.value === 'number' && typeof lastKeptEvent.value === 'number') {
              // Check numeric significance
              const change = Math.abs(event.value - lastKeptEvent.value);
              const percentChange = lastKeptEvent.value !== 0 
                ? (change / Math.abs(lastKeptEvent.value)) * 100
                : change > 0 ? 100 : 0;
              keepEvent = percentChange >= config.significantChangePercent!;
            } else if (event.value !== lastKeptEvent.value) {
              // Non-numeric value changed
              keepEvent = true;
            }
          } else {
            // Always keep first event
            keepEvent = true;
          }
        } else if (age < config.ancientWindowMs!) {
          // Ancient window: only state transitions
          if (event.eventType === 'state_transition' || event.eventType === 'threshold_crossed') {
            keepEvent = true;
          } else if (lastKeptEvent && event.value !== lastKeptEvent.value) {
            // Keep if value changed from last kept event
            keepEvent = true;
          }
        }
        // Events older than ancient window are dropped
        
        if (keepEvent) {
          eventsToKeep.push(event);
          lastKeptEvent = event;
        } else {
          compressedCount++;
        }
      }
    }
    
    // Replace buffer contents if we compressed anything
    if (compressedCount > 0) {
      buffer.clear();
      // Re-add kept events in chronological order
      eventsToKeep.sort((a, b) => {
        const diff = a.timestamp - b.timestamp;
        return diff > 0n ? 1 : diff < 0n ? -1 : 0;
      });
      
      for (const event of eventsToKeep) {
        buffer.add(event, event.timestamp);
      }
    }
    
    return compressedCount;
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
        this.checkMemoryPressure();
      }, this.defaultConfig.memoryCheckIntervalMs || 10000);
      
      if (this.memoryCheckInterval.unref) {
        this.memoryCheckInterval.unref();
      }
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
    if (!this.defaultConfig.diskSpilloverConfig?.enabled) return;
    
    const dir = this.defaultConfig.diskSpilloverConfig.directory!;
    try {
      await fs.mkdir(dir, { recursive: true });
      logger.info('Disk spillover directory initialized', { directory: dir });
    } catch (error) {
      logger.error('Failed to create spillover directory', { error, directory: dir });
      // Disable spillover if we can't create directory
      this.defaultConfig.diskSpilloverConfig.enabled = false;
    }
  }
  
  /**
   * Spill events to disk when memory threshold is exceeded
   */
  private async spillToDisk(groupId: string, events: CachedEvent[]): Promise<boolean> {
    if (!this.defaultConfig.diskSpilloverConfig?.enabled || events.length === 0) {
      return false;
    }
    
    const dir = this.defaultConfig.diskSpilloverConfig.directory!;
    const timestamp = Date.now();
    const filename = `${groupId}-${timestamp}-${events.length}.json`;
    const filepath = path.join(dir, filename);
    
    try {
      // Convert bigint timestamps to strings for JSON serialization
      const serializable = events.map(e => ({
        ...e,
        timestamp: e.timestamp.toString()
      }));
      
      const data = JSON.stringify({
        groupId,
        timestamp,
        eventCount: events.length,
        startTime: events[0]?.timestampMs ?? 0,
        endTime: events[events.length - 1]?.timestampMs ?? 0,
        events: serializable
      });
      
      await fs.writeFile(filepath, data, 'utf8');
      
      logger.info('Spilled events to disk', {
        groupId,
        filename,
        eventCount: events.length,
        sizeBytes: data.length
      });
      
      this.emit('diskSpillover', { groupId, filename, eventCount: events.length });
      return true;
      
    } catch (error) {
      logger.error('Failed to spill events to disk', { error, groupId, filename });
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
    
    const dir = this.defaultConfig.diskSpilloverConfig.directory!;
    const events: CachedEvent[] = [];
    
    try {
      const files = await fs.readdir(dir);
      const groupFiles = files.filter(f => f.startsWith(`${groupId}-`) && f.endsWith('.json'));
      
      for (const file of groupFiles) {
        try {
          const filepath = path.join(dir, file);
          const data = await fs.readFile(filepath, 'utf8');
          const parsed: unknown = JSON.parse(data);
          
          if (!isSpilledEventFile(parsed)) {
            logger.warn('Invalid spilled event file format', { file });
            continue;
          }
          
          // Quick check if file might contain events in our range
          if (parsed.endTime < startTime || parsed.startTime > endTime) {
            continue;
          }
          
          // Deserialize events, converting timestamp back to bigint
          const fileEvents: CachedEvent[] = parsed.events
            .filter((e): e is SerializedCachedEvent => isSerializedCachedEvent(e))
            .map((e) => ({
              ...e,
              timestamp: BigInt(e.timestamp),
              eventType: e.eventType && isEventType(e.eventType) ? e.eventType : undefined,
              value: e.value as ControlValue,
              previousValue: e.previousValue as ControlValue | undefined
            }))
            .filter((e) => e.timestampMs >= startTime && e.timestampMs <= endTime);
          
          events.push(...fileEvents);
          
        } catch (error) {
          logger.error('Failed to load spilled file', { error, file });
        }
      }
      
      // Sort by timestamp
      events.sort((a, b) => {
        const diff = a.timestamp - b.timestamp;
        return diff > 0n ? 1 : diff < 0n ? -1 : 0;
      });
      
      logger.debug('Loaded events from disk', {
        groupId,
        fileCount: groupFiles.length,
        eventCount: events.length
      });
      
    } catch (error) {
      logger.error('Failed to read spillover directory', { error, dir });
    }
    
    return events;
  }
  
  /**
   * Clean up old spillover files
   */
  private async cleanupSpilloverFiles(): Promise<void> {
    if (!this.defaultConfig.diskSpilloverConfig?.enabled) return;
    
    const dir = this.defaultConfig.diskSpilloverConfig.directory!;
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
    
    const spilloverEnabled = this.defaultConfig.diskSpilloverConfig?.enabled;
    const spilloverThresholdBytes = spilloverEnabled 
      ? (this.defaultConfig.diskSpilloverConfig?.thresholdMB || 400) * 1024 * 1024
      : Number.MAX_SAFE_INTEGER;
    
    // Check if we should spill to disk first
    if (spilloverEnabled && currentUsage > spilloverThresholdBytes && !this.diskSpilloverActive) {
      this.diskSpilloverActive = true;
      await this.performDiskSpillover();
    }
    
    // Strategy: Evict oldest events from largest buffers, respecting priorities
    const bufferSizes = Array.from(this.buffers.entries())
      .map(([id, buffer]) => ({
        groupId: id,
        size: buffer.getSize(),
        memory: buffer.getSize() * this.calculateAverageEventSize(id),
        priority: this.groupPriorities.get(id) || 'normal'
      }))
      // Sort by priority first (low priority first), then by memory usage
      .sort((a, b) => {
        const priorityOrder = { low: 0, normal: 1, high: 2 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return b.memory - a.memory;
      });
    
    let freed = 0;
    const target = currentUsage - (this.globalMemoryLimitBytes * 0.7); // Free to 70% for buffer
    
    // Multiple passes with increasing aggression
    let pass = 0;
    while (freed < target && pass < 3) {
      pass++;
      
      for (const { groupId, size, priority } of bufferSizes) {
        if (freed >= target) break;
        
        // Skip high priority groups in first pass only
        if (priority === 'high' && pass === 1 && freed < target * 0.5) continue;
        
        const buffer = this.buffers.get(groupId)!;
        const currentSize = buffer.getSize();
        if (currentSize === 0) continue;
        
        // Increasingly aggressive eviction per pass
        const evictionRate = pass === 1 ? 0.3 : pass === 2 ? 0.5 : 0.7;
        const minEvict = pass === 1 ? 100 : pass === 2 ? 200 : 500;
        const toEvict = Math.min(
          Math.max(Math.floor(currentSize * evictionRate), minEvict),
          currentSize
        );
        
        const evicted = buffer.forceEvict(toEvict);
        if (evicted > 0) {
          freed += evicted * this.calculateAverageEventSize(groupId);
          
          logger.info('Evicted events due to memory pressure', { 
            groupId, 
            evicted,
            remaining: buffer.getSize(),
            priority,
            pass
          });
        }
      }
      
      // Recalculate buffer sizes for next pass
      if (freed < target) {
        bufferSizes.sort((a, b) => {
          const aBuffer = this.buffers.get(a.groupId);
          const bBuffer = this.buffers.get(b.groupId);
          const aSize = aBuffer ? aBuffer.getSize() : 0;
          const bSize = bBuffer ? bBuffer.getSize() : 0;
          return bSize - aSize;
        });
      }
    }
    
    // Final check: if still over limit, clear smallest groups entirely
    if (currentUsage - freed > this.globalMemoryLimitBytes) {
      logger.warn('Memory pressure critical - clearing smallest groups');
      
      // Sort by size ascending (smallest first)
      const smallestFirst = bufferSizes.slice().reverse();
      
      for (const { groupId } of smallestFirst) {
        if (currentUsage - freed <= this.globalMemoryLimitBytes * 0.7) break;
        
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
    }
    
    this.emit('memoryPressureResolved', { freed, currentUsage: currentUsage - freed });
    
    // Update last memory pressure after resolution
    const newUsage = currentUsage - freed;
    const newPercentage = (newUsage / this.globalMemoryLimitBytes) * 100;
    this.lastMemoryPressure = newPercentage;
    
    // Reset spillover flag if memory is under control
    if (newUsage < spilloverThresholdBytes * 0.8) {
      this.diskSpilloverActive = false;
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