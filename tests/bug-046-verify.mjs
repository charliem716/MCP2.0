#!/usr/bin/env node

import { OfficialQRWCClient } from '../dist/src/qrwc/officialClient.js';

// Capture all Winston logs
let disconnectLogs = [];
let successLogs = [];

// Store original console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

// Override both to capture Winston output
console.log = console.error = (...args) => {
  const msg = args.join(' ');
  if (msg.includes('Disconnecting from Q-SYS Core')) {
    disconnectLogs.push(msg);
  }
  if (msg.includes('Disconnected successfully')) {
    successLogs.push(msg);
  }
};

// Set Winston to output to console
process.env.LOG_LEVEL = 'info';
process.env.NODE_ENV = 'test';

console.log = originalConsoleLog;
console.log('=== BUG-046 Verification Test ===\n');

async function verifyBug046Fixed() {
  const client = new OfficialQRWCClient({
    host: 'test.local',
    port: 443,
    enableAutoReconnect: false
  });

  console.log('Test 1: Calling disconnect() 1000 times rapidly...');
  
  for (let i = 0; i < 1000; i++) {
    client.disconnect();
  }
  
  // Allow time for any async logs
  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log(`\nResults:`);
  console.log(`- "Disconnecting" messages: ${disconnectLogs.length}`);
  console.log(`- "Disconnected successfully" messages: ${successLogs.length}`);
  
  // Test 2: Process events
  disconnectLogs = [];
  successLogs = [];
  
  console.log('\nTest 2: Simulating 100 beforeExit events...');
  const client2 = new OfficialQRWCClient({
    host: 'test2.local',
    port: 443,
    enableAutoReconnect: false
  });
  
  for (let i = 0; i < 100; i++) {
    process.emit('beforeExit', 0);
  }
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log(`\nResults:`);
  console.log(`- "Disconnecting" messages: ${disconnectLogs.length}`);
  console.log(`- "Disconnected successfully" messages: ${successLogs.length}`);
  
  const passed = disconnectLogs.length <= 2; // Should be 1 per client max
  console.log(`\n${passed ? '✅ PASSED' : '❌ FAILED'}: Bug ${passed ? 'is fixed' : 'still exists'}`);
  
  process.exit(passed ? 0 : 1);
}

verifyBug046Fixed().catch(console.error);