import { EventCacheManager } from './dist/mcp/state/event-cache/manager.js';
import { MockQRWCAdapter } from './dist/mcp/state/event-cache/test-helpers.js';

console.log('Testing event cache...\n');

// Create manager
const manager = new EventCacheManager({
  maxEvents: 1000,
  maxAgeMs: 60000
});

// Create mock adapter
const adapter = new MockQRWCAdapter();
manager.attachToAdapter(adapter);

// Manually emit event
const event = {
  groupId: 'test-group',
  timestamp: BigInt(Date.now()) * 1000000n,
  timestampMs: Date.now(),
  sequenceNumber: 1,
  changes: [
    { Name: 'TestControl', Value: 42, String: '42' }
  ]
};

console.log('Emitting event:', event);
adapter.emit('changeGroup:changes', event);

// Give it a moment
setTimeout(async () => {
  const results = await manager.query({ groupId: 'test-group' });
  console.log('\nQuery results:', results.length, 'events');
  if (results.length > 0) {
    console.log('First event:', results[0]);
  }
  
  // Also try querySync
  const syncResults = manager.querySync({ groupId: 'test-group' });
  console.log('\nQuerySync results:', syncResults.length, 'events');
  
  manager.destroy();
  process.exit(0);
}, 100);