import { EventCacheManager } from '../dist/src/mcp/state/event-cache/manager.js';
import { EventEmitter } from 'events';

console.log('Testing 80% and 90% warnings specifically...\n');

const manager = new EventCacheManager({
  maxEvents: 1000,
  maxAgeMs: 3600000,
  globalMemoryLimitMB: 0.1, // 100KB
  memoryCheckIntervalMs: 50
});

const mockAdapter = new EventEmitter();
manager.attachToAdapter(mockAdapter);

const warnings = [];

manager.on('memoryPressure', (event) => {
  warnings.push({ level: event.level, percentage: event.percentage });
  console.log(`${event.level} warning at ${event.percentage.toFixed(2)}%`);
});

// Add events gradually
async function addEventsGradually() {
  for (let i = 0; i < 40; i++) {
    mockAdapter.emit('changeGroup:changes', {
      groupId: `group${i}`,
      changes: Array(3).fill(null).map((_, j) => ({
        Name: `ctrl_${i}_${j}`,
        Value: 'x'.repeat(200),
        String: 'x'.repeat(200)
      })),
      timestamp: BigInt(Date.now()) * 1000000n,
      timestampMs: Date.now(),
      sequenceNumber: i
    });
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const stats = manager.getMemoryStats();
    console.log(`After group ${i}: ${stats.percentage.toFixed(2)}%`);
    
    if (stats.percentage > 95) break;
  }
}

await addEventsGradually();

await new Promise(resolve => setTimeout(resolve, 500));

console.log('\nWarnings received:');
warnings.forEach(w => console.log(`- ${w.level} at ${w.percentage.toFixed(2)}%`));

const has80Warning = warnings.some(w => w.level === 'high' && w.percentage >= 80 && w.percentage < 90);
const has90Warning = warnings.some(w => w.level === 'critical' && w.percentage >= 90);

console.log(`\n80% warning: ${has80Warning ? '✓' : '✗'}`);
console.log(`90% warning: ${has90Warning ? '✓' : '✗'}`);

manager.destroy();
process.exit(0);