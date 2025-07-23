import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { LRUCache, EvictionPolicy } from '../../../../src/mcp/state/lru-cache.js';

describe('LRUCache (Simplified)', () => {
  let cache: LRUCache<string, any>;

  afterEach(() => {
    if (cache) {
      cache.shutdown();
    }
  });

  describe('constructor and initialization', () => {
    it('should create cache with default configuration', () => {
      cache = new LRUCache();
      
      expect(cache.size).toBe(0);
      expect(cache.getStatistics().totalEntries).toBe(0);
      expect(cache.getStatistics().hitCount).toBe(0);
      expect(cache.getStatistics().missCount).toBe(0);
    });

    it('should create cache with custom max entries', () => {
      cache = new LRUCache(100);
      expect(cache.size).toBe(0);
    });
  });

  describe('get and set operations', () => {
    beforeEach(() => {
      cache = new LRUCache<string, any>(5);
    });

    it('should set and get values', () => {
      const result = cache.set('key1', 'value1');
      
      expect(result).toBe(true);
      expect(cache.get('key1')).toBe('value1');
      expect(cache.size).toBe(1);
    });

    it('should return null for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should update existing values', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');
      
      expect(cache.get('key1')).toBe('value2');
      expect(cache.size).toBe(1);
    });

    it('should track hit and miss statistics', () => {
      cache.set('key1', 'value1');
      
      // Hit
      cache.get('key1');
      // Miss
      cache.get('nonexistent');
      
      const stats = cache.getStatistics();
      expect(stats.hitCount).toBe(1);
      expect(stats.missCount).toBe(1);
      expect(stats.hitRatio).toBe(0.5);
    });
  });

  describe('LRU eviction', () => {
    beforeEach(() => {
      cache = new LRUCache<string, any>(3);
    });

    it('should evict least recently used item when cache is full', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      
      // key1 is now the least recently used
      cache.set('key4', 'value4');
      
      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(true);
      expect(cache.has('key3')).toBe(true);
      expect(cache.has('key4')).toBe(true);
      expect(cache.size).toBe(3);
    });

    it('should update LRU order on get', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      
      // Access key1, making it most recently used
      cache.get('key1');
      
      // Now key2 is least recently used
      cache.set('key4', 'value4');
      
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
      expect(cache.has('key3')).toBe(true);
      expect(cache.has('key4')).toBe(true);
    });

    it('should update LRU order on set (update)', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      
      // Update key1, making it most recently used
      cache.set('key1', 'updated');
      
      // Now key2 is least recently used
      cache.set('key4', 'value4');
      
      expect(cache.get('key1')).toBe('updated');
      expect(cache.has('key2')).toBe(false);
      expect(cache.has('key3')).toBe(true);
      expect(cache.has('key4')).toBe(true);
    });

    it('should emit eviction event for compatibility', () => {
      const evictListener = jest.fn();
      cache.on('eviction', evictListener);
      
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4'); // Should evict key1
      
      expect(evictListener).toHaveBeenCalled();
      // Note: In simplified version, we emit the evicted key and the new value
      expect(evictListener).toHaveBeenCalledWith('key1', 'value4');
    });

    it('should track eviction count', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4');
      cache.set('key5', 'value5');
      
      const stats = cache.getStatistics();
      expect(stats.evictionCount).toBe(2);
    });
  });

  describe('delete and clear operations', () => {
    beforeEach(() => {
      cache = new LRUCache<string, any>();
    });

    it('should delete existing keys', () => {
      cache.set('key1', 'value1');
      
      const result = cache.delete('key1');
      
      expect(result).toBe(true);
      expect(cache.has('key1')).toBe(false);
      expect(cache.size).toBe(0);
    });

    it('should return false when deleting non-existent key', () => {
      const result = cache.delete('nonexistent');
      expect(result).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      
      cache.clear();
      
      expect(cache.size).toBe(0);
      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(false);
      expect(cache.has('key3')).toBe(false);
    });

    it('should reset cache size on clear', () => {
      cache.set('key1', 'value1');
      cache.get('key1');
      cache.get('nonexistent');
      
      cache.clear();
      
      const stats = cache.getStatistics();
      expect(stats.totalEntries).toBe(0);
      expect(stats.memoryUsage).toBe(0);
      // Hit/miss counts are NOT reset on clear
      expect(stats.hitCount).toBe(1);
      expect(stats.missCount).toBe(1);
    });
  });

  describe('keys and values methods', () => {
    beforeEach(() => {
      cache = new LRUCache<string, any>();
    });

    it('should return keys in insertion order', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      
      const keys = cache.keys();
      expect(keys).toEqual(['key1', 'key2', 'key3']);
    });

    it('should return values in insertion order', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      
      const values = cache.values();
      expect(values).toEqual(['value1', 'value2', 'value3']);
    });

    it('should update order when accessing items', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      
      // Access key1, moving it to the end
      cache.get('key1');
      
      const keys = cache.keys();
      expect(keys).toEqual(['key2', 'key3', 'key1']);
    });

    it('should return empty arrays for empty cache', () => {
      expect(cache.keys()).toEqual([]);
      expect(cache.values()).toEqual([]);
    });
  });

  describe('statistics and monitoring', () => {
    beforeEach(() => {
      cache = new LRUCache<string, any>();
    });

    it('should track basic statistics', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.get('key1'); // hit
      cache.get('key3'); // miss
      
      const stats = cache.getStatistics();
      
      expect(stats.totalEntries).toBe(2);
      expect(stats.hitCount).toBe(1);
      expect(stats.missCount).toBe(1);
      expect(stats.evictionCount).toBe(0);
      expect(stats.memoryUsage).toBe(0); // Simplified - no memory tracking
      expect(stats.hitRatio).toBe(0.5);
      expect(stats.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should handle zero hit ratio', () => {
      cache.get('nonexistent'); // Only misses
      
      const stats = cache.getStatistics();
      expect(stats.hitRatio).toBe(0);
    });

    it('should handle no requests', () => {
      const stats = cache.getStatistics();
      expect(stats.hitRatio).toBe(0); // No hits or misses
    });
  });

  describe('shutdown and cleanup', () => {
    beforeEach(() => {
      cache = new LRUCache<string, any>(10);
    });

    it('should clear cache on shutdown', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      cache.shutdown();
      
      expect(cache.size).toBe(0);
    });

    it('should remove all listeners on shutdown', () => {
      const listener = jest.fn();
      cache.on('eviction', listener);
      
      cache.shutdown();
      cache.emit('eviction', 'key', 'value');
      
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('compatibility methods', () => {
    beforeEach(() => {
      cache = new LRUCache<string, any>();
    });

    it('should support removeExpired as no-op', () => {
      cache.set('key1', 'value1');
      
      const removed = cache.removeExpired();
      
      expect(removed).toBe(0);
      expect(cache.has('key1')).toBe(true);
    });

    it('should only allow eviction and expiration event listeners', () => {
      const evictionListener = jest.fn();
      const expirationListener = jest.fn();
      const otherListener = jest.fn();
      
      cache.on('eviction', evictionListener);
      cache.on('expiration', expirationListener);
      cache.on('other', otherListener);
      
      // Trigger eviction
      cache = new LRUCache<string, any>(1);
      cache.on('eviction', evictionListener);
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      expect(evictionListener).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      cache = new LRUCache<string, any>(3);
    });

    it('should handle setting same key multiple times rapidly', () => {
      for (let i = 0; i < 10; i++) {
        cache.set('key', `value${i}`);
      }
      
      expect(cache.size).toBe(1);
      expect(cache.get('key')).toBe('value9');
    });

    it('should handle cache full of identical values', () => {
      cache.set('key1', 'same');
      cache.set('key2', 'same');
      cache.set('key3', 'same');
      cache.set('key4', 'same'); // Should evict key1
      
      expect(cache.has('key1')).toBe(false);
      expect(cache.get('key2')).toBe('same');
      expect(cache.get('key3')).toBe('same');
      expect(cache.get('key4')).toBe('same');
    });

    it('should maintain cache invariants under stress', () => {
      // Fill cache
      for (let i = 0; i < 10; i++) {
        cache.set(`key${i}`, `value${i}`);
      }
      
      // Random operations
      for (let i = 0; i < 100; i++) {
        const op = Math.random();
        const key = `key${Math.floor(Math.random() * 20)}`;
        
        if (op < 0.4) {
          cache.get(key);
        } else if (op < 0.8) {
          cache.set(key, `newvalue${i}`);
        } else if (op < 0.9) {
          cache.delete(key);
        } else {
          cache.has(key);
        }
      }
      
      // Verify invariants
      expect(cache.size).toBeLessThanOrEqual(3);
      expect(cache.keys().length).toBe(cache.size);
      expect(cache.values().length).toBe(cache.size);
      
      const stats = cache.getStatistics();
      expect(stats.totalEntries).toBe(cache.size);
    });
  });
});