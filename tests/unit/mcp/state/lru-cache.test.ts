import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import {
  LRUCache,
  EvictionPolicy,
  CacheEvent,
} from '../../../../src/mcp/state/lru-cache';

describe('LRUCache (Fixed)', () => {
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

    it('should create cache with custom configuration', () => {
      // Note: The simplified LRUCache only uses maxEntries parameter
      cache = new LRUCache(100);

      expect(cache.size).toBe(0);
    });

    it('should track statistics over time', () => {
      cache = new LRUCache(100);
      
      const stats = cache.getStatistics();
      expect(stats.uptime).toBeGreaterThanOrEqual(0);
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

    it('should emit eviction event', () => {
      const evictListener = jest.fn();
      cache.on('eviction', evictListener);

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4'); // Should evict key1

      expect(evictListener).toHaveBeenCalledWith('key1', 'value1'); // Emits with the evicted value
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
      cache = new LRUCache<string, any>(5);
    });

    it('should delete entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const result = cache.delete('key1');

      expect(result).toBe(true);
      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(true);
      expect(cache.size).toBe(1);
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
  });

  describe('keys and values methods', () => {
    beforeEach(() => {
      cache = new LRUCache<string, any>(5);
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

    it('should update order after access', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Access key1 to move it to the end
      cache.get('key1');

      const keys = cache.keys();
      expect(keys).toEqual(['key2', 'key3', 'key1']);
    });
  });

  describe('statistics and monitoring', () => {
    beforeEach(() => {
      cache = new LRUCache<string, any>(3);
    });

    it('should track basic statistics', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      cache.get('key1'); // hit
      cache.get('key2'); // hit
      cache.get('key3'); // miss

      const stats = cache.getStatistics();
      
      expect(stats.totalEntries).toBe(2);
      expect(stats.hitCount).toBe(2);
      expect(stats.missCount).toBe(1);
      expect(stats.hitRatio).toBeCloseTo(2/3, 2);
      expect(stats.evictionCount).toBe(0);
      expect(stats.memoryUsage).toBe(0); // Simplified version doesn't track memory
      expect(stats.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('shutdown and cleanup', () => {
    it('should clear cache on shutdown', () => {
      cache = new LRUCache<string, any>(5);
      
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      cache.shutdown();

      expect(cache.size).toBe(0);
    });

    it('should handle multiple shutdowns gracefully', () => {
      cache = new LRUCache<string, any>(5);
      
      cache.shutdown();
      expect(() => cache.shutdown()).not.toThrow();
    });
  });

  describe('compatibility methods', () => {
    it('should support removeExpired (no-op)', () => {
      cache = new LRUCache<string, any>(5);
      
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const removed = cache.removeExpired();
      
      expect(removed).toBe(0);
      expect(cache.size).toBe(2);
    });
  });
});