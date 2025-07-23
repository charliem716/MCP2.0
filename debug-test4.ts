import { EventCacheManager } from './src/mcp/state/event-cache/manager.js';
import { MockQRWCAdapter } from './src/mcp/state/event-cache/test-helpers.js';

async function debugTest4() {
  const eventCache = new EventCacheManager({
    maxEvents: 100,
    maxAgeMs: 60000
  });
  
  const mockAdapter = new MockQRWCAdapter();
  
  // Add event listener to see if events are being received
  mockAdapter.on('changeGroup:changes', (event) => {
    console.log('Event received by mock adapter:', event);
  });
  
  // Attach adapter
  eventCache.attachToAdapter(mockAdapter);
  
  console.log('Adapter attached');
  
  // Emit a test event
  const event = {
    groupId: 'test-group',
    changes: [
      { Name: 'control1', Value: 42, String: '42' }
    ],
    timestamp: BigInt(Date.now() * 1_000_000),
    timestampMs: Date.now(),
    sequenceNumber: 1
  };
  
  console.log('Emitting event:', event);
  mockAdapter.emit('changeGroup:changes', event);
  
  console.log('Event emitted');
  
  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Query events
  const events = await eventCache.query({ groupId: 'test-group' });
  console.log('Query result:', events);
  console.log('Event count:', events.length);
  
  eventCache.destroy();
}

debugTest4().catch(console.error); 