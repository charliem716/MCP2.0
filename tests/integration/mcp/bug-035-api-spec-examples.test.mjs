/**
 * Test exact examples from BUG-035 bug report
 */

import { QRWCClientAdapter } from '../../../dist/src/mcp/qrwc/adapter.js';

// Mock client that logs the exact parameters received
class ParameterLoggingClient {
  constructor() {
    this.connected = true;
    this.lastCommand = null;
    this.lastParams = null;
  }

  isConnected() { return this.connected; }
  getQrwc() { 
    return { 
      components: {
        'Main': { controls: { 'Gain': { state: -10 }, 'Mute': { state: 0 } } }
      }
    }; 
  }
  getComponent(name) { return this.getQrwc().components[name]; }
  
  async setControlValue(componentName, controlName, value) {
    return true;
  }

  async sendRawCommand(method, params) {
    this.lastCommand = method;
    this.lastParams = params;
    return { result: {} };
  }
}

async function testExactAPISpecExamples() {
  console.log('Testing exact examples from BUG-035 bug report\n');
  
  const client = new ParameterLoggingClient();
  const adapter = new QRWCClientAdapter(client);
  
  // Example 1: Control.Get with direct array (from bug report line 24)
  console.log('1. Control.Get - Direct array format:');
  console.log('   Input: ["MainGain", "MainMute"]');
  try {
    const result = await adapter.sendCommand('Control.Get', ["MainGain", "MainMute"]);
    console.log('   ✓ Accepted direct array format');
    console.log('   Result has', result.result.length, 'controls');
  } catch (error) {
    console.error('   ✗ FAILED:', error.message);
  }
  
  // Example 2: Control.Get with object wrapper (from bug report line 35)
  console.log('\n2. Control.Get - Object wrapper format:');
  console.log('   Input: {Controls: ["MainGain", "MainMute"]}');
  try {
    const result = await adapter.sendCommand('Control.Get', {
      Controls: ["MainGain", "MainMute"]
    });
    console.log('   ✓ Accepted object wrapper format');
    console.log('   Result has', result.result.length, 'controls');
  } catch (error) {
    console.error('   ✗ FAILED:', error.message);
  }
  
  // Example 3: Control.Set single control (from bug report line 47)
  console.log('\n3. Control.Set - Single control format:');
  console.log('   Input: {Name: "MainGain", Value: -12, Ramp: 2.0}');
  try {
    const result = await adapter.sendCommand('Control.Set', {
      Name: "MainGain",
      Value: -12,
      Ramp: 2.0
    });
    console.log('   ✓ Accepted single control format');
    console.log('   Result:', result.result[0].Result);
  } catch (error) {
    console.error('   ✗ FAILED:', error.message);
  }
  
  // Example 4: Control.Set array format (from bug report line 61)
  console.log('\n4. Control.Set - Array format:');
  console.log('   Input: {Controls: [{Name: "MainGain", Value: -12, Ramp: 2.0}]}');
  try {
    const result = await adapter.sendCommand('Control.Set', {
      Controls: [{
        Name: "MainGain",
        Value: -12,
        Ramp: 2.0
      }]
    });
    console.log('   ✓ Accepted array format');
    console.log('   Result:', result.result[0].Result);
  } catch (error) {
    console.error('   ✗ FAILED:', error.message);
  }
  
  // Test that we handle the exact naming differences
  console.log('\n5. Method name variations:');
  const methodVariations = ['Control.Get', 'Control.GetValues', 'ControlGetValues'];
  for (const method of methodVariations) {
    try {
      await adapter.sendCommand(method, ["Test"]);
      console.log(`   ✓ ${method} - accepted`);
    } catch (error) {
      console.log(`   ✗ ${method} - failed`);
    }
  }
  
  console.log('\n✅ API Specification Examples Test Complete');
}

testExactAPISpecExamples().catch(console.error);