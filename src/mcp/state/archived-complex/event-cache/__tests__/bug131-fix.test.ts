import { EventCacheManager, type EventCacheConfig } from '../manager.js';
import { MockQRWCAdapter } from '../test-helpers.js';

describe('BUG-131: TypeScript exactOptionalPropertyTypes fix', () => {
  let eventCache: EventCacheManager;
  let mockAdapter: MockQRWCAdapter;

  beforeEach(() => {
    const config: EventCacheConfig = {
      maxEvents: 1000,
      maxAgeMs: 3600000, // 1 hour
      skipValidation: true, // Skip validation for test
      compressionConfig: {
        enabled: false
      },
      diskSpilloverConfig: {
        enabled: false
      }
    };

    eventCache = new EventCacheManager(config);
    mockAdapter = new MockQRWCAdapter();
    eventCache.attachToAdapter(mockAdapter);
  });

  afterEach(() => {
    if (eventCache) {
      eventCache.destroy();
    }
  });

  describe('getStatistics global mode', () => {
    it('should handle undefined lastError correctly with exactOptionalPropertyTypes', () => {
      // Get global statistics when no errors have occurred
      const stats = eventCache.getStatistics();
      
      expect(stats).toBeDefined();
      expect(stats).not.toBeNull();
      
      // Type guard to ensure we have global statistics
      if (stats && 'groups' in stats) {
        // The fix ensures lastError can be undefined without TypeScript errors
        expect(stats.lastError).toBeUndefined();
        expect(stats.errorCount).toBe(0);
        expect(stats.totalEvents).toBe(0);
        expect(stats.groups).toEqual([]);
      } else {
        throw new Error('Expected global statistics object');
      }
    });

    it('should handle defined lastError correctly', () => {
      // Add error handler to prevent unhandled error
      eventCache.on('error', () => {
        // Ignore the error event for this test
      });
      
      // Access the private handleError method through any cast for testing
      (eventCache as any).handleError(new Error('Test error'), 'test-context');
      
      const stats = eventCache.getStatistics();
      
      expect(stats).toBeDefined();
      expect(stats).not.toBeNull();
      
      if (stats && 'groups' in stats) {
        expect(stats.lastError).toBeDefined();
        expect(stats.lastError?.message).toBe('Test error');
        expect(stats.lastError?.context).toBe('test-context');
        expect(stats.lastError?.timestamp).toBeGreaterThan(0);
        expect(stats.errorCount).toBe(1);
      } else {
        throw new Error('Expected global statistics object');
      }
    });

    it('should maintain type safety for all statistics fields', () => {
      // Add some events to test with actual data
      const now = Date.now();
      mockAdapter.emit('changeGroup:changes', {
        groupId: 'test-group',
        changes: [{
          Name: 'TestControl',
          Value: 42,
          String: '42',
        }],
        timestamp: BigInt(now * 1_000_000),
        timestampMs: now,
        sequenceNumber: 1,
      });

      const stats = eventCache.getStatistics();
      
      if (stats && 'groups' in stats) {
        // Verify all fields are properly typed
        expect(typeof stats.totalEvents).toBe('number');
        expect(Array.isArray(stats.groups)).toBe(true);
        expect(typeof stats.memoryUsageMB).toBe('number');
        expect(stats.queryCache).toBeDefined();
        expect(typeof stats.errorCount).toBe('number');
        expect(typeof stats.uptime).toBe('number');
        expect(stats.health).toBeDefined();
        expect(stats.performance).toBeDefined();
        expect(typeof stats.performance.eventsPerSecond).toBe('number');
        expect(typeof stats.performance.queriesPerMinute).toBe('number');
        expect(typeof stats.performance.averageQueryLatency).toBe('number');
        expect(stats.resources).toBeDefined();
        expect(Array.isArray(stats.resources.memoryTrend)).toBe(true);
        expect(typeof stats.resources.diskSpilloverUsage).toBe('number');
        expect(typeof stats.resources.compressionEffectiveness).toBe('number');
        
        // Verify groups have proper structure
        expect(stats.groups.length).toBe(1);
        const group = stats.groups[0];
        expect(group.groupId).toBe('test-group');
        expect(group.eventCount).toBe(1);
        expect(group.totalEvents).toBe(1); // Backward compatibility alias
      }
    });
  });

  describe('TypeScript compilation', () => {
    it('should compile with exactOptionalPropertyTypes enabled', () => {
      // This test passes if the file compiles successfully
      // The fix changes lastError from optional (lastError?) to required with undefined union
      // This satisfies TypeScript's exactOptionalPropertyTypes requirement
      
      const stats = eventCache.getStatistics();
      
      // These type assertions should compile without error
      if (stats && 'groups' in stats) {
        const lastError: { message: string; context: string; timestamp: number } | undefined = stats.lastError;
        expect(lastError === undefined || typeof lastError.message === 'string').toBe(true);
      }
    });
  });
});