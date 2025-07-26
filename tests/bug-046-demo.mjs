#!/usr/bin/env node

// Direct test of the actual bug fix without mocking complexities
console.log('=== BUG-046 Demonstration Test ===\n');

// Set environment to allow logging
delete process.env.NODE_ENV;
process.env.LOG_LEVEL = 'info';

import { OfficialQRWCClient } from '../dist/src/qrwc/officialClient.js';

let logCount = 0;
const originalWrite = process.stdout.write;
process.stdout.write = function (chunk, encoding, callback) {
  const str = chunk.toString();
  if (
    str.includes('Disconnecting from Q-SYS Core') ||
    str.includes('Disconnected successfully')
  ) {
    logCount++;
  }
  return originalWrite.call(this, chunk, encoding, callback);
};

async function demonstrateFix() {
  console.log('Creating client and calling disconnect 100 times...\n');

  const client = new OfficialQRWCClient({
    host: 'demo.local',
    port: 443,
    enableAutoReconnect: false,
  });

  // Force connected state using reflection
  const keys = Object.getOwnPropertyNames(client);
  const stateKey = keys.find(k => k.includes('connectionState'));
  if (stateKey) {
    client[stateKey] = 2; // CONNECTED
  }

  // Reset counter
  logCount = 0;

  // Call disconnect multiple times
  for (let i = 0; i < 100; i++) {
    client.disconnect();
  }

  // Wait for any async operations
  await new Promise(resolve => setTimeout(resolve, 100));

  console.log(`\nResults:`);
  console.log(`- Disconnect log messages: ${logCount}`);
  console.log(`- Expected: 2 or less`);
  console.log(
    `- Result: ${logCount <= 2 ? '✅ PASS - No excessive logging!' : '❌ FAIL - Excessive logging detected'}`
  );

  // Test the flag reset
  console.log(`\nChecking shutdownInProgress flag...`);
  const flagKey = keys.find(k => k.includes('shutdownInProgress'));
  if (flagKey) {
    console.log(`- shutdownInProgress after disconnect: ${client[flagKey]}`);
    console.log(`- Expected: false`);
    console.log(
      `- Result: ${!client[flagKey] ? '✅ PASS - Flag properly reset!' : '❌ FAIL - Flag not reset'}`
    );
  }

  process.stdout.write = originalWrite;
  process.exit(logCount <= 2 ? 0 : 1);
}

demonstrateFix().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
