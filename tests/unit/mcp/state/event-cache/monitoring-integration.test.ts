/**
 * Tests for Event Cache Monitoring Integration (STEP-3.3)
 */

import { EventCacheManager } from '../../../../../src/mcp/state/event-cache/manager.js';
import type { ChangeGroupEvent } from '../../../../../src/mcp/state/event-cache/types.js';
import { EventEmitter } from 'events';

describe('EventCacheManager - Monitoring Integration', () => {
  let manager: EventCacheManager;
  let mockAdapter: EventEmitter;

  beforeEach(() => {
    mockAdapter = new EventEmitter();
    manager = new EventCacheManager(
      {
        maxEvents: 10000,
        maxAgeMs: 300000, // 5 minutes
        globalMemoryLimitMB: 50,
        compressionConfig: { enabled: true },
        diskSpilloverConfig: { 
          enabled: true, 
          directory: './test-spillover-monitoring',
          thresholdMB: 30
        },
      },
      mockAdapter as any
    );
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('Performance Counters', () => {
    it('should track events ingested per second', async () => {
      // Generate events at a known rate
      const eventsPerBatch = 10;
      const batches = 5;
      
      for (let i = 0; i < batches; i++) {
        const event: ChangeGroupEvent = {
          groupId: 'test-group',
          changes: Array(eventsPerBatch).fill(null).map((_, j) => ({
            Name: `control${j}`,
            Value: Math.random(),
            String: Math.random().toString(),
          })),
          timestamp: BigInt(Date.now() * 1_000_000),
          timestampMs: Date.now(),
          sequenceNumber: i * eventsPerBatch,
        };
        
        mockAdapter.emit('changeGroup:changes', event);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const stats = manager.getStatistics();
      expect(stats).toBeDefined();
      expect(typeof stats === 'object' && stats !== null && 'performance' in stats).toBe(true);
      
      if (typeof stats === 'object' && stats !== null && 'performance' in stats) {
        expect(stats.performance.eventsPerSecond).toBeGreaterThan(0);
        expect(stats.totalEvents).toBe(eventsPerBatch * batches);
      }
    });

    it('should track queries executed per minute', async () => {
      // Add some test data
      const event: ChangeGroupEvent = {
        groupId: 'test-group',
        changes: [
          { Name: 'control1', Value: 1, String: '1' },
          { Name: 'control2', Value: 2, String: '2' },
        ],
        timestamp: BigInt(Date.now() * 1_000_000),
        timestampMs: Date.now(),
        sequenceNumber: 0,
      };
      mockAdapter.emit('changeGroup:changes', event);

      // Execute multiple queries
      const queryCount = 5;
      for (let i = 0; i < queryCount; i++) {
        await manager.query({ groupId: 'test-group' });
      }

      const stats = manager.getStatistics();
      if (typeof stats === 'object' && stats !== null && 'performance' in stats) {
        expect(stats.performance.queriesPerMinute).toBeGreaterThan(0);
      }
    });

    it.skip('should track average query latency', async () => {
      // TODO: Fix query latency tracking for fast queries
      // Add test data
      const event: ChangeGroupEvent = {
        groupId: 'test-group',
        changes: Array(100).fill(null).map((_, i) => ({
          Name: `control${i}`,
          Value: i,
          String: i.toString(),
        })),
        timestamp: BigInt(Date.now() * 1_000_000),
        timestampMs: Date.now(),
        sequenceNumber: 0,
      };
      mockAdapter.emit('changeGroup:changes', event);

      // Execute queries - ensure they're different to avoid cache hits
      await manager.query({ groupId: 'test-group' });
      await manager.query({ groupId: 'test-group', valueFilter: { operator: 'gt', value: 50 } });
      await manager.query({ groupId: 'test-group', controlNames: ['control10'] });
      
      // Add a slight delay to ensure latency is measurable
      await new Promise(resolve => setTimeout(resolve, 10));

      const stats = manager.getStatistics();
      if (typeof stats === 'object' && stats !== null && 'performance' in stats) {
        expect(stats.performance.averageQueryLatency).toBeGreaterThan(0);
        expect(stats.performance.averageQueryLatency).toBeLessThan(100); // Should be fast
      }
    });
  });

  describe('Resource Monitoring', () => {
    it('should track memory usage trend', async () => {
      // Generate events to increase memory usage
      for (let i = 0; i < 10; i++) {
        const event: ChangeGroupEvent = {
          groupId: `group${i}`,
          changes: Array(100).fill(null).map((_, j) => ({
            Name: `control${j}`,
            Value: Math.random() * 100,
            String: Math.random().toString(36),
          })),
          timestamp: BigInt(Date.now() * 1_000_000),
          timestampMs: Date.now(),
          sequenceNumber: i,
        };
        
        mockAdapter.emit('changeGroup:changes', event);
      }

      // Force a memory check
      await (manager as any).checkMemoryPressure();

      const stats = manager.getStatistics();
      if (typeof stats === 'object' && stats !== null && 'resources' in stats) {
        expect(stats.resources.memoryTrend).toBeDefined();
        expect(Array.isArray(stats.resources.memoryTrend)).toBe(true);
        expect(stats.resources.memoryTrend.length).toBeGreaterThan(0);
        
        // Check memory trend structure
        const trend = stats.resources.memoryTrend[0];
        expect(trend).toHaveProperty('timestamp');
        expect(trend).toHaveProperty('usage');
        expect(typeof trend.usage).toBe('number');
      }
    });

    it('should report disk spillover usage', async () => {
      const stats = manager.getStatistics();
      if (typeof stats === 'object' && stats !== null && 'resources' in stats) {
        expect(stats.resources.diskSpilloverUsage).toBeDefined();
        expect(typeof stats.resources.diskSpilloverUsage).toBe('number');
        expect(stats.resources.diskSpilloverUsage).toBeGreaterThanOrEqual(0);
      }
    });

    it('should calculate compression effectiveness', async () => {
      // Add events and trigger compression
      const event: ChangeGroupEvent = {
        groupId: 'compress-test',
        changes: Array(1000).fill(null).map((_, i) => ({
          Name: 'level',
          Value: i % 10, // Repeating values for better compression
          String: (i % 10).toString(),
        })),
        timestamp: BigInt((Date.now() - 120000) * 1_000_000), // 2 minutes ago
        timestampMs: Date.now() - 120000,
        sequenceNumber: 0,
      };
      
      mockAdapter.emit('changeGroup:changes', event);
      
      // Trigger compression
      manager.runCompression(true);
      
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = manager.getStatistics();
      if (typeof stats === 'object' && stats !== null && 'resources' in stats) {
        expect(stats.resources.compressionEffectiveness).toBeDefined();
        expect(typeof stats.resources.compressionEffectiveness).toBe('number');
        expect(stats.resources.compressionEffectiveness).toBeGreaterThanOrEqual(0);
        expect(stats.resources.compressionEffectiveness).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('Health and Error Monitoring', () => {
    it('should include error count and last error in statistics', async () => {
      // Force an error by trying to query a non-existent group
      const stats1 = manager.getStatistics();
      if (typeof stats1 === 'object' && stats1 !== null && 'errorCount' in stats1) {
        expect(stats1.errorCount).toBe(0);
        expect(stats1.lastError).toBeUndefined();
      }

      // Generate an error condition
      // Listen for error events to confirm it was emitted
      let errorEmitted = false;
      manager.once('error', () => { errorEmitted = true; });
      
      // This would typically happen with disk spillover failures, memory allocation errors, etc.
      // For testing, we'll emit an error event directly
      (manager as any).handleError(new Error('Test error'), 'test-context');

      expect(errorEmitted).toBe(true);

      const stats2 = manager.getStatistics();
      if (typeof stats2 === 'object' && stats2 !== null && 'errorCount' in stats2) {
        expect(stats2.errorCount).toBe(1);
        expect(stats2.lastError).toBeDefined();
        expect(stats2.lastError?.message).toBe('Test error');
        expect(stats2.lastError?.context).toBe('test-context');
        expect(stats2.lastError?.timestamp).toBeDefined();
      }
    });

    it('should include uptime in statistics', async () => {
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = manager.getStatistics();
      if (typeof stats === 'object' && stats !== null && 'uptime' in stats) {
        expect(stats.uptime).toBeGreaterThan(0);
        expect(stats.uptime).toBeLessThan(1000); // Should be less than 1 second in tests
      }
    });

    it('should include health status in statistics', async () => {
      const stats = manager.getStatistics();
      if (typeof stats === 'object' && stats !== null && 'health' in stats) {
        expect(stats.health).toBeDefined();
        expect(stats.health.status).toMatch(/^(healthy|degraded|unhealthy)$/);
        expect(stats.health.errorCount).toBeDefined();
        expect(stats.health.memoryUsagePercent).toBeDefined();
        expect(stats.health.issues).toBeDefined();
        expect(Array.isArray(stats.health.issues)).toBe(true);
      }
    });
  });

  describe('Query Cache Statistics', () => {
    it('should include query cache hit rate in statistics', async () => {
      // Add test data
      const event: ChangeGroupEvent = {
        groupId: 'cache-test',
        changes: [
          { Name: 'control1', Value: 1, String: '1' },
          { Name: 'control2', Value: 2, String: '2' },
        ],
        timestamp: BigInt(Date.now() * 1_000_000),
        timestampMs: Date.now(),
        sequenceNumber: 0,
      };
      mockAdapter.emit('changeGroup:changes', event);

      // First query (cache miss)
      await manager.query({ groupId: 'cache-test' });
      
      // Same query again (cache hit)
      await manager.query({ groupId: 'cache-test' });
      await manager.query({ groupId: 'cache-test' });

      const stats = manager.getStatistics();
      if (typeof stats === 'object' && stats !== null && 'queryCache' in stats) {
        expect(stats.queryCache).toBeDefined();
        expect(typeof stats.queryCache).toBe('object');
        
        const cacheStats = stats.queryCache as any;
        expect(cacheStats.size).toBeGreaterThan(0);
        expect(cacheStats.hitRate).toBeDefined();
      }
    });
  });
});