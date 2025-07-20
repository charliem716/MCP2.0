#!/usr/bin/env node

/**
 * Manual test for BUG-046: Verify disconnect() doesn't spam logs
 */

import { OfficialQRWCClient } from '../../../dist/src/qrwc/officialClient.js';
import { createLogger } from '../../../dist/src/shared/utils/logger.js';

console.log('Manual Test for BUG-046');
console.log('=======================\n');

// Create a test to verify the fix works
async function testDisconnectBehavior() {
  console.log('Creating client...');
  const client = new OfficialQRWCClient({
    host: 'test.local',
    port: 443,
    enableAutoReconnect: false
  });

  console.log('\n1. Testing multiple disconnect() calls:');
  console.log('   Calling disconnect() 10 times...\n');
  
  // Should only see 2 log messages (one "Disconnecting", one "Disconnected successfully")
  for (let i = 0; i < 10; i++) {
    client.disconnect();
  }

  console.log('\n2. Testing disconnect when already disconnected:');
  // Wait a moment then try again
  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log('   Calling disconnect() again (should be silent)...\n');
  client.disconnect();
  
  console.log('\n3. Creating new client to test process events:');
  const client2 = new OfficialQRWCClient({
    host: 'test2.local', 
    port: 443,
    enableAutoReconnect: false
  });

  console.log('   Emitting multiple beforeExit events...\n');
  // Simulate multiple beforeExit events
  for (let i = 0; i < 5; i++) {
    process.emit('beforeExit', 0);
  }

  console.log('\n✅ Test Complete!');
  console.log('\nExpected behavior:');
  console.log('- First test: Should see exactly 2 disconnect log messages');
  console.log('- Second test: Should see NO new log messages');  
  console.log('- Third test: Should see exactly 2 disconnect log messages for client2');
  console.log('\nIf you see hundreds of "Disconnecting from Q-SYS Core" messages, the bug is NOT fixed.');
  
  process.exit(0);
}

testDisconnectBehavior().catch(console.error);