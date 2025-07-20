#!/usr/bin/env node

/**
 * BUG-031 Verification: Control.Get and Control.Set Method Aliases
 * 
 * This integration test verifies that the adapter correctly handles
 * Control.Get and Control.Set method names as documented in the Q-SYS API.
 */

import { QRWCClientAdapter } from '../../dist/mcp/qrwc/adapter.js';

// Mock client that simulates a Q-SYS connection
class MockQRWCClient {
  constructor() {
    this.connected = true;
    this.components = {
      'MainGain': {
        controls: {
          'gain': { state: { Value: -12, String: '-12dB' } },
          'mute': { state: { Value: 0, String: 'false' } }
        }
      }
    };
    this.setControlValueCalls = [];
  }

  isConnected() {
    return this.connected;
  }

  getQrwc() {
    return { components: this.components };
  }

  async setControlValue(componentName, controlName, value) {
    this.setControlValueCalls.push({ componentName, controlName, value });
    // Update the mock state
    if (this.components[componentName]?.controls?.[controlName]) {
      this.components[componentName].controls[controlName].state.Value = value;
      this.components[componentName].controls[controlName].state.String = String(value);
    }
    return Promise.resolve();
  }
}

async function runTests() {
  console.log('🧪 BUG-031 Verification: Testing Control.Get and Control.Set Method Aliases\n');
  
  const mockClient = new MockQRWCClient();
  const adapter = new QRWCClientAdapter(mockClient);
  
  let allTestsPassed = true;

  // Test 1: Control.Get method works
  console.log('1️⃣ Testing Control.Get method...');
  try {
    const getResult = await adapter.sendCommand('Control.Get', {
      Controls: ['MainGain.gain', 'MainGain.mute']
    });
    
    if (getResult.result && getResult.result.length === 2) {
      console.log('   ✅ Control.Get returned expected results');
      console.log('   📊 Results:', JSON.stringify(getResult.result, null, 2));
    } else {
      console.log('   ❌ Control.Get did not return expected results');
      allTestsPassed = false;
    }
  } catch (error) {
    console.log('   ❌ Control.Get failed:', error.message);
    allTestsPassed = false;
  }

  // Test 2: Control.Set method works
  console.log('\n2️⃣ Testing Control.Set method...');
  try {
    const setResult = await adapter.sendCommand('Control.Set', {
      Controls: [{
        Name: 'MainGain.gain',
        Value: -6
      }]
    });
    
    if (mockClient.setControlValueCalls.length === 1 &&
        mockClient.setControlValueCalls[0].value === -6) {
      console.log('   ✅ Control.Set correctly called setControlValue');
      console.log('   📊 Set call:', mockClient.setControlValueCalls[0]);
    } else {
      console.log('   ❌ Control.Set did not call setControlValue correctly');
      allTestsPassed = false;
    }
  } catch (error) {
    console.log('   ❌ Control.Set failed:', error.message);
    allTestsPassed = false;
  }

  // Test 3: Verify Control.Get and Control.GetValues produce identical results
  console.log('\n3️⃣ Testing Control.Get vs Control.GetValues equivalence...');
  try {
    const params = { Controls: ['MainGain.gain'] };
    const getResult = await adapter.sendCommand('Control.Get', params);
    const getValuesResult = await adapter.sendCommand('Control.GetValues', params);
    
    if (JSON.stringify(getResult) === JSON.stringify(getValuesResult)) {
      console.log('   ✅ Control.Get and Control.GetValues produce identical results');
    } else {
      console.log('   ❌ Control.Get and Control.GetValues produce different results');
      console.log('   Control.Get:', JSON.stringify(getResult));
      console.log('   Control.GetValues:', JSON.stringify(getValuesResult));
      allTestsPassed = false;
    }
  } catch (error) {
    console.log('   ❌ Equivalence test failed:', error.message);
    allTestsPassed = false;
  }

  // Test 4: Verify Control.Set and Control.SetValues produce identical results
  console.log('\n4️⃣ Testing Control.Set vs Control.SetValues equivalence...');
  try {
    mockClient.setControlValueCalls = []; // Reset
    
    const params = { Controls: [{ Name: 'MainGain.mute', Value: 1 }] };
    await adapter.sendCommand('Control.Set', params);
    const setCalls = mockClient.setControlValueCalls.length;
    
    await adapter.sendCommand('Control.SetValues', params);
    const setValuesCalls = mockClient.setControlValueCalls.length - setCalls;
    
    if (setCalls === 1 && setValuesCalls === 1 &&
        mockClient.setControlValueCalls[0].value === mockClient.setControlValueCalls[1].value) {
      console.log('   ✅ Control.Set and Control.SetValues work identically');
    } else {
      console.log('   ❌ Control.Set and Control.SetValues behave differently');
      allTestsPassed = false;
    }
  } catch (error) {
    console.log('   ❌ Equivalence test failed:', error.message);
    allTestsPassed = false;
  }

  // Final result
  console.log('\n' + '='.repeat(60));
  if (allTestsPassed) {
    console.log('✅ BUG-031 VERIFIED: All Control.Get/Set alias tests passed!');
    console.log('The adapter correctly handles the standard API method names.');
  } else {
    console.log('❌ BUG-031 FAILED: Some tests did not pass.');
    console.log('The adapter may not be handling method aliases correctly.');
  }
  console.log('='.repeat(60));
  
  process.exit(allTestsPassed ? 0 : 1);
}

// Run the tests
runTests().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});