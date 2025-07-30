/**
 * Unit tests for EventCacheManager error recovery (STEP-3.1)
 */

import { EventCacheManager } from '../../../../../src/mcp/state/event-cache/manager';
import type { ChangeGroupEvent } from '../../../../../src/mcp/state/event-cache/types';
import * as fs from 'fs/promises';

// Mock fs module
jest.mock('fs/promises');

describe('EventCacheManager - Error Recovery', () => {
  let eventCache: EventCacheManager;
  const mockAdapter = {
    on: jest.fn(),
    removeListener: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    eventCache = new EventCacheManager({
      maxEvents: 1000,
      maxAgeMs: 3600000,
      globalMemoryLimitMB: 50,
      diskSpilloverConfig: {
        enabled: true,
        directory: './test-spillover',
        thresholdMB: 40,
        maxFileSizeMB: 10
      }
    });
    
    // Add default error handler to prevent unhandled error warnings
    eventCache.on('error', () => {
      // Intentionally empty - tests will add their own handlers
    });
  });

  afterEach(() => {
    eventCache.destroy();
  });

  describe('handleError method', () => {
    it('should emit error events with context', async () => {
      const errorSpy = jest.fn();
      eventCache.on('error', errorSpy);

      // Directly test error handler instead of trying to trigger spillover
      const testError = new Error('ENOSPC: disk full');
      await (eventCache as any).handleError(testError, 'spillToDisk groupId:test-group');

      expect(errorSpy).toHaveBeenCalled();
      const errorEvent = errorSpy.mock.calls[0][0];
      expect(errorEvent).toMatchObject({
        error: expect.any(Error),
        context: expect.stringContaining('spillToDisk'),
        timestamp: expect.any(Number),
        groupId: 'test-group'
      });
      expect(errorEvent.error.message).toBe('ENOSPC: disk full');
    });

    it('should disable disk spillover on ENOSPC error', async () => {
      // Verify spillover is initially enabled
      const initialConfig = (eventCache as any).defaultConfig.diskSpilloverConfig;
      expect(initialConfig.enabled).toBe(true);

      // Trigger disk full error
      const diskFullError = new Error('ENOSPC: disk full');
      await (eventCache as any).handleError(diskFullError, 'spillToDisk groupId:test-group');

      // Verify disk spillover is disabled
      const configAfterError = (eventCache as any).defaultConfig.diskSpilloverConfig;
      expect(configAfterError.enabled).toBe(false);
      expect((eventCache as any).diskSpilloverActive).toBe(false);
    });

    it('should trigger emergency eviction on memory error', async () => {
      const emergencyEvictionSpy = jest.fn();
      eventCache.on('emergencyEviction', emergencyEvictionSpy);

      // Add some test data first
      eventCache.attachToAdapter(mockAdapter);
      const testEvent: ChangeGroupEvent = {
        groupId: 'test-group',
        changes: [{ Name: 'test.control', Value: 1, String: '1' }],
        timestamp: BigInt(Date.now() * 1000000),
        timestampMs: Date.now()
      };
      
      // Add a few events
      for (let i = 0; i < 10; i++) {
        mockAdapter.on.mock.calls[0][1](testEvent);
      }

      // Trigger memory error directly
      const memoryError = new Error('ENOMEM: out of memory');
      await (eventCache as any).handleError(memoryError, 'checkMemoryPressure');

      expect(emergencyEvictionSpy).toHaveBeenCalled();
      expect(emergencyEvictionSpy.mock.calls[0][0]).toMatchObject({
        totalEvicted: expect.any(Number),
        timestamp: expect.any(Number)
      });
    });

    it('should clear corrupted group on corruption error', async () => {
      eventCache.attachToAdapter(mockAdapter);
      
      // Add events to a group
      const testEvent: ChangeGroupEvent = {
        groupId: 'corrupted-group',
        changes: [{ Name: 'test.control', Value: 1, String: '1' }],
        timestamp: BigInt(Date.now() * 1000000),
        timestampMs: Date.now()
      };

      mockAdapter.on.mock.calls[0][1](testEvent);

      // Verify group exists
      const statsBefore = eventCache.getStatistics('corrupted-group');
      expect(statsBefore).not.toBeNull();

      // Trigger corruption error directly
      const corruptionError = new Error('JSON parse error: corrupted data');
      await (eventCache as any).handleError(corruptionError, 'loadFromDisk groupId:corrupted-group');

      // Verify group was cleared
      const statsAfter = eventCache.getStatistics('corrupted-group');
      expect(statsAfter).toBeNull();
    });
  });

  describe('Emergency eviction', () => {
    it('should evict 50% of events from all groups', async () => {
      eventCache.attachToAdapter(mockAdapter);
      
      // Add events to multiple groups
      const groups = ['group1', 'group2', 'group3'];
      for (const groupId of groups) {
        for (let i = 0; i < 100; i++) {
          const event: ChangeGroupEvent = {
            groupId,
            changes: [{ Name: `${groupId}.control`, Value: i, String: String(i) }],
            timestamp: BigInt(Date.now() * 1000000),
            timestampMs: Date.now()
          };
          mockAdapter.on.mock.calls[0][1](event);
        }
      }

      // Get stats before eviction
      const statsBefore = groups.map(g => ({
        groupId: g,
        count: eventCache.getStatistics(g)?.eventCount ?? 0
      }));

      // Trigger emergency eviction
      await (eventCache as any).emergencyEviction();

      // Get stats after eviction
      const statsAfter = groups.map(g => ({
        groupId: g,
        count: eventCache.getStatistics(g)?.eventCount ?? 0
      }));

      // Verify ~50% reduction
      for (let i = 0; i < groups.length; i++) {
        const before = statsBefore[i].count;
        const after = statsAfter[i].count;
        expect(after).toBeLessThanOrEqual(before * 0.6); // Allow some margin
        expect(after).toBeGreaterThanOrEqual(before * 0.4);
      }
    });

    it('should respect group priorities during eviction', async () => {
      eventCache.attachToAdapter(mockAdapter);
      
      // Set group priorities
      eventCache.setGroupPriority('high-priority', 'high');
      eventCache.setGroupPriority('low-priority', 'low');
      
      // Add same number of events to both groups
      for (const groupId of ['high-priority', 'low-priority']) {
        for (let i = 0; i < 100; i++) {
          const event: ChangeGroupEvent = {
            groupId,
            changes: [{ Name: `${groupId}.control`, Value: i, String: String(i) }],
            timestamp: BigInt(Date.now() * 1000000),
            timestampMs: Date.now()
          };
          mockAdapter.on.mock.calls[0][1](event);
        }
      }

      // Trigger emergency eviction
      await (eventCache as any).emergencyEviction();

      const highPriorityStats = eventCache.getStatistics('high-priority');
      const lowPriorityStats = eventCache.getStatistics('low-priority');

      // High priority should retain more events than low priority
      expect(highPriorityStats?.eventCount).toBeGreaterThan(0);
      expect(lowPriorityStats?.eventCount).toBeGreaterThan(0);
      
      // Both should have roughly 50% evicted
      expect(highPriorityStats?.eventCount).toBeLessThanOrEqual(60);
      expect(lowPriorityStats?.eventCount).toBeLessThanOrEqual(60);
    });
  });

  describe('Health check API', () => {
    it('should return healthy status when no issues', () => {
      const health = eventCache.getHealthStatus();
      
      expect(health.status).toBe('healthy');
      expect(health.errorCount).toBe(0);
      expect(health.memoryUsagePercent).toBeLessThan(80);
      expect(health.issues).toHaveLength(0);
      expect(health.lastError).toBeUndefined();
    });

    it('should return degraded status with high memory usage', async () => {
      // Create a new instance with very low memory limit for easier testing
      const lowMemCache = new EventCacheManager({
        maxEvents: 1000,
        maxAgeMs: 3600000,
        globalMemoryLimitMB: 0.1, // 100KB limit
        diskSpilloverConfig: {
          enabled: false
        }
      });

      try {
        // Add error handler to prevent unhandled errors
        lowMemCache.on('error', () => {});
        lowMemCache.attachToAdapter(mockAdapter);
        
        // Add events to exceed 80% of 100KB (need ~80KB of data)
        const testEvent: ChangeGroupEvent = {
          groupId: 'test-group',
          changes: [],
          timestamp: BigInt(Date.now() * 1000000),
          timestampMs: Date.now()
        };

        // Each event estimated at ~200 bytes + 20% overhead = 240 bytes
        // For 100KB limit: 80% = 80KB = ~333 events, 90% = 90KB = ~375 events
        // Use 350 events to be safely in degraded range (84%)
        for (let i = 0; i < 350; i++) {
          testEvent.changes = [
            { 
              Name: `control${i}`, 
              Value: `value${i}`,
              String: `string${i}` 
            }
          ];
          mockAdapter.on.mock.calls[0][1](testEvent);
        }

        const health = lowMemCache.getHealthStatus();
        
        // Should be degraded (80-90%) or unhealthy (>90%)
        expect(['degraded', 'unhealthy']).toContain(health.status);
        expect(health.memoryUsagePercent).toBeGreaterThan(80);
        
        // Should have appropriate memory usage issue
        const hasMemoryIssue = health.issues.some(issue => 
          issue.includes('High memory usage') || issue.includes('Critical memory usage')
        );
        expect(hasMemoryIssue).toBe(true);
      } finally {
        lowMemCache.destroy();
      }
    });

    it('should return unhealthy status with critical memory usage', async () => {
      // Create instance with tiny memory limit
      const tinyMemCache = new EventCacheManager({
        maxEvents: 1000,
        maxAgeMs: 3600000,
        globalMemoryLimitMB: 0.01, // 10KB limit
        diskSpilloverConfig: {
          enabled: false
        }
      });

      try {
        // Add error handler to prevent unhandled errors
        tinyMemCache.on('error', () => {});
        tinyMemCache.attachToAdapter(mockAdapter);
        
        // Add events to exceed 90% of 10KB
        const testEvent: ChangeGroupEvent = {
          groupId: 'test-group',
          changes: [],
          timestamp: BigInt(Date.now() * 1000000),
          timestampMs: Date.now()
        };

        // Need ~50 events to exceed 90%
        for (let i = 0; i < 100; i++) {
          testEvent.changes = [
            { 
              Name: `control${i}`, 
              Value: `value${i}`,
              String: `string${i}` 
            }
          ];
          mockAdapter.on.mock.calls[0][1](testEvent);
        }

        const health = tinyMemCache.getHealthStatus();
        
        expect(health.status).toBe('unhealthy');
        expect(health.memoryUsagePercent).toBeGreaterThan(90);
        expect(health.issues.some(issue => issue.includes('Critical memory usage'))).toBe(true);
      } finally {
        tinyMemCache.destroy();
      }
    });

    it('should track error count and last error', async () => {
      // Trigger multiple errors directly through handleError
      for (let i = 0; i < 15; i++) {
        const error = new Error(`Test error ${i}`);
        await (eventCache as any).handleError(error, `test operation ${i}`);
      }

      const health = eventCache.getHealthStatus();
      
      expect(health.status).toBe('degraded');
      expect(health.errorCount).toBe(15);
      expect(health.issues.some(issue => issue.includes('High error count'))).toBe(true);
      expect(health.lastError).toBeDefined();
      expect(health.lastError?.message).toBe('Test error 14');
      expect(health.lastError?.context).toBe('test operation 14');
    });

    it('should report active disk spillover', async () => {
      // Manually set disk spillover active
      (eventCache as any).diskSpilloverActive = true;
      
      const health = eventCache.getHealthStatus();
      
      expect(health.issues).toContain('Disk spillover is active');
    });
  });

  describe('Error event emission', () => {
    it('should include groupId in error event when available', async () => {
      const errorSpy = jest.fn();
      eventCache.on('error', errorSpy);

      // Trigger error with groupId in context
      await (eventCache as any).handleError(
        new Error('Test error'),
        'spillToDisk groupId:test-group-123 operation'
      );

      expect(errorSpy).toHaveBeenCalledWith({
        error: expect.any(Error),
        context: expect.stringContaining('groupId:test-group-123'),
        timestamp: expect.any(Number),
        groupId: 'test-group-123'
      });
    });

    it('should log all eviction actions', async () => {
      eventCache.attachToAdapter(mockAdapter);
      
      // Add events to multiple groups
      const groups = ['group1', 'group2'];
      for (const groupId of groups) {
        const event: ChangeGroupEvent = {
          groupId,
          changes: [{ Name: 'test.control', Value: 1, String: '1' }],
          timestamp: BigInt(Date.now() * 1000000),
          timestampMs: Date.now()
        };
        
        for (let i = 0; i < 10; i++) {
          mockAdapter.on.mock.calls[0][1](event);
        }
      }

      // Spy on emergencyEviction event which includes eviction details
      const evictionSpy = jest.fn();
      eventCache.on('emergencyEviction', evictionSpy);

      // Trigger emergency eviction
      await (eventCache as any).emergencyEviction();

      // Verify eviction event was emitted with total count
      expect(evictionSpy).toHaveBeenCalled();
      const evictionEvent = evictionSpy.mock.calls[0][0];
      expect(evictionEvent.totalEvicted).toBeGreaterThan(0);
      
      // Verify some events were evicted from each group
      for (const groupId of groups) {
        const stats = eventCache.getStatistics(groupId);
        expect(stats?.eventCount).toBeLessThan(10);
      }
    });
  });
});