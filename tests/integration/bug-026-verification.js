#!/usr/bin/env node

/**
 * BUG-026 Verification Test
 * Tests that retry logic works correctly in the QRWC adapter
 */

import { QRWCClientAdapter } from '../../dist/mcp/qrwc/adapter.js';

// Test results tracking
let testsPassed = 0;
let testsFailed = 0;

// Mock client that simulates transient failures
class MockQRWCClient {
  constructor() {
    this.failurePatterns = {};
    this.callCounts = {};
  }

  isConnected() {
    return true;
  }

  setFailurePattern(method, pattern) {
    this.failurePatterns[method] = pattern;
    this.callCounts[method] = 0;
  }

  async setControlValue(component, control, value) {
    const key = 'setControlValue';
    this.callCounts[key] = (this.callCounts[key] || 0) + 1;
    
    const pattern = this.failurePatterns[key];
    if (pattern && pattern.length >= this.callCounts[key]) {
      if (pattern[this.callCounts[key] - 1]) {
        const error = new Error('Connection timeout');
        error.code = 'ETIMEDOUT';
        throw error;
      }
    }
    
    return { success: true };
  }

  getQrwc() {
    const key = 'getQrwc';
    this.callCounts[key] = (this.callCounts[key] || 0) + 1;
    
    const pattern = this.failurePatterns[key];
    if (pattern && pattern.length >= this.callCounts[key]) {
      if (pattern[this.callCounts[key] - 1]) {
        const error = new Error('Network error');
        error.code = 'ECONNRESET';
        throw error;
      }
    }
    
    return {
      components: {
        'TestComponent': {
          controls: {
            'gain': { state: 0.5 },
            'mute': { state: false }
          }
        }
      }
    };
  }

  getCallCount(method) {
    return this.callCounts[method] || 0;
  }
}

async function runTest(name, testFn) {
  console.log(`\n🧪 ${name}`);
  try {
    await testFn();
    console.log('✅ PASSED');
    testsPassed++;
  } catch (error) {
    console.log(`❌ FAILED: ${error.message}`);
    testsFailed++;
  }
}

async function main() {
  console.log('=== BUG-026 Verification Test ===');
  console.log('Testing retry logic in QRWC Adapter\n');

  // Test 1: Top-level command retry
  await runTest('Top-level command retry on transient error', async () => {
    const mockClient = new MockQRWCClient();
    const adapter = new QRWCClientAdapter(mockClient);
    
    // Fail twice, succeed on third
    mockClient.setFailurePattern('getQrwc', [true, true, false]);
    
    const result = await adapter.sendCommand('Component.GetComponents', {}, {
      maxRetries: 3,
      retryDelay: 50
    });
    
    if (!result || !result.result) {
      throw new Error('No result returned');
    }
    
    const callCount = mockClient.getCallCount('getQrwc');
    if (callCount !== 3) {
      throw new Error(`Expected 3 calls, got ${callCount}`);
    }
  });

  // Test 2: Individual control operation retry
  await runTest('Individual control operation retry within Control.SetValues', async () => {
    const mockClient = new MockQRWCClient();
    const adapter = new QRWCClientAdapter(mockClient);
    
    // Fail first attempt, succeed on second
    mockClient.setFailurePattern('setControlValue', [true, false]);
    
    const result = await adapter.sendCommand('Control.SetValues', {
      Controls: [{
        Name: 'TestComponent.gain',
        Value: 0.75
      }]
    }, {
      maxRetries: 2,
      retryDelay: 50
    });
    
    if (!result || !result.result || result.result.length !== 1) {
      throw new Error('Invalid result structure');
    }
    
    if (result.result[0].Result !== 'Success') {
      throw new Error(`Expected Success, got ${result.result[0].Result}`);
    }
    
    const callCount = mockClient.getCallCount('setControlValue');
    if (callCount !== 2) {
      throw new Error(`Expected 2 calls, got ${callCount}`);
    }
  });

  // Test 3: Multiple controls with mixed success/failure
  await runTest('Multiple controls with transient failures', async () => {
    const mockClient = new MockQRWCClient();
    const adapter = new QRWCClientAdapter(mockClient);
    
    // First control succeeds, second fails then succeeds, third succeeds
    mockClient.setFailurePattern('setControlValue', [false, true, false, false]);
    
    const result = await adapter.sendCommand('Control.SetValues', {
      Controls: [
        { Name: 'TestComponent.gain', Value: 0.5 },
        { Name: 'TestComponent.mute', Value: true },
        { Name: 'TestComponent.level', Value: -6 }
      ]
    }, {
      maxRetries: 2,
      retryDelay: 50
    });
    
    if (!result || !result.result || result.result.length !== 3) {
      throw new Error('Invalid result structure');
    }
    
    // All should succeed
    for (let i = 0; i < 3; i++) {
      if (result.result[i].Result !== 'Success') {
        throw new Error(`Control ${i} failed: ${result.result[i].Result}`);
      }
    }
    
    const callCount = mockClient.getCallCount('setControlValue');
    if (callCount !== 4) { // 3 controls + 1 retry
      throw new Error(`Expected 4 calls, got ${callCount}`);
    }
  });

  // Test 4: Non-retryable errors should not retry
  await runTest('Non-retryable errors fail immediately', async () => {
    const mockClient = new MockQRWCClient();
    const adapter = new QRWCClientAdapter(mockClient);
    
    let nonRetryableCallCount = 0;
    
    // Override to throw non-retryable error
    mockClient.setControlValue = async () => {
      nonRetryableCallCount++;
      throw new Error('Invalid control name');
    };
    
    const result = await adapter.sendCommand('Control.SetValues', {
      Controls: [{
        Name: 'InvalidComponent.badControl',
        Value: 0
      }]
    }, {
      maxRetries: 3,
      retryDelay: 50
    });
    
    if (!result || !result.result || result.result.length !== 1) {
      throw new Error('Invalid result structure');
    }
    
    if (result.result[0].Result !== 'Error') {
      throw new Error(`Expected Error, got ${result.result[0].Result}`);
    }
    
    // Should only call once (no retries)
    if (nonRetryableCallCount !== 1) {
      throw new Error(`Expected 1 call (no retries), got ${nonRetryableCallCount}`);
    }
  });

  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`Total: ${testsPassed + testsFailed}`);
  
  if (testsFailed === 0) {
    console.log('\n🎉 BUG-026 is RESOLVED! All retry logic tests passed.');
    process.exit(0);
  } else {
    console.log('\n⚠️  BUG-026 is NOT fully resolved. Some tests failed.');
    process.exit(1);
  }
}

// Run the tests
main().catch(error => {
  console.error('Test suite error:', error);
  process.exit(1);
});