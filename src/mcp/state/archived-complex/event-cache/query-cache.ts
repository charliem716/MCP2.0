import crypto from 'crypto';
import type { EventQuery, CachedEvent } from './manager.js';

interface CacheEntry {
  events: CachedEvent[];
  timestamp: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}

export class QueryCache {
  private cache: Map<string, CacheEntry>;
  private keyQueue: string[];
  private maxSize: number;
  private ttlMs: number;
  private hits = 0;
  private misses = 0;

  constructor(options: { maxSize?: number; ttlMs?: number } = {}) {
    this.maxSize = options.maxSize ?? 100;
    this.ttlMs = options.ttlMs ?? 60000; // 60 seconds default
    this.cache = new Map();
    this.keyQueue = [];
  }

  private getCacheKey(query: EventQuery): string {
    const normalized = {
      groupId: query.groupId ?? '',
      startTime: query.startTime ?? 0,
      endTime: query.endTime ?? 0,
      controlNames: query.controlNames?.sort() ?? [],
      valueFilter: query.valueFilter ?? null,
      limit: query.limit ?? 1000,
      offset: query.offset ?? 0,
      eventTypes: query.eventTypes?.sort() ?? [],
      aggregation: query.aggregation ?? null,
    };

    const json = JSON.stringify(normalized);
    return crypto.createHash('md5').update(json).digest('hex');
  }

  get(query: EventQuery): CachedEvent[] | undefined {
    const key = this.getCacheKey(query);
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check TTL
    const age = Date.now() - entry.timestamp;
    if (age > this.ttlMs) {
      this.cache.delete(key);
      this.removeFromQueue(key);
      this.misses++;
      return undefined;
    }

    this.hits++;
    return entry.events;
  }

  set(query: EventQuery, events: CachedEvent[]): void {
    const key = this.getCacheKey(query);

    // If already exists, update and move to end of queue
    if (this.cache.has(key)) {
      this.removeFromQueue(key);
    }

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldestKey = this.keyQueue.shift();
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    // Add new entry
    this.cache.set(key, {
      events,
      timestamp: Date.now(),
    });
    this.keyQueue.push(key);
  }

  invalidate(groupId?: string): void {
    if (groupId) {
      // Invalidate all queries for specific group
      const keysToDelete: string[] = [];

      for (const [key, entry] of this.cache.entries()) {
        if (entry.events.some(e => e.groupId === groupId)) {
          keysToDelete.push(key);
        }
      }

      keysToDelete.forEach(key => {
        this.cache.delete(key);
        this.removeFromQueue(key);
      });
    } else {
      // Clear entire cache
      this.cache.clear();
      this.keyQueue = [];
    }
  }

  getStats(): CacheStats {
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? this.hits / totalRequests : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      hitRate: Math.round(hitRate * 1000) / 1000, // Round to 3 decimal places
    };
  }

  clear(): void {
    this.cache.clear();
    this.keyQueue = [];
    this.hits = 0;
    this.misses = 0;
  }

  private removeFromQueue(key: string): void {
    const index = this.keyQueue.indexOf(key);
    if (index > -1) {
      this.keyQueue.splice(index, 1);
    }
  }
}