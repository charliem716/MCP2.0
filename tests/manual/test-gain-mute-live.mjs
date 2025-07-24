#!/usr/bin/env node

import { OfficialQRWCClient } from './dist/qrwc/officialClient.js';
import { QRWCClientAdapter } from './dist/mcp/qrwc/adapter.js';
import { MCPToolRegistry } from './dist/mcp/handlers/index.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load config
const configPath = join(__dirname, 'qsys-core.config.json');
if (!fs.existsSync(configPath)) {
  console.error('❌ Config file not found. Run ./setup-env.sh first!');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const { host, port, username, password } = config.qsysCore;

console.log('🔇 Live Gain Component Mute Test');
console.log('='.repeat(60));
console.log(`🎯 Target: ${host}:${port}`);
console.log('='.repeat(60));

async function testGainMute() {
  let officialClient;
  let adapter;
  let registry;

  try {
    // 1. Connect to Q-SYS Core
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

    // Create adapter and registry
    adapter = new QRWCClientAdapter(officialClient);
    registry = new MCPToolRegistry(adapter);

    // Initialize the registry
    await registry.initialize();

    // 2. List all controls to find gain components with mute
    console.log('\n2️⃣ Finding gain components with mute controls...');
    const controlsResult = await registry.callTool('list_controls', {});

    // Extract controls from MCP response format
    let controls;
    if (
      controlsResult.content &&
      controlsResult.content[0] &&
      controlsResult.content[0].text
    ) {
      // Parse the text response to extract control data
      const text = controlsResult.content[0].text;
      // Extract JSON from the formatted text (assuming it contains JSON data)
      const jsonMatch = text.match(/\[.*\]/s);
      if (jsonMatch) {
        controls = JSON.parse(jsonMatch[0]);
      } else {
        // If no JSON found, try to parse mock data from the tool
        console.log('   No JSON data found, using direct query...');
        // Use the adapter directly to get controls
        const directResponse = await adapter.sendCommand(
          'Component.GetAllControls',
          {}
        );
        controls = directResponse.Controls || [];
      }
    } else {
      throw new Error('Unexpected response format from list_controls');
    }

    // Filter for gain-related components with mute controls
    const gainComponents = new Set();
    const muteControls = [];

    controls.forEach(control => {
      const componentName = control.name.split('.')[0];
      if (
        componentName.toLowerCase().includes('gain') ||
        componentName.toLowerCase().includes('volume') ||
        componentName.toLowerCase().includes('output')
      ) {
        gainComponents.add(componentName);
        if (control.name.includes('mute')) {
          muteControls.push(control);
        }
      }
    });

    console.log(`\n   Found ${gainComponents.size} gain-related components`);
    console.log(`   Found ${muteControls.length} mute controls`);

    if (muteControls.length === 0) {
      // Look for any mute control
      controls.forEach(control => {
        if (control.name.includes('mute')) {
          muteControls.push(control);
        }
      });
      console.log(
        `\n   Expanded search found ${muteControls.length} total mute controls`
      );
    }

    if (muteControls.length > 0) {
      // Use the first mute control found
      const targetMute = muteControls[0];
      console.log(`\n   🎯 Selected mute control: ${targetMute.name}`);

      // 3. Get current mute status
      console.log('\n3️⃣ Getting current mute status...');
      const currentResult = await registry.callTool('get_control_values', {
        controls: [targetMute.name],
      });

      // Parse MCP response
      let currentValues;
      if (
        currentResult.content &&
        currentResult.content[0] &&
        currentResult.content[0].text
      ) {
        const text = currentResult.content[0].text;
        const jsonMatch = text.match(/\[.*\]/s);
        if (jsonMatch) {
          currentValues = JSON.parse(jsonMatch[0]);
        } else {
          // Direct query
          const directResponse = await adapter.sendCommand('Control.Get', {
            Name: targetMute.name,
          });
          currentValues = [
            {
              name: targetMute.name,
              value: directResponse.Value,
            },
          ];
        }
      }
      const currentMuteState = currentValues[0].value;
      console.log(
        `   Current mute state: ${currentMuteState ? '🔇 MUTED' : '🔊 UNMUTED'}`
      );

      // 4. Toggle mute ON
      console.log('\n4️⃣ Engaging mute...');
      const setResult = await registry.callTool('set_control_values', {
        controls: [
          {
            name: targetMute.name,
            value: true, // Set mute to true
          },
        ],
      });
      console.log(`   Result: ${setResult.content ? 'Success' : 'Failed'}`);

      // 5. Verify mute is engaged
      console.log('\n5️⃣ Verifying mute is engaged...');
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms

      const verifyResult = await registry.callTool('get_control_values', {
        controls: [targetMute.name],
      });

      // Parse MCP response
      let verifyValues;
      if (
        verifyResult.content &&
        verifyResult.content[0] &&
        verifyResult.content[0].text
      ) {
        const text = verifyResult.content[0].text;
        const jsonMatch = text.match(/\[.*\]/s);
        if (jsonMatch) {
          verifyValues = JSON.parse(jsonMatch[0]);
        } else {
          // Direct query
          const directResponse = await adapter.sendCommand('Control.Get', {
            Name: targetMute.name,
          });
          verifyValues = [
            {
              name: targetMute.name,
              value: directResponse.Value,
            },
          ];
        }
      }
      const newMuteState = verifyValues[0].value;
      console.log(
        `   New mute state: ${newMuteState ? '🔇 MUTED' : '🔊 UNMUTED'}`
      );

      if (newMuteState === true) {
        console.log('\n✅ SUCCESS: Mute has been engaged!');
      } else {
        console.log('\n❌ FAILED: Mute was not engaged');
      }

      // Optional: Restore original state after 3 seconds
      console.log('\n⏳ Restoring original state in 3 seconds...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      await registry.callTool('set_control_values', {
        controls: [
          {
            name: targetMute.name,
            value: currentMuteState,
          },
        ],
      });
      console.log(
        `   Restored to: ${currentMuteState ? '🔇 MUTED' : '🔊 UNMUTED'}`
      );
    } else {
      console.log('\n❌ No mute controls found in the system');
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    if (officialClient) {
      console.log('\n🧹 Closing connection...');
      try {
        officialClient.disconnect();
      } catch (error) {
        // Ignore disconnect errors to prevent infinite loop
      }
    }
  }
}

// Run the test
testGainMute()
  .catch(console.error)
  .finally(() => {
    // Force exit after test completion to avoid hanging
    setTimeout(() => process.exit(0), 1000);
  });
