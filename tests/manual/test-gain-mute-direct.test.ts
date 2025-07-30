import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { OfficialQRWCClient } from './dist/qrwc/officialClient';
import { QRWCClientAdapter } from './dist/mcp/qrwc/adapter';
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

console.log('🔇 Live Gain Component Mute Test (Direct)');
console.log('='.repeat(60));
console.log(`🎯 Target: ${host}:${port}`);
console.log('='.repeat(60));

async function testGainMute() {
  let officialClient;
  let adapter;

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

    // Create adapter
    adapter = new QRWCClientAdapter(officialClient);

    // 2. Get all components
    console.log('\n2️⃣ Getting all components...');
    const componentsResponse = await adapter.sendCommand(
      'Component.GetComponents',
      {}
    );
    const components = componentsResponse.Components || [];
    console.log(`   Found ${components.length} components`);

    // 3. Find gain-related components
    console.log('\n3️⃣ Finding gain/output components...');
    const gainComponents = components.filter(
      comp =>
        comp.Name.toLowerCase().includes('gain') ||
        comp.Name.toLowerCase().includes('output') ||
        comp.Type.toLowerCase().includes('gain') ||
        comp.Type.toLowerCase().includes('output')
    );

    console.log(`   Found ${gainComponents.length} gain/output components`);

    // 4. Look for mute controls
    console.log('\n4️⃣ Searching for mute controls...');
    let targetMute = null;

    for (const component of gainComponents) {
      try {
        const controlsResponse = await adapter.sendCommand(
          'Component.GetControls',
          {
            Name: component.Name,
          }
        );

        const controls = controlsResponse.Controls || [];
        const muteControl = controls.find(ctrl =>
          ctrl.Name.toLowerCase().includes('mute')
        );

        if (muteControl) {
          targetMute = {
            component: component.Name,
            control: muteControl.Name,
          };
          console.log(
            `   ✅ Found mute control: ${muteControl.Name} in ${component.Name}`
          );
          break;
        }
      } catch (error) {
        // Skip components that don't have controls
      }
    }

    // If no mute found in gain components, search all components
    if (!targetMute) {
      console.log('   Searching all components for mute controls...');
      for (const component of components) {
        try {
          const controlsResponse = await adapter.sendCommand(
            'Component.GetControls',
            {
              Name: component.Name,
            }
          );

          const controls = controlsResponse.Controls || [];
          const muteControl = controls.find(ctrl =>
            ctrl.Name.toLowerCase().includes('mute')
          );

          if (muteControl) {
            targetMute = {
              component: component.Name,
              control: muteControl.Name,
            };
            console.log(
              `   ✅ Found mute control: ${muteControl.Name} in ${component.Name}`
            );
            break;
          }
        } catch (error) {
          // Skip components that don't have controls
        }
      }
    }

    if (!targetMute) {
      console.log('\n❌ No mute controls found in the system');
      return;
    }

    // 5. Get current mute state
    console.log('\n5️⃣ Getting current mute state...');
    const currentResponse = await adapter.sendCommand('Control.Get', {
      Name: targetMute.control,
    });
    const currentMuteState = currentResponse.Value;
    console.log(
      `   Current state: ${currentMuteState ? '🔇 MUTED' : '🔊 UNMUTED'}`
    );

    // 6. Toggle mute ON
    console.log('\n6️⃣ Setting mute to ON...');
    await adapter.sendCommand('Control.Set', {
      Name: targetMute.control,
      Value: 1, // 1 for muted
    });
    console.log('   ✅ Mute command sent');

    // 7. Verify mute state
    console.log('\n7️⃣ Verifying mute state...');
    await new Promise(resolve => setTimeout(resolve, 500));

    const verifyResponse = await adapter.sendCommand('Control.Get', {
      Name: targetMute.control,
    });
    const newMuteState = verifyResponse.Value;
    console.log(`   New state: ${newMuteState ? '🔇 MUTED' : '🔊 UNMUTED'}`);

    if (newMuteState === 1) {
      console.log('\n✅ SUCCESS: Mute has been engaged!');
    } else {
      console.log('\n❌ FAILED: Mute was not engaged');
    }

    // 8. Restore original state
    console.log('\n8️⃣ Restoring original state in 3 seconds...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    await adapter.sendCommand('Control.Set', {
      Name: targetMute.control,
      Value: currentMuteState,
    });
    console.log(
      `   Restored to: ${currentMuteState ? '🔇 MUTED' : '🔊 UNMUTED'}`
    );
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
        // Ignore disconnect errors
      }
    }
  }
}

// Run the test
testGainMute()
  .catch(console.error)
  .finally(() => {
    // Force exit after completion
    setTimeout(() => process.exit(0), 1000);
  });
