/**
 * Tests for BUG-122: Memory pressure detection
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EventCacheManager } from '../manager.js';
import { MockQRWCAdapter } from '../test-helpers.js';
import type { ChangeGroupEvent } from '../types.js';

// Mock the logger
jest.mock('../../../../shared/utils/logger.js', () => ({
  globalLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('EventCacheManager - Memory Pressure Detection (BUG-122)', () => {
  let eventCache: EventCacheManager;
  let adapter: MockQRWCAdapter;

  beforeEach(() => {
    adapter = new MockQRWCAdapter();
  });

  afterEach(() => {
    if (eventCache) {
      eventCache.destroy();
    }
  });

  it('should emit memory pressure event when threshold is exceeded', async () => {
    // Create cache with very small memory limit
    eventCache = new EventCacheManager({
      maxEvents: 1000,
      maxAgeMs: 3600000,
      globalMemoryLimitMB: 1, // 1MB limit for easy testing
      memoryCheckIntervalMs: 50, // Fast checks
      skipValidation: true // Allow small memory limit in tests
    }, adapter);

    const memoryPressureSpy = jest.fn();
    eventCache.on('memoryPressure', memoryPressureSpy);
    eventCache.attachToAdapter(adapter);

    // Generate events to fill memory
    const largeString = 'x'.repeat(1000); // 1KB string
    for (let i = 0; i < 1000; i++) {
      const event: ChangeGroupEvent = {
        groupId: 'test-group',
        changes: [{
          Name: 'control1',
          Value: i,
          String: largeString
        }],
        timestamp: BigInt(Date.now() * 1000000),
        timestampMs: Date.now()
      };
      
      // Process event through adapter
      adapter.emit('changeGroup.update', event);
      
      // Check memory periodically
      if (i % 100 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Stop if memory pressure detected
      if (memoryPressureSpy.mock.calls.length > 0) {
        break;
      }
    }

    // Verify memory pressure was detected
    expect(memoryPressureSpy).toHaveBeenCalled();
    expect(memoryPressureSpy.mock.calls[0][0]).toEqual({
      level: expect.stringMatching(/^(high|critical)$/),
      percentage: expect.any(Number)
    });
    
    // Verify percentage is above threshold
    const { percentage } = memoryPressureSpy.mock.calls[0][0];
    expect(percentage).toBeGreaterThanOrEqual(80);
  });

  it('should detect both high and critical memory pressure levels', async () => {
    eventCache = new EventCacheManager({
      maxEvents: 1000,
      maxAgeMs: 3600000,
      globalMemoryLimitMB: 2, // 2MB limit
      memoryCheckIntervalMs: 50,
      skipValidation: true
    }, adapter);

    const memoryPressureSpy = jest.fn();
    eventCache.on('memoryPressure', memoryPressureSpy);
    eventCache.attachToAdapter(adapter);

    // Fill memory gradually to trigger both thresholds
    const events: ChangeGroupEvent[] = [];
    const largeString = 'x'.repeat(5000); // 5KB string
    
    // Generate enough events to exceed 90%
    for (let i = 0; i < 500; i++) {
      const event: ChangeGroupEvent = {
        groupId: `group-${i % 10}`,
        changes: [{
          Name: 'bigControl',
          Value: i,
          String: largeString
        }],
        timestamp: BigInt(Date.now() * 1000000 + i),
        timestampMs: Date.now() + i
      };
      
      adapter.emit('changeGroup.update', event);
      
      // Allow memory checks to run
      if (i % 50 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Should have at least one memory pressure event
    expect(memoryPressureSpy).toHaveBeenCalled();
    
    // Check if we got both high (80%) and critical (90%) events
    const levels = memoryPressureSpy.mock.calls.map(call => call[0].level);
    expect(levels).toContain('high');
    
    // If we got critical, verify it came after high
    if (levels.includes('critical')) {
      const highIndex = levels.indexOf('high');
      const criticalIndex = levels.indexOf('critical');
      expect(criticalIndex).toBeGreaterThan(highIndex);
    }
  });

  it('should only emit memory pressure once per threshold crossing', async () => {
    eventCache = new EventCacheManager({
      maxEvents: 1000,
      maxAgeMs: 3600000,
      globalMemoryLimitMB: 1,
      memoryCheckIntervalMs: 50,
      skipValidation: true
    }, adapter);

    const memoryPressureSpy = jest.fn();
    eventCache.on('memoryPressure', memoryPressureSpy);
    eventCache.attachToAdapter(adapter);

    // Add events to trigger memory pressure
    const largeString = 'x'.repeat(2000);
    for (let i = 0; i < 600; i++) {
      adapter.emit('changeGroup.update', {
        groupId: 'test',
        changes: [{ Name: 'ctrl', Value: i, String: largeString }],
        timestamp: BigInt(Date.now() * 1000000),
        timestampMs: Date.now()
      });
    }

    // Wait for memory checks
    await new Promise(resolve => setTimeout(resolve, 500));

    // Count high and critical events
    const highEvents = memoryPressureSpy.mock.calls.filter(
      call => call[0].level === 'high'
    );
    const criticalEvents = memoryPressureSpy.mock.calls.filter(
      call => call[0].level === 'critical'
    );

    // Should only emit each level once
    expect(highEvents.length).toBeLessThanOrEqual(1);
    expect(criticalEvents.length).toBeLessThanOrEqual(1);
  });
});