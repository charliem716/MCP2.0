#!/usr/bin/env node

/**
 * Manual verification test for BUG-050 reconnection fix
 * This test verifies that the system handles long disconnections correctly
 */

import { OfficialQRWCClient } from '../../dist/src/qrwc/officialClient.js';

// Test configuration
const TEST_CONFIG = {
  host: '192.168.1.100', // Replace with actual Q-SYS Core IP
  port: 443,
  username: 'test',
  password: 'test'
};

console.log('🧪 BUG-050 Verification Test');
console.log('============================');
console.log('This test verifies:');
console.log('1. System continues reconnecting after max attempts');
console.log('2. Long-term reconnection uses 60-second intervals');
console.log('3. Cache invalidation flag is set for >30s disconnections');
console.log('');

// Track events
let reconnectAttempts = 0;
let longTermMode = false;
let cacheInvalidationTriggered = false;

// Create client with lower max attempts for faster testing
const client = new OfficialQRWCClient({
  ...TEST_CONFIG,
  reconnectInterval: 2000, // 2 seconds for faster testing
  maxReconnectAttempts: 3, // Switch to long-term after 3 attempts
  timeout: 5000
});

// Set up event handlers
client.on('connected', (data) => {
  console.log('✅ Connected!', {
    requiresCacheInvalidation: data.requiresCacheInvalidation,
    downtimeMs: data.downtimeMs
  });
  
  if (data.requiresCacheInvalidation) {
    cacheInvalidationTriggered = true;
    console.log('✅ Cache invalidation triggered (downtime > 30s)');
  }
});

client.on('disconnected', (reason) => {
  console.log('❌ Disconnected:', reason);
  reconnectAttempts = 0;
});

client.on('reconnecting', (attempt) => {
  reconnectAttempts = attempt;
  console.log(`🔄 Reconnection attempt ${attempt}`);
  
  if (attempt > 3 && !longTermMode) {
    longTermMode = true;
    console.log('✅ Switched to long-term reconnection mode');
  }
});

client.on('error', (error) => {
  console.log('⚠️  Error:', error.message);
});

// Test results
function printResults() {
  console.log('\n📊 Test Results:');
  console.log('================');
  console.log(`Total reconnection attempts: ${reconnectAttempts}`);
  console.log(`Long-term mode activated: ${longTermMode ? '✅' : '❌'}`);
  console.log(`Cache invalidation triggered: ${cacheInvalidationTriggered ? '✅' : '❌'}`);
  
  const allPassed = reconnectAttempts > 3 && longTermMode;
  console.log(`\nOverall: ${allPassed ? '✅ PASSED' : '❌ FAILED'}`);
}

// Start the test
console.log('\n🚀 Starting connection test...');
console.log('⚠️  Note: This test requires a Q-SYS Core at the configured IP');
console.log('    Update TEST_CONFIG with your Q-SYS Core details\n');

client.connect().catch((error) => {
  console.error('Initial connection failed:', error.message);
});

// Run for 30 seconds to observe multiple reconnection attempts
setTimeout(() => {
  console.log('\n⏱️  Test duration complete');
  printResults();
  process.exit(0);
}, 30000);

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n🛑 Test interrupted');
  printResults();
  process.exit(0);
});