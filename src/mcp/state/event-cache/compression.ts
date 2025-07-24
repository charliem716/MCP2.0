/**
 * Compression Engine for Event Cache
 * 
 * Handles event compression based on time windows and significance thresholds
 */

import type { CachedEvent, EventCacheConfig } from './manager.js';
import { globalLogger as logger } from '../../../shared/utils/logger.js';

export interface CompressionStats {
  original: number;
  compressed: number;
  lastRun: number;
}

export class CompressionEngine {
  private compressionStats = new Map<string, CompressionStats>();
  
  /**
   * Get compression statistics for a group
   */
  getStats(groupId: string): CompressionStats | undefined {
    return this.compressionStats.get(groupId);
  }
  
  /**
   * Set compression statistics for a group
   */
  setStats(groupId: string, stats: CompressionStats): void {
    this.compressionStats.set(groupId, stats);
  }
  
  /**
   * Clear all compression statistics
   */
  clearStats(): void {
    this.compressionStats.clear();
  }
  
  /**
   * Check if compression should run for a group
   */
  shouldCompress(groupId: string, now: number): boolean {
    const stats = this.compressionStats.get(groupId);
    return !stats || (now - stats.lastRun) > 30000; // 30 second cooldown
  }
  
  /**
   * Compress events in a buffer based on configured rules
   */
  compressEvents(
    events: CachedEvent[],
    config: NonNullable<EventCacheConfig['compressionConfig']>
  ): { kept: CachedEvent[]; compressed: number } {
    if (events.length === 0) {
      return { kept: [], compressed: 0 };
    }
    
    // Group events by control name
    const controlEvents = new Map<string, CachedEvent[]>();
    for (const event of events) {
      const controlName = event.controlName;
      if (!controlEvents.has(controlName)) {
        controlEvents.set(controlName, []);
      }
      controlEvents.get(controlName)!.push(event);
    }
    
    // Apply compression to each control
    const eventsToKeep = this.selectEventsToKeep(controlEvents, config);
    const compressed = events.length - eventsToKeep.length;
    
    logger.debug('Compression complete', {
      original: events.length,
      kept: eventsToKeep.length,
      compressed
    });
    
    return { kept: eventsToKeep, compressed };
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
    
    for (const [controlName, events] of controlEvents) {
      // Sort by timestamp
      events.sort((a, b) => Number(a.timestamp - b.timestamp));
      
      // Apply compression rules
      const keptEvents = this.applyCompressionRules(events, config, now);
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
    const keptEvents: CachedEvent[] = [];
    let lastKeptEvent: CachedEvent | null = null;
    
    for (const event of events) {
      const age = now - event.timestampMs;
      
      if (this.shouldKeepEvent(event, lastKeptEvent, age, config)) {
        keptEvents.push(event);
        lastKeptEvent = event;
      }
    }
    
    return keptEvents;
  }
  
  /**
   * Determine if an event should be kept based on age and compression rules
   */
  private shouldKeepEvent(
    event: CachedEvent,
    lastKeptEvent: CachedEvent | null,
    age: number,
    config: NonNullable<EventCacheConfig['compressionConfig']>
  ): boolean {
    if (age < (config.recentWindowMs ?? 60000)) {
      return true;
    }
    
    if (event.eventType === 'threshold_crossed') {
      return true;
    }
    
    if (age < (config.mediumWindowMs ?? 300000)) {
      return this.isSignificantChange(event, lastKeptEvent, config);
    }
    
    if (age < (config.ancientWindowMs ?? 900000)) {
      return this.isStateTransition(event, lastKeptEvent);
    }
    
    return false;
  }
  
  /**
   * Check if an event represents a significant change
   */
  private isSignificantChange(
    event: CachedEvent,
    lastKeptEvent: CachedEvent | null,
    config: NonNullable<EventCacheConfig['compressionConfig']>
  ): boolean {
    if (!lastKeptEvent) return true;
    
    if (event.eventType === 'significant_change' || event.eventType === 'state_transition') {
      return true;
    }
    
    const timeDiff = event.timestampMs - lastKeptEvent.timestampMs;
    if (timeDiff < (config.minTimeBetweenEventsMs ?? 1000)) {
      return false;
    }
    
    if (typeof event.value === 'number' && typeof lastKeptEvent.value === 'number') {
      const percentChange = Math.abs((event.value - lastKeptEvent.value) / lastKeptEvent.value) * 100;
      return percentChange >= (config.significantChangePercent ?? 10);
    }
    
    return event.value !== lastKeptEvent.value;
  }
  
  /**
   * Check if an event represents a state transition
   */
  private isStateTransition(
    event: CachedEvent,
    lastKeptEvent: CachedEvent | null
  ): boolean {
    if (!lastKeptEvent) return true;
    
    if (typeof event.value === 'boolean') {
      return event.value !== lastKeptEvent.value;
    }
    
    if (event.eventType === 'state_transition') {
      return true;
    }
    
    if (typeof event.value === 'number' && typeof lastKeptEvent.value === 'number') {
      const wasNegative = lastKeptEvent.value < 0;
      const isNegative = event.value < 0;
      return wasNegative !== isNegative;
    }
    
    return false;
  }
}