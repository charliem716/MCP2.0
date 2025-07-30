import { describe, it, expect } from '@jest/globals';
import { EventCacheManager } from '../../../../../src/mcp/state/event-cache/manager';
import { EventEmitter } from 'events';

describe('EventCacheManager Priority Eviction', () => {
  it('should protect high-priority groups during eviction', async () => {
    const manager = new EventCacheManager({
      maxEvents: 100, // Small limit per group
      maxAgeMs: 3600000,
      globalMemoryLimitMB: 0.5, // 500KB limit
      memoryCheckIntervalMs: 50,
    });

    const mockAdapter = new EventEmitter();
    manager.attachToAdapter(mockAdapter);

    // Set priorities FIRST before adding any events
    manager.setGroupPriority('high-priority', 'high');
    manager.setGroupPriority('normal-priority', 'normal');
    manager.setGroupPriority('low-priority', 'low');

    // Add events to all priority groups
    for (const group of ['high-priority', 'normal-priority', 'low-priority']) {
      mockAdapter.emit('changeGroup:changes', {
        groupId: group,
        changes: Array(50).fill(null).map((_, i) => ({
          Name: `ctrl_${i}`,
          Value: `${group}_value_${i}`.repeat(20), // ~400 bytes per event
          String: `${group}_string_${i}`.repeat(20),
        })),
        timestamp: BigInt(Date.now()) * 1000000n,
        timestampMs: Date.now(),
        sequenceNumber: 1,
      });
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Check initial state
    const beforeStats = manager.getMemoryStats();
    console.log(`Before overflow: ${(beforeStats.totalUsage / 1024).toFixed(1)}KB used`);
    const beforeEvents = {
      high: beforeStats.groupStats.find(g => g.groupId === 'high-priority')?.events || 0,
      normal: beforeStats.groupStats.find(g => g.groupId === 'normal-priority')?.events || 0,
      low: beforeStats.groupStats.find(g => g.groupId === 'low-priority')?.events || 0,
    };
    console.log(`Initial events - High: ${beforeEvents.high}, Normal: ${beforeEvents.normal}, Low: ${beforeEvents.low}`);

    // Add overflow data to trigger eviction
    for (let i = 0; i < 10; i++) {
      mockAdapter.emit('changeGroup:changes', {
        groupId: `overflow_${i}`,
        changes: Array(50).fill(null).map((_, j) => ({
          Name: `overflow_ctrl_${j}`,
          Value: `overflow_data_${i}_${j}`.repeat(30), // Larger data
          String: `overflow_string_${i}_${j}`.repeat(30),
        })),
        timestamp: BigInt(Date.now()) * 1000000n,
        timestampMs: Date.now(),
        sequenceNumber: 100 + i,
      });
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Force memory check
    await (manager as any).checkMemoryPressure();
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check final state
    const afterStats = manager.getMemoryStats();
    console.log(`After overflow: ${(afterStats.totalUsage / 1024).toFixed(1)}KB used (${afterStats.percentage.toFixed(1)}%)`);
    
    const afterEvents = {
      high: afterStats.groupStats.find(g => g.groupId === 'high-priority')?.events || 0,
      normal: afterStats.groupStats.find(g => g.groupId === 'normal-priority')?.events || 0,
      low: afterStats.groupStats.find(g => g.groupId === 'low-priority')?.events || 0,
    };
    console.log(`Final events - High: ${afterEvents.high}, Normal: ${afterEvents.normal}, Low: ${afterEvents.low}`);

    // Verify priority protection
    // High priority should retain more events than low priority
    expect(afterEvents.high).toBeGreaterThanOrEqual(afterEvents.normal);
    expect(afterEvents.normal).toBeGreaterThanOrEqual(afterEvents.low);
    
    // If any eviction happened, low priority should be affected most
    if (beforeEvents.low > afterEvents.low) {
      console.log('✓ Low priority events were evicted');
    }
    
    manager.destroy();
  });
});