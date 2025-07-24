/**
 * Event Cache Manager Tests
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EventCacheManager } from '../manager.js';
import { MockQRWCAdapter } from '../test-helpers.js';

// Mock the logger
jest.mock('../../../../shared/utils/logger.js', () => ({
  globalLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('EventCacheManager', () => {
  let eventCache: EventCacheManager;
  let mockAdapter: MockQRWCAdapter & { on?: jest.Mock | undefined };

  beforeEach(() => {
    // Create a fresh mock adapter for each test
    const baseAdapter = new MockQRWCAdapter();
    // Add jest spy for testing
    const originalOn = baseAdapter.on.bind(baseAdapter);
    mockAdapter = Object.assign(baseAdapter, { on: jest.fn(originalOn) as any });
    
    // Create a fresh event cache for each test
    eventCache = new EventCacheManager({
      maxEvents: 1000,
      maxAgeMs: 60000 // 1 minute
    });
  });

  describe('initialization', () => {
    it('should create with default config', () => {
      const cache = new EventCacheManager();
      expect(cache).toBeDefined();
      expect(cache.getGroupIds()).toEqual([]);
    });

    it('should create with custom config', () => {
      const cache = new EventCacheManager({
        maxEvents: 5000,
        maxAgeMs: 300000
      });
      expect(cache).toBeDefined();
    });
  });

  describe('attachToAdapter', () => {
    it('should attach to adapter and listen for events', () => {
      eventCache.attachToAdapter(mockAdapter as any);
      
      expect(mockAdapter.on).toHaveBeenCalledWith(
        'changeGroup:changes',
        expect.any(Function)
      );
    });

    it('should not attach twice', () => {
      eventCache.attachToAdapter(mockAdapter as any);
      eventCache.attachToAdapter(mockAdapter as any);
      
      expect(mockAdapter.on).toHaveBeenCalledTimes(1);
    });
  });

  describe('event handling', () => {
    beforeEach(() => {
      eventCache.attachToAdapter(mockAdapter as any);
    });

    it('should store events from change group', (done) => {
      const changeEvent = {
        groupId: 'test-group',
        changes: [
          {
            Name: 'Gain1.gain',
            Value: 0.5,
            String: '0.5'
          },
          {
            Name: 'Gain1.mute',
            Value: false,
            String: 'false'
          }
        ],
        timestamp: BigInt(Date.now() * 1_000_000),
        timestampMs: Date.now(),
        sequenceNumber: 1
      };

      eventCache.on('eventsStored', (data) => {
        expect(data.groupId).toBe('test-group');
        expect(data.count).toBe(2);
        expect(data.totalEvents).toBe(2);
        done();
      });

      mockAdapter.emit('changeGroup:changes', changeEvent);
    });

    it('should calculate delta for numeric values', async () => {
      const time1 = Date.now();
      const time2 = time1 + 100;

      // First event
      mockAdapter.emit('changeGroup:changes', {
        groupId: 'test-group',
        changes: [{
          Name: 'Gain1.gain',
          Value: 0.5,
          String: '0.5'
        }],
        timestamp: BigInt(time1 * 1_000_000),
        timestampMs: time1,
        sequenceNumber: 1
      });

      // Second event with different value
      mockAdapter.emit('changeGroup:changes', {
        groupId: 'test-group',
        changes: [{
          Name: 'Gain1.gain',
          Value: 0.8,
          String: '0.8'
        }],
        timestamp: BigInt(time2 * 1_000_000),
        timestampMs: time2,
        sequenceNumber: 2
      });

      // Query events immediately (synchronous)
      const events = await eventCache.query({ 
        groupId: 'test-group',
        startTime: time1 - 1000,
        endTime: time2 + 1000
      });
      expect(events).toHaveLength(2);
      expect(events[1]?.delta).toBeCloseTo(0.3, 5);
      expect(events[1]?.duration).toBe(100);
    });
  });

  describe('query', () => {
    beforeEach(() => {
      eventCache.attachToAdapter(mockAdapter as any);
      
      // Add some test events in the past
      const baseTime = Date.now() - 30000; // 30 seconds ago
      for (let i = 0; i < 10; i++) {
        mockAdapter.emit('changeGroup:changes', {
          groupId: 'group1',
          changes: [{
            Name: `Control${  i}`,
            Value: i,
            String: String(i)
          }],
          timestamp: BigInt((baseTime + i * 1000) * 1_000_000),
          timestampMs: baseTime + i * 1000,
          sequenceNumber: i
        });
      }
    });

    it('should query all events', async () => {
      const events = await eventCache.query({});
      expect(events).toHaveLength(10);
    });

    it('should query by group ID', async () => {
      // Add events for another group
      mockAdapter.emit('changeGroup:changes', {
        groupId: 'group2',
        changes: [{
          Name: 'OtherControl',
          Value: 99,
          String: '99'
        }],
        timestamp: BigInt(Date.now() * 1_000_000),
        timestampMs: Date.now(),
        sequenceNumber: 100
      });

      const events = await eventCache.query({ groupId: 'group1' });
      expect(events).toHaveLength(10);
      expect(events.every(e => e.groupId === 'group1')).toBe(true);
    });

    it('should query by time range', async () => {
      const now = Date.now();
      const events = await eventCache.query({
        startTime: now - 60000, // 60 seconds ago to include test events
        endTime: now
      });
      
      // Should include recent events
      expect(events.length).toBeGreaterThan(0);
      expect(events.length).toBeLessThanOrEqual(10);
    });

    it('should filter by control names', async () => {
      const events = await eventCache.query({
        controlNames: ['Control3', 'Control5']
      });
      
      expect(events).toHaveLength(2);
      expect(events[0]?.controlName).toBe('Control3');
      expect(events[1]?.controlName).toBe('Control5');
    });

    it('should apply value filters', async () => {
      const events = await eventCache.query({
        valueFilter: {
          operator: 'gt',
          value: 5
        }
      });
      
      expect(events).toHaveLength(4); // Controls 6, 7, 8, 9
      expect(events.every(e => Number(e.value) > 5)).toBe(true);
    });

    it('should apply limit', async () => {
      const events = await eventCache.query({
        limit: 3
      });
      
      expect(events).toHaveLength(3);
    });

    it('should filter changes only', async () => {
      // Add duplicate value
      mockAdapter.emit('changeGroup:changes', {
        groupId: 'group1',
        changes: [{
          Name: 'Control0', // Same control
          Value: 0, // Same value
          String: '0'
        }],
        timestamp: BigInt(Date.now() * 1_000_000),
        timestampMs: Date.now(),
        sequenceNumber: 100
      });

      const events = await eventCache.query({
        groupId: 'group1',
        aggregation: 'changes_only'
      });
      
      // Should not include the duplicate
      expect(events.filter(e => e.controlName === 'Control0')).toHaveLength(1);
    });
  });

  describe('statistics', () => {
    beforeEach(() => {
      eventCache.attachToAdapter(mockAdapter as any);
      
      // Add test events in the past
      const baseTime = Date.now() - 5000; // 5 seconds ago
      for (let i = 0; i < 5; i++) {
        mockAdapter.emit('changeGroup:changes', {
          groupId: 'stats-group',
          changes: [{
            Name: `Control${  i % 3}`, // Only 3 unique controls
            Value: i,
            String: String(i)
          }],
          timestamp: BigInt((baseTime + i * 100) * 1_000_000),
          timestampMs: baseTime + i * 100,
          sequenceNumber: i
        });
      }
    });

    it('should calculate statistics for a group', () => {
      const stats = eventCache.getStatistics('stats-group');
      
      expect(stats).toBeDefined();
      if (!stats) throw new Error('Stats should be defined');
      expect(stats.eventCount).toBe(5);
      expect(stats.controlsTracked).toBe(3);
      expect(stats.oldestEvent).toBeDefined();
      expect(stats.newestEvent).toBeDefined();
      expect(stats.memoryUsage).toBeGreaterThan(0);
      expect(stats.eventsPerSecond).toBeGreaterThanOrEqual(0);
    });

    it('should return null for non-existent group', () => {
      const stats = eventCache.getStatistics('non-existent');
      expect(stats).toBeNull();
    });

    it('should get all statistics', () => {
      const allStats = eventCache.getAllStatistics();
      
      expect(allStats.size).toBe(1);
      expect(allStats.has('stats-group')).toBe(true);
    });
  });

  describe('clear operations', () => {
    beforeEach(() => {
      eventCache.attachToAdapter(mockAdapter as any);
      
      // Add events to multiple groups
      for (const group of ['group1', 'group2', 'group3']) {
        mockAdapter.emit('changeGroup:changes', {
          groupId: group,
          changes: [{
            Name: 'TestControl',
            Value: 1,
            String: '1'
          }],
          timestamp: BigInt(Date.now() * 1_000_000),
          timestampMs: Date.now(),
          sequenceNumber: 1
        });
      }
    });

    it('should clear specific group', async () => {
      expect(eventCache.getGroupIds()).toHaveLength(3);
      
      const result = eventCache.clearGroup('group2');
      expect(result).toBe(true);
      
      expect(eventCache.getGroupIds()).toHaveLength(2);
      expect(eventCache.getGroupIds()).not.toContain('group2');
      
      const events = await eventCache.query({ groupId: 'group2' });
      expect(events).toHaveLength(0);
    });

    it('should return false for non-existent group', () => {
      const result = eventCache.clearGroup('non-existent');
      expect(result).toBe(false);
    });

    it('should clear all groups', async () => {
      expect(eventCache.getGroupIds()).toHaveLength(3);
      
      eventCache.clearAll();
      
      expect(eventCache.getGroupIds()).toHaveLength(0);
      expect(await eventCache.query({})).toHaveLength(0);
    });
  });

  describe('value filter operators', () => {
    beforeEach(() => {
      eventCache.attachToAdapter(mockAdapter as any);
      
      // Add test events with various values
      const baseTime = Date.now() - 500; // 500ms ago to ensure they're in query range
      const testData = [
        { Name: 'NumericControl', Value: 5, String: '5' },
        { Name: 'NumericControl', Value: 10, String: '10' },
        { Name: 'BoolControl', Value: false, String: 'false' },
        { Name: 'BoolControl', Value: true, String: 'true' },
        { Name: 'StringControl', Value: 'active', String: 'active' },
        { Name: 'StringControl', Value: 'inactive', String: 'inactive' }
      ];

      testData.forEach((data, i) => {
        mockAdapter.emit('changeGroup:changes', {
          groupId: 'filter-test',
          changes: [data],
          timestamp: BigInt((baseTime + i * 100) * 1_000_000),
          timestampMs: baseTime + i * 100,
          sequenceNumber: i
        });
      });
    });

    it('should filter with eq operator', async () => {
      const events = await eventCache.query({
        groupId: 'filter-test',
        valueFilter: { operator: 'eq', value: 10 },
        startTime: Date.now() - 1000,
        endTime: Date.now() + 1000
      });
      
      expect(events).toHaveLength(1);
      expect(events[0]?.value).toBe(10);
    });

    it('should filter with neq operator', async () => {
      const events = await eventCache.query({
        groupId: 'filter-test',
        valueFilter: { operator: 'neq', value: true },
        startTime: Date.now() - 1000,
        endTime: Date.now() + 1000
      });
      
      expect(events.filter(e => e.controlName === 'BoolControl')).toHaveLength(1);
      expect(events.find(e => e.controlName === 'BoolControl')?.value).toBe(false);
    });

    it('should filter with changed_to operator', async () => {
      const events = await eventCache.query({
        groupId: 'filter-test',
        valueFilter: { operator: 'changed_to', value: true },
        startTime: Date.now() - 1000,
        endTime: Date.now() + 1000
      });
      
      // Should find the transition from false to true
      const boolChanges = events.filter(e => e.controlName === 'BoolControl');
      expect(boolChanges).toHaveLength(1);
      expect(boolChanges[0]?.value).toBe(true);
      expect(boolChanges[0]?.previousValue).toBe(false);
    });

    it('should filter with changed_from operator', async () => {
      const events = await eventCache.query({
        groupId: 'filter-test',
        valueFilter: { operator: 'changed_from', value: 'active' },
        startTime: Date.now() - 1000,
        endTime: Date.now() + 1000
      });
      
      // Should find the transition from active to inactive
      const stringChanges = events.filter(e => e.controlName === 'StringControl');
      expect(stringChanges).toHaveLength(1);
      expect(stringChanges[0]?.previousValue).toBe('active');
      expect(stringChanges[0]?.value).toBe('inactive');
    });
  });
});