import { EventCacheManager } from './src/mcp/state/event-cache/manager.js';
import { MockQRWCAdapter } from './src/mcp/state/event-cache/test-helpers.js';

async function debugTest() {
  const eventCache = new EventCacheManager({
    maxEvents: 100,
    maxAgeMs: 60000,
  });

  const mockAdapter = new MockQRWCAdapter();

  // Attach adapter
  eventCache.attachToAdapter(mockAdapter);

  console.log('Adapter attached');

  // Emit a test event
  mockAdapter.emit('changeGroup:changes', {
    groupId: 'test-group',
    changes: [{ Name: 'control1', Value: 42, String: '42' }],
    timestamp: BigInt(Date.now() * 1_000_000),
    timestampMs: Date.now(),
    sequenceNumber: 1,
  });

  console.log('Event emitted');

  // Query events
  const events = await eventCache.query({ groupId: 'test-group' });
  console.log('Query result:', events);
  console.log('Event count:', events.length);

  eventCache.destroy();
}

debugTest().catch(console.error);
