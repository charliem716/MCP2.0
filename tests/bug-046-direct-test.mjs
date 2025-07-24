#!/usr/bin/env node

// Direct test that patches the logger to count calls
import { OfficialQRWCClient } from '../dist/src/qrwc/officialClient.js';

let disconnectCount = 0;
let successCount = 0;

// Test the disconnect behavior directly
const client = new OfficialQRWCClient({
  host: 'test.local',
  port: 443,
  enableAutoReconnect: false,
});

// Access the private logger property to count calls
const clientAny = client;
if (clientAny.logger) {
  const originalInfo = clientAny.logger.info;
  clientAny.logger.info = function (message, ...args) {
    if (message.includes('Disconnecting from Q-SYS Core')) {
      disconnectCount++;
    }
    if (message.includes('Disconnected successfully')) {
      successCount++;
    }
    originalInfo.call(this, message, ...args);
  };
}

console.log('=== BUG-046 Direct Test ===\n');
console.log('Calling disconnect() 100 times...');

// Call disconnect 100 times - should only log once
for (let i = 0; i < 100; i++) {
  client.disconnect();
}

console.log(`\nResults:`);
console.log(`- "Disconnecting" calls: ${disconnectCount}`);
console.log(`- "Disconnected successfully" calls: ${successCount}`);

const expectedDisconnect = 1;
const expectedSuccess = 1;

if (
  disconnectCount === expectedDisconnect &&
  successCount === expectedSuccess
) {
  console.log(`\n✅ PASSED: Bug is fixed! Only logged once despite 100 calls.`);
} else {
  console.log(
    `\n❌ FAILED: Expected ${expectedDisconnect} disconnect and ${expectedSuccess} success, got ${disconnectCount} and ${successCount}`
  );
}

// Test 2: Check state after disconnect
console.log('\nTest 2: Verifying shutdownInProgress flag...');
console.log(`- shutdownInProgress: ${clientAny.shutdownInProgress}`);
console.log(`- connectionState: ${clientAny.connectionState}`);

process.exit(disconnectCount === 1 ? 0 : 1);
