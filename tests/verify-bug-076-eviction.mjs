import { EventCacheManager } from '../dist/src/mcp/state/event-cache/manager.js';
import { EventEmitter } from 'events';

console.log('=== BUG-076 Eviction Test ===\n');

const manager = new EventCacheManager({
  maxEvents: 1000,
  maxAgeMs: 3600000,
  globalMemoryLimitMB: 1, // 1MB limit
  memoryCheckIntervalMs: 100
});

const mockAdapter = new EventEmitter();
manager.attachToAdapter(mockAdapter);

// Track events
let initialEventCount = 0;
let evictionOccurred = false;
let memoryKeptUnderLimit = false;

manager.on('memoryPressureResolved', (event) => {
  evictionOccurred = true;
  console.log(`Memory pressure resolved: freed ${event.freed} bytes`);
});

// Create initial events
console.log('Creating initial events...');
for (let i = 0; i < 5; i++) {
  const changes = Array(20).fill(null).map((_, j) => ({
    Name: `control_${i}_${j}`,
    Value: 'x'.repeat(500),
    String: 'x'.repeat(500)
  }));
  
  mockAdapter.emit('changeGroup:changes', {
    groupId: `group${i}`,
    changes,
    timestamp: BigInt(Date.now()) * 1000000n,
    timestampMs: Date.now(),
    sequenceNumber: i
  });
  
  initialEventCount += changes.length;
}

// Wait for initial setup
setTimeout(() => {
  const stats1 = manager.getMemoryStats();
  console.log(`\nInitial state:`);
  console.log(`- Total events: ${stats1.groupStats.reduce((sum, g) => sum + g.events, 0)}`);
  console.log(`- Memory usage: ${(stats1.totalUsage / 1024).toFixed(2)}KB`);
  console.log(`- Percentage: ${stats1.percentage.toFixed(2)}%`);
  
  // Add more events to trigger memory pressure
  console.log('\nAdding more events to exceed limit...');
  for (let i = 5; i < 20; i++) {
    const changes = Array(50).fill(null).map((_, j) => ({
      Name: `control_${i}_${j}`,
      Value: 'x'.repeat(1000),
      String: 'x'.repeat(1000)
    }));
    
    mockAdapter.emit('changeGroup:changes', {
      groupId: `group${i}`,
      changes,
      timestamp: BigInt(Date.now()) * 1000000n,
      timestampMs: Date.now(),
      sequenceNumber: i
    });
  }
  
  // Wait for eviction
  setTimeout(() => {
    const stats2 = manager.getMemoryStats();
    const finalEventCount = stats2.groupStats.reduce((sum, g) => sum + g.events, 0);
    
    console.log(`\nFinal state:`);
    console.log(`- Total events: ${finalEventCount}`);
    console.log(`- Memory usage: ${(stats2.totalUsage / 1024).toFixed(2)}KB`);
    console.log(`- Percentage: ${stats2.percentage.toFixed(2)}%`);
    console.log(`- Events evicted: ${initialEventCount + (15 * 50) - finalEventCount}`);
    
    // Check if memory is managed
    if (stats2.percentage <= 100) {
      memoryKeptUnderLimit = true;
    }
    
    console.log(`\n=== Results ===`);
    console.log(`Eviction occurred: ${evictionOccurred ? '✓' : '✗'}`);
    console.log(`Memory kept under limit: ${memoryKeptUnderLimit ? '✓' : `✗ (still at ${  stats2.percentage.toFixed(2)  }%)`}`);
    console.log(`Events were removed: ${finalEventCount < initialEventCount + (15 * 50) ? '✓' : '✗'}`);
    
    manager.destroy();
    process.exit(0);
  }, 1000);
}, 200);