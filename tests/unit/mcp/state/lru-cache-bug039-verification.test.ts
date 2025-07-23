import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { LRUCache } from '../../../../src/mcp/state/lru-cache.js';

/**
 * Test file that specifically verifies all expected behaviors from BUG-039:
 * 1. Stores key-value pairs
 * 2. Evicts least recently used items when full
 * 3. Provides get/set/delete operations
 * 4. Has configurable size limit
 * 
 * Also verifies that complex features (TTL, memory tracking, etc.) are NOT present
 * in the simplified implementation.
 */
describe('LRUCache BUG-039 Verification', () => {
  let cache: LRUCache<string, any>;

  afterEach(() => {
    if (cache) {
      cache.shutdown();
    }
  });

  describe('BUG-039 Requirement 1: Stores key-value pairs', () => {
    beforeEach(() => {
      cache = new LRUCache<string, any>();
    });

    it('should store and retrieve key-value pairs', () => {
      // Store various types of values
      cache.set('string', 'hello');
      cache.set('number', 42);
      cache.set('boolean', true);
      cache.set('object', { foo: 'bar' });
      cache.set('array', [1, 2, 3]);
      cache.set('null', null);

      // Verify all values can be retrieved
      expect(cache.get('string')).toBe('hello');
      expect(cache.get('number')).toBe(42);
      expect(cache.get('boolean')).toBe(true);
      expect(cache.get('object')).toEqual({ foo: 'bar' });
      expect(cache.get('array')).toEqual([1, 2, 3]);
      expect(cache.get('null')).toBeNull();
    });

    it('should maintain key-value associations correctly', () => {
      const testData = new Map([
        ['key1', 'value1'],
        ['key2', { data: 'complex' }],
        ['key3', [1, 2, 3]],
        ['key4', null],
        ['key5', 12345]
      ]);

      // Store all test data
      for (const [key, value] of testData) {
        cache.set(key, value);
      }

      // Verify all associations are maintained
      for (const [key, expectedValue] of testData) {
        expect(cache.get(key)).toEqual(expectedValue);
      }
    });

    it('should update values for existing keys', () => {
      cache.set('key', 'initial');
      expect(cache.get('key')).toBe('initial');

      cache.set('key', 'updated');
      expect(cache.get('key')).toBe('updated');

      cache.set('key', { complex: 'object' });
      expect(cache.get('key')).toEqual({ complex: 'object' });
    });
  });

  describe('BUG-039 Requirement 2: Evicts least recently used items when full', () => {
    beforeEach(() => {
      cache = new LRUCache<string, any>(3); // Small cache to test eviction
    });

    it('should evict the least recently used item when cache is full', () => {
      // Fill the cache
      cache.set('first', 1);
      cache.set('second', 2);
      cache.set('third', 3);
      
      // Verify all items are present
      expect(cache.size).toBe(3);
      expect(cache.has('first')).toBe(true);
      expect(cache.has('second')).toBe(true);
      expect(cache.has('third')).toBe(true);

      // Add a fourth item, should evict 'first'
      cache.set('fourth', 4);
      
      expect(cache.size).toBe(3);
      expect(cache.has('first')).toBe(false); // Evicted
      expect(cache.has('second')).toBe(true);
      expect(cache.has('third')).toBe(true);
      expect(cache.has('fourth')).toBe(true);
    });

    it('should update LRU order when items are accessed via get()', () => {
      // Fill the cache
      cache.set('first', 1);
      cache.set('second', 2);
      cache.set('third', 3);

      // Access 'first', making it most recently used
      expect(cache.get('first')).toBe(1);

      // Add a fourth item, should evict 'second' (now LRU)
      cache.set('fourth', 4);

      expect(cache.has('first')).toBe(true); // Not evicted because we accessed it
      expect(cache.has('second')).toBe(false); // Evicted
      expect(cache.has('third')).toBe(true);
      expect(cache.has('fourth')).toBe(true);
    });

    it('should update LRU order when items are updated via set()', () => {
      // Fill the cache
      cache.set('first', 1);
      cache.set('second', 2);
      cache.set('third', 3);

      // Update 'first', making it most recently used
      cache.set('first', 'updated');

      // Add a fourth item, should evict 'second' (now LRU)
      cache.set('fourth', 4);

      expect(cache.get('first')).toBe('updated'); // Not evicted
      expect(cache.has('second')).toBe(false); // Evicted
      expect(cache.has('third')).toBe(true);
      expect(cache.has('fourth')).toBe(true);
    });

    it('should maintain correct LRU order through multiple operations', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      
      // Order is now: a -> b -> c (c is most recent)
      
      cache.get('a'); // Order: b -> c -> a
      cache.get('b'); // Order: c -> a -> b
      
      cache.set('d', 4); // Should evict 'c'
      
      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(true);
      expect(cache.has('c')).toBe(false); // Evicted
      expect(cache.has('d')).toBe(true);
    });

    it('should count evictions correctly', () => {
      const stats = cache.getStatistics();
      expect(stats.evictionCount).toBe(0);

      // Fill cache and trigger evictions
      for (let i = 0; i < 10; i++) {
        cache.set(`key${i}`, i);
      }

      const newStats = cache.getStatistics();
      expect(newStats.evictionCount).toBe(7); // 10 items added, cache size 3, so 7 evictions
    });
  });

  describe('BUG-039 Requirement 3: Provides get/set/delete operations', () => {
    beforeEach(() => {
      cache = new LRUCache<string, any>();
    });

    describe('get operation', () => {
      it('should return value for existing keys', () => {
        cache.set('exists', 'value');
        expect(cache.get('exists')).toBe('value');
      });

      it('should return null for non-existent keys', () => {
        expect(cache.get('does-not-exist')).toBeNull();
      });

      it('should count hits and misses', () => {
        cache.set('key', 'value');
        
        cache.get('key'); // Hit
        cache.get('missing'); // Miss
        cache.get('key'); // Hit
        cache.get('another-missing'); // Miss

        const stats = cache.getStatistics();
        expect(stats.hitCount).toBe(2);
        expect(stats.missCount).toBe(2);
        expect(stats.hitRatio).toBe(0.5);
      });
    });

    describe('set operation', () => {
      it('should always return true for successful sets', () => {
        expect(cache.set('key1', 'value1')).toBe(true);
        expect(cache.set('key2', 'value2')).toBe(true);
        expect(cache.set('key1', 'updated')).toBe(true); // Update
      });

      it('should increase cache size for new keys', () => {
        expect(cache.size).toBe(0);
        
        cache.set('key1', 'value1');
        expect(cache.size).toBe(1);
        
        cache.set('key2', 'value2');
        expect(cache.size).toBe(2);
      });

      it('should not increase cache size for updates', () => {
        cache.set('key', 'value1');
        expect(cache.size).toBe(1);
        
        cache.set('key', 'value2');
        expect(cache.size).toBe(1);
      });
    });

    describe('delete operation', () => {
      it('should return true when deleting existing keys', () => {
        cache.set('key', 'value');
        expect(cache.delete('key')).toBe(true);
      });

      it('should return false when deleting non-existent keys', () => {
        expect(cache.delete('non-existent')).toBe(false);
      });

      it('should remove key from cache', () => {
        cache.set('key', 'value');
        expect(cache.has('key')).toBe(true);
        
        cache.delete('key');
        expect(cache.has('key')).toBe(false);
        expect(cache.get('key')).toBeNull();
      });

      it('should decrease cache size', () => {
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        expect(cache.size).toBe(2);
        
        cache.delete('key1');
        expect(cache.size).toBe(1);
        
        cache.delete('key2');
        expect(cache.size).toBe(0);
      });
    });
  });

  describe('BUG-039 Requirement 4: Has configurable size limit', () => {
    it('should accept custom maxEntries in constructor', () => {
      const cache1 = new LRUCache<string, any>(10);
      const cache2 = new LRUCache<string, any>(100);
      const cache3 = new LRUCache<string, any>(1);
      
      // Add items up to limit
      for (let i = 0; i < 10; i++) {
        cache1.set(`key${i}`, i);
      }
      expect(cache1.size).toBe(10);
      
      // Add one more should trigger eviction
      cache1.set('key10', 10);
      expect(cache1.size).toBe(10); // Still 10, one was evicted
      
      // Test with size 1
      cache3.set('first', 1);
      cache3.set('second', 2);
      expect(cache3.size).toBe(1);
      expect(cache3.has('first')).toBe(false);
      expect(cache3.has('second')).toBe(true);
      
      cache1.shutdown();
      cache2.shutdown();
      cache3.shutdown();
    });

    it('should use default maxEntries if not provided', () => {
      cache = new LRUCache<string, any>(); // Default is 1000
      
      // Add many items without triggering eviction
      for (let i = 0; i < 500; i++) {
        cache.set(`key${i}`, i);
      }
      expect(cache.size).toBe(500);
      
      // All items should still be present
      expect(cache.has('key0')).toBe(true);
      expect(cache.has('key499')).toBe(true);
    });

    it('should enforce size limit during concurrent operations', () => {
      cache = new LRUCache<string, any>(5);
      
      // Rapidly add many items
      for (let i = 0; i < 20; i++) {
        cache.set(`key${i}`, i);
      }
      
      // Size should never exceed limit
      expect(cache.size).toBe(5);
      
      // Only the most recent 5 items should be present
      expect(cache.has('key15')).toBe(true);
      expect(cache.has('key16')).toBe(true);
      expect(cache.has('key17')).toBe(true);
      expect(cache.has('key18')).toBe(true);
      expect(cache.has('key19')).toBe(true);
      
      // Older items should be evicted
      expect(cache.has('key14')).toBe(false);
      expect(cache.has('key0')).toBe(false);
    });
  });

  describe('Verify complex features are NOT present', () => {
    beforeEach(() => {
      cache = new LRUCache<string, any>();
    });

    it('should NOT support TTL (Time To Live)', () => {
      // The simplified cache doesn't have TTL parameters
      // Constructor only accepts maxEntries, no options object
      const simpleCache = new LRUCache<string, any>(100);
      expect(simpleCache).toBeDefined();
      
      // removeExpired should always return 0 (no-op)
      cache.set('key', 'value');
      const expiredCount = cache.removeExpired();
      expect(expiredCount).toBe(0);
      expect(cache.has('key')).toBe(true); // Key is still there
    });

    it('should NOT track memory usage', () => {
      // Add large objects
      const largeObject = { data: 'x'.repeat(10000) };
      cache.set('large1', largeObject);
      cache.set('large2', largeObject);
      cache.set('large3', largeObject);
      
      const stats = cache.getStatistics();
      // Memory usage should always be 0 in simplified version
      expect(stats.memoryUsage).toBe(0);
    });

    it('should NOT support multiple eviction policies', () => {
      // Only LRU is supported
      // Constructor only accepts maxEntries, no eviction policy option
      const simpleCache = new LRUCache<string, any>(100);
      expect(simpleCache).toBeDefined();
      
      // EvictionPolicy enum exists for compatibility but only has LRU
      expect(Object.keys(EvictionPolicy)).toEqual(['LRU']);
    });

    it('should NOT emit events for all operations', () => {
      const hitListener = jest.fn();
      const missListener = jest.fn();
      const setListener = jest.fn();
      
      // These event listeners should not work (ignored)
      cache.on('hit', hitListener);
      cache.on('miss', missListener);
      cache.on('set', setListener);
      
      cache.set('key', 'value');
      cache.get('key'); // Hit
      cache.get('missing'); // Miss
      
      // None of these listeners should be called
      expect(hitListener).not.toHaveBeenCalled();
      expect(missListener).not.toHaveBeenCalled();
      expect(setListener).not.toHaveBeenCalled();
    });

    it('should only support eviction and expiration events for compatibility', () => {
      const evictionListener = jest.fn();
      const expirationListener = jest.fn();
      
      cache = new LRUCache<string, any>(1);
      cache.on('eviction', evictionListener);
      cache.on('expiration', expirationListener);
      
      cache.set('key1', 'value1');
      cache.set('key2', 'value2'); // Should trigger eviction
      
      expect(evictionListener).toHaveBeenCalled();
      // Expiration listener won't be called since there's no TTL
      expect(expirationListener).not.toHaveBeenCalled();
    });

    it('should NOT support memory limits', () => {
      // Constructor only accepts maxEntries, no memory limit option
      const simpleCache = new LRUCache<string, any>(100);
      expect(simpleCache).toBeDefined();
      
      // Memory usage is always 0 in statistics
      const stats = simpleCache.getStatistics();
      expect(stats.memoryUsage).toBe(0);
    });

    it('should NOT support item-specific TTL', () => {
      // Set method only accepts key and value, no options
      const result = cache.set('key', 'value');
      expect(result).toBe(true);
      
      // No way to pass TTL options - method signature doesn't support it
      expect(cache.get('key')).toBe('value');
    });

    it('should NOT support priority-based eviction', () => {
      // Set method only accepts key and value, no priority option
      cache.set('high-priority', 'value1');
      cache.set('low-priority', 'value2');
      
      // All items are treated equally - no priority-based eviction
      // Only LRU order matters
      expect(cache.has('high-priority')).toBe(true);
      expect(cache.has('low-priority')).toBe(true);
    });
  });

  describe('Additional utility methods', () => {
    beforeEach(() => {
      cache = new LRUCache<string, any>(5);
    });

    it('should provide has() method', () => {
      expect(cache.has('key')).toBe(false);
      
      cache.set('key', 'value');
      expect(cache.has('key')).toBe(true);
      
      cache.delete('key');
      expect(cache.has('key')).toBe(false);
    });

    it('should provide clear() method', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      
      expect(cache.size).toBe(3);
      
      cache.clear();
      
      expect(cache.size).toBe(0);
      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(false);
      expect(cache.has('key3')).toBe(false);
    });

    it('should provide keys() method returning array in LRU order', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      
      expect(cache.keys()).toEqual(['a', 'b', 'c']);
      
      // Access 'a' to make it most recent
      cache.get('a');
      
      expect(cache.keys()).toEqual(['b', 'c', 'a']);
    });

    it('should provide values() method returning array in LRU order', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      
      expect(cache.values()).toEqual([1, 2, 3]);
      
      // Access 'a' to make it most recent
      cache.get('a');
      
      expect(cache.values()).toEqual([2, 3, 1]);
    });

    it('should provide size property', () => {
      expect(cache.size).toBe(0);
      
      cache.set('key1', 'value1');
      expect(cache.size).toBe(1);
      
      cache.set('key2', 'value2');
      expect(cache.size).toBe(2);
      
      cache.delete('key1');
      expect(cache.size).toBe(1);
      
      cache.clear();
      expect(cache.size).toBe(0);
    });

    it('should provide getStatistics() method', () => {
      const stats = cache.getStatistics();
      
      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('hitCount');
      expect(stats).toHaveProperty('missCount');
      expect(stats).toHaveProperty('evictionCount');
      expect(stats).toHaveProperty('memoryUsage');
      expect(stats).toHaveProperty('hitRatio');
      expect(stats).toHaveProperty('uptime');
      
      // Verify initial values
      expect(stats.totalEntries).toBe(0);
      expect(stats.hitCount).toBe(0);
      expect(stats.missCount).toBe(0);
      expect(stats.evictionCount).toBe(0);
      expect(stats.memoryUsage).toBe(0); // Always 0 in simplified version
      expect(stats.hitRatio).toBe(0);
      expect(stats.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should provide shutdown() method for cleanup', () => {
      const evictionListener = jest.fn();
      cache.on('eviction', evictionListener);
      
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      cache.shutdown();
      
      // Cache should be cleared
      expect(cache.size).toBe(0);
      
      // Listeners should be removed
      cache.emit('eviction', 'key', 'value');
      expect(evictionListener).not.toHaveBeenCalled();
    });
  });

  describe('Performance characteristics', () => {
    it('should handle large number of operations efficiently', () => {
      cache = new LRUCache<string, any>(1000);
      
      const startTime = Date.now();
      
      // Perform many operations
      for (let i = 0; i < 10000; i++) {
        cache.set(`key${i}`, i);
        if (i % 3 === 0) cache.get(`key${i}`);
        if (i % 5 === 0) cache.delete(`key${Math.floor(i / 2)}`);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete in reasonable time (less than 1 second)
      expect(duration).toBeLessThan(1000);
      
      // Verify cache integrity
      expect(cache.size).toBeLessThanOrEqual(1000);
      const stats = cache.getStatistics();
      expect(stats.totalEntries).toBe(cache.size);
    });

    it('should maintain O(1) operations', () => {
      cache = new LRUCache<string, any>(1000);
      
      // Fill cache
      for (let i = 0; i < 1000; i++) {
        cache.set(`key${i}`, i);
      }
      
      // Time individual operations
      const iterations = 1000;
      
      // Test get
      const getStart = Date.now();
      for (let i = 0; i < iterations; i++) {
        cache.get(`key${i % 1000}`);
      }
      const getTime = Date.now() - getStart;
      
      // Test set
      const setStart = Date.now();
      for (let i = 0; i < iterations; i++) {
        cache.set(`newkey${i}`, i);
      }
      const setTime = Date.now() - setStart;
      
      // Test delete
      const deleteStart = Date.now();
      for (let i = 0; i < iterations; i++) {
        cache.delete(`key${i % 1000}`);
      }
      const deleteTime = Date.now() - deleteStart;
      
      // All operations should be fast (avg < 1ms per operation)
      expect(getTime / iterations).toBeLessThan(1);
      expect(setTime / iterations).toBeLessThan(1);
      expect(deleteTime / iterations).toBeLessThan(1);
    });
  });
});

// Import enum for verification test
import { EvictionPolicy } from '../../../../src/mcp/state/lru-cache.js';