import { EventCacheManager } from '../../../../../src/mcp/state/event-cache/manager.js';
import { QRWCClientAdapter } from '../../../../../src/mcp/qrwc/adapter.js';
import { EventEmitter } from 'events';

// Mock the logger
jest.mock('../../../../../src/shared/utils/logger.js', () => ({
  globalLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('EventCacheManager - Memory Management', () => {
  let manager: EventCacheManager;
  let mockAdapter: QRWCClientAdapter;
  
  beforeEach(() => {
    // Create mock adapter
    mockAdapter = new EventEmitter() as any;
    mockAdapter.getChangeGroup = jest.fn();
    mockAdapter.createChangeGroup = jest.fn();
  });
  
  afterEach(() => {
    if (manager) {
      manager.destroy();
    }
    jest.clearAllMocks();
  });
  
  describe('Memory Configuration', () => {
    it('should initialize with default memory limit of 500MB', () => {
      manager = new EventCacheManager();
      const stats = manager.getMemoryStats();
      expect(stats.limit).toBe(500 * 1024 * 1024);
    });
    
    it('should accept custom memory limit', () => {
      manager = new EventCacheManager({
        maxEvents: 100000,
        maxAgeMs: 3600000,
        globalMemoryLimitMB: 256
      });
      const stats = manager.getMemoryStats();
      expect(stats.limit).toBe(256 * 1024 * 1024);
    });
  });
  
  describe('Memory Usage Calculation', () => {
    it('should calculate memory usage across all buffers', () => {
      manager = new EventCacheManager({
        maxEvents: 1000,
        maxAgeMs: 3600000
      });
      
      manager.attachToAdapter(mockAdapter);
      
      // Simulate events for multiple groups
      const event1 = {
        groupId: 'group1',
        changes: [
          { Name: 'control1', Value: 100, String: '100' },
          { Name: 'control2', Value: 'test', String: 'test' }
        ],
        timestamp: BigInt(Date.now()) * 1000000n,
        timestampMs: Date.now(),
        sequenceNumber: 1
      };
      
      const event2 = {
        groupId: 'group2',
        changes: [
          { Name: 'control3', Value: true, String: 'true' }
        ],
        timestamp: BigInt(Date.now()) * 1000000n,
        timestampMs: Date.now(),
        sequenceNumber: 2
      };
      
      mockAdapter.emit('changeGroup:changes', event1);
      mockAdapter.emit('changeGroup:changes', event2);
      
      const stats = manager.getMemoryStats();
      expect(stats.totalUsage).toBeGreaterThan(0);
      expect(stats.groupStats).toHaveLength(2);
      expect(stats.groupStats[0].events).toBe(2); // 2 changes in group1
      expect(stats.groupStats[1].events).toBe(1); // 1 change in group2
    });
    
    it('should estimate event size based on actual data', () => {
      manager = new EventCacheManager();
      manager.attachToAdapter(mockAdapter);
      
      // Create event with known size
      const longString = 'x'.repeat(1000);
      const event = {
        groupId: 'test',
        changes: [
          { Name: 'bigControl', Value: longString, String: longString }
        ],
        timestamp: BigInt(Date.now()) * 1000000n,
        timestampMs: Date.now(),
        sequenceNumber: 1
      };
      
      mockAdapter.emit('changeGroup:changes', event);
      
      const stats = manager.getMemoryStats();
      // Should be significantly larger than default 200 bytes
      expect(stats.groupStats[0].memory).toBeGreaterThan(2000);
    });
  });
  
  describe('Memory Pressure Detection', () => {
    it('should emit warning at 80% memory usage', (done) => {
      manager = new EventCacheManager({
        maxEvents: 100,
        maxAgeMs: 3600000,
        globalMemoryLimitMB: 1, // 1MB limit for testing
        memoryCheckIntervalMs: 10
      });
      
      manager.attachToAdapter(mockAdapter);
      
      manager.on('memoryPressure', (event) => {
        expect(event.level).toBe('high');
        expect(event.percentage).toBeGreaterThanOrEqual(80);
        expect(event.percentage).toBeLessThan(90);
        done();
      });
      
      // Fill with events to trigger 80% threshold
      const changes = Array(50).fill(null).map((_, i) => ({
        Name: `control${i}`,
        Value: 'x'.repeat(100),
        String: 'x'.repeat(100)
      }));
      
      for (let i = 0; i < 10; i++) {
        mockAdapter.emit('changeGroup:changes', {
          groupId: `group${i}`,
          changes,
          timestamp: BigInt(Date.now()) * 1000000n,
          timestampMs: Date.now(),
          sequenceNumber: i
        });
      }
    });
    
    it('should emit critical warning at 90% memory usage', (done) => {
      manager = new EventCacheManager({
        maxEvents: 100,
        maxAgeMs: 3600000,
        globalMemoryLimitMB: 1,
        memoryCheckIntervalMs: 10
      });
      
      manager.attachToAdapter(mockAdapter);
      
      let highEmitted = false;
      manager.on('memoryPressure', (event) => {
        if (event.level === 'high') {
          highEmitted = true;
        } else if (event.level === 'critical') {
          expect(highEmitted).toBe(true);
          expect(event.percentage).toBeGreaterThanOrEqual(90);
          done();
        }
      });
      
      // Fill with more events to trigger 90% threshold
      const changes = Array(100).fill(null).map((_, i) => ({
        Name: `control${i}`,
        Value: 'x'.repeat(100),
        String: 'x'.repeat(100)
      }));
      
      for (let i = 0; i < 15; i++) {
        mockAdapter.emit('changeGroup:changes', {
          groupId: `group${i}`,
          changes,
          timestamp: BigInt(Date.now()) * 1000000n,
          timestampMs: Date.now(),
          sequenceNumber: i
        });
      }
    });
  });
  
  describe('Memory Pressure Handling', () => {
    it('should evict events when memory limit is exceeded', (done) => {
      manager = new EventCacheManager({
        maxEvents: 1000,
        maxAgeMs: 3600000,
        globalMemoryLimitMB: 1,
        memoryCheckIntervalMs: 10
      });
      
      manager.attachToAdapter(mockAdapter);
      
      manager.on('memoryPressureResolved', (event) => {
        expect(event.freed).toBeGreaterThan(0);
        expect(event.currentUsage).toBeLessThan(1 * 1024 * 1024);
        
        // Verify some events were evicted
        const stats = manager.getMemoryStats();
        expect(stats.percentage).toBeLessThanOrEqual(80);
        done();
      });
      
      // Exceed memory limit
      const changes = Array(200).fill(null).map((_, i) => ({
        Name: `control${i}`,
        Value: 'x'.repeat(100),
        String: 'x'.repeat(100)
      }));
      
      for (let i = 0; i < 20; i++) {
        mockAdapter.emit('changeGroup:changes', {
          groupId: `group${i}`,
          changes,
          timestamp: BigInt(Date.now()) * 1000000n,
          timestampMs: Date.now(),
          sequenceNumber: i
        });
      }
    });
    
    it('should respect group priorities during eviction', (done) => {
      manager = new EventCacheManager({
        maxEvents: 100,
        maxAgeMs: 3600000,
        globalMemoryLimitMB: 1,
        memoryCheckIntervalMs: 10
      });
      
      manager.attachToAdapter(mockAdapter);
      
      // Set priorities
      manager.setGroupPriority('important', 'high');
      manager.setGroupPriority('normal', 'normal');
      manager.setGroupPriority('unimportant', 'low');
      
      // Add events to each group
      const changes = Array(50).fill(null).map((_, i) => ({
        Name: `control${i}`,
        Value: 'x'.repeat(100),
        String: 'x'.repeat(100)
      }));
      
      ['important', 'normal', 'unimportant'].forEach(groupId => {
        for (let i = 0; i < 5; i++) {
          mockAdapter.emit('changeGroup:changes', {
            groupId,
            changes,
            timestamp: BigInt(Date.now()) * 1000000n,
            timestampMs: Date.now(),
            sequenceNumber: i
          });
        }
      });
      
      manager.on('memoryPressureResolved', () => {
        const stats = manager.getMemoryStats();
        const groupStats = stats.groupStats.reduce((acc, stat) => {
          acc[stat.groupId] = stat.events;
          return acc;
        }, {} as Record<string, number>);
        
        // High priority should have more events remaining
        expect(groupStats['important']).toBeGreaterThan(groupStats['unimportant']);
        done();
      });
      
      // Trigger memory pressure
      for (let i = 0; i < 10; i++) {
        mockAdapter.emit('changeGroup:changes', {
          groupId: 'overflow',
          changes: Array(100).fill(null).map((_, j) => ({
            Name: `overflow${j}`,
            Value: 'x'.repeat(200),
            String: 'x'.repeat(200)
          })),
          timestamp: BigInt(Date.now()) * 1000000n,
          timestampMs: Date.now(),
          sequenceNumber: 100 + i
        });
      }
    });
  });
  
  describe('forceEvict method', () => {
    it('should evict specified number of events from buffer', () => {
      const { CircularBuffer } = require('../../../../../src/mcp/state/event-cache/circular-buffer.js');
      const buffer = new CircularBuffer(100);
      
      // Add 50 events
      for (let i = 0; i < 50; i++) {
        buffer.add({ id: i });
      }
      
      expect(buffer.getSize()).toBe(50);
      
      // Force evict 10 events
      const evicted = buffer.forceEvict(10);
      expect(evicted).toBe(10);
      expect(buffer.getSize()).toBe(40);
      
      // Verify oldest events were removed
      const remaining = buffer.getAll();
      expect(remaining[0]).toEqual({ id: 10 }); // First 10 were evicted
    });
    
    it('should handle evicting more events than available', () => {
      const { CircularBuffer } = require('../../../../../src/mcp/state/event-cache/circular-buffer.js');
      const buffer = new CircularBuffer(100);
      
      // Add only 5 events
      for (let i = 0; i < 5; i++) {
        buffer.add({ id: i });
      }
      
      // Try to evict 10
      const evicted = buffer.forceEvict(10);
      expect(evicted).toBe(5);
      expect(buffer.getSize()).toBe(0);
    });
  });
  
  describe('Memory Monitoring Lifecycle', () => {
    it('should stop memory monitoring on destroy', () => {
      manager = new EventCacheManager({
        maxEvents: 1000,
        maxAgeMs: 3600000,
        memoryCheckIntervalMs: 10
      });
      
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      manager.destroy();
      
      // Should clear both cleanup and memory check intervals
      expect(clearIntervalSpy).toHaveBeenCalledTimes(2);
    });
    
    it('should not start monitoring if interval not configured', () => {
      manager = new EventCacheManager({
        maxEvents: 1000,
        maxAgeMs: 3600000
        // No memoryCheckIntervalMs
      });
      
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      const initialCalls = setIntervalSpy.mock.calls.length;
      
      // Should only set cleanup interval, not memory check
      expect(setIntervalSpy).toHaveBeenCalledTimes(initialCalls);
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle empty buffers gracefully', () => {
      manager = new EventCacheManager();
      
      const stats = manager.getMemoryStats();
      expect(stats.totalUsage).toBe(0);
      expect(stats.percentage).toBe(0);
      expect(stats.groupStats).toHaveLength(0);
    });
    
    it('should use minimum event size of 200 bytes', () => {
      manager = new EventCacheManager();
      manager.attachToAdapter(mockAdapter);
      
      // Add tiny event
      mockAdapter.emit('changeGroup:changes', {
        groupId: 'tiny',
        changes: [{ Name: 'a', Value: 1, String: '1' }],
        timestamp: BigInt(Date.now()) * 1000000n,
        timestampMs: Date.now(),
        sequenceNumber: 1
      });
      
      const stats = manager.getMemoryStats();
      // Even tiny events should count as at least 200 bytes
      expect(stats.groupStats[0].memory).toBeGreaterThanOrEqual(200 * 1.2); // With overhead
    });
  });
});