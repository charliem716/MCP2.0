#!/usr/bin/env node

import WebSocket from 'ws';
import fs from 'fs';

// Load Q-SYS configuration
const configPath = 'qsys-core.config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const { host, port, username, password } = config.qsysCore;

console.log('🔍 Discovering Q-SYS Controls...\n');
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
      params: params || {},
      id,
    };

    console.log(`\n📤 Sending: ${JSON.stringify(command, null, 2)}`);

    const handler = data => {
      const response = JSON.parse(data.toString());
      if (response.id === id) {
        console.log(
          `📥 Response received (${response.result ? 'success' : 'error'})`
        );
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

    console.log(`\n📦 Found ${components.length} components:`);
    components.forEach((comp, idx) => {
      console.log(`  ${idx + 1}. ${comp.Name} (${comp.Type})`);
    });

    // Get controls for the first few components
    console.log('\n2️⃣ Getting controls for first 3 components...\n');

    for (let i = 0; i < Math.min(3, components.length); i++) {
      const component = components[i];
      console.log(`\n🎛️ Controls for "${component.Name}":`);

      try {
        const controls = await sendCommand('Component.GetControls', {
          Name: component.Name,
        });

        if (controls && controls.length > 0) {
          controls.slice(0, 5).forEach((ctrl, idx) => {
            console.log(`  ${idx + 1}. ${ctrl.Name}`);
            console.log(
              `     Type: ${ctrl.Type}, Value: ${ctrl.Value}, Direction: ${ctrl.Direction}`
            );
          });
          if (controls.length > 5) {
            console.log(`  ... and ${controls.length - 5} more controls`);
          }

          // Find a mute and gain control for testing
          const muteControl = controls.find(
            c => c.Name.toLowerCase().includes('mute') && c.Direction !== 'Read'
          );
          const gainControl = controls.find(
            c =>
              (c.Name.toLowerCase().includes('gain') ||
                c.Name.toLowerCase().includes('level')) &&
              c.Direction !== 'Read'
          );

          if (muteControl) {
            console.log(
              `\n  📍 Found mute control: "${muteControl.Name}" (current: ${muteControl.Value})`
            );
          }
          if (gainControl) {
            console.log(
              `  📍 Found gain control: "${gainControl.Name}" (current: ${gainControl.Value})`
            );
          }
        } else {
          console.log(`  No controls found`);
        }
      } catch (error) {
        console.log(`  Error getting controls: ${error.message}`);
      }
    }
  } catch (error) {
    console.error('\n❌ Discovery failed:', error.message);
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
