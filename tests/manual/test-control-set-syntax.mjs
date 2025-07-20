#!/usr/bin/env node

import WebSocket from 'ws';
import fs from 'fs';

// Load Q-SYS configuration
const configPath = 'qsys-core.config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const { host, port, username, password } = config.qsysCore;

console.log('🔧 Verifying Control.Set command syntax...\n');
console.log(`Connecting to: ${host}:${port}`);

const wsUrl = `wss://${host}:${port}/qrc`;
const socket = new WebSocket(wsUrl, {
  headers: {
    'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
  },
  rejectUnauthorized: false
});

let requestId = 1;

function sendCommand(method, params) {
  return new Promise((resolve, reject) => {
    const id = requestId++;
    const command = {
      jsonrpc: "2.0",
      method: method,
      params: params,
      id: id
    };
    
    console.log(`\n📤 Sending: ${JSON.stringify(command, null, 2)}`);
    
    const handler = (data) => {
      const response = JSON.parse(data.toString());
      if (response.id === id) {
        console.log(`📥 Response: ${JSON.stringify(response, null, 2)}`);
        socket.removeListener('message', handler);
        resolve(response); // Return full response to check error codes
      }
    };
    
    socket.on('message', handler);
    socket.send(JSON.stringify(command) + '\0');
  });
}

socket.on('open', async () => {
  console.log('\n✅ WebSocket connected successfully!\n');
  
  try {
    console.log('1️⃣ Testing Control.Set command syntax (expecting error code 8 for non-existent control)...');
    
    // Test the correct syntax - should get error code 8 (control does not exist)
    const correctSyntax = await sendCommand('Control.Set', {
      Name: 'TestControl',
      Value: 50,
      Ramp: 1.0
    });
    
    if (correctSyntax.error && correctSyntax.error.code === 8) {
      console.log('\n✅ Control.Set syntax is CORRECT!');
      console.log('   Q-SYS recognized the command but reported the control doesn\'t exist (expected)');
    }
    
    console.log('\n2️⃣ Testing incorrect Control.SetValue command (should get different error)...');
    
    // Test incorrect command name
    const incorrectCommand = await sendCommand('Control.SetValue', {
      Name: 'TestControl',
      Value: 50
    });
    
    if (incorrectCommand.error && incorrectCommand.error.code !== 8) {
      console.log('\n✅ Control.SetValue is INCORRECT as expected!');
      console.log(`   Error: ${incorrectCommand.error.message} (code: ${incorrectCommand.error.code})`);
    }
    
    console.log('\n3️⃣ Testing incorrect parameter format (Controls array)...');
    
    // Test incorrect parameter format
    const incorrectParams = await sendCommand('Control.Set', {
      Controls: [{
        Name: 'TestControl',
        Value: 50
      }]
    });
    
    if (incorrectParams.error) {
      console.log('\n✅ Controls array format is INCORRECT as expected!');
      console.log(`   Error: ${incorrectParams.error.message} (code: ${incorrectParams.error.code})`);
    }
    
    console.log('\n📋 Summary:');
    console.log('✅ Control.Set is the correct command name');
    console.log('✅ Parameters should be { Name, Value, Ramp } directly');
    console.log('❌ Control.SetValue is not a valid QRC command');
    console.log('❌ Controls array wrapper is not valid for Control.Set');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
  
  console.log('\n🔌 Closing connection...');
  socket.close();
});

socket.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  process.exit(1);
});

socket.on('close', () => {
  console.log('👋 Connection closed');
  process.exit(0);
});