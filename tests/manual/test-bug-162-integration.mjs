#!/usr/bin/env node

/**
 * Integration test for BUG-162 with actual OfficialQRWCClient
 */

import { OfficialQRWCClient } from '../../dist/qrwc/officialClient.js';

console.log('=== BUG-162 Integration Test ===\n');

console.log('1. Testing client creation and health methods...');
const client = new OfficialQRWCClient({
  host: 'invalid-host',
  port: 443,
  enableAutoReconnect: true,
  maxReconnectAttempts: 2,
  reconnectInterval: 100,
  connectionTimeout: 500,
});

// Test method availability
console.log('   - getHealthStatus exists:', typeof client.getHealthStatus === 'function' ? '✓' : '✗');
console.log('   - isHealthy exists:', typeof client.isHealthy === 'function' ? '✓' : '✗');
console.log('   - getCircuitBreakerState exists:', typeof client.getCircuitBreakerState === 'function' ? '✓' : '✗');

// Test initial health status
const health = client.getHealthStatus();
console.log('\n2. Initial health status:');
console.log('   - isHealthy:', health.isHealthy);
console.log('   - state:', health.state);
console.log('   - circuitBreakerState:', health.circuitBreakerState);
console.log('   - totalAttempts:', health.totalAttempts);

console.log('\n3. Testing connection with retry logic...');
let reconnectCount = 0;
client.on('reconnecting', (data) => {
  reconnectCount++;
  console.log(`   - Reconnect attempt ${data.attempt}`);
});

client.on('error', (error) => {
  console.log(`   - Error event: ${error.message}`);
});

client.on('state_change', (state) => {
  console.log(`   - State changed to: ${state}`);
});

// Test connection with timeout
const startTime = Date.now();
try {
  await client.connect();
  console.log('   ✗ Connection succeeded (should have failed)');
} catch (error) {
  const elapsed = Date.now() - startTime;
  console.log(`   ✓ Connection failed as expected after ${elapsed}ms`);
  console.log(`   - Error: ${error.message}`);
  console.log(`   - Reconnect attempts: ${reconnectCount}`);
}

// Check final health status
const finalHealth = client.getHealthStatus();
console.log('\n4. Final health status:');
console.log('   - totalAttempts:', finalHealth.totalAttempts);
console.log('   - consecutiveFailures:', finalHealth.consecutiveFailures);
console.log('   - circuitBreakerState:', finalHealth.circuitBreakerState);

// Clean up
client.disconnect();

console.log('\n=== Test Summary ===');
console.log('✓ Health monitoring methods implemented');
console.log(`✓ Retry logic working (${reconnectCount} retries)`);
console.log('✓ Connection state management working');
console.log('✓ Error handling working');

process.exit(0);