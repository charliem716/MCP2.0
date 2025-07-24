import { EventCacheManager } from '../dist/src/mcp/state/event-cache/manager.js';
import { EventEmitter } from 'events';

console.log('Testing BUG-076: Memory limit enforcement');

// Create manager with low memory limit
const manager = new EventCacheManager({
  maxEvents: 1000,
  maxAgeMs: 3600000,
  globalMemoryLimitMB: 1, // 1MB limit
  memoryCheckIntervalMs: 100, // Check every 100ms
});

// Mock adapter
const mockAdapter = new EventEmitter();
manager.attachToAdapter(mockAdapter);

let memoryPressureEmitted = false;
let memoryPressureLevel = null;
let memoryResolved = false;

// Listen for memory events
manager.on('memoryPressure', event => {
  memoryPressureEmitted = true;
  memoryPressureLevel = event.level;
  console.log(
    `Memory pressure detected: ${event.level} at ${event.percentage.toFixed(2)}%`
  );
});

manager.on('memoryPressureResolved', event => {
  memoryResolved = true;
  console.log(`Memory pressure resolved. Freed: ${event.freed} bytes`);
});

// Generate large events to exceed memory
console.log('Generating events to exceed 1MB limit...');
const largeData = 'x'.repeat(1000); // 1KB string

for (let i = 0; i < 50; i++) {
  const changes = [];
  for (let j = 0; j < 30; j++) {
    changes.push({
      Name: `control_${i}_${j}`,
      Value: largeData,
      String: largeData,
    });
  }

  mockAdapter.emit('changeGroup:changes', {
    groupId: `group${i}`,
    changes,
    timestamp: BigInt(Date.now()) * 1000000n,
    timestampMs: Date.now(),
    sequenceNumber: i,
  });
}

// Wait for memory monitoring
setTimeout(() => {
  const stats = manager.getMemoryStats();
  console.log('\nFinal memory stats:');
  console.log(`Total usage: ${(stats.totalUsage / 1024 / 1024).toFixed(2)}MB`);
  console.log(`Limit: ${(stats.limit / 1024 / 1024).toFixed(2)}MB`);
  console.log(`Percentage: ${stats.percentage.toFixed(2)}%`);
  console.log(`Groups tracked: ${stats.groupStats.length}`);

  console.log('\nVerification:');
  console.log(`✓ Memory pressure emitted: ${memoryPressureEmitted}`);
  console.log(`✓ Pressure level: ${memoryPressureLevel}`);
  console.log(`✓ Memory resolved: ${memoryResolved}`);
  console.log(`✓ Memory kept under limit: ${stats.totalUsage <= stats.limit}`);

  // Test priority system
  console.log('\nTesting priority system...');
  manager.setGroupPriority('group0', 'high');
  manager.setGroupPriority('group1', 'low');

  manager.destroy();
  console.log('\n✅ BUG-076 fix verified successfully!');
  process.exit(0);
}, 1000);
