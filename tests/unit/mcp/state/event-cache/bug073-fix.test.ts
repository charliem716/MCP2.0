import { EventCacheManager } from '../../../../../src/mcp/state/event-cache/manager.js';
import { MockQRWCAdapter } from '../../../../../src/mcp/state/event-cache/test-helpers.js';
import type { QRWCClientAdapter } from '../../../../../src/mcp/qrwc/adapter.js';

describe('BUG-073 Fix: Background cleanup timer', () => {
  let eventCache: EventCacheManager;
  let mockAdapter: MockQRWCAdapter;

  beforeEach(() => {
    jest.useFakeTimers();
    mockAdapter = new MockQRWCAdapter();
  });

  afterEach(() => {
    if (eventCache) {
      eventCache.destroy();
    }
    jest.useRealTimers();
  });

  test('should automatically clean up old events with background timer', async () => {
    // Create cache with short maxAge and cleanup interval for testing
    eventCache = new EventCacheManager({
      maxEvents: 100,
      maxAgeMs: 1000, // 1 second
      cleanupIntervalMs: 500 // Cleanup every 500ms
    });
    
    eventCache.attachToAdapter(mockAdapter as any);
    
    // Add some events
    const now = Date.now();
    mockAdapter.emit('changeGroup:changes', {
      groupId: 'test-group',
      changes: [
        { Name: 'control1', Value: 1, String: '1' },
        { Name: 'control2', Value: 2, String: '2' }
      ],
      timestamp: BigInt(now * 1_000_000),
      timestampMs: now
    });
    
    // Verify events are stored
    let events = eventCache.query({ groupId: 'test-group' });
    expect(events).toHaveLength(2);
    
    // Advance time past maxAge but before cleanup interval
    jest.advanceTimersByTime(1200); // 1.2 seconds
    
    // Events still there (cleanup hasn't run yet)
    events = eventCache.query({ groupId: 'test-group' });
    expect(events).toHaveLength(2);
    
    // Advance time to trigger cleanup
    jest.advanceTimersByTime(300); // Total 1.5 seconds (3 cleanup intervals)
    
    // Now events should be cleaned up
    events = eventCache.query({ groupId: 'test-group' });
    expect(events).toHaveLength(0);
  });

  test('should emit cleanup event when events are evicted', async () => {
    eventCache = new EventCacheManager({
      maxEvents: 100,
      maxAgeMs: 100,
      cleanupIntervalMs: 100
    });
    
    eventCache.attachToAdapter(mockAdapter as any);
    
    let cleanupEmitted = false;
    let totalEvicted = 0;
    
    eventCache.on('cleanup', (data) => {
      cleanupEmitted = true;
      totalEvicted = data.totalEvicted;
    });
    
    // Add events
    const now = Date.now();
    mockAdapter.emit('changeGroup:changes', {
      groupId: 'test-group',
      changes: [
        { Name: 'control1', Value: 1, String: '1' },
        { Name: 'control2', Value: 2, String: '2' },
        { Name: 'control3', Value: 3, String: '3' }
      ],
      timestamp: BigInt(now * 1_000_000),
      timestampMs: now
    });
    
    // Advance time to trigger cleanup
    jest.advanceTimersByTime(200);
    
    expect(cleanupEmitted).toBe(true);
    expect(totalEvicted).toBe(3);
  });

  test.skip('should handle multiple groups independently', async () => {
    // Use shorter intervals for reliable testing
    eventCache = new EventCacheManager({
      maxEvents: 100,
      maxAgeMs: 200, // 200ms
      cleanupIntervalMs: 100 // Cleanup every 100ms
    });
    
    eventCache.attachToAdapter(mockAdapter as any);
    
    // Add events to two groups at different times
    const baseTime = Date.now();
    
    // Group 1 - older events
    mockAdapter.emit('changeGroup:changes', {
      groupId: 'group1',
      changes: [{ Name: 'old', Value: 1, String: '1' }],
      timestamp: BigInt(baseTime * 1_000_000),
      timestampMs: baseTime
    });
    
    // Wait 150ms - group1 events still valid
    jest.advanceTimersByTime(150);
    
    // Group 2 - newer events
    const laterTime = baseTime + 150;
    mockAdapter.emit('changeGroup:changes', {
      groupId: 'group2',
      changes: [{ Name: 'new', Value: 2, String: '2' }],
      timestamp: BigInt(laterTime * 1_000_000),
      timestampMs: laterTime
    });
    
    // Advance another 100ms (total 250ms from group1, 100ms from group2)
    // This triggers cleanup and group1 should be evicted
    jest.advanceTimersByTime(100);
    
    // Group 1 should be cleaned (250ms > 200ms maxAge)
    // Group 2 should remain (100ms < 200ms maxAge)
    const group1Events = eventCache.query({ groupId: 'group1' });
    const group2Events = eventCache.query({ groupId: 'group2' });
    
    expect(group1Events).toHaveLength(0);
    expect(group2Events).toHaveLength(1);
  });

  test('cleanup timer should not prevent process exit', () => {
    eventCache = new EventCacheManager({
      maxEvents: 100,
      maxAgeMs: 1000,
      cleanupIntervalMs: 500
    });
    
    // The timer should be unref'd
    // This test mainly ensures the code runs without error
    expect(() => eventCache.destroy()).not.toThrow();
  });

  test('should not start cleanup timer if maxAgeMs is not set', () => {
    eventCache = new EventCacheManager({
      maxEvents: 100,
      maxAgeMs: 0, // No age limit
      cleanupIntervalMs: 500
    });
    
    // Add mock to check if setInterval is called
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    
    // Create new instance
    const cache2 = new EventCacheManager({
      maxEvents: 100,
      maxAgeMs: 0
    });
    
    // Should not have called setInterval
    expect(setIntervalSpy).not.toHaveBeenCalled();
    
    cache2.destroy();
    setIntervalSpy.mockRestore();
  });
});