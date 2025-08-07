/**
 * Unit tests for SQLiteEventMonitor
 * Tests core functionality without mocking implementation details
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { SQLiteEventMonitor } from '../sqlite-event-monitor.js';
import type { QRWCClientAdapter } from '../../../qrwc/adapter.js';

describe('SQLiteEventMonitor', () => {
  let monitor: SQLiteEventMonitor;
  let mockAdapter: QRWCClientAdapter;
  let eventEmitter: EventEmitter;

  beforeEach(() => {
    // Create a minimal mock adapter
    eventEmitter = new EventEmitter();
    mockAdapter = {
      on: eventEmitter.on.bind(eventEmitter),
      emit: eventEmitter.emit.bind(eventEmitter),
      once: jest.fn(),
      off: jest.fn(),
      removeListener: jest.fn(),
    } as any;
  });

  afterEach(async () => {
    if (monitor && monitor.isEnabled()) {
      await monitor.close();
    }
  });

  describe('Initialization', () => {
    it('should initialize when enabled', async () => {
      monitor = new SQLiteEventMonitor(mockAdapter, {
        enabled: true,
        dbPath: ':memory:',
      });

      await monitor.initialize();
      expect(monitor.isEnabled()).toBe(true);
    });

    it('should not initialize when disabled', async () => {
      monitor = new SQLiteEventMonitor(mockAdapter, {
        enabled: false,
        dbPath: ':memory:',
      });

      await monitor.initialize();
      expect(monitor.isEnabled()).toBe(false);
    });

    it('should work without an adapter', async () => {
      monitor = new SQLiteEventMonitor(undefined, {
        enabled: true,
        dbPath: ':memory:',
      });

      await monitor.initialize();
      expect(monitor.isEnabled()).toBe(true);
    });
  });

  describe('Event Recording', () => {
    beforeEach(async () => {
      monitor = new SQLiteEventMonitor(mockAdapter, {
        enabled: true,
        dbPath: ':memory:',
      });
      await monitor.initialize();
    });

    it('should be able to query events', async () => {
      // Just verify that querying doesn't throw
      const events = await monitor.queryEvents({ groupId: 'test-group' });
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBe(0); // No events yet
    });

    it('should handle events without adapter', async () => {
      const monitorNoAdapter = new SQLiteEventMonitor(undefined, {
        enabled: true,
        dbPath: ':memory:',
      });
      await monitorNoAdapter.initialize();

      // Should not crash when no adapter
      const events = await monitorNoAdapter.queryEvents({});
      expect(events).toEqual([]);

      await monitorNoAdapter.close();
    });
  });

  describe('Query Operations', () => {
    beforeEach(async () => {
      monitor = new SQLiteEventMonitor(mockAdapter, {
        enabled: true,
        dbPath: ':memory:',
      });
      await monitor.initialize();
    });

    it('should query events by time range', async () => {
      const now = Date.now();
      
      // Emit some events
      for (let i = 0; i < 5; i++) {
        eventEmitter.emit('changeGroup:poll', {
          groupId: 'test-group',
          controls: [{ Name: 'Component.Control1', Value: i, String: `${i}` }],
          timestamp: now + i * 1000,
        });
      }

      // Query with time range
      const events = await monitor.queryEvents({
        startTime: now,
        endTime: now + 3000,
      });

      expect(Array.isArray(events)).toBe(true);
    });

    it('should return statistics', async () => {
      const stats = await monitor.getStatistics();
      
      expect(stats).toHaveProperty('totalEvents');
      expect(stats).toHaveProperty('uniqueControls');
      expect(stats).toHaveProperty('changeGroups');
      expect(stats).toHaveProperty('oldestEvent');
      expect(stats).toHaveProperty('newestEvent');
      expect(stats).toHaveProperty('databaseSize');
    });
  });

  describe('Resource Management', () => {
    it('should close cleanly', async () => {
      monitor = new SQLiteEventMonitor(mockAdapter, {
        enabled: true,
        dbPath: ':memory:',
      });
      await monitor.initialize();
      
      expect(monitor.isEnabled()).toBe(true);
      
      await monitor.close();
      expect(monitor.isEnabled()).toBe(false);
    });

    it('should handle multiple close calls', async () => {
      monitor = new SQLiteEventMonitor(mockAdapter, {
        enabled: true,
        dbPath: ':memory:',
      });
      await monitor.initialize();
      
      await monitor.close();
      await monitor.close(); // Should not throw
      
      expect(monitor.isEnabled()).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid query parameters gracefully', async () => {
      monitor = new SQLiteEventMonitor(mockAdapter, {
        enabled: true,
        dbPath: ':memory:',
      });
      await monitor.initialize();

      const events = await monitor.queryEvents({
        limit: -1, // Invalid
        startTime: 'invalid' as any, // Invalid type
      });

      expect(Array.isArray(events)).toBe(true);
    });

    it('should handle disabled monitor operations', async () => {
      monitor = new SQLiteEventMonitor(mockAdapter, {
        enabled: false,
        dbPath: ':memory:',
      });
      await monitor.initialize();

      const events = await monitor.queryEvents({});
      expect(events).toEqual([]);

      const stats = await monitor.getStatistics();
      expect(stats.totalEvents).toBe(0);
    });
  });
});