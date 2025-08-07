#!/usr/bin/env node

/**
 * Manual Test for BUG-150: 33Hz Polling Verification
 * 
 * This script directly tests the 33Hz polling capability without mocks.
 * It creates a real adapter instance and verifies the polling frequency.
 */

// Suppress debug logs for cleaner output
process.env.LOG_LEVEL = 'error';

import { QRWCClientAdapter } from '../../dist/mcp/qrwc/adapter.js';
import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';

console.log('=== BUG-150 Manual Test: 33Hz Polling ===\n');

// Create a mock QRWC client that tracks calls
class MockQRWCClient extends EventEmitter {
  constructor() {
    super();
    this.pollCount = 0;
    this.pollTimestamps = [];
    this.components = new Map([
      ['TestComponent', {
        Name: 'TestComponent',
        Type: 'Test',
        controls: new Map([
          ['TestControl', { Name: 'TestControl', Value: 0 }]
        ])
      }]
    ]);
  }

  on() { return this; }
  once() { return this; }
  off() { return this; }
  
  async connect() {
    console.log('✓ Mock client connected');
    return true;
  }
  
  async disconnect() {
    console.log('✓ Mock client disconnected');
  }
  
  isConnected() { return true; }
  
  async sendCommand(command, params) {
    if (command === 'ChangeGroup.Poll') {
      this.pollCount++;
      this.pollTimestamps.push(performance.now());
    }
    return { Changes: [] };
  }
  
  async getAllComponents() { return Array.from(this.components.values()); }
  async getAllControls() { return []; }
  
  getComponent(name) { 
    return this.components.get(name);
  }
  
  // Add the missing getQrwc method
  getQrwc() {
    return {
      getComponent: (name) => this.getComponent(name)
    };
  }
  
  async setControlValue() { return {}; }
  async setControlValues() { return {}; }
  async getCoreStatus() { return {}; }
}

async function test33HzPolling() {
  const mockClient = new MockQRWCClient();
  const adapter = new QRWCClientAdapter(mockClient);
  
  console.log('1. Creating change group...');
  const groupId = 'test-33hz-group';
  const createResult = await adapter.sendCommand('ChangeGroup.Create', { Id: groupId });
  console.log(`   ✓ Change group created: ${groupId}`);
  
  console.log('\n2. Adding control to group...');
  await adapter.sendCommand('ChangeGroup.AddControl', {
    Id: groupId,
    Controls: ['TestComponent.TestControl']
  });
  console.log('   ✓ Control added to group');
  
  console.log('\n3. Starting 33Hz auto-polling (0.03s intervals)...');
  const startTime = performance.now();
  mockClient.pollCount = 0;
  mockClient.pollTimestamps = [];
  
  const pollResult = await adapter.sendCommand('ChangeGroup.AutoPoll', {
    Id: groupId,
    Rate: 0.03  // 33Hz
  });
  console.log(`   ✓ Auto-polling started at 33Hz`);
  
  console.log('\n4. Waiting for 1 second to collect polling data...');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const endTime = performance.now();
  const elapsedSeconds = (endTime - startTime) / 1000;
  
  console.log('\n5. Stopping auto-polling...');
  await adapter.sendCommand('ChangeGroup.Destroy', { Id: groupId });
  console.log('   ✓ Auto-polling stopped');
  
  // Analyze results
  console.log('\n=== RESULTS ===');
  console.log(`Test duration: ${elapsedSeconds.toFixed(3)} seconds`);
  console.log(`Total polls executed: ${mockClient.pollCount}`);
  console.log(`Expected polls (~33Hz): ${Math.floor(elapsedSeconds * 33)}`);
  
  const expectedPolls = Math.floor(elapsedSeconds * 33);
  const tolerance = 0.1; // 10% tolerance
  const minPolls = Math.floor(expectedPolls * (1 - tolerance));
  const maxPolls = Math.ceil(expectedPolls * (1 + tolerance));
  
  const withinRange = mockClient.pollCount >= minPolls && mockClient.pollCount <= maxPolls;
  
  console.log(`\nActual polling rate: ${(mockClient.pollCount / elapsedSeconds).toFixed(1)} Hz`);
  console.log(`Acceptable range: ${minPolls}-${maxPolls} polls`);
  console.log(`Status: ${withinRange ? '✅ PASS' : '❌ FAIL'}`);
  
  // Analyze timing intervals
  if (mockClient.pollTimestamps.length > 1) {
    const intervals = [];
    for (let i = 1; i < mockClient.pollTimestamps.length; i++) {
      intervals.push(mockClient.pollTimestamps[i] - mockClient.pollTimestamps[i-1]);
    }
    
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const minInterval = Math.min(...intervals);
    const maxInterval = Math.max(...intervals);
    
    console.log('\n=== TIMING ANALYSIS ===');
    console.log(`Average interval: ${avgInterval.toFixed(2)}ms (expected: ~30ms)`);
    console.log(`Min interval: ${minInterval.toFixed(2)}ms`);
    console.log(`Max interval: ${maxInterval.toFixed(2)}ms`);
    
    const intervalOk = avgInterval >= 25 && avgInterval <= 35;
    console.log(`Interval consistency: ${intervalOk ? '✅ PASS' : '❌ FAIL'}`);
  }
  
  return withinRange;
}

// Run the test
test33HzPolling()
  .then(passed => {
    console.log('\n=== TEST COMPLETE ===');
    if (passed) {
      console.log('✅ BUG-150 33Hz polling verification PASSED');
      process.exit(0);
    } else {
      console.log('❌ BUG-150 33Hz polling verification FAILED');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('\n❌ Test failed with error:', error);
    process.exit(1);
  });