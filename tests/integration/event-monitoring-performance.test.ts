/**
 * Integration test for BUG-150: Event Monitoring System 33Hz Performance
 * 
 * This test verifies that the event monitoring system can handle:
 * - 33Hz (30ms) polling intervals
 * - 30-day data retention
 * - High-throughput event recording
 */

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { SQLiteEventMonitor } from '../../src/mcp/state/event-monitor/sqlite-event-monitor.js';
import type { QRWCClientAdapter } from '../../src/mcp/qrwc/adapter.js';

describe('Event Monitoring Performance Requirements (BUG-150)', () => {
  let eventMonitor: SQLiteEventMonitor;
  let mockAdapter: QRWCClientAdapter;
  let changeGroupEmitter: EventEmitter;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useRealTimers(); // Use real timers for this integration test
    
    // Set environment for 30-day retention
    process.env['EVENT_MONITORING_RETENTION_DAYS'] = '30';
    
    // Create state manager
    
    // Create event emitter for adapter
    changeGroupEmitter = new EventEmitter();
    
    // Mock adapter with event emitter
    mockAdapter = {
      on: changeGroupEmitter.on.bind(changeGroupEmitter),
      emit: changeGroupEmitter.emit.bind(changeGroupEmitter),
      once: jest.fn(),
      off: jest.fn(),
      removeListener: jest.fn(),
      getAllChangeGroups: jest.fn().mockResolvedValue(new Map([
        ['test-group-33hz', { 
          id: 'test-group-33hz',
          controls: ['Component1.control1', 'Component1.control2']
        }]
      ])),
    } as any;
    
    // Create event monitor with in-memory database for testing
    eventMonitor = new SQLiteEventMonitor(mockAdapter, {
      enabled: true,
      dbPath: ':memory:',
      retentionDays: 30,
      bufferSize: 1000,
      flushInterval: 30, // Match 33Hz rate
    });
    
    await eventMonitor.initialize();
  });

  afterEach(async () => {
    if (eventMonitor) {
      await eventMonitor.close();
    }
    delete process.env['EVENT_MONITORING_RETENTION_DAYS'];
  });

  describe('33Hz Polling Capability', () => {
    it('should record events at 33Hz (30ms intervals)', async () => {
      const groupId = 'test-group-33hz';
      
      // Activate monitoring for the group
      changeGroupEmitter.emit('changeGroup:autoPollStarted', groupId);
      
      // Generate 33 events in 1 second (33Hz)
      const startTime = Date.now();
      const events = [];
      
      for (let i = 0; i < 33; i++) {
        const event = {
          groupId,
          controls: [
            {
              Name: 'Component1.control1',
              Value: i,
              String: `${i}`,
            },
            {
              Name: 'Component1.control2',
              Value: i * 2,
              String: `${i * 2}`,
            },
          ],
          timestamp: startTime + (i * 30), // 30ms intervals
        };
        
        events.push(event);
        changeGroupEmitter.emit('changeGroup:poll', event);
      }
      
      // Force flush to database
      eventMonitor['flush']();
      
      // Query recorded events
      const recordedEvents = await eventMonitor.queryEvents({
        changeGroupId: groupId,
        startTime: startTime - 100,
        endTime: startTime + 1100,
      });
      
      // Should have recorded all events (2 controls × 33 events = 66 total)
      expect(recordedEvents.length).toBe(66);
      
      // Verify events are properly spaced (approximately 30ms apart)
      const control1Events = recordedEvents.filter(e => e.controlName === 'Component1.control1');
      expect(control1Events.length).toBe(33);
      
      // Check timestamp spacing
      for (let i = 1; i < control1Events.length; i++) {
        const timeDiff = control1Events[i - 1].timestamp - control1Events[i].timestamp;
        expect(Math.abs(timeDiff)).toBeLessThanOrEqual(35); // Allow 5ms variance
        expect(Math.abs(timeDiff)).toBeGreaterThanOrEqual(25);
      }
    });

    it('should handle sustained 33Hz load for extended period', async () => {
      const groupId = 'test-group-sustained';
      
      // Activate monitoring
      changeGroupEmitter.emit('changeGroup:autoPollStarted', groupId);
      
      // Generate 10 seconds of 33Hz events (330 events)
      const startTime = Date.now();
      const totalEvents = 330;
      
      for (let i = 0; i < totalEvents; i++) {
        changeGroupEmitter.emit('changeGroup:poll', {
          groupId,
          controls: [
            {
              Name: 'LoadTest.control',
              Value: i,
              String: `${i}`,
            },
          ],
          timestamp: startTime + (i * 30),
        });
      }
      
      // Force flush
      eventMonitor['flush']();
      
      // Query and verify
      const recordedEvents = await eventMonitor.queryEvents({
        changeGroupId: groupId,
      });
      
      expect(recordedEvents.length).toBe(totalEvents);
      
      // Get statistics
      const stats = await eventMonitor.getStatistics();
      expect(stats.totalEvents).toBe(totalEvents);
      expect(stats.uniqueControls).toBe(1);
    });

    it('should handle multiple change groups at high frequency', async () => {
      const groups = ['group-1', 'group-2', 'group-3'];
      const eventsPerGroup = 100;
      const startTime = Date.now();
      
      // Activate all groups
      groups.forEach(groupId => {
        changeGroupEmitter.emit('changeGroup:autoPollStarted', groupId);
      });
      
      // Generate interleaved events for all groups
      for (let i = 0; i < eventsPerGroup; i++) {
        groups.forEach((groupId, groupIndex) => {
          changeGroupEmitter.emit('changeGroup:poll', {
            groupId,
            controls: [
              {
                Name: `Component${groupIndex}.control`,
                Value: i,
                String: `${i}`,
              },
            ],
            timestamp: startTime + (i * 30) + (groupIndex * 10), // Slightly offset
          });
        });
      }
      
      // Force flush
      eventMonitor['flush']();
      
      // Verify each group's events
      for (const groupId of groups) {
        const events = await eventMonitor.queryEvents({ changeGroupId: groupId });
        expect(events.length).toBe(eventsPerGroup);
      }
      
      // Check total statistics
      const stats = await eventMonitor.getStatistics();
      expect(stats.totalEvents).toBe(eventsPerGroup * groups.length);
      expect(stats.uniqueChangeGroups).toBe(groups.length);
    });
  });

  describe('30-Day Retention Configuration', () => {
    it('should be configured for 30-day retention by default', async () => {
      // Verify the configuration
      expect(eventMonitor['config'].retentionDays).toBe(30);
      
      // Verify through statistics (configuration section)
      const stats = await eventMonitor.getStatistics();
      
      // The stats don't directly expose config, but we can verify
      // the internal config is set correctly
      expect(eventMonitor['config'].retentionDays).toBe(30);
    });

    it('should respect EVENT_MONITORING_RETENTION_DAYS environment variable', async () => {
      // Set custom retention
      process.env['EVENT_MONITORING_RETENTION_DAYS'] = '60';
      
      // Create new monitor
      const customMonitor = new SQLiteEventMonitor(mockAdapter, {
        enabled: true,
        dbPath: ':memory:',
      });
      
      await customMonitor.initialize();
      
      // Verify custom retention
      expect(customMonitor['config'].retentionDays).toBe(60);
      
      await customMonitor.close();
      delete process.env['EVENT_MONITORING_RETENTION_DAYS'];
    });
  });

  describe('Performance Characteristics', () => {
    it('should maintain low query latency with large dataset', async () => {
      const groupId = 'perf-test-group';
      const eventCount = 1000;
      
      // Activate monitoring
      changeGroupEmitter.emit('changeGroup:autoPollStarted', groupId);
      
      // Generate large dataset
      const startTime = Date.now();
      for (let i = 0; i < eventCount; i++) {
        changeGroupEmitter.emit('changeGroup:poll', {
          groupId,
          controls: [
            {
              Name: `PerfTest.control${i % 10}`,
              Value: i,
              String: `${i}`,
            },
          ],
          timestamp: startTime + i,
        });
      }
      
      // Force flush
      eventMonitor['flush']();
      
      // Measure query performance
      const queryStart = Date.now();
      const events = await eventMonitor.queryEvents({
        changeGroupId: groupId,
        limit: 100,
      });
      const queryTime = Date.now() - queryStart;
      
      // Query should be fast even with large dataset
      expect(queryTime).toBeLessThan(100); // Less than 100ms
      expect(events.length).toBe(100);
    });

    it('should efficiently buffer high-frequency writes', async () => {
      const groupId = 'buffer-test-group';
      
      // Activate monitoring
      changeGroupEmitter.emit('changeGroup:autoPollStarted', groupId);
      
      // Check initial buffer
      expect(eventMonitor['buffer'].length).toBe(0);
      
      // Generate events without flushing
      for (let i = 0; i < 100; i++) {
        changeGroupEmitter.emit('changeGroup:poll', {
          groupId,
          controls: [
            {
              Name: 'BufferTest.control',
              Value: i,
              String: `${i}`,
            },
          ],
          timestamp: Date.now(),
        });
      }
      
      // Buffer should contain events
      expect(eventMonitor['buffer'].length).toBe(100);
      
      // Force flush
      eventMonitor['flush']();
      
      // Buffer should be empty
      expect(eventMonitor['buffer'].length).toBe(0);
      
      // Events should be in database
      const events = await eventMonitor.queryEvents({ changeGroupId: groupId });
      expect(events.length).toBe(100);
    });
  });

  describe('Data Integrity', () => {
    it('should preserve exact event values and timestamps', async () => {
      const groupId = 'integrity-test';
      const testValue = { complex: 'object', nested: { value: 42 } };
      const testTimestamp = 1234567890123;
      
      // Activate monitoring
      changeGroupEmitter.emit('changeGroup:autoPollStarted', groupId);
      
      // Send event with specific values
      changeGroupEmitter.emit('changeGroup:poll', {
        groupId,
        controls: [
          {
            Name: 'Test.control',
            Value: testValue,
            String: `${testValue}`,
          },
        ],
        timestamp: testTimestamp,
      });
      
      // Force flush and query
      eventMonitor['flush']();
      const events = await eventMonitor.queryEvents({ changeGroupId: groupId });
      
      expect(events.length).toBe(1);
      expect(events[0].timestamp).toBe(testTimestamp);
      expect(JSON.parse(events[0].value)).toEqual(testValue);
      expect(events[0].source).toBe('changeGroup');
    });

    it('should handle concurrent reads and writes', async () => {
      const groupId = 'concurrent-test';
      
      // Activate monitoring
      changeGroupEmitter.emit('changeGroup:autoPollStarted', groupId);
      
      // Start concurrent operations
      const writePromises = [];
      const readPromises = [];
      
      // Generate writes
      for (let i = 0; i < 50; i++) {
        writePromises.push(new Promise<void>(resolve => {
          changeGroupEmitter.emit('changeGroup:poll', {
            groupId,
            controls: [{ Name: 'Concurrent.control', Value: i, String: `${i}` }],
            timestamp: Date.now(),
          });
          resolve();
        }));
      }
      
      // Perform reads
      for (let i = 0; i < 10; i++) {
        readPromises.push(eventMonitor.queryEvents({ changeGroupId: groupId }));
      }
      
      // Wait for all operations
      await Promise.all([...writePromises, ...readPromises]);
      
      // Force final flush
      eventMonitor['flush']();
      
      // Verify all events were recorded
      const finalEvents = await eventMonitor.queryEvents({ changeGroupId: groupId });
      expect(finalEvents.length).toBe(50);
    });
  });
});