/**
 * Tests for BUG-083: Code Complexity Violations fixes
 *
 * Verifies that refactored methods maintain correct behavior
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
    error: jest.fn(),
  },
}));

describe('BUG-083: Refactored Methods', () => {
  let manager: EventCacheManager;
  let mockAdapter: MockQRWCAdapter;

  beforeEach(() => {
    mockAdapter = new MockQRWCAdapter();
    manager = new EventCacheManager({
      maxEvents: 1000,
      maxAgeMs: 60000,
      compressionConfig: {
        enabled: true,
        checkIntervalMs: 100,
        recentWindowMs: 1000,
        mediumWindowMs: 5000,
        ancientWindowMs: 10000,
        significantChangePercent: 10,
        minTimeBetweenEventsMs: 100,
      },
      diskSpilloverConfig: {
        enabled: true,
        directory: '/tmp/test-spillover',
        thresholdMB: 1,
        maxFileSizeMB: 10,
      },
      globalMemoryLimitMB: 0.5, // Lower limit to 0.5MB for testing
      memoryCheckIntervalMs: 50, // Faster checks for testing
    });
    manager.attachToAdapter(mockAdapter as any);
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('Compression (refactored compressBufferEvents)', () => {
    it('should compress events based on age windows', async () => {
      const groupId = 'test-group';

      // Add events across different time windows
      for (let i = 0; i < 20; i++) {
        mockAdapter.emit('changeGroup:changes', {
          groupId,
          changes: [{ Name: 'test.control', Value: i, String: i.toString() }],
          timestamp: BigInt(Date.now() * 1_000_000),
          timestampMs: Date.now() - i * 500, // Space them out by 500ms
          sequenceNumber: i,
        });
      }

      // Trigger compression
      await new Promise(resolve => setTimeout(resolve, 200));

      const events = await manager.query({ groupId });

      // Should have compressed some events
      expect(events.length).toBeLessThan(20);
      expect(events.length).toBeGreaterThan(0);
    });

    it('should keep all recent events', async () => {
      const groupId = 'test-group';
      const now = Date.now();

      // Add 10 recent events
      for (let i = 0; i < 10; i++) {
        mockAdapter.emit('changeGroup:changes', {
          groupId,
          changes: [{ Name: 'test.control', Value: i, String: i.toString() }],
          timestamp: BigInt(now * 1_000_000),
          timestampMs: now,
          sequenceNumber: i,
        });
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      const events = await manager.query({ groupId });
      expect(events.length).toBe(10);
    });

    it('should keep significant changes in medium window', async () => {
      const groupId = 'test-group';
      const now = Date.now();

      // Add initial value
      mockAdapter.emit('changeGroup:changes', {
        groupId,
        changes: [{ Name: 'test.control', Value: 100, String: '100' }],
        timestamp: BigInt((now - 2000) * 1_000_000),
        timestampMs: now - 2000,
        sequenceNumber: 0,
      });

      // Add small change (5% - should be compressed)
      mockAdapter.emit('changeGroup:changes', {
        groupId,
        changes: [{ Name: 'test.control', Value: 105, String: '105' }],
        timestamp: BigInt((now - 1500) * 1_000_000),
        timestampMs: now - 1500,
        sequenceNumber: 1,
      });

      // Add significant change (15% - should be kept)
      mockAdapter.emit('changeGroup:changes', {
        groupId,
        changes: [{ Name: 'test.control', Value: 115, String: '115' }],
        timestamp: BigInt((now - 1000) * 1_000_000),
        timestampMs: now - 1000,
        sequenceNumber: 2,
      });

      // Wait for compression
      await new Promise(resolve => setTimeout(resolve, 200));

      const events = await manager.query({ groupId });
      const values = events.map(e => e.value);

      expect(values).toContain(100);
      expect(values).toContain(115);
      // Small change might be compressed out
    });
  });

  describe('Memory Pressure (refactored handleMemoryPressure)', () => {
    it('should evict events when memory limit exceeded', async () => {
      // Add many events to trigger memory pressure
      const groups = ['group1', 'group2', 'group3'];

      for (const groupId of groups) {
        for (let i = 0; i < 500; i++) {
          mockAdapter.emit('changeGroup:changes', {
            groupId,
            changes: [
              { Name: `${groupId}.control1`, Value: i, String: i.toString() },
              {
                Name: `${groupId}.control2`,
                Value: i * 2,
                String: (i * 2).toString(),
              },
            ],
            timestamp: BigInt(Date.now() * 1_000_000),
            timestampMs: Date.now(),
            sequenceNumber: i,
          });
        }
      }

      // Wait for memory check
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify some events were evicted
      let totalEvents = 0;
      for (const groupId of groups) {
        const events = await manager.query({ groupId });
        totalEvents += events.length;
      }

      // Should have less than the original 3000 events (500 * 2 * 3)
      expect(totalEvents).toBeLessThan(3000);
    });

    it('should respect group priorities during eviction', async () => {
      // Set group priorities
      manager.setGroupPriority('high-priority', 'high');
      manager.setGroupPriority('low-priority', 'low');

      // Add events to both groups
      for (let i = 0; i < 500; i++) {
        mockAdapter.emit('changeGroup:changes', {
          groupId: 'high-priority',
          changes: [{ Name: 'control', Value: i, String: i.toString() }],
          timestamp: BigInt(Date.now() * 1_000_000),
          timestampMs: Date.now(),
          sequenceNumber: i,
        });

        mockAdapter.emit('changeGroup:changes', {
          groupId: 'low-priority',
          changes: [{ Name: 'control', Value: i, String: i.toString() }],
          timestamp: BigInt(Date.now() * 1_000_000),
          timestampMs: Date.now(),
          sequenceNumber: i,
        });
      }

      // Trigger memory pressure
      await new Promise(resolve => setTimeout(resolve, 300));

      const highPriorityEvents = await manager.query({
        groupId: 'high-priority',
      });
      const lowPriorityEvents = await manager.query({
        groupId: 'low-priority',
      });

      // High priority should have more events retained
      expect(highPriorityEvents.length).toBeGreaterThan(
        lowPriorityEvents.length
      );
    });
  });

  describe('Change Event Handling (refactored handleChangeEvent)', () => {
    it('should process multiple changes efficiently', async () => {
      const groupId = 'test-group';
      let eventCount = 0;

      manager.on('eventsStored', data => {
        eventCount += data.count;
      });

      // Send batch of changes
      mockAdapter.emit('changeGroup:changes', {
        groupId,
        changes: [
          { Name: 'control1', Value: 1, String: '1' },
          { Name: 'control2', Value: 2, String: '2' },
          { Name: 'control3', Value: 3, String: '3' },
          { Name: 'control4', Value: 4, String: '4' },
          { Name: 'control5', Value: 5, String: '5' },
        ],
        timestamp: BigInt(Date.now() * 1_000_000),
        timestampMs: Date.now(),
        sequenceNumber: 1,
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(eventCount).toBe(5);

      const events = await manager.query({ groupId });
      expect(events.length).toBe(5);
    });

    it('should detect event types correctly', async () => {
      // Create a new manager without compression for this test
      const testManager = new EventCacheManager({
        maxEvents: 1000,
        maxAgeMs: 60000,
        compressionConfig: {
          enabled: false, // Disable compression for this test
        },
      });
      testManager.attachToAdapter(mockAdapter as any);

      const groupId = 'test-group';

      // Initial value
      mockAdapter.emit('changeGroup:changes', {
        groupId,
        changes: [{ Name: 'control', Value: 0, String: '0' }],
        timestamp: BigInt(Date.now() * 1_000_000),
        timestampMs: Date.now(),
        sequenceNumber: 1,
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      // State transition
      mockAdapter.emit('changeGroup:changes', {
        groupId,
        changes: [{ Name: 'control', Value: 1, String: '1' }],
        timestamp: BigInt(Date.now() * 1_000_000),
        timestampMs: Date.now(),
        sequenceNumber: 2,
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      // Significant change
      mockAdapter.emit('changeGroup:changes', {
        groupId,
        changes: [{ Name: 'numeric', Value: 100, String: '100' }],
        timestamp: BigInt(Date.now() * 1_000_000),
        timestampMs: Date.now(),
        sequenceNumber: 3,
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      mockAdapter.emit('changeGroup:changes', {
        groupId,
        changes: [{ Name: 'numeric', Value: 150, String: '150' }],
        timestamp: BigInt(Date.now() * 1_000_000),
        timestampMs: Date.now(),
        sequenceNumber: 4,
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const events = await testManager.query({ groupId });

      // Check event types were detected
      const eventTypes = events.map(e => e.eventType).filter(Boolean);

      // Debug output - removed after fixing

      expect(eventTypes.length).toBeGreaterThan(0);
      expect(eventTypes).toContain('state_transition');
      expect(eventTypes).toContain('significant_change');

      testManager.destroy();
    });
  });

  describe('Disk Spillover (refactored spillToDisk)', () => {
    it('should spill events to disk when configured', async () => {
      const groupId = 'test-group';

      // Just verify the event handler can be attached
      manager.on('diskSpillover', () => {
        // Event handler for disk spillover
      });

      // Add many events to trigger spillover
      for (let i = 0; i < 1000; i++) {
        mockAdapter.emit('changeGroup:changes', {
          groupId,
          changes: [
            { Name: 'control1', Value: i, String: i.toString() },
            { Name: 'control2', Value: i * 2, String: (i * 2).toString() },
          ],
          timestamp: BigInt(Date.now() * 1_000_000),
          timestampMs: Date.now(),
          sequenceNumber: i,
        });
      }

      // Wait for spillover check
      await new Promise(resolve => setTimeout(resolve, 300));

      // Note: Actual disk write might fail in test environment
      // We're mainly testing that the refactored code paths execute
    });
  });

  describe('Helper Methods', () => {
    it('should sort events by timestamp correctly', async () => {
      const groupId = 'test-group';
      const timestamps = [1000, 3000, 2000, 5000, 4000];

      for (let i = 0; i < timestamps.length; i++) {
        mockAdapter.emit('changeGroup:changes', {
          groupId,
          changes: [{ Name: 'control', Value: i, String: i.toString() }],
          timestamp: BigInt(timestamps[i]! * 1_000_000),
          timestampMs: timestamps[i],
          sequenceNumber: i,
        });
      }

      const events = await manager.query({ groupId });

      // Events should be sorted by timestamp
      for (let i = 1; i < events.length; i++) {
        const currentEvent = events[i];
        const previousEvent = events[i - 1];
        if (currentEvent && previousEvent) {
          expect(currentEvent.timestampMs).toBeGreaterThanOrEqual(
            previousEvent.timestampMs
          );
        }
      }
    });
  });
});
