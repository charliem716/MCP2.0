import { describe, it, expect } from '@jest/globals';

/**
 * BUG-042 Fix Verification Test
 *
 * Ensures that direct imports work correctly after removing unnecessary index.ts files
 */
describe('BUG-042: Direct imports verification', () => {
  it('should import EventCacheManager directly from manager.js', async () => {
    // This will fail to compile if the import path is wrong
    const { EventCacheManager } = await import(
      '../../src/mcp/state/event-cache/manager.js'
    );
    expect(EventCacheManager).toBeDefined();
    expect(typeof EventCacheManager).toBe('function');
  });

  it('should import StatePersistenceManager directly from manager.js', async () => {
    // This will fail to compile if the import path is wrong
    const { StatePersistenceManager } = await import(
      '../../src/mcp/state/persistence/manager.js'
    );
    expect(StatePersistenceManager).toBeDefined();
    expect(typeof StatePersistenceManager).toBe('function');
  });

  it('should import ChangeGroupManager from change-group-manager.js', async () => {
    // This will fail to compile if the import path is wrong
    const { ChangeGroupManager } = await import(
      '../../src/mcp/state/change-group-manager.js'
    );
    expect(ChangeGroupManager).toBeDefined();
    expect(typeof ChangeGroupManager).toBe('function');
  });

  it('should import cache components from cache.ts', async () => {
    // This will fail to compile if the import path is wrong
    const cache = await import('../../src/mcp/state/cache.js');
    expect(cache.ControlStateCache).toBeDefined();
    expect(cache.CoreCache).toBeDefined();
    expect(cache.CacheChangeGroupManager).toBeDefined();
    expect(cache.CacheSyncManager).toBeDefined();
  });
});
