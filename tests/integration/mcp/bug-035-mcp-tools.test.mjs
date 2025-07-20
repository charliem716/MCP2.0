/**
 * Test BUG-035 fix with actual MCP tools
 */

import { MCPToolRegistry } from '../../../dist/src/mcp/handlers/index.js';
import { QRWCClientAdapter } from '../../../dist/src/mcp/qrwc/adapter.js';

// Mock official client
class MockOfficialClient {
  constructor() {
    this.connected = true;
    this.components = {
      'TestMixer': {
        controls: {
          'gain': { state: -5 },
          'mute': { state: 0 }
        }
      }
    };
  }

  isConnected() { return this.connected; }
  getQrwc() { return { components: this.components }; }
  getComponent(name) { return this.components[name]; }
  
  async setControlValue(componentName, controlName, value) {
    console.log(`  [Mock] Setting ${componentName}.${controlName} = ${value}`);
    if (this.components[componentName]?.controls?.[controlName]) {
      this.components[componentName].controls[controlName].state = value;
    }
  }

  async sendRawCommand(method, params) {
    console.log(`  [Mock] Raw command: ${method}`);
    
    // Mock response for different methods
    if (method === 'Control.Get' && Array.isArray(params)) {
      // API spec format - direct array
      return {
        result: params.map(name => ({
          Name: name,
          Value: -10,
          String: "-10 dB"
        }))
      };
    }
    
    if (method === 'Control.Set' && params.Name && params.Value !== undefined) {
      // API spec format - single control
      return { result: true };
    }
    
    return { result: {} };
  }
}

async function testMCPToolsWithBothFormats() {
  console.log('Testing BUG-035 with MCP Tools (send_raw_command)\n');
  
  const officialClient = new MockOfficialClient();
  const adapter = new QRWCClientAdapter(officialClient);
  const registry = new MCPToolRegistry(adapter);
  
  await registry.initialize();
  
  // Test 1: Use send_raw_command with API spec format for Control.Get
  console.log('1. Testing Control.Get via send_raw_command (API spec format):');
  try {
    const result = await registry.callTool('send_raw_command', {
      method: 'Control.Get',
      params: ['TestGain', 'TestMute']  // Direct array
    });
    
    console.log('   ✓ API spec format accepted');
    console.log('   Result:', JSON.stringify(result.content[0].text, null, 2));
  } catch (error) {
    console.error('   ✗ Failed:', error.message);
  }
  
  // Test 2: Use send_raw_command with API spec format for Control.Set
  console.log('\n2. Testing Control.Set via send_raw_command (API spec format):');
  try {
    const result = await registry.callTool('send_raw_command', {
      method: 'Control.Set',
      params: {
        Name: 'TestGain',
        Value: -12,
        Ramp: 2.0
      }
    });
    
    console.log('   ✓ API spec format accepted');
    console.log('   Result:', result.content[0].text);
  } catch (error) {
    console.error('   ✗ Failed:', error.message);
  }
  
  // Test 3: Verify the existing MCP tools still work
  console.log('\n3. Testing get_control_values tool (uses adapter internally):');
  try {
    const result = await registry.callTool('get_control_values', {
      controls: ['TestMixer.gain', 'TestMixer.mute']
    });
    
    console.log('   ✓ MCP tool works correctly');
    const parsed = JSON.parse(result.content[0].text);
    console.log('   Controls found:', parsed.controls.map(c => `${c.name}=${c.value}`).join(', '));
  } catch (error) {
    console.error('   ✗ Failed:', error.message);
  }
  
  // Test 4: Test set_control_values tool
  console.log('\n4. Testing set_control_values tool (uses adapter internally):');
  try {
    const result = await registry.callTool('set_control_values', {
      controls: [
        { name: 'TestMixer.gain', value: -15 },
        { name: 'TestMixer.mute', value: true }
      ]
    });
    
    console.log('   ✓ MCP tool works correctly');
    const parsed = JSON.parse(result.content[0].text);
    console.log('   Results:', parsed.results.map(r => `${r.name}: ${r.success}`).join(', '));
  } catch (error) {
    console.error('   ✗ Failed:', error.message);
  }
  
  console.log('\n✅ MCP Tools compatibility test complete');
}

testMCPToolsWithBothFormats().catch(console.error);