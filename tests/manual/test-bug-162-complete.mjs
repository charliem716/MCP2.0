#!/usr/bin/env node

/**
 * Complete test for BUG-162 - Verifies all expected behaviors
 */

import { OfficialQRWCClient } from '../../dist/qrwc/officialClient.js';
import { ConnectionManager } from '../../dist/qrwc/connection/ConnectionManager.js';

console.log('=== BUG-162 Complete Verification ===\n');

const tests = {
  passed: 0,
  failed: 0,
};

function test(name, result) {
  if (result) {
    console.log(`✓ ${name}`);
    tests.passed++;
  } else {
    console.log(`✗ ${name}`);
    tests.failed++;
  }
}

// Test 1: Health monitoring methods exist
console.log('1. Health Monitoring Methods:');
const client = new OfficialQRWCClient({
  host: 'test-host',
  port: 443,
});

test('getHealthStatus exists', typeof client.getHealthStatus === 'function');
test('isHealthy exists', typeof client.isHealthy === 'function');
test('getCircuitBreakerState exists', typeof client.getCircuitBreakerState === 'function');
test('checkHealth exists', typeof client.checkHealth === 'function');

const health = client.getHealthStatus();
test('Health status has correct structure', 
  health.hasOwnProperty('isHealthy') &&
  health.hasOwnProperty('state') &&
  health.hasOwnProperty('circuitBreakerState') &&
  health.hasOwnProperty('totalAttempts')
);

client.disconnect();

// Test 2: Exponential backoff
console.log('\n2. Exponential Backoff:');
const cm = new ConnectionManager({
  maxRetries: 3,
  initialRetryDelay: 100,
});

let retryDelays = [];
cm.on('retry', (attempt, delay) => {
  retryDelays.push(delay);
});

const failingConnect = async () => {
  throw new Error('Test failure');
};

try {
  await cm.connectWithRetry(failingConnect);
} catch (e) {
  // Expected
}

test('Retry attempts made', retryDelays.length === 3);
test('First retry delay ~100ms', retryDelays[0] >= 100 && retryDelays[0] <= 150);
test('Second retry delay ~200ms', retryDelays[1] >= 200 && retryDelays[1] <= 250);
test('Third retry delay ~400ms', retryDelays[2] >= 400 && retryDelays[2] <= 450);

cm.disconnect();

// Test 3: Circuit breaker
console.log('\n3. Circuit Breaker:');
const cm2 = new ConnectionManager({
  circuitBreakerThreshold: 2,
});

// Trigger failures
for (let i = 0; i < 3; i++) {
  try {
    await cm2.connectWithRetry(failingConnect);
  } catch (e) {
    // Expected
  }
}

test('Circuit breaker opens after threshold', cm2.getCircuitBreakerState() === 'open');

let blockedByCircuit = false;
try {
  await cm2.connectWithRetry(failingConnect);
} catch (error) {
  blockedByCircuit = error.message.includes('Circuit breaker');
}

test('Circuit breaker blocks when open', blockedByCircuit);

cm2.disconnect();

// Test 4: Connection promise rejection
console.log('\n4. Promise Rejection on Failure:');
const client2 = new OfficialQRWCClient({
  host: 'invalid-host',
  port: 443,
  enableAutoReconnect: true,
  maxReconnectAttempts: 1,
  reconnectInterval: 50,
});

let promiseRejected = false;
let errorReceived = null;

try {
  await client2.connect();
} catch (error) {
  promiseRejected = true;
  errorReceived = error;
}

test('connect() promise rejects on failure', promiseRejected);
test('Error has correct type', errorReceived && errorReceived.constructor.name === 'QSysError');
test('Error has correct code', errorReceived && errorReceived.code === 'QSYS_CONNECTION_FAILED');

client2.disconnect();

// Test 5: Automatic recovery
console.log('\n5. Automatic Recovery:');
const cm3 = new ConnectionManager({
  maxRetries: 2,
  initialRetryDelay: 50,
});

let attemptCount = 0;
let recovered = false;

const recoveringConnect = async () => {
  attemptCount++;
  if (attemptCount < 2) {
    throw new Error('Temporary failure');
  }
  recovered = true;
};

try {
  await cm3.connectWithRetry(recoveringConnect);
} catch (e) {
  // Should not throw if recovery works
}

test('Recovers after temporary failure', recovered);
test('Final state is connected', cm3.getState() === 'connected');

cm3.disconnect();

// Summary
console.log('\n=== Test Summary ===');
console.log(`Tests Passed: ${tests.passed}`);
console.log(`Tests Failed: ${tests.failed}`);

if (tests.failed === 0) {
  console.log('\n✅ BUG-162 FULLY RESOLVED - All expected behaviors implemented');
  process.exit(0);
} else {
  console.log('\n❌ BUG-162 STILL FAILING - Some features not working');
  process.exit(1);
}