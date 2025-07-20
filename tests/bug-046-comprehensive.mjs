#!/usr/bin/env node

import { OfficialQRWCClient } from '../dist/src/qrwc/officialClient.js';
import { ConnectionState } from '../dist/src/shared/types/common.js';

console.log('=== BUG-046 Comprehensive Verification Test ===\n');

// Capture all console output
let allLogs = [];
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = console.error = (...args) => {
  const msg = args.join(' ');
  allLogs.push(msg);
};

// Set Winston to output to console
process.env.LOG_LEVEL = 'info';
process.env.NODE_ENV = 'test';

// Restore console for our output
console.log = originalConsoleLog;

async function testExcessiveLogging() {
  console.log('Test 1: Multiple disconnect calls on connected client');
  
  const client = new OfficialQRWCClient({
    host: 'test.local',
    port: 443,
    enableAutoReconnect: false
  });
  
  // Access private properties via prototype manipulation
  Object.defineProperty(client, 'connectionState', {
    value: ConnectionState.CONNECTED,
    writable: true,
    configurable: true
  });
  
  // Clear logs
  allLogs = [];
  
  // Call disconnect 1000 times
  for (let i = 0; i < 1000; i++) {
    client.disconnect();
  }
  
  // Count disconnect messages
  const disconnectingCount = allLogs.filter(log => log.includes('Disconnecting from Q-SYS Core')).length;
  const disconnectedCount = allLogs.filter(log => log.includes('Disconnected successfully')).length;
  
  console.log(`- "Disconnecting" messages: ${disconnectingCount}`);
  console.log(`- "Disconnected successfully" messages: ${disconnectedCount}`);
  console.log(`- Total logs: ${allLogs.length}`);
  
  const test1Pass = disconnectingCount === 1 && disconnectedCount === 1;
  console.log(`- Result: ${test1Pass ? '✅ PASS' : '❌ FAIL'}`);
  
  // Test 2: Verify flag is reset
  console.log('\nTest 2: Verify shutdownInProgress flag is reset');
  
  const client2 = new OfficialQRWCClient({
    host: 'test2.local',
    port: 443,
    enableAutoReconnect: false
  });
  
  Object.defineProperty(client2, 'connectionState', {
    value: ConnectionState.CONNECTED,
    writable: true,
    configurable: true
  });
  client2.disconnect();
  
  // Check private property
  const flagReset = !client2['shutdownInProgress'];
  console.log(`- Flag reset after disconnect: ${flagReset ? '✅ YES' : '❌ NO'}`);
  
  // Test 3: Process events
  console.log('\nTest 3: Process shutdown events');
  
  const client3 = new OfficialQRWCClient({
    host: 'test3.local',
    port: 443,
    enableAutoReconnect: false
  });
  
  Object.defineProperty(client3, 'connectionState', {
    value: ConnectionState.CONNECTED,
    writable: true,
    configurable: true
  });
  allLogs = [];
  
  // Simulate multiple beforeExit events
  for (let i = 0; i < 100; i++) {
    process.emit('beforeExit', 0);
  }
  
  const processEventLogs = allLogs.filter(log => 
    log.includes('Disconnecting from Q-SYS Core') || 
    log.includes('Disconnected successfully')
  ).length;
  
  console.log(`- Disconnect logs from process events: ${processEventLogs}`);
  const test3Pass = processEventLogs <= 2;
  console.log(`- Result: ${test3Pass ? '✅ PASS' : '❌ FAIL'}`);
  
  // Overall result
  const allPass = test1Pass && flagReset && test3Pass;
  console.log(`\n${allPass ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}: BUG-046 is ${allPass ? 'fixed' : 'not fully fixed'}`);
  
  process.exit(allPass ? 0 : 1);
}

testExcessiveLogging().catch(console.error);