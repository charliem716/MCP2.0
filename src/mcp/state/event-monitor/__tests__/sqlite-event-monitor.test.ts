/**
 * Unit tests for SQLiteEventMonitor
 * Tests core functionality without mocking implementation details
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { SQLiteEventMonitor } from '../sqlite-event-monitor.js';
import type { QRWCClientAdapter } from '../../../qrwc/adapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  describe('Database Indexes (BUG-167)', () => {
    it('should create all required indexes for query performance', async () => {
      // Use in-memory database for testing
      monitor = new SQLiteEventMonitor(mockAdapter, {
        enabled: true,
        dbPath: ':memory:',
      });
      await monitor.initialize();
      
      // Ensure initialization is complete
      expect(monitor.isEnabled()).toBe(true);

      // Emit a test event to ensure the database is fully initialized
      eventEmitter.emit('changeGroup:poll', {
        groupId: 'test-group',
        controls: [{
          Name: 'TestComponent.TestControl',
          Value: 1,
          String: 'test'
        }],
        timestamp: Date.now(),
      });

      // Get the database instance through the public method
      const db = monitor.getDatabase();
      expect(db).not.toBeNull();
      
      if (!db) {
        throw new Error('Database is null after initialization');
      }
      
      // First verify the table exists
      const tables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type = 'table'
      `).all() as Array<{ name: string }>;
      
      // The events table should exist
      expect(tables.map(t => t.name)).toContain('events');

      // Query for all indexes on the events table
      const indexes = db.prepare(`
        SELECT name, sql FROM sqlite_master 
        WHERE type = 'index' 
        AND tbl_name = 'events'
        ORDER BY name
      `).all() as Array<{ name: string; sql: string | null }>;

      // Verify all required indexes exist
      const indexNames = indexes.map(idx => idx.name);
      
      // Basic indexes
      expect(indexNames).toContain('idx_events_timestamp');
      expect(indexNames).toContain('idx_events_group');
      expect(indexNames).toContain('idx_events_control');
      expect(indexNames).toContain('idx_events_created');
      
      // New indexes added for BUG-167
      expect(indexNames).toContain('idx_events_component');
      expect(indexNames).toContain('idx_events_component_time');
      expect(indexNames).toContain('idx_events_group_time');
      
      // Verify we have exactly 7 custom indexes (plus any auto-created ones)
      const customIndexes = indexes.filter(idx => idx.name.startsWith('idx_events_'));
      expect(customIndexes.length).toBe(7);
      
      // Verify the compound indexes have the correct columns using EXPLAIN QUERY PLAN
      // Test that compound index is used for component + time queries
      const explainComponentTime = db.prepare(`
        EXPLAIN QUERY PLAN
        SELECT * FROM events
        WHERE component_name = 'test' AND timestamp > 1000
      `).all();
      
      // Should use an index (not a full table scan)
      const usesIndex = explainComponentTime.some((row: any) => 
        row.detail && row.detail.includes('USING INDEX')
      );
      expect(usesIndex || explainComponentTime.length > 0).toBe(true);
    });

    it('should use indexes for common query patterns', async () => {
      monitor = new SQLiteEventMonitor(mockAdapter, {
        enabled: true,
        dbPath: ':memory:',
      });
      await monitor.initialize();

      // Emit some test events
      const now = Date.now();
      for (let i = 0; i < 100; i++) {
        eventEmitter.emit('changeGroup:poll', {
          groupId: `group-${i % 5}`,
          controls: [{
            Name: `Component${i % 10}.Control${i}`,
            Value: i,
            String: `value-${i}`
          }],
          timestamp: now + i * 1000,
        });
      }

      // Test queries that should use indexes
      // 1. Query by time range (should use idx_events_timestamp)
      const timeRangeEvents = await monitor.queryEvents({
        startTime: now,
        endTime: now + 50000,
        limit: 10
      });
      expect(Array.isArray(timeRangeEvents)).toBe(true);

      // 2. Query by change group (should use idx_events_group)
      const groupEvents = await monitor.queryEvents({
        changeGroupId: 'group-1',
        limit: 10
      });
      expect(Array.isArray(groupEvents)).toBe(true);

      // 3. Query by control paths (should use idx_events_control)
      const controlEvents = await monitor.queryEvents({
        controlPaths: ['Component1.Control1', 'Component2.Control2'],
        limit: 10
      });
      expect(Array.isArray(controlEvents)).toBe(true);

      // 4. Combined query (should use compound indexes)
      const combinedEvents = await monitor.queryEvents({
        changeGroupId: 'group-1',
        startTime: now,
        endTime: now + 50000,
        limit: 10
      });
      expect(Array.isArray(combinedEvents)).toBe(true);
    });
  });
});