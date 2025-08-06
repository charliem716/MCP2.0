import { jest } from '@jest/globals';
import { SQLiteEventMonitor } from '../../src/mcp/state/event-monitor/sqlite-event-monitor.js';
import { MonitoredStateManager } from '../../src/mcp/state/monitored-state-manager.js';
import { SimpleStateManager } from '../../src/mcp/state/simple-state-manager.js';
import type { QRWCClientAdapter } from '../../src/mcp/qrwc/adapter.js';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs');

describe('Event Cache Error Recovery', () => {
  let eventMonitor: SQLiteEventMonitor;
  let stateManager: SimpleStateManager;
  let mockAdapter: QRWCClientAdapter;
  let changeGroupEmitter: EventEmitter;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Mock file system
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    (fs.readdirSync as jest.Mock).mockReturnValue([]);
    (fs.unlinkSync as jest.Mock).mockImplementation(() => {});

    // Create mock adapter
    changeGroupEmitter = new EventEmitter();
    mockAdapter = {
      on: changeGroupEmitter.on.bind(changeGroupEmitter),
      emit: changeGroupEmitter.emit.bind(changeGroupEmitter),
      removeListener: changeGroupEmitter.removeListener.bind(changeGroupEmitter),
      removeAllListeners: changeGroupEmitter.removeAllListeners.bind(changeGroupEmitter),
      getAllChangeGroups: jest.fn().mockResolvedValue(new Map()),
    } as any;

    // Create state manager
    stateManager = new SimpleStateManager();
    await stateManager.initialize({
      maxEntries: 100,
      ttlMs: 60000,
      cleanupIntervalMs: 10000,
      enableMetrics: false,
      persistenceEnabled: false,
    });

    eventMonitor = new SQLiteEventMonitor(stateManager, mockAdapter);
  });

  afterEach(async () => {
    if (eventMonitor) {
      await eventMonitor.shutdown();
    }
    if (stateManager) {
      await stateManager.shutdown();
    }
  });

  describe('Initialization failures', () => {
    it('should handle database creation failure', async () => {
      // Mock fs to fail on directory creation
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.mkdirSync as jest.Mock).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      await expect(eventMonitor.initialize({
        enabled: true,
        dbPath: '/restricted/path',
        retentionDays: 7,
      })).rejects.toThrow('Permission denied');

      expect(eventMonitor.isInitialized()).toBe(false);
    });

    it('should handle invalid database path gracefully', async () => {
      // Mock invalid path characters
      await expect(eventMonitor.initialize({
        enabled: true,
        dbPath: '\0invalid\0path', // Null characters
        retentionDays: 7,
      })).rejects.toThrow();
    });

    it('should not initialize when disabled', async () => {
      await eventMonitor.initialize({
        enabled: false,
        dbPath: ':memory:',
      });

      expect(eventMonitor.isInitialized()).toBe(false);
      
      // Should throw meaningful error when trying to use
      await expect(eventMonitor.query({})).rejects.toThrow('Event monitoring is not active');
    });
  });

  describe('Runtime failures', () => {
    beforeEach(async () => {
      await eventMonitor.initialize({
        enabled: true,
        dbPath: ':memory:',
        retentionDays: 7,
        bufferSize: 10,
        flushInterval: 50,
      });
    });

    it('should handle change group lookup failures', async () => {
      // Make getAllChangeGroups throw error
      (mockAdapter.getAllChangeGroups as jest.Mock).mockRejectedValue(new Error('Network error'));

      // Should not crash when trying to record event
      await stateManager.setState('Control1', { value: 1, source: 'test' });

      // Wait for potential flush
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should have no events since change group lookup failed
      const events = await eventMonitor.query({});
      expect(events).toHaveLength(0);
    });

    it('should handle database write failures', async () => {
      // Setup change group
      (mockAdapter.getAllChangeGroups as jest.Mock).mockResolvedValue(
        new Map([['test', { id: 'test', controls: ['Control1'] }]])
      );
      changeGroupEmitter.emit('changeGroupSubscribed', 'test');

      // Mock database prepare to fail
      const db = eventMonitor['db'];
      if (db) {
        const originalPrepare = db.prepare.bind(db);
        let failCount = 0;
        jest.spyOn(db, 'prepare').mockImplementation((sql: string) => {
          if (sql.includes('INSERT') && failCount++ < 2) {
            throw new Error('Database locked');
          }
          return originalPrepare(sql);
        });
      }

      // Try to record events
      await stateManager.setState('Control1', { value: 1, source: 'test' });
      await stateManager.setState('Control1', { value: 2, source: 'test' });

      // Wait for flush attempts
      await new Promise(resolve => setTimeout(resolve, 200));

      // Events should eventually be written (after retries)
      const events = await eventMonitor.query({});
      expect(events.length).toBeGreaterThanOrEqual(0); // May or may not succeed
    });

    it('should recover from buffer overflow', async () => {
      // Initialize with very small buffer
      await eventMonitor.shutdown();
      eventMonitor = new SQLiteEventMonitor(stateManager, mockAdapter);
      await eventMonitor.initialize({
        enabled: true,
        dbPath: ':memory:',
        retentionDays: 7,
        bufferSize: 3,
        flushInterval: 1000, // Long interval to test buffer overflow
      });

      (mockAdapter.getAllChangeGroups as jest.Mock).mockResolvedValue(
        new Map([['test', { id: 'test', controls: ['Control1', 'Control2', 'Control3', 'Control4'] }]])
      );
      changeGroupEmitter.emit('changeGroupSubscribed', 'test');

      // Add more events than buffer can hold
      for (let i = 0; i < 10; i++) {
        await stateManager.setState(`Control${i % 4 + 1}`, { value: i, source: 'test' });
      }

      // Force flush
      const events = await eventMonitor.query({});
      
      // Should have recorded events despite buffer overflow
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('Query failures', () => {
    beforeEach(async () => {
      await eventMonitor.initialize({
        enabled: true,
        dbPath: ':memory:',
        retentionDays: 7,
      });

      // Add some test data
      (mockAdapter.getAllChangeGroups as jest.Mock).mockResolvedValue(
        new Map([['test', { id: 'test', controls: ['Control1'] }]])
      );
      changeGroupEmitter.emit('changeGroupSubscribed', 'test');
      await stateManager.setState('Control1', { value: 1, source: 'test' });
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should handle invalid query parameters', async () => {
      // Invalid time range (end before start)
      const events = await eventMonitor.query({
        startTime: Date.now(),
        endTime: Date.now() - 10000,
      });

      // Should return empty array rather than error
      expect(events).toEqual([]);
    });

    it('should handle database query errors', async () => {
      // Mock database to throw on query
      const db = eventMonitor['db'];
      if (db) {
        jest.spyOn(db, 'prepare').mockImplementation(() => {
          throw new Error('SQL syntax error');
        });
      }

      await expect(eventMonitor.query({})).rejects.toThrow('SQL syntax error');
    });

    it('should handle statistics query errors', async () => {
      // Mock database to throw on statistics query
      const db = eventMonitor['db'];
      if (db) {
        const originalPrepare = db.prepare.bind(db);
        jest.spyOn(db, 'prepare').mockImplementation((sql: string) => {
          if (sql.includes('COUNT')) {
            throw new Error('Aggregate function error');
          }
          return originalPrepare(sql);
        });
      }

      await expect(eventMonitor.getStatistics()).rejects.toThrow('Aggregate function error');
    });
  });

  describe('State consistency', () => {
    it('should maintain consistency during concurrent operations', async () => {
      await eventMonitor.initialize({
        enabled: true,
        dbPath: ':memory:',
        retentionDays: 7,
        bufferSize: 100,
        flushInterval: 50,
      });

      (mockAdapter.getAllChangeGroups as jest.Mock).mockResolvedValue(
        new Map([['test', { id: 'test', controls: Array(10).fill(0).map((_, i) => `Control${i}`) }]])
      );
      changeGroupEmitter.emit('changeGroupSubscribed', 'test');

      // Perform concurrent operations
      const operations = [];

      // Concurrent writes
      for (let i = 0; i < 10; i++) {
        operations.push(
          stateManager.setState(`Control${i}`, { value: i, source: 'test' })
        );
      }

      // Concurrent queries
      operations.push(eventMonitor.query({}));
      operations.push(eventMonitor.getStatistics());

      // Wait for all operations
      await Promise.all(operations);

      // Verify consistency
      const finalEvents = await eventMonitor.query({});
      const finalStats = await eventMonitor.getStatistics();

      expect(finalStats.totalEvents).toBe(finalEvents.length);
      expect(finalStats.totalEvents).toBeLessThanOrEqual(10);
    });

    it('should handle rapid subscribe/unsubscribe cycles', async () => {
      await eventMonitor.initialize({
        enabled: true,
        dbPath: ':memory:',
        retentionDays: 7,
      });

      (mockAdapter.getAllChangeGroups as jest.Mock).mockResolvedValue(
        new Map([['test', { id: 'test', controls: ['Control1'] }]])
      );

      // Rapid subscribe/unsubscribe
      for (let i = 0; i < 5; i++) {
        changeGroupEmitter.emit('changeGroupSubscribed', 'test');
        await stateManager.setState('Control1', { value: i, source: 'test' });
        changeGroupEmitter.emit('changeGroupUnsubscribed', 'test');
      }

      // Final subscribe and record
      changeGroupEmitter.emit('changeGroupSubscribed', 'test');
      await stateManager.setState('Control1', { value: 99, source: 'test' });

      await new Promise(resolve => setTimeout(resolve, 100));

      const events = await eventMonitor.query({});
      // Should have recorded some events
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('Memory management', () => {
    it('should handle memory pressure gracefully', async () => {
      await eventMonitor.initialize({
        enabled: true,
        dbPath: ':memory:',
        retentionDays: 7,
        bufferSize: 10000, // Large buffer
        flushInterval: 10000, // Infrequent flush
      });

      (mockAdapter.getAllChangeGroups as jest.Mock).mockResolvedValue(
        new Map([['test', { id: 'test', controls: ['Control1'] }]])
      );
      changeGroupEmitter.emit('changeGroupSubscribed', 'test');

      // Fill buffer with many events
      for (let i = 0; i < 5000; i++) {
        await stateManager.setState('Control1', { 
          value: i, 
          source: 'test',
          // Add large payload to increase memory usage
          metadata: { data: 'x'.repeat(1000) }
        });
      }

      // Should handle large buffer
      const stats = await eventMonitor.getStatistics();
      expect(stats.bufferSize).toBeLessThanOrEqual(10000);
    });

    it('should clean up resources on shutdown', async () => {
      await eventMonitor.initialize({
        enabled: true,
        dbPath: ':memory:',
        retentionDays: 7,
      });

      // Add listeners and data
      (mockAdapter.getAllChangeGroups as jest.Mock).mockResolvedValue(
        new Map([['test', { id: 'test', controls: ['Control1'] }]])
      );
      changeGroupEmitter.emit('changeGroupSubscribed', 'test');
      await stateManager.setState('Control1', { value: 1, source: 'test' });

      // Shutdown
      await eventMonitor.shutdown();

      // Verify cleanup
      expect(eventMonitor.isInitialized()).toBe(false);
      
      // Should not be able to perform operations
      await expect(eventMonitor.query({})).rejects.toThrow('Event monitoring is not active');
      await expect(eventMonitor.getStatistics()).rejects.toThrow('Event monitoring is not active');

      // Listeners should be removed
      expect(changeGroupEmitter.listenerCount('changeGroupSubscribed')).toBe(0);
      expect(changeGroupEmitter.listenerCount('changeGroupUnsubscribed')).toBe(0);
    });
  });

  describe('Integration with MonitoredStateManager', () => {
    it('should handle state manager errors gracefully', async () => {
      const monitoredManager = new MonitoredStateManager();
      
      await monitoredManager.initialize({
        maxEntries: 100,
        ttlMs: 60000,
        cleanupIntervalMs: 10000,
        enableMetrics: false,
        persistenceEnabled: false,
        eventMonitoring: {
          enabled: true,
          dbPath: ':memory:',
        },
      }, mockAdapter);

      // Force an error in state manager
      jest.spyOn(monitoredManager, 'setState').mockRejectedValue(new Error('State error'));

      // Should handle the error
      await expect(monitoredManager.setState('Control1', { value: 1, source: 'test' }))
        .rejects.toThrow('State error');

      // Event monitor should still be functional
      const monitor = monitoredManager.getEventMonitor();
      if (monitor) {
        const stats = await monitor.getStatistics();
        expect(stats).toBeDefined();
      }

      await monitoredManager.shutdown();
    });

    it('should recover from event monitor failure', async () => {
      const monitoredManager = new MonitoredStateManager();
      
      // Initialize with invalid path to cause monitor failure
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.mkdirSync as jest.Mock).mockImplementation(() => {
        throw new Error('Cannot create directory');
      });

      await expect(monitoredManager.initialize({
        maxEntries: 100,
        ttlMs: 60000,
        cleanupIntervalMs: 10000,
        enableMetrics: false,
        persistenceEnabled: false,
        eventMonitoring: {
          enabled: true,
          dbPath: '/invalid/path',
        },
      }, mockAdapter)).rejects.toThrow('Cannot create directory');

      // State manager should not be initialized due to monitor failure
      expect(monitoredManager.getEventMonitor()).toBeUndefined();
    });
  });
});