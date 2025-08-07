#!/usr/bin/env node

/**
 * Simplified Manual Test for BUG-150: 33Hz Polling
 * 
 * This test directly verifies the timer implementation without complex mocking.
 */

process.env.LOG_LEVEL = 'error';

import { QRWCClientAdapter } from '../../dist/mcp/qrwc/adapter.js';

console.log('=== BUG-150 Simplified 33Hz Test ===\n');

// Minimal mock that satisfies all requirements
const mockClient = {
  on: () => mockClient,
  once: () => mockClient,
  off: () => mockClient,
  emit: () => mockClient,
  isConnected: () => true,
  sendCommand: () => Promise.resolve({ Changes: [] }),
  getAllComponents: () => Promise.resolve([]),
  getAllControls: () => Promise.resolve([]),
  getComponent: () => ({ controls: new Map() }),
  getQrwc: () => ({ 
    getComponent: () => ({ controls: new Map() })
  })
};

let pollCount = 0;
const pollTimestamps = [];

async function test() {
  const adapter = new QRWCClientAdapter(mockClient);
  
  // Override the sendCommand to track polling
  const originalSend = adapter.sendCommand.bind(adapter);
  adapter.sendCommand = async (command, params) => {
    if (command === 'ChangeGroup.Poll') {
      pollCount++;
      pollTimestamps.push(Date.now());
    }
    return originalSend(command, params);
  };
  
  console.log('1. Testing 33Hz timer configuration...');
  
  // Directly call the internal handler to bypass validation
  const groupId = 'test-group';
  adapter['changeGroups'].set(groupId, { 
    id: groupId, 
    controls: ['TestControl'] 
  });
  
  // Start 33Hz polling
  const result = adapter['handleChangeGroupAutoPoll']({
    Id: groupId,
    Rate: 0.03  // 33Hz
  });
  
  console.log('   ✓ 33Hz auto-polling configured');
  console.log(`   Rate: ${result.result.Rate}s (${(1/result.result.Rate).toFixed(1)} Hz)`);
  
  // Wait for 1 second
  console.log('\n2. Collecting polling data for 1 second...');
  const startTime = Date.now();
  await new Promise(resolve => setTimeout(resolve, 1000));
  const elapsed = (Date.now() - startTime) / 1000;
  
  // Stop polling
  adapter['handleChangeGroupDestroy']({ Id: groupId });
  
  // Analyze results
  console.log('\n=== RESULTS ===');
  console.log(`Duration: ${elapsed.toFixed(3)}s`);
  console.log(`Polls executed: ${pollCount}`);
  console.log(`Expected polls: ~${Math.floor(elapsed * 33)}`);
  console.log(`Actual rate: ${(pollCount / elapsed).toFixed(1)} Hz`);
  
  // Check intervals
  if (pollTimestamps.length > 1) {
    const intervals = [];
    for (let i = 1; i < pollTimestamps.length; i++) {
      intervals.push(pollTimestamps[i] - pollTimestamps[i-1]);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    console.log(`\nAverage interval: ${avgInterval.toFixed(1)}ms`);
    console.log(`Min interval: ${Math.min(...intervals)}ms`);
    console.log(`Max interval: ${Math.max(...intervals)}ms`);
  }
  
  // Pass/Fail determination
  const expectedPolls = Math.floor(elapsed * 33);
  const tolerance = 0.15;
  const minPolls = Math.floor(expectedPolls * (1 - tolerance));
  const maxPolls = Math.ceil(expectedPolls * (1 + tolerance));
  
  const passed = pollCount >= minPolls && pollCount <= maxPolls;
  
  console.log(`\nAcceptable range: ${minPolls}-${maxPolls} polls`);
  console.log(`Status: ${passed ? '✅ PASS' : '❌ FAIL'}`);
  
  return passed;
}

test()
  .then(passed => {
    console.log('\n=== TEST COMPLETE ===');
    process.exit(passed ? 0 : 1);
  })
  .catch(error => {
    console.error('Test error:', error);
    process.exit(1);
  });