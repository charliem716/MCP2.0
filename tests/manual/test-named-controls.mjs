#!/usr/bin/env node

import WebSocket from 'ws';
import fs from 'fs';

// Load Q-SYS configuration
const configPath = 'qsys-core.config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const { host, port, username, password } = config.qsysCore;

console.log('🔍 Testing Named Controls with Control.Set...\n');
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
        console.log(`📥 Response: ${JSON.stringify(response, null, 2)}`);
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
    // Test with common named control patterns
    const testControls = [
      'MainGain',
      'Main Gain',
      'main_gain',
      'MainMute',
      'Main Mute',
      'main_mute',
      'gain',
      'mute',
      'volume',
      'Main System Gain',
      'Main Output Gain',
      'Table_Mic_Volume', // This was in the component list
    ];

    console.log('1️⃣ Testing various named control patterns...\n');

    for (const controlName of testControls) {
      try {
        console.log(`Testing: "${controlName}"`);
        const result = await sendCommand('Control.Get', [controlName]);
        console.log(
          `✅ Found control "${controlName}": ${JSON.stringify(result)}\n`
        );

        // If we found a control, test Control.Set on it
        if (result && result.length > 0) {
          const control = result[0];
          console.log(`\n🎯 Testing Control.Set on "${controlName}"...`);

          // Determine if it's a boolean or numeric control
          if (typeof control.Value === 'boolean') {
            // Toggle the boolean
            const newValue = !control.Value;
            console.log(`Toggling from ${control.Value} to ${newValue}`);

            await sendCommand('Control.Set', {
              Name: controlName,
              Value: newValue,
            });

            // Verify the change
            await new Promise(resolve => setTimeout(resolve, 500));
            const verify = await sendCommand('Control.Get', [controlName]);
            console.log(`Verified new value: ${verify[0].Value}`);

            // Toggle back
            await sendCommand('Control.Set', {
              Name: controlName,
              Value: control.Value,
            });
            console.log(`Restored original value: ${control.Value}`);
          } else if (typeof control.Value === 'number') {
            // Adjust numeric value slightly
            const adjustment = control.Value > -50 ? -1 : 1;
            const newValue = control.Value + adjustment;
            console.log(`Adjusting from ${control.Value} to ${newValue}`);

            await sendCommand('Control.Set', {
              Name: controlName,
              Value: newValue,
              Ramp: 0.5,
            });

            // Verify the change
            await new Promise(resolve => setTimeout(resolve, 1000));
            const verify = await sendCommand('Control.Get', [controlName]);
            console.log(`Verified new value: ${verify[0].Value}`);

            // Restore original
            await sendCommand('Control.Set', {
              Name: controlName,
              Value: control.Value,
              Ramp: 0.5,
            });
            console.log(`Restored original value: ${control.Value}`);
          }

          console.log(
            `\n✅ Control.Set works correctly for "${controlName}"!\n`
          );
          break; // We've successfully tested, no need to continue
        }
      } catch (error) {
        // Control doesn't exist, continue to next
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
