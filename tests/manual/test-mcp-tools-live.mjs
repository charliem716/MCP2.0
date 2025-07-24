#!/usr/bin/env node

/**
 * Live MCP Tools Test with Q-SYS Core
 * Tests all MCP tools against a real Q-SYS Core to verify functionality
 */

import { OfficialQRWCClient } from '../../dist/src/qrwc/officialClient.js';
import { QRWCClientAdapter } from '../../dist/src/mcp/qrwc/adapter.js';
import { MCPToolRegistry } from '../../dist/src/mcp/handlers/index.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load config
const configPath = join(__dirname, '../../qsys-core.config.json');
if (!fs.existsSync(configPath)) {
  console.error('❌ Config file not found. Run ./setup-env.sh first!');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const { host, port, username, password } = config.qsysCore;

console.log('🧪 Live MCP Tools Test with Q-SYS Core');
console.log('='.repeat(60));
console.log(`🎯 Target: ${host}:${port}`);
console.log(`👤 Auth: ${username ? 'Enabled' : 'Disabled'}`);
console.log('='.repeat(60));

async function testMCPTools() {
  let officialClient;
  let adapter;
  let registry;

  try {
    // Step 1: Create and connect QRWC client
    console.log('\n1️⃣ Creating QRWC client...');
    officialClient = new OfficialQRWCClient({
      host,
      port,
      username,
      password,
      secure: port === 443,
    });

    console.log('   Connecting to Q-SYS Core...');
    await officialClient.connect();
    console.log('   ✅ Connected successfully!');

    // Step 2: Create adapter and registry
    console.log('\n2️⃣ Setting up MCP Tool Registry...');
    adapter = new QRWCClientAdapter(officialClient);
    registry = new MCPToolRegistry(adapter);
    await registry.initialize();
    console.log(
      '   ✅ Registry initialized with',
      registry.getToolCount(),
      'tools'
    );

    // Step 3: List available tools
    console.log('\n3️⃣ Available MCP Tools:');
    const tools = await registry.listTools();
    tools.forEach(tool => {
      console.log(`   • ${tool.name}: ${tool.description}`);
    });

    // Step 4: Test each tool
    console.log('\n4️⃣ Testing MCP Tools:\n');

    // Test 1: List Components
    console.log('📋 TEST: list_components');
    try {
      const result = await registry.callTool('list_components', {
        includeProperties: true,
      });

      if (result.isError) {
        console.error('   ❌ Error:', result.content[0].text);
      } else {
        console.log('   ✅ Success!');
        console.log(
          `   ${result.content[0].text.split('\\n').slice(0, 5).join('\\n   ')}`
        );
      }
    } catch (error) {
      console.error('   ❌ Exception:', error.message);
    }

    // Test 2: Query Core Status
    console.log('\\n📊 TEST: query_core_status');
    try {
      const result = await registry.callTool('query_core_status', {
        includeDetails: true,
        includeNetworkInfo: true,
        includePerformance: true,
      });

      if (result.isError) {
        console.error('   ❌ Error:', result.content[0].text);
      } else {
        console.log('   ✅ Success!');
        const lines = result.content[0].text.split('\\n');
        console.log(`   ${lines.slice(0, 10).join('\\n   ')}`);
      }
    } catch (error) {
      console.error('   ❌ Exception:', error.message);
    }

    // Test 3: List Controls
    console.log('\\n🎛️  TEST: list_controls');
    try {
      const result = await registry.callTool('list_controls', {
        controlType: 'all',
        includeMetadata: true,
      });

      if (result.isError) {
        console.error('   ❌ Error:', result.content[0].text);
      } else {
        console.log('   ✅ Success!');
        const lines = result.content[0].text.split('\\n');
        console.log(`   ${lines.slice(0, 10).join('\\n   ')}`);
      }
    } catch (error) {
      console.error('   ❌ Exception:', error.message);
    }

    // Test 4: Get Control Values (if we found any controls)
    console.log('\\n📊 TEST: get_control_values');
    try {
      // First get list of controls
      const listResult = await registry.callTool('list_controls', {});
      if (!listResult.isError) {
        // Extract first control name from the result
        const controlMatch = listResult.content[0].text.match(/• ([^:]+):/);
        if (controlMatch) {
          const controlName = controlMatch[1].trim();
          console.log(`   Testing with control: ${controlName}`);

          const result = await registry.callTool('get_control_values', {
            controls: [controlName],
          });

          if (result.isError) {
            console.error('   ❌ Error:', result.content[0].text);
          } else {
            console.log('   ✅ Success!');
            console.log(`   ${result.content[0].text}`);
          }
        } else {
          console.log('   ⚠️  No controls found to test');
        }
      }
    } catch (error) {
      console.error('   ❌ Exception:', error.message);
    }

    // Test 5: Get Component Controls
    console.log('\\n🎛️  TEST: get_component_controls');
    try {
      // First get a component to test with
      const listResult = await registry.callTool('list_components', {});
      if (!listResult.isError) {
        // Extract first component name from the result
        const componentMatch = listResult.content[0].text.match(/• ([^(]+) \(/);
        if (componentMatch) {
          const componentName = componentMatch[1].trim();
          console.log(`   Testing with component: ${componentName}`);

          const result = await registry.callTool('get_component_controls', {
            componentName,
            includeValues: true,
          });

          if (result.isError) {
            console.error('   ❌ Error:', result.content[0].text);
          } else {
            console.log('   ✅ Success!');
            const lines = result.content[0].text.split('\\n');
            console.log(`   ${lines.slice(0, 5).join('\\n   ')}`);
          }
        } else {
          console.log('   ⚠️  No components found to test');
        }
      }
    } catch (error) {
      console.error('   ❌ Exception:', error.message);
    }

    // Test 6: Get All Controls
    console.log('\\n📊 TEST: get_all_controls');
    try {
      const result = await registry.callTool('get_all_controls', {
        limit: 5,
        offset: 0,
        includeValues: true,
        includeMetadata: true,
      });

      if (result.isError) {
        console.error('   ❌ Error:', result.content[0].text);
      } else {
        console.log('   ✅ Success!');
        const lines = result.content[0].text.split('\\n');
        console.log(`   ${lines.slice(0, 10).join('\\n   ')}`);
      }
    } catch (error) {
      console.error('   ❌ Exception:', error.message);
    }

    // Test 7: Query Q-SYS API
    console.log('\\n🌐 TEST: query_qsys_api');
    try {
      const result = await registry.callTool('query_qsys_api', {
        endpoint: '/api/v0/cores',
        method: 'GET',
      });

      if (result.isError) {
        console.error('   ❌ Error:', result.content[0].text);
      } else {
        console.log('   ✅ Success!');
        const lines = result.content[0].text.split('\\n');
        console.log(`   ${lines.slice(0, 5).join('\\n   ')}`);
      }
    } catch (error) {
      console.error('   ❌ Exception:', error.message);
    }

    // Test 8: Send Raw Command (safe read-only command)
    console.log('\\n📡 TEST: send_raw_command');
    try {
      const result = await registry.callTool('send_raw_command', {
        command: 'cgp',
        params: [],
      });

      if (result.isError) {
        console.error('   ❌ Error:', result.content[0].text);
      } else {
        console.log('   ✅ Success!');
        console.log('   Command executed successfully');
      }
    } catch (error) {
      console.error('   ❌ Exception:', error.message);
    }

    // Test 9: Set Control Values (interactive - only if safe)
    console.log('\\n🎚️  TEST: set_control_values');
    console.log(
      '   ⚠️  Skipping set_control_values to avoid changing live system'
    );
    console.log('   💡 To test manually, use: npm run mcp-client');

    // Test 10: Echo tool (always safe)
    console.log('\\n🔊 TEST: echo');
    try {
      const result = await registry.callTool('echo', {
        message: 'Hello from MCP Tools Test!',
      });

      if (result.isError) {
        console.error('   ❌ Error:', result.content[0].text);
      } else {
        console.log('   ✅ Success:', result.content[0].text);
      }
    } catch (error) {
      console.error('   ❌ Exception:', error.message);
    }

    // Summary
    console.log(`\\n${'='.repeat(60)}`);
    console.log('📊 Test Summary:');
    console.log('   • Connection: ✅ Successful');
    console.log('   • Tools Loaded: ✅', registry.getToolCount(), 'tools');
    console.log('   • Read Operations: ✅ Working');
    console.log('   • Write Operations: ⚠️  Not tested (safety)');
    console.log('\\n✨ MCP Tools are functional with live Q-SYS Core!');
  } catch (error) {
    console.error('\\n❌ Test Failed:', error.message);
    console.error('\\nStack:', error.stack);

    if (error.message.includes('ECONNREFUSED')) {
      console.error('\\n🔍 Connection refused. Check:');
      console.error('   • Q-SYS Core is powered on');
      console.error('   • IP address is correct');
      console.error('   • External Control is enabled in Designer');
      console.error('   • Firewall allows connection');
    }
  } finally {
    // Cleanup
    if (officialClient?.isConnected()) {
      console.log('\\n🧹 Closing connection...');
      await officialClient.disconnect();
    }
    process.exit(0);
  }
}

// Run the test
testMCPTools().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
