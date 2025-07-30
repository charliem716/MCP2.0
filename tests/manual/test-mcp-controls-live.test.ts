import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

/**
 * Live MCP Controls Test with Q-SYS Core
 * Tests control-specific operations with a real Q-SYS Core
 */

import { OfficialQRWCClient } from './dist/qrwc/officialClient';
import { QRWCClientAdapter } from './dist/mcp/qrwc/adapter';
import { MCPToolRegistry } from './dist/mcp/handlers/index';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load config
const configPath = join(__dirname, 'qsys-core.config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const { host, port, username, password } = config.qsysCore;

console.log('🎛️  Live MCP Controls Test');
console.log('='.repeat(60));
console.log(`🎯 Target: ${host}:${port}`);
console.log('='.repeat(60));

async function testControls() {
  let officialClient;
  let adapter;
  let registry;

  try {
    // Connect to Q-SYS
    console.log('\n1️⃣ Connecting to Q-SYS Core...');
    officialClient = new OfficialQRWCClient({
      host,
      port,
      username,
      password,
      secure: port === 443,
    });
    await officialClient.connect();
    console.log('   ✅ Connected!');

    // Setup MCP
    adapter = new QRWCClientAdapter(officialClient);
    registry = new MCPToolRegistry(adapter);
    await registry.initialize();

    // Test 1: List specific component controls
    console.log('\n2️⃣ Testing specific component controls:\n');

    const testComponents = [
      'Main Output Gain',
      'Table_Mic_Volume',
      'Main System Gain',
      'Soundbar',
      'VoiceAgentController',
    ];

    for (const componentName of testComponents) {
      console.log(`📋 Component: ${componentName}`);
      try {
        const result = await registry.callTool('list_controls', {
          component: componentName,
          includeMetadata: true,
        });

        if (!result.isError) {
          const lines = result.content[0].text.split('\\n');
          console.log(`   ${lines.slice(0, 10).join('\\n   ')}`);
        } else {
          console.log('   ❌ Error:', result.content[0].text);
        }
      } catch (error) {
        console.log('   ❌ Exception:', error.message);
      }
      console.log('');
    }

    // Test 2: Get control values for known controls
    console.log('\\n3️⃣ Testing get_control_values with specific controls:\\n');

    // First, get some actual control names
    const componentsToTest = ['Main Output Gain', 'Table_Mic_Volume'];
    const controlsToRead = [];

    for (const comp of componentsToTest) {
      const listResult = await registry.callTool('list_controls', {
        component: comp,
      });
      if (!listResult.isError) {
        // Extract control names from result
        const matches = listResult.content[0].text.matchAll(/• ([^:]+):/g);
        for (const match of matches) {
          controlsToRead.push(match[1].trim());
          if (controlsToRead.length >= 5) break;
        }
      }
    }

    if (controlsToRead.length > 0) {
      console.log('Reading controls:', controlsToRead);

      const getResult = await registry.callTool('get_control_values', {
        controls: controlsToRead,
      });

      if (!getResult.isError) {
        console.log(`\\n${getResult.content[0].text}`);
      } else {
        console.log('❌ Error:', getResult.content[0].text);
      }
    }

    // Test 3: Direct QRWC access to understand control structure
    console.log('\\n4️⃣ Direct QRWC Component Analysis:\\n');

    const qrwc = officialClient.getQrwc();
    if (qrwc) {
      // Show first 3 components with their controls
      const componentNames = Object.keys(qrwc.components).slice(0, 3);

      for (const compName of componentNames) {
        console.log(`📦 Component: ${compName}`);
        const component = qrwc.components[compName];

        if (component && component.controls) {
          const controlNames = Object.keys(component.controls).slice(0, 5);
          for (const ctrlName of controlNames) {
            const control = component.controls[ctrlName];
            console.log(
              `   • ${ctrlName}: ${control.state} (type: ${typeof control.state})`
            );
          }
        }
        console.log('');
      }
    }

    // Test 4: Test set_control_values (safe test - echo current value)
    console.log('\\n5️⃣ Testing set_control_values (SAFE - no changes):\\n');
    console.log('   ⚠️  Skipping write operations for safety');
    console.log(
      '   💡 To test writes, uncomment the code below and use caution!'
    );

    // UNCOMMENT TO TEST WRITES (USE WITH CAUTION!)
    /*
    if (controlsToRead.length > 0 && controlsToRead[0].includes('gain')) {
      // Get current value
      const currentResult = await registry.callTool('get_control_values', {
        controls: [controlsToRead[0]]
      });
      
      if (!currentResult.isError) {
        // Extract current value (assuming it's a gain control)
        const currentValue = 0; // Parse from result
        
        // Set to same value (safe test)
        const setResult = await registry.callTool('set_control_values', {
          controls: [{
            name: controlsToRead[0],
            value: currentValue
          }]
        });
        
        console.log(setResult.isError ? '❌ Failed' : '✅ Success');
        console.log(setResult.content[0].text);
      }
    }
    */

    console.log(`\\n${'='.repeat(60)}`);
    console.log('✅ Control tests completed successfully!');
  } catch (error) {
    console.error('\\n❌ Test Failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    if (officialClient?.isConnected()) {
      console.log('\\n🧹 Closing connection...');
      await officialClient.disconnect();
    }
    process.exit(0);
  }
}

// Run the test
testControls().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
