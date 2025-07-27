/**
 * Integration tests for EventCacheManager error recovery (STEP-3.1)
 */

import { EventCacheManager } from '../../src/mcp/state/event-cache/manager.js';
import type { ChangeGroupEvent } from '../../src/mcp/state/event-cache/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

describe('EventCacheManager - Error Recovery Integration', () => {
  let eventCache: EventCacheManager;
  const testSpilloverDir = './test-integration-spillover';
  const mockAdapter = {
    on: jest.fn(),
    removeListener: jest.fn()
  };

  beforeEach(async () => {
    // Clean up test directory
    await fs.rm(testSpilloverDir, { recursive: true, force: true });
    
    eventCache = new EventCacheManager({
      maxEvents: 10000,
      maxAgeMs: 3600000,
      globalMemoryLimitMB: 100,
      memoryCheckIntervalMs: 1000,
      diskSpilloverConfig: {
        enabled: true,
        directory: testSpilloverDir,
        thresholdMB: 80,
        maxFileSizeMB: 10
      },
      compressionConfig: {
        enabled: true,
        checkIntervalMs: 5000
      }
    });
  });

  afterEach(async () => {
    eventCache.destroy();
    await fs.rm(testSpilloverDir, { recursive: true, force: true });
  });

  describe('Disk full recovery', () => {
    it('should handle disk full errors gracefully', async () => {
      eventCache.attachToAdapter(mockAdapter);
      
      // Create spillover directory with limited space (simulate disk full)
      await fs.mkdir(testSpilloverDir, { recursive: true });
      
      // Fill cache to trigger spillover
      const largeEvent: ChangeGroupEvent = {
        groupId: 'large-group',
        changes: [],
        timestamp: BigInt(Date.now() * 1000000),
        timestampMs: Date.now()
      };

      // Add events until spillover threshold
      for (let i = 0; i < 5000; i++) {
        largeEvent.changes = [
          { 
            Name: `control${i}`, 
            Value: 'x'.repeat(1000), // Large value
            String: 'x'.repeat(1000) 
          }
        ];
        mockAdapter.on.mock.calls[0][1](largeEvent);
      }

      // Wait for spillover attempt
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Simulate disk full by making directory read-only
      try {
        await fs.chmod(testSpilloverDir, 0o444);
        
        // Add more events to trigger spillover failure
        for (let i = 5000; i < 6000; i++) {
          largeEvent.changes = [
            { Name: `control${i}`, Value: i, String: String(i) }
          ];
          mockAdapter.on.mock.calls[0][1](largeEvent);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify health status reflects the issue
        const health = eventCache.getHealthStatus();
        expect(health.status).not.toBe('healthy');
        expect(health.errorCount).toBeGreaterThan(0);
        
        // Verify cache is still functional
        const results = await eventCache.query({
          groupId: 'large-group',
          limit: 10
        });
        expect(results.length).toBeGreaterThan(0);
        
      } finally {
        // Restore permissions
        await fs.chmod(testSpilloverDir, 0o755);
      }
    });
  });

  describe('Memory pressure scenarios', () => {
    it('should handle sustained high memory pressure', async () => {
      const memoryPressureSpy = jest.fn();
      const emergencyEvictionSpy = jest.fn();
      
      eventCache.on('memoryPressure', memoryPressureSpy);
      eventCache.on('emergencyEviction', emergencyEvictionSpy);
      eventCache.attachToAdapter(mockAdapter);

      // Generate events continuously
      const interval = setInterval(() => {
        const event: ChangeGroupEvent = {
          groupId: `group${Math.floor(Math.random() * 10)}`,
          changes: Array(10).fill(null).map((_, i) => ({
            Name: `control${i}`,
            Value: Math.random() * 1000,
            String: 'x'.repeat(500)
          })),
          timestamp: BigInt(Date.now() * 1000000),
          timestampMs: Date.now()
        };
        mockAdapter.on.mock.calls[0][1](event);
      }, 10);

      // Run for 10 seconds
      await new Promise(resolve => setTimeout(resolve, 10000));
      clearInterval(interval);

      // Verify memory pressure was detected
      expect(memoryPressureSpy).toHaveBeenCalled();
      
      // Verify system remained stable
      const health = eventCache.getHealthStatus();
      expect(['healthy', 'degraded']).toContain(health.status);
      
      // Verify queries still work
      const results = await eventCache.query({
        startTime: Date.now() - 5000,
        limit: 100
      });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should recover from memory allocation failures', async () => {
      eventCache.attachToAdapter(mockAdapter);
      
      // Track memory stats
      const initialStats = eventCache.getMemoryStats();
      
      // Fill cache rapidly
      const promises = [];
      for (let g = 0; g < 20; g++) {
        promises.push((async () => {
          for (let i = 0; i < 1000; i++) {
            const event: ChangeGroupEvent = {
              groupId: `stress-group-${g}`,
              changes: [
                { 
                  Name: `control${i}`, 
                  Value: new Array(1000).fill('x').join(''),
                  String: new Array(1000).fill('x').join('')
                }
              ],
              timestamp: BigInt(Date.now() * 1000000),
              timestampMs: Date.now()
            };
            mockAdapter.on.mock.calls[0][1](event);
            
            // Small delay to allow event processing
            if (i % 100 === 0) {
              await new Promise(resolve => setTimeout(resolve, 10));
            }
          }
        })());
      }

      await Promise.all(promises);
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify recovery occurred
      const finalStats = eventCache.getMemoryStats();
      expect(finalStats.percentage).toBeLessThan(100);
      
      // Verify some events were retained
      const allStats = eventCache.getStatistics();
      expect(allStats).toBeDefined();
      if (typeof allStats === 'object' && 'totalEvents' in allStats) {
        expect(allStats.totalEvents).toBeGreaterThan(0);
      }
    });
  });

  describe('Corruption recovery', () => {
    it('should detect and recover from corrupted spillover files', async () => {
      eventCache.attachToAdapter(mockAdapter);
      
      // Create spillover directory
      await fs.mkdir(testSpilloverDir, { recursive: true });
      
      // Add events to trigger spillover
      const event: ChangeGroupEvent = {
        groupId: 'corruption-test',
        changes: [],
        timestamp: BigInt(Date.now() * 1000000),
        timestampMs: Date.now()
      };

      for (let i = 0; i < 2000; i++) {
        event.changes = [
          { Name: `control${i}`, Value: i, String: String(i) }
        ];
        mockAdapter.on.mock.calls[0][1](event);
      }

      // Wait for spillover
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Corrupt a spillover file
      const files = await fs.readdir(testSpilloverDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      
      if (jsonFiles.length > 0) {
        const corruptFile = path.join(testSpilloverDir, jsonFiles[0]);
        await fs.writeFile(corruptFile, '{ invalid json corrupted data');
        
        // Try to query, which should load from disk
        const results = await eventCache.query({
          groupId: 'corruption-test',
          startTime: 0
        });
        
        // Should still return some results from memory
        expect(results.length).toBeGreaterThan(0);
        
        // Verify error was handled
        const health = eventCache.getHealthStatus();
        expect(health.errorCount).toBeGreaterThan(0);
      }
    });
  });

  describe('Multi-error scenarios', () => {
    it('should handle cascading errors', async () => {
      const errorSpy = jest.fn();
      eventCache.on('error', errorSpy);
      eventCache.attachToAdapter(mockAdapter);

      // Scenario: Memory pressure + disk full + corruption
      
      // 1. Fill memory
      for (let i = 0; i < 5000; i++) {
        const event: ChangeGroupEvent = {
          groupId: 'cascade-test',
          changes: [
            { 
              Name: `control${i}`, 
              Value: 'x'.repeat(1000),
              String: 'x'.repeat(1000)
            }
          ],
          timestamp: BigInt(Date.now() * 1000000),
          timestampMs: Date.now()
        };
        mockAdapter.on.mock.calls[0][1](event);
      }

      // 2. Make spillover directory read-only
      await fs.mkdir(testSpilloverDir, { recursive: true });
      await fs.chmod(testSpilloverDir, 0o444);

      // 3. Continue adding events
      for (let i = 5000; i < 6000; i++) {
        const event: ChangeGroupEvent = {
          groupId: 'cascade-test',
          changes: [
            { Name: `control${i}`, Value: i, String: String(i) }
          ],
          timestamp: BigInt(Date.now() * 1000000),
          timestampMs: Date.now()
        };
        mockAdapter.on.mock.calls[0][1](event);
      }

      await new Promise(resolve => setTimeout(resolve, 3000));

      // Restore permissions
      await fs.chmod(testSpilloverDir, 0o755);

      // Verify multiple errors were handled
      expect(errorSpy).toHaveBeenCalledTimes(expect.any(Number));
      
      // Verify system is still operational
      const health = eventCache.getHealthStatus();
      expect(health.errorCount).toBeGreaterThan(0);
      
      // Verify basic functionality still works
      const results = await eventCache.query({
        groupId: 'cascade-test',
        limit: 10
      });
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Health monitoring during errors', () => {
    it('should accurately report health status transitions', async () => {
      const healthStates: Array<{ status: string; timestamp: number }> = [];
      
      // Monitor health periodically
      const healthInterval = setInterval(() => {
        const health = eventCache.getHealthStatus();
        healthStates.push({
          status: health.status,
          timestamp: Date.now()
        });
      }, 500);

      eventCache.attachToAdapter(mockAdapter);

      // Start healthy
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Add events to increase memory
      for (let i = 0; i < 8000; i++) {
        const event: ChangeGroupEvent = {
          groupId: 'health-test',
          changes: [
            { 
              Name: `control${i}`, 
              Value: 'x'.repeat(500),
              String: 'x'.repeat(500)
            }
          ],
          timestamp: BigInt(Date.now() * 1000000),
          timestampMs: Date.now()
        };
        mockAdapter.on.mock.calls[0][1](event);
        
        if (i % 1000 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
      clearInterval(healthInterval);

      // Verify we saw status transitions
      const uniqueStatuses = [...new Set(healthStates.map(h => h.status))];
      expect(uniqueStatuses.length).toBeGreaterThan(1);
      
      // Verify progression (may not see all states)
      expect(healthStates[0].status).toBe('healthy');
      expect(healthStates.some(h => h.status === 'degraded' || h.status === 'unhealthy')).toBe(true);
    });
  });
});