import { EventCacheManager } from './src/mcp/state/event-cache/manager.js';
import { MockQRWCAdapter } from './src/mcp/state/event-cache/test-helpers.js';

async function debugTest2() {
  const eventCache = new EventCacheManager({
    maxEvents: 100,
    maxAgeMs: 60000,
  });

  const mockAdapter = new MockQRWCAdapter();

  // Attach adapter
  eventCache.attachToAdapter(mockAdapter);

  const now = Date.now();

  // First event
  mockAdapter.emit('changeGroup:changes', {
    groupId: 'test-group',
    changes: [{ Name: 'gain', Value: 10, String: '10' }],
    timestamp: BigInt(now * 1_000_000),
    timestampMs: now,
    sequenceNumber: 1,
  });

  console.log('First event emitted');

  // Second event with different value
  mockAdapter.emit('changeGroup:changes', {
    groupId: 'test-group',
    changes: [{ Name: 'gain', Value: 15, String: '15' }],
    timestamp: BigInt((now + 100) * 1_000_000),
    timestampMs: now + 100,
    sequenceNumber: 2,
  });

  console.log('Second event emitted');

  // Query events
  const events = await eventCache.query({
    groupId: 'test-group',
    controlNames: ['gain'],
  });

  console.log('Query result:', events);
  console.log('Event count:', events.length);

  // Check if both events are stored
  for (const event of events) {
    console.log(
      `Event: controlName=${event.controlName}, value=${event.value}, delta=${event.delta}, previousValue=${event.previousValue}`
    );
  }

  eventCache.destroy();
}

debugTest2().catch(console.error);
