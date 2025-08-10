import { SQLiteEventMonitor } from '../../../../../src/mcp/state/event-monitor/sqlite-event-monitor.js';
import Database from 'better-sqlite3';
import { globalLogger as logger } from '../../../../../src/shared/utils/logger.js';
import fs from 'fs';
import path from 'path';

jest.mock('../../../../../src/shared/utils/logger.js', () => ({
  globalLogger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('SQLiteEventMonitor Filtering and Pagination', () => {
  let monitor: SQLiteEventMonitor;
  let testDbPath: string;

  beforeEach(async () => {
    // Use in-memory database for complete isolation
    testDbPath = ':memory:';
    
    monitor = new SQLiteEventMonitor(undefined, {
      enabled: true,
      dbPath: testDbPath,
      bufferSize: 0, // Immediate flush for testing
      flushInterval: 1000,
    });

    await monitor.initialize();
    
    // Get database reference
    const db = monitor.getDatabase();
    if (!db) throw new Error('Database not initialized');
    
    // Check if there's any existing data (debug)
    const existingCount = db.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number };
    if (existingCount.count > 0) {
      console.error(`WARNING: Database already has ${existingCount.count} events before test setup!`);
      // Clear all existing data
      db.exec('DELETE FROM events');
    }

    // Insert test data with various components and controls
    const testEvents = [
      // Events for Component A
      { timestamp: Date.now() - 10000, changeGroupId: 'group1', controlPath: 'CompA.control1', 
        componentName: 'Component A', controlName: 'control1', value: 1, stringValue: '1', source: 'test' },
      { timestamp: Date.now() - 9000, changeGroupId: 'group1', controlPath: 'CompA.control2', 
        componentName: 'Component A', controlName: 'control2', value: 2, stringValue: '2', source: 'test' },
      { timestamp: Date.now() - 8000, changeGroupId: 'group1', controlPath: 'CompA.control3', 
        componentName: 'Component A', controlName: 'control3', value: 3, stringValue: '3', source: 'test' },
      
      // Events for Component B
      { timestamp: Date.now() - 7000, changeGroupId: 'group2', controlPath: 'CompB.control1', 
        componentName: 'Component B', controlName: 'control1', value: 4, stringValue: '4', source: 'test' },
      { timestamp: Date.now() - 6000, changeGroupId: 'group2', controlPath: 'CompB.control2', 
        componentName: 'Component B', controlName: 'control2', value: 5, stringValue: '5', source: 'test' },
      { timestamp: Date.now() - 5000, changeGroupId: 'group2', controlPath: 'CompB.control3', 
        componentName: 'Component B', controlName: 'control3', value: 6, stringValue: '6', source: 'test' },
      
      // Events for Component C
      { timestamp: Date.now() - 4000, changeGroupId: 'group3', controlPath: 'CompC.control1', 
        componentName: 'Component C', controlName: 'control1', value: 7, stringValue: '7', source: 'test' },
      { timestamp: Date.now() - 3000, changeGroupId: 'group3', controlPath: 'CompC.control2', 
        componentName: 'Component C', controlName: 'control2', value: 8, stringValue: '8', source: 'test' },
      { timestamp: Date.now() - 2000, changeGroupId: 'group3', controlPath: 'CompC.control3', 
        componentName: 'Component C', controlName: 'control3', value: 9, stringValue: '9', source: 'test' },
      { timestamp: Date.now() - 1000, changeGroupId: 'group3', controlPath: 'CompC.control4', 
        componentName: 'Component C', controlName: 'control4', value: 10, stringValue: '10', source: 'test' },
    ];

    // Insert test events directly into database
    const stmt = db.prepare(`
      INSERT INTO events (
        timestamp, change_group_id, control_path,
        component_name, control_name, value, string_value, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    for (const event of testEvents) {
      stmt.run(
        event.timestamp,
        event.changeGroupId,
        event.controlPath,
        event.componentName,
        event.controlName,
        event.value,
        event.stringValue,
        event.source
      );
    }
    
    // Verify insertions (debug)
    const afterCount = db.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number };
    const sampleEvents = db.prepare('SELECT * FROM events LIMIT 3').all();
    console.log(`Inserted ${testEvents.length} events, DB now has ${afterCount.count} events`);
    console.log('Sample events:', sampleEvents);
  });

  afterEach(async () => {
    await monitor.close();
    // No file cleanup needed for in-memory database
  });

  describe('Component Name Filtering', () => {
    it('should filter events by single component name', async () => {
      const events = await monitor.queryEvents({
        componentNames: ['Component A']
      });

      expect(events).toHaveLength(3);
      expect(events.every(e => e.componentName === 'Component A')).toBe(true);
    });

    it('should filter events by multiple component names', async () => {
      const events = await monitor.queryEvents({
        componentNames: ['Component A', 'Component B']
      });

      expect(events).toHaveLength(6);
      expect(events.every(e => 
        e.componentName === 'Component A' || e.componentName === 'Component B'
      )).toBe(true);
    });

    it('should return empty array for non-existent component', async () => {
      const events = await monitor.queryEvents({
        componentNames: ['Non-Existent Component']
      });

      expect(events).toHaveLength(0);
    });

    it('should combine component filtering with other filters', async () => {
      const events = await monitor.queryEvents({
        componentNames: ['Component C'],
        changeGroupId: 'group3'
      });

      expect(events).toHaveLength(4);
      expect(events.every(e => 
        e.componentName === 'Component C' && e.changeGroupId === 'group3'
      )).toBe(true);
    });
  });

  describe('Pagination with Offset', () => {
    it('should return different results with different offsets', async () => {
      const page1 = await monitor.queryEvents({
        limit: 3,
        offset: 0
      });

      const page2 = await monitor.queryEvents({
        limit: 3,
        offset: 3
      });

      const page3 = await monitor.queryEvents({
        limit: 3,
        offset: 6
      });

      // Should have different events
      expect(page1).toHaveLength(3);
      expect(page2).toHaveLength(3);
      expect(page3).toHaveLength(3);

      // Events should not overlap
      const page1Ids = page1.map(e => e.id);
      const page2Ids = page2.map(e => e.id);
      const page3Ids = page3.map(e => e.id);

      expect(page1Ids.some(id => page2Ids.includes(id))).toBe(false);
      expect(page1Ids.some(id => page3Ids.includes(id))).toBe(false);
      expect(page2Ids.some(id => page3Ids.includes(id))).toBe(false);
    });

    it('should handle offset beyond available records', async () => {
      const events = await monitor.queryEvents({
        limit: 5,
        offset: 100
      });

      expect(events).toHaveLength(0);
    });

    it('should handle partial pages at the end', async () => {
      const events = await monitor.queryEvents({
        limit: 5,
        offset: 8
      });

      expect(events).toHaveLength(2); // Only 2 events left after offset 8
    });

    it('should work with filters and pagination together', async () => {
      const page1 = await monitor.queryEvents({
        componentNames: ['Component C'],
        limit: 2,
        offset: 0
      });

      const page2 = await monitor.queryEvents({
        componentNames: ['Component C'],
        limit: 2,
        offset: 2
      });

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      
      // All should be from Component C
      expect([...page1, ...page2].every(e => e.componentName === 'Component C')).toBe(true);
      
      // Should be different events
      const page1Ids = page1.map(e => e.id);
      const page2Ids = page2.map(e => e.id);
      expect(page1Ids.some(id => page2Ids.includes(id))).toBe(false);
    });
  });

  describe('Combined Filtering Scenarios', () => {
    it('should handle all filters simultaneously', async () => {
      const events = await monitor.queryEvents({
        startTime: Date.now() - 8000,
        endTime: Date.now() - 2000,
        componentNames: ['Component B', 'Component C'],
        limit: 3,
        offset: 1
      });

      // Should get events from -7000 to -2000 for Component B and C
      // That's 5 events total (3 from B, 2 from C)
      // With offset 1 and limit 3, should get events 2-4
      expect(events).toHaveLength(3);
      expect(events.every(e => 
        e.componentName === 'Component B' || e.componentName === 'Component C'
      )).toBe(true);
    });

    it('should maintain sort order with pagination', async () => {
      const allEvents = await monitor.queryEvents({
        limit: 10
      });

      const page1 = await monitor.queryEvents({
        limit: 5,
        offset: 0
      });

      const page2 = await monitor.queryEvents({
        limit: 5,
        offset: 5
      });

      // Concatenated pages should match original order
      expect([...page1, ...page2].map(e => e.id)).toEqual(allEvents.map(e => e.id));
    });
  });
});