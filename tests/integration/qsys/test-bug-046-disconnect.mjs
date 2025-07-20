#!/usr/bin/env node

/**
 * Integration test for BUG-046: Excessive Disconnect Logging During Shutdown
 * This test verifies that disconnect() only logs once even when called multiple times
 */

import { OfficialQRWCClient } from '../../../dist/src/qrwc/officialClient.js';

console.log('Testing BUG-046: Excessive Disconnect Logging');
console.log('===========================================\n');

// Count disconnect log messages
let disconnectCount = 0;
let connectedCount = 0;

// Override console.log to capture logger output
const originalLog = console.log;
console.log = (...args) => {
  const message = args.join(' ');
  if (message.includes('Disconnecting from Q-SYS Core')) {
    disconnectCount++;
  } else if (message.includes('Disconnected successfully')) {
    connectedCount++;
  }
  originalLog(...args);
};

async function testMultipleDisconnects() {
  const client = new OfficialQRWCClient({
    host: 'test.local',
    port: 443,
    enableAutoReconnect: false
  });

  console.log('Test 1: Calling disconnect() 100 times rapidly...\n');
  
  // Call disconnect 100 times
  for (let i = 0; i < 100; i++) {
    client.disconnect();
  }

  // Wait a bit to ensure all logs are processed
  await new Promise(resolve => setTimeout(resolve, 100));

  console.log(`\n✅ Test 1 Results:`);
  console.log(`  - "Disconnecting" logs: ${disconnectCount} (expected: 1)`);
  console.log(`  - "Disconnected successfully" logs: ${connectedCount} (expected: 1)`);
  
  const test1Pass = disconnectCount === 1 && connectedCount === 1;
  console.log(`  - Test 1: ${test1Pass ? 'PASSED' : 'FAILED'}`);

  // Reset counters
  disconnectCount = 0;
  connectedCount = 0;

  console.log('\nTest 2: Simulating process shutdown events...\n');
  
  // Create another client
  const client2 = new OfficialQRWCClient({
    host: 'test2.local',
    port: 443,
    enableAutoReconnect: false
  });

  // Simulate multiple beforeExit events
  for (let i = 0; i < 50; i++) {
    process.emit('beforeExit', 0);
  }

  // Wait for event processing
  await new Promise(resolve => setTimeout(resolve, 100));

  console.log(`\n✅ Test 2 Results:`);
  console.log(`  - "Disconnecting" logs: ${disconnectCount} (expected: 1)`);
  console.log(`  - "Disconnected successfully" logs: ${connectedCount} (expected: 1)`);
  
  const test2Pass = disconnectCount === 1 && connectedCount === 1;
  console.log(`  - Test 2: ${test2Pass ? 'PASSED' : 'FAILED'}`);

  // Restore console.log
  console.log = originalLog;

  console.log('\n===========================================');
  console.log(`Overall: ${test1Pass && test2Pass ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  console.log('BUG-046 Fix Verification Complete\n');

  process.exit(test1Pass && test2Pass ? 0 : 1);
}

// Run the test
testMultipleDisconnects().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});