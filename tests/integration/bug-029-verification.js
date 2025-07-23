#!/usr/bin/env node

/**
 * BUG-029 Verification Test
 * Tests control value validation in QRWC adapter
 */

import { QRWCClientAdapter } from '../../dist/mcp/qrwc/adapter.js';

// Mock client
class MockQRWCClient {
  constructor() {
    this.calls = [];
  }

  isConnected() {
    return true;
  }

  async setControlValue(component, control, value) {
    this.calls.push({ component, control, value });
    return { success: true };
  }

  getQrwc() {
    return {
      components: {
        'Mixer': {
          controls: {
            'gain': { state: 0, type: 'Number', min: -100, max: 10 },
            'mute': { state: 0, type: 'Boolean' },
            'label': { state: 'Test', type: 'String', maxLength: 32 }
          }
        },
        'Unknown': {
          controls: {
            'noType': { state: 42 } // No type info
          }
        }
      }
    };
  }

  getCalls() {
    return this.calls;
  }

  clearCalls() {
    this.calls = [];
  }
}

async function runTest(name, testFn) {
  console.log(`\n🧪 ${name}`);
  try {
    await testFn();
    console.log('✅ PASSED');
    return true;
  } catch (error) {
    console.log(`❌ FAILED: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('=== BUG-029 Verification Test ===');
  console.log('Testing control value validation\n');

  let passed = 0;
  let failed = 0;

  const mockClient = new MockQRWCClient();
  const adapter = new QRWCClientAdapter(mockClient);

  // Test 1: Boolean conversion
  if (await runTest('Boolean values converted to 0/1', async () => {
    mockClient.clearCalls();
    
    const result = await adapter.sendCommand('Control.SetValues', {
      Controls: [
        { Name: 'Mixer.mute', Value: true },
        { Name: 'Mixer.mute', Value: false }
      ]
    });
    
    console.log('Result:', JSON.stringify(result, null, 2));
    const calls = mockClient.getCalls();
    console.log('Calls:', calls);
    
    if (calls.length !== 2) throw new Error(`Expected 2 calls, got ${calls.length}`);
    if (calls[0].value !== 1) throw new Error(`Expected true->1, got ${calls[0].value}`);
    if (calls[1].value !== 0) throw new Error(`Expected false->0, got ${calls[1].value}`);
    
    if (!result.result.every(r => r.Result === 'Success')) {
      throw new Error(`Not all operations succeeded: ${  JSON.stringify(result.result)}`);
    }
  })) passed++; else failed++;

  // Test 2: Numeric range validation
  if (await runTest('Numeric values validated against range', async () => {
    mockClient.clearCalls();
    
    const result = await adapter.sendCommand('Control.SetValues', {
      Controls: [
        { Name: 'Mixer.gain', Value: 0 },      // Valid
        { Name: 'Mixer.gain', Value: -50 },    // Valid
        { Name: 'Mixer.gain', Value: 50 },     // Out of range (max: 10)
        { Name: 'Mixer.gain', Value: -200 }    // Out of range (min: -100)
      ]
    });
    
    const calls = mockClient.getCalls();
    if (calls.length !== 2) throw new Error(`Expected 2 valid calls, got ${calls.length}`);
    
    // Check results
    if (result.result[0].Result !== 'Success') throw new Error('Valid value 0 failed');
    if (result.result[1].Result !== 'Success') throw new Error('Valid value -50 failed');
    if (result.result[2].Result !== 'Error') throw new Error('Invalid value 50 should fail');
    if (result.result[3].Result !== 'Error') throw new Error('Invalid value -200 should fail');
    
    if (!result.result[2].Error.includes('above maximum')) {
      throw new Error('Expected "above maximum" error message');
    }
  })) passed++; else failed++;

  // Test 3: Type validation
  if (await runTest('Type validation prevents incorrect types', async () => {
    mockClient.clearCalls();
    
    const result = await adapter.sendCommand('Control.SetValues', {
      Controls: [
        { Name: 'Mixer.gain', Value: 'loud' },     // String to number
        { Name: 'Mixer.label', Value: 123 },       // Number to string - should be accepted
        { Name: 'Mixer.mute', Value: 'yes' }       // Invalid string to boolean
      ]
    });
    
    const calls = mockClient.getCalls();
    // Only the numeric->string conversion should succeed
    if (calls.length !== 1) throw new Error(`Expected 1 valid call, got ${calls.length}`);
    
    if (result.result[0].Result !== 'Error') throw new Error('String to number should fail');
    if (result.result[1].Result !== 'Success') throw new Error('Number to string should succeed');
    if (result.result[2].Result !== 'Error') throw new Error('Invalid boolean string should fail');
  })) passed++; else failed++;

  // Test 4: String length validation
  if (await runTest('String length validation', async () => {
    mockClient.clearCalls();
    
    const shortString = 'Valid';
    const longString = 'x'.repeat(50); // Exceeds maxLength: 32
    
    const result = await adapter.sendCommand('Control.SetValues', {
      Controls: [
        { Name: 'Mixer.label', Value: shortString },
        { Name: 'Mixer.label', Value: longString }
      ]
    });
    
    const calls = mockClient.getCalls();
    if (calls.length !== 1) throw new Error(`Expected 1 valid call, got ${calls.length}`);
    if (calls[0].value !== shortString) throw new Error('Short string should pass');
    
    if (result.result[0].Result !== 'Success') throw new Error('Valid string failed');
    if (result.result[1].Result !== 'Error') throw new Error('Too long string should fail');
    if (!result.result[1].Error.includes('too long')) {
      throw new Error('Expected "too long" error message');
    }
  })) passed++; else failed++;

  // Test 5: Controls without type info
  if (await runTest('Controls without type info pass through', async () => {
    mockClient.clearCalls();
    
    const result = await adapter.sendCommand('Control.SetValues', {
      Controls: [
        { Name: 'Unknown.noType', Value: 'anything' },
        { Name: 'Unknown.noType', Value: { complex: 'object' } }
      ]
    });
    
    const calls = mockClient.getCalls();
    if (calls.length !== 2) throw new Error(`Expected 2 calls, got ${calls.length}`);
    
    // Both should pass through without validation
    if (result.result[0].Result !== 'Success') throw new Error('First value should pass');
    if (result.result[1].Result !== 'Success') throw new Error('Second value should pass');
  })) passed++; else failed++;

  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);
  
  if (failed === 0) {
    console.log('\n🎉 BUG-029 is RESOLVED! Control value validation is working correctly.');
    process.exit(0);
  } else {
    console.log('\n⚠️  BUG-029 is NOT fully resolved. Some validation tests failed.');
    process.exit(1);
  }
}

// Run the tests
main().catch(error => {
  console.error('Test suite error:', error);
  process.exit(1);
});