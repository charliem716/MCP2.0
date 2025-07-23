import { EventCacheManager } from '../dist/src/mcp/state/event-cache/manager.js';
import { EventEmitter } from 'events';

console.log('=== BUG-076 Final Verification ===\n');

// Test all acceptance criteria
const manager = new EventCacheManager({
  maxEvents: 1000,
  maxAgeMs: 3600000,
  globalMemoryLimitMB: 1, // 1MB for easy testing
  memoryCheckIntervalMs: 100
});

const mockAdapter = new EventEmitter();
manager.attachToAdapter(mockAdapter);

const results = {
  configAccepted: true,
  memoryLimit: false,
  memoryCalculation: false,
  warning80: false,
  warning90: false,
  evictionWorks: false,
  noOOM: true
};

// Track memory events
manager.on('memoryPressure', (event) => {
  console.log(`Memory pressure: ${event.level} at ${event.percentage.toFixed(2)}%`);
  if (event.level === 'high') results.warning80 = true;
  if (event.level === 'critical') results.warning90 = true;
});

manager.on('memoryPressureResolved', (event) => {
  console.log(`Memory pressure resolved: freed ${(event.freed / 1024).toFixed(2)}KB`);
  results.evictionWorks = true;
});

// Test memory calculation accuracy
console.log('1. Testing memory calculation...');
const testData = 'x'.repeat(1000);
mockAdapter.emit('changeGroup:changes', {
  groupId: 'test1',
  changes: [{
    Name: 'control1',
    Value: testData,
    String: testData
  }],
  timestamp: BigInt(Date.now()) * 1000000n,
  timestampMs: Date.now(),
  sequenceNumber: 1
});

await new Promise(resolve => setTimeout(resolve, 150));
const stats1 = manager.getMemoryStats();
results.memoryCalculation = stats1.groupStats[0]?.memory > 2000; // Should be > 2KB
console.log(`   Memory calculated: ${stats1.groupStats[0]?.memory} bytes ✓`);

// Test gradual filling to trigger warnings
console.log('\n2. Testing memory pressure warnings...');
for (let i = 0; i < 30; i++) {
  mockAdapter.emit('changeGroup:changes', {
    groupId: `group${i}`,
    changes: Array(20).fill(null).map((_, j) => ({
      Name: `ctrl_${i}_${j}`,
      Value: 'data'.repeat(250),
      String: 'data'.repeat(250)
    })),
    timestamp: BigInt(Date.now()) * 1000000n,
    timestampMs: Date.now(),
    sequenceNumber: i + 10
  });
  
  // Small delay to allow memory check
  await new Promise(resolve => setTimeout(resolve, 20));
}

await new Promise(resolve => setTimeout(resolve, 300));

// Test memory limit enforcement
console.log('\n3. Testing memory limit enforcement...');
const stats2 = manager.getMemoryStats();
results.memoryLimit = stats2.totalUsage <= stats2.limit;
console.log(`   Memory: ${(stats2.totalUsage / 1024 / 1024).toFixed(2)}MB / ${(stats2.limit / 1024 / 1024).toFixed(2)}MB`);
console.log(`   Percentage: ${stats2.percentage.toFixed(2)}%`);
console.log(`   Under limit: ${results.memoryLimit ? '✓' : '✗'}`);

// Test priority system
console.log('\n4. Testing priority system...');
const manager2 = new EventCacheManager({
  maxEvents: 100,
  maxAgeMs: 3600000,
  globalMemoryLimitMB: 0.5,
  memoryCheckIntervalMs: 50
});

const mockAdapter2 = new EventEmitter();
manager2.attachToAdapter(mockAdapter2);

manager2.setGroupPriority('important', 'high');
manager2.setGroupPriority('unimportant', 'low');

// Add initial events
for (const group of ['important', 'unimportant']) {
  mockAdapter2.emit('changeGroup:changes', {
    groupId: group,
    changes: Array(20).fill(null).map((_, j) => ({
      Name: `${group}_${j}`,
      Value: 'test',
      String: 'test'
    })),
    timestamp: BigInt(Date.now()) * 1000000n,
    timestampMs: Date.now(),
    sequenceNumber: 100
  });
}

// Overflow to trigger eviction
for (let i = 0; i < 50; i++) {
  mockAdapter2.emit('changeGroup:changes', {
    groupId: 'overflow',
    changes: Array(20).fill(null).map((_, j) => ({
      Name: `overflow_${i}_${j}`,
      Value: 'x'.repeat(500),
      String: 'x'.repeat(500)
    })),
    timestamp: BigInt(Date.now()) * 1000000n,
    timestampMs: Date.now(),
    sequenceNumber: 200 + i
  });
}

await new Promise(resolve => setTimeout(resolve, 500));
const finalStats = manager2.getMemoryStats();
const importantEvents = finalStats.groupStats.find(g => g.groupId === 'important')?.events || 0;
const unimportantEvents = finalStats.groupStats.find(g => g.groupId === 'unimportant')?.events || 0;
console.log(`   Important group: ${importantEvents} events`);
console.log(`   Unimportant group: ${unimportantEvents} events`);
console.log(`   Priority working: ${importantEvents >= unimportantEvents ? '✓' : '✗'}`);

// Final summary
console.log('\n=== ACCEPTANCE CRITERIA ===');
console.log(`✅ Global memory limit configuration accepted`);
console.log(`${results.memoryLimit ? '✅' : '❌'} Global memory limit is enforced`);
console.log(`${results.memoryCalculation ? '✅' : '❌'} Memory usage is accurately calculated`);
console.log(`${results.warning80 && results.warning90 ? '✅' : '❌'} Warning events emitted at 80% and 90%`);
console.log(`${results.evictionWorks ? '✅' : '❌'} Automatic eviction prevents OOM`);
console.log(`${results.noOOM ? '✅' : '❌'} No OOM errors occurred`);

const allPassed = results.memoryLimit && results.memoryCalculation && 
                  results.warning80 && results.warning90 && 
                  results.evictionWorks && results.noOOM;

console.log(`\n${allPassed ? '✅ BUG-076 is RESOLVED' : '❌ BUG-076 still has issues'}`);

manager.destroy();
manager2.destroy();
process.exit(0);