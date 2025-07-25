import { LRUCache } from '../../src/mcp/state/lru-cache.js';
import { config } from '../../src/shared/utils/env.js';

// Mock the env config
jest.mock('../../src/shared/utils/env.js', () => ({
  config: {
    cache: {
      maxEntries: 500, // Test with different value
      ttlMs: 900000,
      maxMemoryMB: 25,
    },
  },
}));

describe('LRU Cache Configuration', () => {
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
});