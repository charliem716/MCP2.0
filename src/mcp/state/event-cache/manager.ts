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
  eventType?: 'change' | 'threshold_crossed' | 'state_transition' | 'significant_change' | undefined;
  threshold?: number | undefined;
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
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'changed_to' | 'changed_from';
    value?: unknown;
  } | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  aggregation?: 'raw' | 'changes_only' | 'summary' | undefined;
  eventTypes?: Array<'change' | 'threshold_crossed' | 'state_transition' | 'significant_change'>;
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
  globalMemoryLimitMB?: number;
  memoryCheckIntervalMs?: number;
}

/**
 * Manages event caching for all change groups
 */
export class EventCacheManager extends EventEmitter {
  private buffers: Map<string, CircularBuffer<CachedEvent>>;
  private globalSequence = 0;
  private lastValues: Map<string, Map<string, unknown>>;
  private lastEventTimes: Map<string, Map<string, number>>;
  private eventRates: Map<string, number[]>;
  private isAttached = false;
  private cleanupInterval?: NodeJS.Timeout;
  private memoryCheckInterval?: NodeJS.Timeout;
  private globalMemoryLimitBytes: number;
  private lastMemoryPressure = 0;
  private groupPriorities: Map<string, 'high' | 'normal' | 'low'>;
  
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
    this.globalMemoryLimitBytes = (this.defaultConfig.globalMemoryLimitMB || 500) * 1024 * 1024;
    
    logger.info('EventCacheManager initialized', {
      maxEvents: this.defaultConfig.maxEvents,
      maxAgeMs: this.defaultConfig.maxAgeMs,
      globalMemoryLimitMB: this.defaultConfig.globalMemoryLimitMB || 500
    });
    
    // Start background cleanup timer if maxAge is configured
    if (this.defaultConfig.maxAgeMs && this.defaultConfig.maxAgeMs > 0) {
      this.startCleanupTimer();
    }
    
    // Start memory monitoring
    this.startMemoryMonitoring();
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
        string: change.String,
        previousValue,
        previousString: previousValue?.toString(),
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
        this.checkMemoryPressure();
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
  private calculateDelta(previousValue: unknown, currentValue: unknown): number | undefined {
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
    previousValue: unknown,
    currentValue: unknown
  ): CachedEvent['eventType'] {
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
    previousValue: unknown,
    currentValue: unknown
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
  query(params: EventQuery): CachedEvent[] {
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
      delete (this as any).cleanupInterval;
    }
    
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      delete (this as any).memoryCheckInterval;
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
  private checkMemoryPressure(): void {
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
      this.handleMemoryPressure(usage);
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
   * Handle memory pressure by evicting events
   */
  private handleMemoryPressure(currentUsage: number): void {
    logger.warn('Handling memory pressure', { 
      currentUsage, 
      limit: this.globalMemoryLimitBytes 
    });
    
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