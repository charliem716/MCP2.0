/**
 * Integration test for BUG-035: Parameter Format Compatibility
 * 
 * This test verifies that the MCP tools work with both Q-SYS API spec
 * and current implementation parameter formats.
 */

import { QRWCClientAdapter } from '../../../dist/src/mcp/qrwc/adapter.js';

// Mock official client for testing
class MockOfficialClient {
  constructor() {
    this.connected = true;
    this.components = {
      'Main Gain': {
        controls: {
          'gain': { state: -10 },
          'mute': { state: 0 }
        }
      }
    };
  }

  isConnected() {
    return this.connected;
  }

  getQrwc() {
    return { components: this.components };
  }

  getComponent(name) {
    return this.components[name];
  }

  async setControlValue(componentName, controlName, value) {
    if (!componentName || !controlName) {
      // Handle named control format
      const fullName = componentName || controlName;
      const parts = fullName.split('.');
      if (parts.length === 2) {
        componentName = parts[0];
        controlName = parts[1];
      }
    }
    
    console.log(`Setting ${componentName}.${controlName} = ${value}`);
    
    if (this.components[componentName]?.controls?.[controlName]) {
      this.components[componentName].controls[controlName].state = value;
    }
  }

  async sendRawCommand(method, params) {
    return { result: { Platform: "Test", Version: "1.0.0" } };
  }
}

async function testParameterFormats() {
  console.log('Testing BUG-035: Parameter Format Compatibility\n');
  
  const officialClient = new MockOfficialClient();
  const adapter = new QRWCClientAdapter(officialClient);
  
  // Test 1: Control.Get with direct array (API spec)
  console.log('1. Testing Control.Get with direct array format (API spec):');
  try {
    const result1 = await adapter.sendCommand('Control.Get', ['Main Gain.gain', 'Main Gain.mute']);
    console.log('   ✓ Direct array format works');
    console.log('   Result:', JSON.stringify(result1.result, null, 2));
  } catch (error) {
    console.error('   ✗ Direct array format failed:', error.message);
  }
  
  // Test 2: Control.Get with object wrapper (current)
  console.log('\n2. Testing Control.Get with object wrapper (current):');
  try {
    const result2 = await adapter.sendCommand('Control.Get', {
      Controls: ['Main Gain.gain', 'Main Gain.mute']
    });
    console.log('   ✓ Object wrapper format works');
    console.log('   Result:', JSON.stringify(result2.result, null, 2));
  } catch (error) {
    console.error('   ✗ Object wrapper format failed:', error.message);
  }
  
  // Test 3: Control.Set with single control (API spec)
  console.log('\n3. Testing Control.Set with single control format (API spec):');
  try {
    const result3 = await adapter.sendCommand('Control.Set', {
      Name: 'Main Gain.gain',
      Value: -15,
      Ramp: 2.0
    });
    console.log('   ✓ Single control format works');
    console.log('   Result:', JSON.stringify(result3.result, null, 2));
    
    // Verify the value was set
    const checkResult = await adapter.sendCommand('Control.Get', ['Main Gain.gain']);
    console.log('   Verification - New value:', checkResult.result[0].Value);
  } catch (error) {
    console.error('   ✗ Single control format failed:', error.message);
  }
  
  // Test 4: Control.Set with array format (current)
  console.log('\n4. Testing Control.Set with array format (current):');
  try {
    const result4 = await adapter.sendCommand('Control.Set', {
      Controls: [
        { Name: 'Main Gain.gain', Value: -20 },
        { Name: 'Main Gain.mute', Value: 1 }
      ]
    });
    console.log('   ✓ Array format works');
    console.log('   Result:', JSON.stringify(result4.result, null, 2));
    
    // Verify the values were set
    const checkResult = await adapter.sendCommand('Control.Get', {
      Controls: ['Main Gain.gain', 'Main Gain.mute']
    });
    console.log('   Verification - New values:', 
      checkResult.result.map(r => `${r.Name}=${r.Value}`).join(', '));
  } catch (error) {
    console.error('   ✗ Array format failed:', error.message);
  }
  
  // Test 5: Mixed usage showing both formats work
  console.log('\n5. Testing mixed usage of both formats:');
  try {
    // Set using API spec format
    await adapter.sendCommand('Control.Set', {
      Name: 'Main Gain.gain',
      Value: -25
    });
    
    // Get using direct array format
    const result = await adapter.sendCommand('Control.Get', ['Main Gain.gain']);
    
    console.log('   ✓ Mixed format usage works');
    console.log('   Set with API spec format, retrieved with direct array');
    console.log('   Retrieved value:', result.result[0].Value);
  } catch (error) {
    console.error('   ✗ Mixed format usage failed:', error.message);
  }
  
  console.log('\n✅ BUG-035 Parameter Format Compatibility Test Complete');
}

// Run the test
testParameterFormats().catch(console.error);