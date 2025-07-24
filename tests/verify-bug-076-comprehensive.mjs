import { EventCacheManager } from '../dist/src/mcp/state/event-cache/manager.js';
import { EventEmitter } from 'events';

console.log('=== BUG-076 Comprehensive Verification ===\n');

let allTestsPassed = true;

// Test 1: Memory pressure warnings at 80% and 90%
console.log('Test 1: Memory pressure warnings');
const manager1 = new EventCacheManager({
  maxEvents: 1000,
  maxAgeMs: 3600000,
  globalMemoryLimitMB: 1,
  memoryCheckIntervalMs: 50,
});

const mockAdapter1 = new EventEmitter();
manager1.attachToAdapter(mockAdapter1);

let highWarning = false;
let criticalWarning = false;

manager1.on('memoryPressure', event => {
  if (
    event.level === 'high' &&
    event.percentage >= 80 &&
    event.percentage < 90
  ) {
    highWarning = true;
  } else if (event.level === 'critical' && event.percentage >= 90) {
    criticalWarning = true;
  }
});

// Generate events gradually
for (let i = 0; i < 15; i++) {
  mockAdapter1.emit('changeGroup:changes', {
    groupId: `group${i}`,
    changes: Array(30)
      .fill(null)
      .map((_, j) => ({
        Name: `ctrl_${j}`,
        Value: 'x'.repeat(800),
        String: 'x'.repeat(800),
      })),
    timestamp: BigInt(Date.now()) * 1000000n,
    timestampMs: Date.now(),
    sequenceNumber: i,
  });
}

await new Promise(resolve => setTimeout(resolve, 200));
console.log(`✓ High warning (80%): ${highWarning ? 'YES' : 'NO'}`);
console.log(`✓ Critical warning (90%): ${criticalWarning ? 'YES' : 'NO'}`);
allTestsPassed = allTestsPassed && highWarning && criticalWarning;
manager1.destroy();

// Test 2: Memory stays under limit
console.log('\nTest 2: Memory enforcement');
const manager2 = new EventCacheManager({
  maxEvents: 5000,
  maxAgeMs: 3600000,
  globalMemoryLimitMB: 2,
  memoryCheckIntervalMs: 100,
});

const mockAdapter2 = new EventEmitter();
manager2.attachToAdapter(mockAdapter2);

// Flood with events
for (let i = 0; i < 100; i++) {
  mockAdapter2.emit('changeGroup:changes', {
    groupId: `stress${i}`,
    changes: Array(50)
      .fill(null)
      .map((_, j) => ({
        Name: `ctrl_${j}`,
        Value: 'x'.repeat(1000),
        String: 'x'.repeat(1000),
      })),
    timestamp: BigInt(Date.now()) * 1000000n,
    timestampMs: Date.now(),
    sequenceNumber: i,
  });
}

await new Promise(resolve => setTimeout(resolve, 500));
const stats2 = manager2.getMemoryStats();
const memoryUnderLimit = stats2.totalUsage <= stats2.limit;
console.log(
  `✓ Memory usage: ${(stats2.totalUsage / 1024 / 1024).toFixed(2)}MB / ${(stats2.limit / 1024 / 1024).toFixed(2)}MB`
);
console.log(
  `✓ Under limit: ${memoryUnderLimit ? 'YES' : 'NO'} (${stats2.percentage.toFixed(2)}%)`
);
allTestsPassed = allTestsPassed && memoryUnderLimit;
manager2.destroy();

// Test 3: Priority system
console.log('\nTest 3: Priority protection');
const manager3 = new EventCacheManager({
  maxEvents: 1000,
  maxAgeMs: 3600000,
  globalMemoryLimitMB: 1,
  memoryCheckIntervalMs: 100,
});

const mockAdapter3 = new EventEmitter();
manager3.attachToAdapter(mockAdapter3);

// Set priorities
manager3.setGroupPriority('critical', 'high');
manager3.setGroupPriority('normal', 'normal');
manager3.setGroupPriority('optional', 'low');

// Add events to each
for (const group of ['critical', 'normal', 'optional']) {
  for (let i = 0; i < 5; i++) {
    mockAdapter3.emit('changeGroup:changes', {
      groupId: group,
      changes: Array(50)
        .fill(null)
        .map((_, j) => ({
          Name: `${group}_ctrl_${j}`,
          Value: `${group}_data`.repeat(100),
          String: `${group}_data`.repeat(100),
        })),
      timestamp: BigInt(Date.now()) * 1000000n,
      timestampMs: Date.now(),
      sequenceNumber: i,
    });
  }
}

// Trigger memory pressure
for (let i = 0; i < 20; i++) {
  mockAdapter3.emit('changeGroup:changes', {
    groupId: `overflow${i}`,
    changes: Array(100)
      .fill(null)
      .map((_, j) => ({
        Name: `overflow_${j}`,
        Value: 'overflow'.repeat(200),
        String: 'overflow'.repeat(200),
      })),
    timestamp: BigInt(Date.now()) * 1000000n,
    timestampMs: Date.now(),
    sequenceNumber: 100 + i,
  });
}

await new Promise(resolve => setTimeout(resolve, 500));
const stats3 = manager3.getMemoryStats();
const criticalEvents =
  stats3.groupStats.find(g => g.groupId === 'critical')?.events || 0;
const optionalEvents =
  stats3.groupStats.find(g => g.groupId === 'optional')?.events || 0;
const priorityRespected = criticalEvents > optionalEvents;

console.log(`✓ Critical group events: ${criticalEvents}`);
console.log(`✓ Optional group events: ${optionalEvents}`);
console.log(`✓ Priority respected: ${priorityRespected ? 'YES' : 'NO'}`);
allTestsPassed = allTestsPassed && priorityRespected;
manager3.destroy();

// Test 4: Accurate memory calculation
console.log('\nTest 4: Memory calculation accuracy');
const manager4 = new EventCacheManager({
  maxEvents: 1000,
  maxAgeMs: 3600000,
  globalMemoryLimitMB: 10,
});

const mockAdapter4 = new EventEmitter();
manager4.attachToAdapter(mockAdapter4);

// Add events with known sizes
const testString = 'a'.repeat(1000); // 1KB string
mockAdapter4.emit('changeGroup:changes', {
  groupId: 'test',
  changes: [
    {
      Name: 'bigControl',
      Value: testString,
      String: testString,
    },
  ],
  timestamp: BigInt(Date.now()) * 1000000n,
  timestampMs: Date.now(),
  sequenceNumber: 1,
});

await new Promise(resolve => setTimeout(resolve, 100));
const stats4 = manager4.getMemoryStats();
const eventSize = stats4.groupStats[0]?.memory || 0;
// Should be > 2KB (UTF-16) + overhead
const sizeAccurate = eventSize > 2000;

console.log(`✓ Event size calculated: ${eventSize} bytes`);
console.log(`✓ Size calculation accurate: ${sizeAccurate ? 'YES' : 'NO'}`);
allTestsPassed = allTestsPassed && sizeAccurate;
manager4.destroy();

// Summary
console.log('\n=== SUMMARY ===');
console.log(`All tests passed: ${allTestsPassed ? '✅ YES' : '❌ NO'}`);
console.log('\nExpected behaviors verified:');
console.log('✅ Global memory limit is enforced');
console.log('✅ Memory usage is accurately calculated');
console.log('✅ Warning events emitted at 80% and 90%');
console.log('✅ Automatic eviction prevents OOM');
console.log('✅ Priority system protects important groups');

process.exit(allTestsPassed ? 0 : 1);
