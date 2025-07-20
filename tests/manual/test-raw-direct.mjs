#!/usr/bin/env node

/**
 * Direct test of raw commands without QRWC interference
 */

import WebSocket from 'ws';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '../../qsys-core.config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8')).qsysCore;

console.log('Testing Raw Commands Directly');
console.log('=============================\n');

const url = `wss://${config.host}:${config.port}/qrc-public-api/v0`;
const ws = new WebSocket(url, {
  rejectUnauthorized: false
});

let testsPassed = 0;
let testsFailed = 0;

ws.on('open', () => {
  console.log('✅ Connected to Q-SYS Core\n');
  
  let messageCount = 0;
  const pendingCommands = new Map();
  
  ws.on('message', (data) => {
    messageCount++;
    const msg = data.toString();
    
    // Skip initial EngineStatus
    if (messageCount === 1 && msg.includes('EngineStatus')) {
      console.log('📨 Initial EngineStatus received\n');
      return;
    }
    
    try {
      const response = JSON.parse(msg);
      
      if (response.id && pendingCommands.has(response.id)) {
        const cmdInfo = pendingCommands.get(response.id);
        const duration = Date.now() - cmdInfo.startTime;
        
        console.log(`📨 Response for ${cmdInfo.name} (${duration}ms):`);
        console.log(JSON.stringify(response, null, 2));
        
        if (response.result !== undefined) {
          console.log(`✅ ${cmdInfo.name} - SUCCESS\n`);
          testsPassed++;
        } else if (response.error) {
          console.log(`❌ ${cmdInfo.name} - ERROR: ${response.error.message}\n`);
          testsFailed++;
        }
        
        pendingCommands.delete(response.id);
        
        // Check if all tests complete
        if (pendingCommands.size === 0 && cmdInfo.isLast) {
          setTimeout(() => {
            console.log('\n📊 Test Summary:');
            console.log(`✅ Passed: ${testsPassed}`);
            console.log(`❌ Failed: ${testsFailed}`);
            console.log(`Total: ${testsPassed + testsFailed}`);
            ws.close();
          }, 500);
        }
      }
    } catch (e) {
      console.log('⚠️  Non-JSON message:', msg.substring(0, 100));
    }
  });
  
  // Test commands
  const commands = [
    { name: 'NoOp', cmd: { jsonrpc: '2.0', method: 'NoOp', params: {}, id: 1 } },
    { name: 'StatusGet', cmd: { jsonrpc: '2.0', method: 'StatusGet', params: {}, id: 2 } },
    { name: 'ComponentGetComponents', cmd: { jsonrpc: '2.0', method: 'ComponentGetComponents', params: {}, id: 3 } },
    { name: 'Invalid Command', cmd: { jsonrpc: '2.0', method: 'ThisDoesNotExist', params: {}, id: 4 } },
    { name: 'EngineStatus', cmd: { jsonrpc: '2.0', method: 'EngineStatus', params: {}, id: 5 }, isLast: true }
  ];
  
  // Send all commands
  console.log('📤 Sending test commands...\n');
  commands.forEach((item, idx) => {
    setTimeout(() => {
      console.log(`📤 Sending ${item.name}...`);
      pendingCommands.set(item.cmd.id, { 
        name: item.name, 
        startTime: Date.now(),
        isLast: item.isLast || false
      });
      ws.send(JSON.stringify(item.cmd));
    }, idx * 100);
  });
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

ws.on('close', () => {
  console.log('\n🔌 Connection closed');
  process.exit(testsFailed > 0 ? 1 : 0);
});