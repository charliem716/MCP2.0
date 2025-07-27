import { EventEmitter } from 'events';
import { globalLogger as logger } from '../../shared/utils/logger.js';
import { config as envConfig } from '../../shared/utils/env.js';
import type { CacheStatistics } from './repository.js';

/**
 * Events emitted by LRUCache
 */
export interface LRUCacheEvents<K, V> {
  eviction: (key: K, value: V) => void;
  expiration: (key: K, value: V) => void;
}

/**
 * Simple LRU Cache implementation using Map's insertion order
 *
 * Features:
 * - O(1) get, set, delete operations using Map
 * - Automatic LRU eviction when cache is full
 * - Basic statistics tracking (hits, misses, evictions)
 * - Simple and maintainable code
 */
export class LRUCache<K, V> extends EventEmitter {
  private readonly cache = new Map<K, V>();
  private hitCount = 0;
  private missCount = 0;
  private evictionCount = 0;
  private readonly createdAt = Date.now();

  constructor(private readonly maxEntries = envConfig.cache.maxEntries) {
    super();

    logger.debug('LRU Cache initialized', { maxEntries });
  }

  /**
   * Get value from cache
   */
  get(key: K): V | null {
    const value = this.cache.get(key);

    if (value === undefined) {
      this.missCount++;
      return null;
    }

    // Move to end (most recent) by deleting and re-adding
    this.cache.delete(key);
    this.cache.set(key, value);

    this.hitCount++;
    return value;
  }

  /**
   * Set key-value pair in cache
   */
  set(key: K, value: V): boolean {
    // If key exists, delete it first to update position
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Add new entry
    this.cache.set(key, value);

    // Check if we need to evict
    if (this.cache.size > this.maxEntries) {
      // Get first (oldest) key and value
      const firstKey = this.cache.keys().next().value as K;
      const evictedValue = this.cache.get(firstKey);
      this.cache.delete(firstKey);
      this.evictionCount++;

      // Emit eviction event for compatibility
      if (evictedValue) {
        this.emit('eviction', firstKey, evictedValue);
      }
    }

    return true;
  }

  /**
   * Delete key from cache
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Check if key exists in cache
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Clear all entries from cache
   */
  clear(): void {
    this.cache.clear();
    logger.debug('Cache cleared');
  }

  /**
   * Get all keys in cache (in LRU order, most recent last)
   */
  keys(): K[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all values in cache (in LRU order)
   */
  values(): V[] {
    return Array.from(this.cache.values());
  }

  /**
   * Get cache size (number of entries)
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   */
  getStatistics(): CacheStatistics {
    const total = this.hitCount + this.missCount;
    const hitRatio = total > 0 ? this.hitCount / total : 0;

    return {
      totalEntries: this.cache.size,
      hitCount: this.hitCount,
      missCount: this.missCount,
      evictionCount: this.evictionCount,
      memoryUsage: 0, // Simplified - no memory tracking
      hitRatio,
      uptime: Date.now() - this.createdAt,
    };
  }

  /**
   * Cleanup resources (for compatibility)
   */
  shutdown(): void {
    this.clear();
    this.removeAllListeners();
    logger.debug('LRU Cache shutdown completed');
  }

  // Compatibility methods for existing code

  /**
   * Remove expired entries (no-op in simplified version)
   */
  removeExpired(): number {
    return 0;
  }

  /**
   * Emit events (for compatibility with listeners)
   */
  override on<E extends keyof LRUCacheEvents<K, V>>(
    event: E,
    listener: LRUCacheEvents<K, V>[E]
  ): this;
  override on(
    event: string | symbol,
    listener: (...args: unknown[]) => void
  ): this {
    // Only support 'eviction' and 'expiration' events for compatibility
    if (event === 'eviction' || event === 'expiration') {
      return super.on(event, listener);
    }
    return this;
  }
}

// Export enum for compatibility (though only LRU is supported)
export enum EvictionPolicy {
  LRU = 'lru',
}

// Export enum for compatibility (though events are minimally used)
export enum CacheEvent {
  Hit = 'hit',
  Miss = 'miss',
  Set = 'set',
  Evict = 'evict',
  Clear = 'clear',
  Expire = 'expire',
}
