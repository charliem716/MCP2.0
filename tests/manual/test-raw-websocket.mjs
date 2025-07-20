#!/usr/bin/env node

/**
 * Test raw WebSocket commands independently
 */

import WebSocket from 'ws';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '../../qsys-core.config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8')).qsysCore;

console.log('Testing Raw WebSocket Commands');
console.log('==============================');
console.log(`Target: ${config.host}:${config.port}`);
console.log('');

const url = `wss://${config.host}:${config.port}/qrc-public-api/v0`;
const ws = new WebSocket(url, {
  rejectUnauthorized: false
});

ws.on('open', () => {
  console.log('✅ WebSocket connected');
  console.log('');
  
  // Skip the initial EngineStatus message
  let skipFirst = true;
  
  ws.on('message', (data) => {
    if (skipFirst) {
      skipFirst = false;
      return;
    }
    
    console.log('📨 Response:', data.toString());
    try {
      const parsed = JSON.parse(data.toString());
      if (parsed.result) {
        console.log('✅ Command successful');
      } else if (parsed.error) {
        console.log('❌ Command error:', parsed.error.message);
      }
    } catch (e) {
      // Not JSON
    }
    console.log('');
  });
  
  // Test commands
  const commands = [
    { name: 'NoOp', cmd: { jsonrpc: '2.0', method: 'NoOp', params: {}, id: 1 } },
    { name: 'StatusGet', cmd: { jsonrpc: '2.0', method: 'StatusGet', params: {}, id: 2 } },
    { name: 'Component.GetComponents', cmd: { jsonrpc: '2.0', method: 'Component.GetComponents', params: {}, id: 3 } },
    { name: 'ComponentGetComponents', cmd: { jsonrpc: '2.0', method: 'ComponentGetComponents', params: {}, id: 4 } }
  ];
  
  let idx = 0;
  const interval = setInterval(() => {
    if (idx >= commands.length) {
      setTimeout(() => {
        console.log('✅ Test complete');
        ws.close();
      }, 1000);
      clearInterval(interval);
      return;
    }
    
    const { name, cmd } = commands[idx];
    console.log(`📤 Testing ${name}:`, JSON.stringify(cmd));
    ws.send(JSON.stringify(cmd));
    idx++;
  }, 1000);
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

ws.on('close', () => {
  console.log('🔌 WebSocket closed');
  process.exit(0);
});