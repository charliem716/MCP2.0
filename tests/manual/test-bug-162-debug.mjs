#!/usr/bin/env node

/**
 * Debug test for BUG-162
 */

import { OfficialQRWCClient } from '../../dist/qrwc/officialClient.js';

console.log('=== BUG-162 Debug Test ===\n');

const client = new OfficialQRWCClient({
  host: 'invalid-host',
  port: 443,
  enableAutoReconnect: true,
  maxReconnectAttempts: 1,
  reconnectInterval: 100,
  connectionTimeout: 500,
});

console.log('Calling connect()...');

client.connect()
  .then(() => {
    console.log('✗ UNEXPECTED: connect() resolved successfully');
    process.exit(1);
  })
  .catch((error) => {
    console.log('✓ EXPECTED: connect() rejected with error');
    console.log('  Error type:', error.constructor.name);
    console.log('  Error message:', error.message);
    console.log('  Error code:', error.code);
    process.exit(0);
  });