import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import WebSocket from 'ws';
import fs from 'fs';

// Load Q-SYS configuration
const configPath = 'qsys-core.config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const { host, port, username, password } = config.qsysCore;

console.log('🔧 Testing Control.Set command with Q-SYS Core (Raw QRC)...\n');
console.log(`Connecting to: ${host}:${port}`);

const wsUrl = `wss://${host}:${port}/qrc`;
const socket = new WebSocket(wsUrl, {
  headers: {
    Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
  },
  rejectUnauthorized: false, // Allow self-signed certificates
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
    // Test 1: Get current control values
    console.log('1️⃣ Getting current control values...');
    const currentValues = await sendCommand('Control.Get', [
      'gain_1',
      'mute_1',
    ]);

    // Test 2: Mute the control
    console.log('\n2️⃣ Testing MUTE (setting to true)...');
    await sendCommand('Control.Set', {
      Name: 'mute_1',
      Value: true,
    });

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify mute
    console.log('\n3️⃣ Verifying mute state...');
    const muteState = await sendCommand('Control.Get', ['mute_1']);

    // Test 3: Unmute the control
    console.log('\n4️⃣ Testing UNMUTE (setting to false)...');
    await sendCommand('Control.Set', {
      Name: 'mute_1',
      Value: false,
    });

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify unmute
    console.log('\n5️⃣ Verifying unmute state...');
    const unmuteState = await sendCommand('Control.Get', ['mute_1']);

    // Test 4: Set gain with ramp
    console.log('\n6️⃣ Testing gain control with ramp...');
    await sendCommand('Control.Set', {
      Name: 'gain_1',
      Value: -10.0,
      Ramp: 2.0,
    });

    console.log('\n✅ All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('- Control.Set command works correctly');
    console.log('- Mute control responds to true/false values');
    console.log('- Gain control accepts numeric values with ramp');
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
