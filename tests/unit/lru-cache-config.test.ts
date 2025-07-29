import { describe, it, expect, jest, beforeEach } from '@jest/globals';

describe('LRU Cache Configuration', () => {
  let LRUCache: any;

  beforeEach(async () => {
    jest.resetModules();

    // Mock the env config
    jest.unstable_mockModule('@/shared/utils/env', () => ({
      config: {
        cache: {
          maxEntries: 500, // Test with different value
          ttlMs: 900000,
          maxMemoryMB: 25,
        },
      },
    }));

    // Import after mocking
    const cacheModule = await import('@/mcp/state/lru-cache');
    LRUCache = cacheModule.LRUCache;
  });

  it('should use configuration from env for default max entries', () => {
    const cache = new LRUCache<string, string>();
    
    // The cache should use the mocked config value
    // We can verify this by filling the cache and checking eviction
    for (let i = 0; i < 500; i++) {
      cache.set(`key${i}`, `value${i}`);
    }
    
    // Should still have all 500 entries
    expect(cache.size).toBe(500);
    
    // Adding one more should trigger eviction
    cache.set('key500', 'value500');
    expect(cache.size).toBe(500); // Still 500, oldest was evicted
    
    // The first key should have been evicted
    expect(cache.get('key0')).toBeNull();
    expect(cache.get('key500')).toBe('value500');
  });

  it('should allow overriding max entries in constructor', () => {
    const cache = new LRUCache<string, string>(100);
    
    for (let i = 0; i < 100; i++) {
      cache.set(`key${i}`, `value${i}`);
    }
    
    expect(cache.size).toBe(100);
    
    // Adding one more should trigger eviction
    cache.set('key100', 'value100');
    expect(cache.size).toBe(100);
    
    // The first key should have been evicted
    expect(cache.get('key0')).toBeNull();
    expect(cache.get('key100')).toBe('value100');
  });

  it('should respect TTL configuration', async () => {
    // Mock Date.now for consistent testing
    const mockNow = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(mockNow);
    
    const cache = new LRUCache<string, string>();
    cache.set('ttl-test', 'value');
    
    // Should exist initially
    expect(cache.get('ttl-test')).toBe('value');
    
    // Move time forward past TTL (900000ms = 15 minutes)
    jest.spyOn(Date, 'now').mockReturnValue(mockNow + 900001);
    
    // Should be expired
    expect(cache.get('ttl-test')).toBeNull();
  });

  it('should handle custom TTL per entry', () => {
    const mockNow = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(mockNow);
    
    const cache = new LRUCache<string, string>();
    
    // Set with custom TTL of 1 second
    cache.set('custom-ttl', 'value', 1000);
    
    // Should exist initially
    expect(cache.get('custom-ttl')).toBe('value');
    
    // Move time forward 1001ms
    jest.spyOn(Date, 'now').mockReturnValue(mockNow + 1001);
    
    // Should be expired
    expect(cache.get('custom-ttl')).toBeNull();
  });
});