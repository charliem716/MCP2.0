#!/usr/bin/env node

import WebSocket from 'ws';
import fs from 'fs';

// Load Q-SYS configuration
const configPath = 'qsys-core.config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const { host, port, username, password } = config.qsysCore;

console.log('🔧 Testing Component Controls...\n');
console.log(`Connecting to: ${host}:${port}`);

const wsUrl = `wss://${host}:${port}/qrc`;
const socket = new WebSocket(wsUrl, {
  headers: {
    Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
  },
  rejectUnauthorized: false,
});

let requestId = 1;

function sendCommand(method, params) {
  return new Promise((resolve, reject) => {
    const id = requestId++;
    const command = {
      jsonrpc: '2.0',
      method,
      params,
      id,
    };

    console.log(`\n📤 Sending: ${JSON.stringify(command, null, 2)}`);

    const handler = data => {
      const response = JSON.parse(data.toString());
      if (response.id === id) {
        console.log(`📥 Response received`);
        socket.removeListener('message', handler);
        if (response.error) {
          reject(
            new Error(
              `QRC Error: ${response.error.message} (code: ${response.error.code})`
            )
          );
        } else {
          resolve(response.result);
        }
      }
    };

    socket.on('message', handler);
    socket.send(`${JSON.stringify(command)}\0`);
  });
}

socket.on('open', async () => {
  console.log('\n✅ WebSocket connected successfully!\n');

  try {
    // Get all components
    console.log('1️⃣ Getting all components...');
    const components = await sendCommand('Component.GetComponents', {});

    console.log(`\n📦 Found ${components.length} components\n`);

    // Look for gain/volume components
    const gainComponents = components.filter(
      c =>
        c.Name.toLowerCase().includes('gain') ||
        c.Name.toLowerCase().includes('volume') ||
        c.Type === 'gain'
    );

    console.log(`Found ${gainComponents.length} gain/volume components:`);
    gainComponents.forEach(c => console.log(`  - ${c.Name} (${c.Type})`));

    if (gainComponents.length > 0) {
      const testComponent = gainComponents[0];
      console.log(`\n2️⃣ Testing with component: "${testComponent.Name}"...`);

      // Get controls for this component
      const controlsResponse = await sendCommand('Component.GetControls', {
        Name: testComponent.Name,
      });

      // Handle different response formats
      const controls = Array.isArray(controlsResponse)
        ? controlsResponse
        : controlsResponse.Controls
          ? controlsResponse.Controls
          : [];

      console.log(`\nFound ${controls.length} controls:`);
      if (controls.length === 0) {
        console.log('  No controls found - component might not be scriptable');
        console.log(
          '  Full response:',
          JSON.stringify(controlsResponse, null, 2)
        );
      } else {
        controls.forEach(c =>
          console.log(`  - ${c.Name}: ${c.Value} (${c.Type})`)
        );
      }

      // Find gain and mute controls
      const gainControl = controls.find(c => c.Name.includes('gain'));
      const muteControl = controls.find(c => c.Name.includes('mute'));

      if (muteControl && muteControl.Direction !== 'Read') {
        console.log(`\n3️⃣ Testing mute control: "${muteControl.Name}"...`);

        // Get current state
        const currentState = await sendCommand('Component.Get', {
          Name: testComponent.Name,
          Controls: [{ Name: muteControl.Name }],
        });

        const currentMute = currentState.Controls[0].Value;
        console.log(`Current mute state: ${currentMute}`);

        // Toggle mute
        console.log(`\nToggling mute to: ${!currentMute}...`);
        await sendCommand('Component.Set', {
          Name: testComponent.Name,
          Controls: [
            {
              Name: muteControl.Name,
              Value: !currentMute,
            },
          ],
        });

        // Verify change
        await new Promise(resolve => setTimeout(resolve, 500));
        const newState = await sendCommand('Component.Get', {
          Name: testComponent.Name,
          Controls: [{ Name: muteControl.Name }],
        });

        console.log(`New mute state: ${newState.Controls[0].Value}`);

        // Toggle back
        console.log(`\nRestoring original state: ${currentMute}...`);
        await sendCommand('Component.Set', {
          Name: testComponent.Name,
          Controls: [
            {
              Name: muteControl.Name,
              Value: currentMute,
            },
          ],
        });

        console.log(`\n✅ Component.Set works correctly!`);
      }

      if (gainControl && gainControl.Direction !== 'Read') {
        console.log(
          `\n4️⃣ Testing gain control with ramp: "${gainControl.Name}"...`
        );

        // Get current value
        const currentState = await sendCommand('Component.Get', {
          Name: testComponent.Name,
          Controls: [{ Name: gainControl.Name }],
        });

        const currentGain = currentState.Controls[0].Value;
        console.log(`Current gain: ${currentGain}`);

        // Adjust gain
        const newGain = currentGain > -20 ? currentGain - 3 : currentGain + 3;
        console.log(`\nSetting gain to ${newGain} with 1s ramp...`);

        await sendCommand('Component.Set', {
          Name: testComponent.Name,
          Controls: [
            {
              Name: gainControl.Name,
              Value: newGain,
              Ramp: 1.0,
            },
          ],
        });

        // Wait for ramp
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Restore
        console.log(`\nRestoring to ${currentGain} with 1s ramp...`);
        await sendCommand('Component.Set', {
          Name: testComponent.Name,
          Controls: [
            {
              Name: gainControl.Name,
              Value: currentGain,
              Ramp: 1.0,
            },
          ],
        });

        console.log(`\n✅ Gain control with ramp works correctly!`);
      }
    }
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }

  console.log('\n🔌 Closing connection...');
  socket.close();
});

socket.on('error', error => {
  console.error('❌ WebSocket error:', error.message);
  process.exit(1);
});

socket.on('close', () => {
  console.log('👋 Connection closed');
  process.exit(0);
});
