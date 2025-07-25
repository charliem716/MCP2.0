/**
 * Test to verify OfficialQRWCClient properly cleans up signal handlers
 */

import { OfficialQRWCClient } from '../../../src/qrwc/officialClient.js';

describe('OfficialQRWCClient Signal Handler Cleanup', () => {
  const mockOptions = {
    host: 'test.local',
    port: 443,
    enableAutoReconnect: false, // Disable auto-reconnect for testing
  };

  it('should not leak signal handlers after disconnect', () => {
    // Get initial handler counts
    const initialCounts = {
      SIGINT: process.listenerCount('SIGINT'),
      SIGTERM: process.listenerCount('SIGTERM'),
      beforeExit: process.listenerCount('beforeExit'),
    };
    
    console.log('Initial counts:', initialCounts);

    // Create and disconnect a client
    const client = new OfficialQRWCClient(mockOptions);
    
    const afterCreate = {
      SIGINT: process.listenerCount('SIGINT'),
      SIGTERM: process.listenerCount('SIGTERM'),
      beforeExit: process.listenerCount('beforeExit'),
    };
    console.log('After creation:', afterCreate);
    
    // After creation, handlers should be added
    expect(process.listenerCount('SIGINT')).toBe(initialCounts.SIGINT + 1);
    expect(process.listenerCount('SIGTERM')).toBe(initialCounts.SIGTERM + 1);
    expect(process.listenerCount('beforeExit')).toBe(initialCounts.beforeExit + 1);

    // Disconnect the client
    client.disconnect();
    
    const afterDisconnect = {
      SIGINT: process.listenerCount('SIGINT'),
      SIGTERM: process.listenerCount('SIGTERM'),
      beforeExit: process.listenerCount('beforeExit'),
    };
    console.log('After disconnect:', afterDisconnect);

    // After disconnect, handlers should be removed
    expect(process.listenerCount('SIGINT')).toBe(initialCounts.SIGINT);
    expect(process.listenerCount('SIGTERM')).toBe(initialCounts.SIGTERM);
    expect(process.listenerCount('beforeExit')).toBe(initialCounts.beforeExit);
  });

  it('should not accumulate handlers over multiple client lifecycles', () => {
    const initialCounts = {
      SIGINT: process.listenerCount('SIGINT'),
      SIGTERM: process.listenerCount('SIGTERM'),
      beforeExit: process.listenerCount('beforeExit'),
    };

    // Create and disconnect multiple clients
    for (let i = 0; i < 5; i++) {
      const client = new OfficialQRWCClient(mockOptions);
      client.disconnect();
    }

    // Handler counts should return to initial values
    expect(process.listenerCount('SIGINT')).toBe(initialCounts.SIGINT);
    expect(process.listenerCount('SIGTERM')).toBe(initialCounts.SIGTERM);
    expect(process.listenerCount('beforeExit')).toBe(initialCounts.beforeExit);
  });

  it('should handle multiple disconnect calls gracefully', () => {
    const initialCounts = {
      SIGINT: process.listenerCount('SIGINT'),
      SIGTERM: process.listenerCount('SIGTERM'),
      beforeExit: process.listenerCount('beforeExit'),
    };

    const client = new OfficialQRWCClient(mockOptions);
    
    // Call disconnect multiple times
    client.disconnect();
    client.disconnect();
    client.disconnect();

    // Handler counts should still be correct (not negative)
    expect(process.listenerCount('SIGINT')).toBe(initialCounts.SIGINT);
    expect(process.listenerCount('SIGTERM')).toBe(initialCounts.SIGTERM);
    expect(process.listenerCount('beforeExit')).toBe(initialCounts.beforeExit);
  });
});