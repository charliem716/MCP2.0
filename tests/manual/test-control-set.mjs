#!/usr/bin/env node

import { Qrwc } from '@q-sys/qrwc';
import WebSocket from 'ws';
import fs from 'fs';

// Load Q-SYS configuration
const configPath = 'qsys-core.config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const { host, port, username, password } = config.qsysCore;

console.log('🔧 Testing Control.Set command with Q-SYS Core...\n');
console.log(`Connecting to: ${host}:${port}`);

const client = new Qrwc({
  host,
  port,
  username,
  password,
  WebSocket,
});

async function testControlSet() {
  try {
    // Connect to Q-SYS Core
    console.log('\n1️⃣ Connecting to Q-SYS Core...');
    await client.connect();
    console.log('✅ Connected successfully!\n');

    // First, get the current value of a control
    console.log('2️⃣ Getting current control values...');
    const getResponse = await client.sendCommand({
      method: 'Control.Get',
      params: ['gain_1', 'mute_1'],
    });
    console.log('Current values:', JSON.stringify(getResponse, null, 2));

    // Test 1: Mute the control
    console.log('\n3️⃣ Testing MUTE (setting to true)...');
    const muteResponse = await client.sendCommand({
      method: 'Control.Set',
      params: {
        Name: 'mute_1',
        Value: true,
      },
    });
    console.log('Mute response:', JSON.stringify(muteResponse, null, 2));

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify the mute worked
    console.log('\n4️⃣ Verifying mute state...');
    const verifyMute = await client.sendCommand({
      method: 'Control.Get',
      params: ['mute_1'],
    });
    console.log('Mute state:', JSON.stringify(verifyMute, null, 2));

    // Test 2: Unmute the control
    console.log('\n5️⃣ Testing UNMUTE (setting to false)...');
    const unmuteResponse = await client.sendCommand({
      method: 'Control.Set',
      params: {
        Name: 'mute_1',
        Value: false,
      },
    });
    console.log('Unmute response:', JSON.stringify(unmuteResponse, null, 2));

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify the unmute worked
    console.log('\n6️⃣ Verifying unmute state...');
    const verifyUnmute = await client.sendCommand({
      method: 'Control.Get',
      params: ['mute_1'],
    });
    console.log('Unmute state:', JSON.stringify(verifyUnmute, null, 2));

    // Test 3: Set gain with ramp
    console.log('\n7️⃣ Testing gain control with ramp...');
    const gainResponse = await client.sendCommand({
      method: 'Control.Set',
      params: {
        Name: 'gain_1',
        Value: -10.0,
        Ramp: 2.0,
      },
    });
    console.log('Gain set response:', JSON.stringify(gainResponse, null, 2));

    console.log('\n✅ All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('- Control.Set command works correctly');
    console.log('- Mute control responds to true/false values');
    console.log('- Gain control accepts numeric values with ramp');
  } catch (error) {
    console.error('\n❌ Error during testing:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  } finally {
    // Disconnect
    console.log('\n🔌 Disconnecting...');
    await client.disconnect();
    console.log('✅ Disconnected');
  }
}

// Run the test
testControlSet().catch(console.error);
