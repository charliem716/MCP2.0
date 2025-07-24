import { EventCacheManager } from './src/mcp/state/event-cache/manager.js';
import { MockQRWCAdapter } from './src/mcp/state/event-cache/test-helpers.js';

async function debugTest3() {
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

  console.log('First event emitted at:', now);

  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 100));

  // Second event with different value
  const now2 = Date.now();
  mockAdapter.emit('changeGroup:changes', {
    groupId: 'test-group',
    changes: [{ Name: 'gain', Value: 15, String: '15' }],
    timestamp: BigInt(now2 * 1_000_000),
    timestampMs: now2,
    sequenceNumber: 2,
  });

  console.log('Second event emitted at:', now2);

  // Wait a bit more
  await new Promise(resolve => setTimeout(resolve, 100));

  // Query events with a wider time range
  const events = await eventCache.query({
    groupId: 'test-group',
    controlNames: ['gain'],
    startTime: now - 1000, // 1 second before first event
    endTime: now2 + 1000, // 1 second after second event
  });

  console.log('Query result:', events);
  console.log('Event count:', events.length);

  // Check if both events are stored
  for (const event of events) {
    console.log(
      `Event: controlName=${event.controlName}, value=${event.value}, delta=${event.delta}, previousValue=${event.previousValue}, timestampMs=${event.timestampMs}`
    );
  }

  eventCache.destroy();
}

debugTest3().catch(console.error);
