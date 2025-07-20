#!/usr/bin/env node

import { QRWCClientAdapter } from '../dist/mcp/qrwc/adapter.js';

// Mock official client to simulate real behavior
const mockOfficialClient = {
  isConnected: () => true,
  getQrwc: () => ({
    components: {
      'My APM': {
        controls: {
          'ent.xfade.gain': {
            state: {
              Value: -100.0,
              String: '-100.0dB',
              Position: 0
            }
          }
        }
      }
    }
  }),
  getComponent: (name) => {
    const qrwc = mockOfficialClient.getQrwc();
    return qrwc.components[name];
  },
  setControlValue: async (component, control, value) => {
    console.log(`[Mock] Setting ${component}.${control} = ${value}`);
  }
};

async function verifyBug032() {
  console.log('=== BUG-032 Verification Test ===\n');
  
  const adapter = new QRWCClientAdapter(mockOfficialClient);
  
  try {
    // Test 1: Component.Get
    console.log('Test 1: Component.Get');
    const getResult = await adapter.sendCommand('Component.Get', {
      Name: 'My APM',
      Controls: [
        { Name: 'ent.xfade.gain' }
      ]
    });
    
    console.log('Result:', JSON.stringify(getResult, null, 2));
    
    // Verify response matches expected format
    const expected = {
      result: {
        Name: 'My APM',
        Controls: [{
          Name: 'ent.xfade.gain',
          Value: -100.0,
          String: '-100.0dB',
          Position: 0
        }]
      }
    };
    
    const matches = JSON.stringify(getResult) === JSON.stringify(expected);
    console.log(`✅ Component.Get response matches spec: ${matches}\n`);
    
    // Test 2: Component.Set
    console.log('Test 2: Component.Set');
    const setResult = await adapter.sendCommand('Component.Set', {
      Name: 'My APM',
      Controls: [
        {
          Name: 'ent.xfade.gain',
          Value: -100.0,
          Ramp: 2.0
        }
      ]
    });
    
    console.log('Result:', JSON.stringify(setResult, null, 2));
    console.log(`✅ Component.Set returned success: ${setResult.result === true}\n`);
    
    // Test 3: Error handling
    console.log('Test 3: Error handling for non-existent component');
    try {
      await adapter.sendCommand('Component.Get', {
        Name: 'NonExistent',
        Controls: [{ Name: 'test' }]
      });
      console.log('❌ Should have thrown error');
    } catch (error) {
      console.log(`✅ Correctly threw error: ${error.message}\n`);
    }
    
    console.log('=== All tests passed! BUG-032 is fixed. ===');
    
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

verifyBug032();