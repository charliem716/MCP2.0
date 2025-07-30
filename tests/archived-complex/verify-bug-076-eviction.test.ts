import { describe, it, expect } from '@jest/globals';
import { EventCacheManager } from '../src/mcp/state/event-cache/manager';
import { EventEmitter } from 'events';

describe('BUG-076: Eviction Test', () => {
  it('should handle memory eviction correctly', async () => {
    console.log('=== BUG-076 Eviction Test ===\n');
    
    const manager = new EventCacheManager({
      maxEvents: 1000,
      maxAgeMs: 3600000,
      globalMemoryLimitMB: 1, // 1MB limit
      memoryCheckIntervalMs: 100,
    });

    const mockAdapter = new EventEmitter();
    manager.attachToAdapter(mockAdapter);

    // Track events
    let initialEventCount = 0;
    let evictionOccurred = false;
    let memoryKeptUnderLimit = false;

    manager.on('memoryPressureResolved', event => {
      evictionOccurred = true;
      console.log(`Memory pressure resolved: freed ${event.freed} bytes`);
    });

    // Create initial events
    console.log('Creating initial events...');
    for (let i = 0; i < 5; i++) {
      const changes = Array(20)
        .fill(null)
        .map((_, j) => ({
          Name: `control_${i}_${j}`,
          Value: 'x'.repeat(500),
          String: 'x'.repeat(500),
        }));

      mockAdapter.emit('changeGroup:changes', {
        groupId: `group${i}`,
        changes,
        timestamp: BigInt(Date.now()) * 1000000n,
        timestampMs: Date.now(),
        sequenceNumber: i,
      });

      initialEventCount += changes.length;
    }

    // Wait for initial setup
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const stats1 = manager.getMemoryStats();
    console.log(
      `Initial memory: ${(stats1.totalUsage / 1024 / 1024).toFixed(2)}MB (${stats1.percentage.toFixed(2)}%)`
    );

    // Flood with more events to trigger eviction
    console.log('\nFlooding with events to trigger eviction...');
    for (let i = 0; i < 15; i++) {
      const changes = Array(50)
        .fill(null)
        .map((_, j) => ({
          Name: `flood_${i}_${j}`,
          Value: 'x'.repeat(1000),
          String: 'x'.repeat(1000),
        }));

      mockAdapter.emit('changeGroup:changes', {
        groupId: `flood${i}`,
        changes,
        timestamp: BigInt(Date.now()) * 1000000n,
        timestampMs: Date.now(),
        sequenceNumber: 100 + i,
      });
    }

    // Wait for eviction
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const stats2 = manager.getMemoryStats();
    memoryKeptUnderLimit = stats2.totalUsage <= stats2.limit;
    const finalEventCount = stats2.groupStats.reduce(
      (sum, g) => sum + g.events,
      0
    );

    console.log(
      `\nFinal memory: ${(stats2.totalUsage / 1024 / 1024).toFixed(2)}MB (${stats2.percentage.toFixed(2)}%)`
    );
    console.log(`Limit: ${(stats2.limit / 1024 / 1024).toFixed(2)}MB`);
    console.log(
      `Eviction occurred: ${evictionOccurred ? '✓' : '✗'}`
    );
    console.log(
      `Memory kept under limit: ${memoryKeptUnderLimit ? '✓' : `✗ (still at ${stats2.percentage.toFixed(2)}%)`}`
    );
    console.log(
      `Events were removed: ${finalEventCount < initialEventCount + 15 * 50 ? '✓' : '✗'}`
    );

    manager.destroy();
    
    // Jest assertions
    expect(evictionOccurred).toBe(true);
    expect(stats2.totalUsage).toBeLessThanOrEqual(stats2.limit);
    expect(memoryKeptUnderLimit).toBe(true);
  });
});