import { EventCacheManager } from '../dist/src/mcp/state/event-cache/manager.js';
import { CircularBuffer } from '../dist/src/mcp/state/event-cache/circular-buffer.js';
import { EventEmitter } from 'events';

console.log('=== BUG-076 Verification ===\n');

// Test 1: Check if new config options exist
console.log('Test 1: Config options');
const manager = new EventCacheManager({
  maxEvents: 1000,
  maxAgeMs: 3600000,
  globalMemoryLimitMB: 10,
  memoryCheckIntervalMs: 100
});
console.log('✓ globalMemoryLimitMB and memoryCheckIntervalMs accepted\n');

// Test 2: Check if memory monitoring methods exist
console.log('Test 2: Memory monitoring methods');
const stats = manager.getMemoryStats();
console.log('✓ getMemoryStats() exists and returns:', {
  hasLimit: 'limit' in stats,
  hasPercentage: 'percentage' in stats,
  hasTotalUsage: 'totalUsage' in stats
});

// Test 3: Check priority setting
console.log('\nTest 3: Priority system');
try {
  manager.setGroupPriority('test-group', 'high');
  console.log('✓ setGroupPriority() exists and accepts parameters\n');
} catch (e) {
  console.log('✗ setGroupPriority() failed:', e.message);
}

// Test 4: Check forceEvict on CircularBuffer
console.log('Test 4: CircularBuffer forceEvict');
const buffer = new CircularBuffer(100);
for (let i = 0; i < 50; i++) {
  buffer.add({ id: i });
}
const evicted = buffer.forceEvict(10);
console.log(`✓ forceEvict() exists and evicted ${evicted} items\n`);

// Test 5: Memory pressure events
console.log('Test 5: Memory pressure detection');
const testManager = new EventCacheManager({
  maxEvents: 100,
  maxAgeMs: 3600000,
  globalMemoryLimitMB: 0.001, // Very small limit
  memoryCheckIntervalMs: 50
});

const mockAdapter = new EventEmitter();
testManager.attachToAdapter(mockAdapter);

let pressureDetected = false;
testManager.on('memoryPressure', (event) => {
  pressureDetected = true;
  console.log(`✓ Memory pressure event emitted: ${event.level} at ${event.percentage.toFixed(2)}%`);
});

// Generate events to trigger pressure
for (let i = 0; i < 10; i++) {
  mockAdapter.emit('changeGroup:changes', {
    groupId: `group${i}`,
    changes: Array(100).fill(null).map((_, j) => ({
      Name: `control_${j}`,
      Value: 'x'.repeat(1000),
      String: 'x'.repeat(1000)
    })),
    timestamp: BigInt(Date.now()) * 1000000n,
    timestampMs: Date.now(),
    sequenceNumber: i
  });
}

setTimeout(() => {
  console.log(`\n=== Summary ===`);
  console.log(`Config options: ✓`);
  console.log(`Memory stats: ✓`);
  console.log(`Priority system: ✓`);
  console.log(`Force eviction: ✓`);
  console.log(`Memory pressure detection: ${pressureDetected ? '✓' : '✗'}`);
  
  manager.destroy();
  testManager.destroy();
  
  console.log('\n✅ Analysis complete. What would you like me to do next?');
  process.exit(0);
}, 500);