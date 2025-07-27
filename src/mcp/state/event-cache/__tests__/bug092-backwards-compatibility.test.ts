/**
 * BUG-092: Test backwards compatibility for query method
 *
 * Verifies that the synchronous querySync method provides
 * backwards compatibility for code that expects synchronous behavior
 */

import { EventCacheManager } from '../manager.js';
import type { ChangeGroupEvent } from '../types.js';

describe('BUG-092: Query Method Backwards Compatibility', () => {
  let eventCache: EventCacheManager;
  const groupId = 'test-group';

  beforeEach(() => {
    eventCache = new EventCacheManager({
      maxEvents: 1000,
      maxAgeMs: 60000,
      diskSpilloverConfig: {
        enabled: true,
        directory: './test-spillover',
        thresholdMB: 10,
        maxFileSizeMB: 5,
      },
    });

    // Add some test events
    const event: ChangeGroupEvent = {
      groupId,
      timestamp: BigInt(Date.now()) * 1000000n,
      timestampMs: Date.now(),
      sequenceNumber: 1,
      changes: [
        { Name: 'Control1', Value: 10, String: '10' },
        { Name: 'Control2', Value: true, String: 'true' },
        { Name: 'Control3', Value: 'active', String: 'active' },
      ],
    };

    // Manually trigger event handling to populate cache
    (eventCache as any).handleChangeEvent(event);
  });

  afterEach(() => {
    eventCache.destroy();
  });

  describe('Synchronous querySync method', () => {
    it('should work without await for backwards compatibility', () => {
      // This should work synchronously without await
      const results = eventCache.querySync({ groupId });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(3);
      // Check that all expected controls are present
      const controlNames = results.map(r => r.controlName);
      expect(controlNames).toContain('Control1');
      expect(controlNames).toContain('Control2');
      expect(controlNames).toContain('Control3');
    });

    it('should work with synchronous method (deprecated)', () => {
      // The querySync method should work without await
      // It logs a deprecation warning internally via logger
      const results = eventCache.querySync({ groupId });

      // Verify it returns results without needing await
      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
    });

    it('should support all query parameters', () => {
      const results = eventCache.querySync({
        groupId,
        controlNames: ['Control1', 'Control2'],
        valueFilter: { operator: 'eq', value: 10 },
        limit: 1,
      });

      expect(results.length).toBe(1);
      if (results.length > 0) {
        expect(results[0].controlName).toBe('Control1');
        expect(results[0].value).toBe(10);
      }
    });

    it('should only return memory-cached events', () => {
      // Even if disk spillover is enabled, querySync should only return memory events
      const results = eventCache.querySync({ groupId });

      // All events should be from memory (recently added)
      expect(results.every(e => e.timestampMs > Date.now() - 1000)).toBe(true);
    });
  });

  describe('Async query method', () => {
    it('should require await for full functionality', async () => {
      const results = await eventCache.query({ groupId });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(3);
    });

    it('should support disk spillover when enabled', async () => {
      // The async method can load from disk if spillover is active
      const results = await eventCache.query({
        groupId,
        startTime: Date.now() - 3600000, // 1 hour ago
      });

      // Should include memory events at minimum
      expect(results.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Migration path', () => {
    it('should allow gradual migration from sync to async', async () => {
      // Step 1: Use querySync during migration
      const syncResults = eventCache.querySync({ groupId });
      expect(syncResults.length).toBe(3);

      // Step 2: Switch to async query for full functionality
      const asyncResults = await eventCache.query({ groupId });
      expect(asyncResults.length).toBe(3);

      // Results should be identical for memory-only queries
      expect(syncResults).toEqual(asyncResults);
    });

    it('should handle mixed usage patterns', async () => {
      // Some code paths might still use sync
      const syncCount = eventCache.querySync({ groupId }).length;

      // While new code uses async
      const asyncCount = (await eventCache.query({ groupId })).length;

      // Both should work without errors
      expect(syncCount).toBe(3);
      expect(asyncCount).toBe(3);
    });
  });

  describe('Error handling', () => {
    it('should handle errors gracefully in sync method', () => {
      // Even with invalid parameters, should not throw
      const results = eventCache.querySync({
        groupId: 'non-existent-group',
      });

      expect(results).toEqual([]);
    });

    it('should handle errors gracefully in async method', async () => {
      const results = await eventCache.query({
        groupId: 'non-existent-group',
      });

      expect(results).toEqual([]);
    });
  });
});
