#!/usr/bin/env node

import { OfficialQRWCClient } from '../dist/src/qrwc/officialClient.js';
import { ConnectionState } from '../dist/src/shared/types/common.js';
import { createLogger } from '../dist/src/shared/utils/logger.js';

console.log('=== BUG-046 Final Verification Test ===\n');

// Create a custom logger to capture logs
let capturedLogs = [];
const testLogger = createLogger({
  service: 'test',
  metadata: {},
});

// Intercept logger output
const originalLoggerInfo = testLogger.info;
const originalLoggerError = testLogger.error;
testLogger.info = function (message, ...args) {
  capturedLogs.push({ level: 'info', message });
  return originalLoggerInfo.call(this, message, ...args);
};
testLogger.error = function (message, ...args) {
  capturedLogs.push({ level: 'error', message });
  return originalLoggerError.call(this, message, ...args);
};

// Patch OfficialQRWCClient to use our test logger
import { OfficialQRWCClient as OriginalClient } from '../dist/src/qrwc/officialClient.js';

class TestableClient extends OriginalClient {
  constructor(options) {
    super(options);
    this.logger = testLogger;
    // Expose private properties for testing
    this._connectionState = ConnectionState.CONNECTED;
  }

  get connectionState() {
    return this._connectionState;
  }

  set connectionState(value) {
    this._connectionState = value;
  }

  setState(state) {
    this._connectionState = state;
  }
}

async function runTests() {
  console.log(
    'Test 1: Verify no excessive logging on multiple disconnect calls'
  );

  const client = new TestableClient({
    host: 'test.local',
    port: 443,
    enableAutoReconnect: false,
  });

  // Clear logs
  capturedLogs = [];

  // Call disconnect 1000 times
  for (let i = 0; i < 1000; i++) {
    client.disconnect();
  }

  const disconnectLogs = capturedLogs.filter(
    log =>
      log.message.includes('Disconnecting') ||
      log.message.includes('Disconnected')
  );

  console.log(`- Total disconnect logs: ${disconnectLogs.length}`);
  console.log(`- Expected: 2 (one "Disconnecting", one "Disconnected")`);

  const test1Pass = disconnectLogs.length === 2;
  console.log(`- Result: ${test1Pass ? '✅ PASS' : '❌ FAIL'}`);

  if (disconnectLogs.length > 0) {
    console.log('- Log messages:');
    disconnectLogs.forEach((log, i) => {
      console.log(`  ${i + 1}. ${log.message}`);
    });
  }

  // Test 2: Verify shutdownInProgress flag behavior
  console.log('\nTest 2: Verify shutdownInProgress flag is properly managed');

  const client2 = new TestableClient({
    host: 'test2.local',
    port: 443,
    enableAutoReconnect: false,
  });

  // Before disconnect
  const flagBeforeDisconnect = client2.shutdownInProgress;
  console.log(
    `- Flag before disconnect: ${flagBeforeDisconnect} (expected: false)`
  );

  // During first call (need to check inside disconnect method)
  // After disconnect
  client2.disconnect();
  const flagAfterDisconnect = client2.shutdownInProgress;
  console.log(
    `- Flag after disconnect: ${flagAfterDisconnect} (expected: false)`
  );

  const test2Pass = !flagBeforeDisconnect && !flagAfterDisconnect;
  console.log(`- Result: ${test2Pass ? '✅ PASS' : '❌ FAIL'}`);

  // Overall result
  const allPass = test1Pass && test2Pass;
  console.log(`\n${allPass ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  console.log(`BUG-046 is ${allPass ? 'FIXED' : 'NOT FULLY FIXED'}`);

  process.exit(allPass ? 0 : 1);
}

runTests().catch(console.error);
