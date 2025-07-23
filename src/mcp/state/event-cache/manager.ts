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

/**
 * Cached event with full metadata
 */
export interface CachedEvent {
  groupId: string;
  controlName: string;
  timestamp: bigint;
  timestampMs: number;
  value: unknown;
  string: string;
  previousValue?: unknown;
  previousString?: string;
  delta?: number | undefined;
  duration?: number | undefined;
  sequenceNumber: number;
}

/**
 * Query parameters for historical event searches
 */
export interface EventQuery {
  groupId?: string | undefined;
  startTime?: number | undefined;
  endTime?: number | undefined;
  controlNames?: string[] | undefined;
  valueFilter?: {
    operator: 'eq' | 'neq' | 'gt' | 'lt' | 'changed_to' | 'changed_from';
    value?: unknown;
  } | undefined;
  limit?: number | undefined;
  aggregation?: 'raw' | 'changes_only' | 'summary' | undefined;
}

/**
 * Statistics for a change group's event cache
 */
export interface CacheStatistics {
  eventCount: number;
  oldestEvent?: number | undefined;
  newestEvent?: number | undefined;
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
}

/**
 * Manages event caching for all change groups
 */
export class EventCacheManager extends EventEmitter {
  private buffers: Map<string, CircularBuffer<CachedEvent>>;
  private globalSequence: number = 0;
  private lastValues: Map<string, Map<string, unknown>>;
  private lastEventTimes: Map<string, Map<string, number>>;
  private eventRates: Map<string, number[]>;
  private isAttached: boolean = false;
  private cleanupInterval?: NodeJS.Timeout;
  
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
    
    logger.info('EventCacheManager initialized', {
      maxEvents: this.defaultConfig.maxEvents,
      maxAgeMs: this.defaultConfig.maxAgeMs
    });
    
    // Start background cleanup timer if maxAge is configured
    if (this.defaultConfig.maxAgeMs && this.defaultConfig.maxAgeMs > 0) {
      this.startCleanupTimer();
    }
  }
  
  /**
   * Attach to a QRWC adapter to listen for change events
   */
  attachToAdapter(adapter: QRWCClientAdapter): void {
    if (this.isAttached) {
      logger.warn('EventCacheManager already attached to adapter');
      return;
    }
    
    adapter.on('changeGroup:changes', (event) => {
      this.handleChangeEvent(event);
    });
    
    this.isAttached = true;
    logger.info('EventCacheManager attached to QRWCClientAdapter');
  }
  
  /**
   * Handle incoming change event from adapter
   */
  private handleChangeEvent(event: any): void {
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
    const groupLastValues = this.lastValues.get(groupId) || new Map();
    const groupLastTimes = this.lastEventTimes.get(groupId) || new Map();
    
    // Process each change
    for (const change of changes) {
      const previousValue = groupLastValues.get(change.Name);
      const previousTime = groupLastTimes.get(change.Name);
      
      const cachedEvent: CachedEvent = {
        groupId,
        controlName: change.Name,
        timestamp,
        timestampMs,
        value: change.Value,
        string: change.String,
        previousValue,
        previousString: previousValue?.toString(),
        delta: this.calculateDelta(previousValue, change.Value),
        duration: previousTime ? timestampMs - previousTime : undefined,
        sequenceNumber: this.globalSequence++
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
  private calculateDelta(previousValue: unknown, currentValue: unknown): number | undefined {
    if (typeof previousValue === 'number' && typeof currentValue === 'number') {
      return currentValue - previousValue;
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
  query(params: EventQuery): CachedEvent[] {
    const {
      groupId,
      startTime = Date.now() - 60000, // Default: last minute
      endTime = Date.now(),
      controlNames,
      valueFilter,
      limit = 1000,
      aggregation = 'raw'
    } = params;
    
    logger.debug('Querying event cache', {
      groupId,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      controlNames,
      valueFilter,
      limit
    });
    
    let results: CachedEvent[] = [];
    
    // Determine which buffers to query
    const buffersToQuery: CircularBuffer<CachedEvent>[] = groupId 
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
      
      results.push(...filtered);
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
    
    // Apply limit
    if (limit > 0 && results.length > limit) {
      results = results.slice(0, limit);
    }
    
    logger.debug('Query completed', {
      resultCount: results.length,
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
                 
        case 'lt': 
          return typeof event.value === 'number' && 
                 typeof value === 'number' && 
                 event.value < value;
                 
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
    const events = (buffer as any).getAll ? (buffer as any).getAll() : [];
    
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
   * Stop cleanup timer and clean up resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
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
}