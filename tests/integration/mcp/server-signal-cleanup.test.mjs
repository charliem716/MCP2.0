import { MCPServer } from '../../../dist/src/mcp/server.js';
import { strict as assert } from 'assert';

console.log('Testing BUG-028: Signal Handler Cleanup Integration Test');

// Test configuration
const config = {
  name: 'test-server',
  version: '1.0.0',
  qrwc: {
    host: 'test.local',
    port: 443,
    reconnectInterval: 5000
  }
};

async function testSignalHandlerCleanup() {
  console.log('\n1. Testing signal handler accumulation without cleanup...');
  
  // Store initial listener counts (including error handlers)
  const initialSIGINT = process.listenerCount('SIGINT');
  const initialSIGTERM = process.listenerCount('SIGTERM');
  const initialSIGUSR2 = process.listenerCount('SIGUSR2');
  const initialUncaught = process.listenerCount('uncaughtException');
  const initialUnhandled = process.listenerCount('unhandledRejection');
  
  console.log(`Initial listener counts - SIGINT: ${initialSIGINT}, SIGTERM: ${initialSIGTERM}, SIGUSR2: ${initialSIGUSR2}`);
  console.log(`Initial error handler counts - uncaughtException: ${initialUncaught}, unhandledRejection: ${initialUnhandled}`);
  
  // Create first server (constructor sets up error handlers)
  const server1 = new MCPServer(config);
  // Manually setup graceful shutdown handlers (normally done in start())
  const setupMethod = Object.getPrototypeOf(server1).constructor.prototype.setupGracefulShutdown;
  setupMethod.call(server1);
  
  // Check listener counts increased
  const afterFirst = {
    SIGINT: process.listenerCount('SIGINT'),
    SIGTERM: process.listenerCount('SIGTERM'),
    SIGUSR2: process.listenerCount('SIGUSR2'),
    uncaughtException: process.listenerCount('uncaughtException'),
    unhandledRejection: process.listenerCount('unhandledRejection')
  };
  
  console.log(`After first server - SIGINT: ${afterFirst.SIGINT}, SIGTERM: ${afterFirst.SIGTERM}, SIGUSR2: ${afterFirst.SIGUSR2}`);
  console.log(`After first server - uncaughtException: ${afterFirst.uncaughtException}, unhandledRejection: ${afterFirst.unhandledRejection}`);
  assert.equal(afterFirst.SIGINT, initialSIGINT + 1, 'SIGINT listener should be added');
  assert.equal(afterFirst.SIGTERM, initialSIGTERM + 1, 'SIGTERM listener should be added');
  assert.equal(afterFirst.SIGUSR2, initialSIGUSR2 + 1, 'SIGUSR2 listener should be added');
  assert.equal(afterFirst.uncaughtException, initialUncaught + 1, 'uncaughtException listener should be added');
  assert.equal(afterFirst.unhandledRejection, initialUnhandled + 1, 'unhandledRejection listener should be added');
  
  console.log('\n2. Testing cleanup on shutdown...');
  
  // Mock required properties for shutdown
  server1.isConnected = true;
  server1.transport = { close: async () => {} };
  server1.officialQrwcClient = { disconnect: async () => {} };
  server1.toolRegistry = { cleanup: async () => {} };
  
  // Shutdown server1
  await server1.shutdown();
  
  // Check listeners were removed
  const afterShutdown = {
    SIGINT: process.listenerCount('SIGINT'),
    SIGTERM: process.listenerCount('SIGTERM'),
    SIGUSR2: process.listenerCount('SIGUSR2'),
    uncaughtException: process.listenerCount('uncaughtException'),
    unhandledRejection: process.listenerCount('unhandledRejection')
  };
  
  console.log(`After shutdown - SIGINT: ${afterShutdown.SIGINT}, SIGTERM: ${afterShutdown.SIGTERM}, SIGUSR2: ${afterShutdown.SIGUSR2}`);
  console.log(`After shutdown - uncaughtException: ${afterShutdown.uncaughtException}, unhandledRejection: ${afterShutdown.unhandledRejection}`);
  assert.equal(afterShutdown.SIGINT, initialSIGINT, 'SIGINT listeners should be back to initial count');
  assert.equal(afterShutdown.SIGTERM, initialSIGTERM, 'SIGTERM listeners should be back to initial count');
  assert.equal(afterShutdown.SIGUSR2, initialSIGUSR2, 'SIGUSR2 listeners should be back to initial count');
  assert.equal(afterShutdown.uncaughtException, initialUncaught, 'uncaughtException listeners should be back to initial count');
  assert.equal(afterShutdown.unhandledRejection, initialUnhandled, 'unhandledRejection listeners should be back to initial count');
  
  console.log('\n3. Testing no accumulation with proper cleanup...');
  
  // Create multiple servers with proper cleanup
  for (let i = 0; i < 3; i++) {
    const server = new MCPServer(config);
    setupMethod.call(server);
    
    // Mock for shutdown
    server.isConnected = true;
    server.transport = { close: async () => {} };
    server.officialQrwcClient = { disconnect: async () => {} };
    server.toolRegistry = { cleanup: async () => {} };
    
    await server.shutdown();
  }
  
  // Verify no accumulation
  const finalCounts = {
    SIGINT: process.listenerCount('SIGINT'),
    SIGTERM: process.listenerCount('SIGTERM'),
    SIGUSR2: process.listenerCount('SIGUSR2'),
    uncaughtException: process.listenerCount('uncaughtException'),
    unhandledRejection: process.listenerCount('unhandledRejection')
  };
  
  console.log(`Final counts after 3 create/shutdown cycles - SIGINT: ${finalCounts.SIGINT}, SIGTERM: ${finalCounts.SIGTERM}, SIGUSR2: ${finalCounts.SIGUSR2}`);
  console.log(`Final error handler counts - uncaughtException: ${finalCounts.uncaughtException}, unhandledRejection: ${finalCounts.unhandledRejection}`);
  assert.equal(finalCounts.SIGINT, initialSIGINT, 'No SIGINT accumulation');
  assert.equal(finalCounts.SIGTERM, initialSIGTERM, 'No SIGTERM accumulation');
  assert.equal(finalCounts.SIGUSR2, initialSIGUSR2, 'No SIGUSR2 accumulation');
  assert.equal(finalCounts.uncaughtException, initialUncaught, 'No uncaughtException accumulation');
  assert.equal(finalCounts.unhandledRejection, initialUnhandled, 'No unhandledRejection accumulation');
  
  console.log('\n✅ All integration tests passed! BUG-028 is fully fixed.');
}

// Run test
testSignalHandlerCleanup().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});