#!/usr/bin/env node

/**
 * Final comprehensive test for BUG-162
 */

import { ConnectionManager } from '../../dist/qrwc/connection/ConnectionManager.js';

console.log('=== BUG-162 Final Verification ===\n');

// Test all expected behaviors from bug report
const expectedBehaviors = [
  'Automatic reconnection with exponential backoff',
  'Maximum retry limits',
  'Health status reporting',
  'Graceful degradation during outages',
  'Automatic recovery when connection restored'
];

console.log('Expected Behaviors Testing:\n');

// 1. Test exponential backoff
console.log('1. Testing exponential backoff...');
const cm = new ConnectionManager({
  maxRetries: 3,
  initialRetryDelay: 100,
  maxRetryDelay: 1000,
});

let retryDelays = [];
cm.on('retry', (attempt, delay) => {
  retryDelays.push({ attempt, delay });
});

let connectionFailed = false;
const failingConnect = async () => {
  throw new Error('Test connection failure');
};

try {
  await cm.connectWithRetry(failingConnect);
} catch (error) {
  connectionFailed = true;
}

console.log('   - Connection failed as expected:', connectionFailed ? '✓' : '✗');
console.log('   - Retry attempts:', retryDelays.length);
console.log('   - Exponential delays:', retryDelays.map(r => r.delay).join(', '));

// Verify exponential backoff (each delay should be ~2x previous)
let isExponential = true;
for (let i = 1; i < retryDelays.length; i++) {
  const ratio = retryDelays[i].delay / retryDelays[i-1].delay;
  if (ratio < 1.5 || ratio > 2.5) {
    isExponential = false;
    break;
  }
}
console.log('   - Exponential backoff verified:', isExponential ? '✓' : '✗');

// 2. Test maximum retry limits
console.log('\n2. Testing maximum retry limits...');
const health = cm.getHealthStatus();
console.log('   - Total attempts:', health.totalAttempts);
console.log('   - Max retries respected (3):', health.totalAttempts <= 4 ? '✓' : '✗');

// 3. Test health status reporting
console.log('\n3. Testing health status reporting...');
console.log('   - Health status available:', health ? '✓' : '✗');
console.log('   - Contains isHealthy:', 'isHealthy' in health ? '✓' : '✗');
console.log('   - Contains consecutiveFailures:', 'consecutiveFailures' in health ? '✓' : '✗');
console.log('   - Contains state:', 'state' in health ? '✓' : '✗');
console.log('   - Contains circuitBreakerState:', 'circuitBreakerState' in health ? '✓' : '✗');

// 4. Test circuit breaker for graceful degradation
console.log('\n4. Testing graceful degradation (circuit breaker)...');
const cm2 = new ConnectionManager({
  circuitBreakerThreshold: 2,
  circuitBreakerTimeout: 1000,
});

// Trigger multiple failures
for (let i = 0; i < 3; i++) {
  try {
    await cm2.connectWithRetry(failingConnect);
  } catch (error) {
    // Expected
  }
}

const cbState = cm2.getCircuitBreakerState();
console.log('   - Circuit breaker opened after threshold:', cbState === 'open' ? '✓' : '✗');

// Try to connect when circuit is open
let blockedByCircuit = false;
try {
  await cm2.connectWithRetry(failingConnect);
} catch (error) {
  blockedByCircuit = error.message.includes('Circuit breaker');
}
console.log('   - Blocks connections when open:', blockedByCircuit ? '✓' : '✗');

// 5. Test automatic recovery capability
console.log('\n5. Testing automatic recovery capability...');
const cm3 = new ConnectionManager({
  maxRetries: 2,
  initialRetryDelay: 50,
});

let successAfterFailures = false;
let attemptCount = 0;

const intermittentConnect = async () => {
  attemptCount++;
  if (attemptCount < 2) {
    throw new Error('Temporary failure');
  }
  // Success on second attempt
  successAfterFailures = true;
};

try {
  await cm3.connectWithRetry(intermittentConnect);
} catch (error) {
  // Should not fail if recovery works
}

console.log('   - Recovers after temporary failures:', successAfterFailures ? '✓' : '✗');
console.log('   - Final state:', cm3.getState());

// Summary
console.log('\n=== Test Results Summary ===\n');

const results = {
  'Exponential backoff': isExponential,
  'Maximum retry limits': health.totalAttempts <= 4,
  'Health status reporting': health && 'isHealthy' in health,
  'Circuit breaker (graceful degradation)': cbState === 'open' && blockedByCircuit,
  'Automatic recovery': successAfterFailures,
};

let allPassed = true;
for (const [feature, passed] of Object.entries(results)) {
  console.log(`${feature}: ${passed ? '✓ PASS' : '✗ FAIL'}`);
  if (!passed) allPassed = false;
}

console.log('\n=== BUG-162 Status ===');
if (allPassed) {
  console.log('✓ RESOLVED - All expected behaviors implemented');
} else {
  console.log('✗ STILL FAILING - Some features not working');
}

// Clean up
cm.disconnect();
cm2.disconnect();
cm3.disconnect();

process.exit(allPassed ? 0 : 1);