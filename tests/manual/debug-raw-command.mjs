#!/usr/bin/env node

/**
 * Debug script for send_raw_command issue
 * Tests raw WebSocket communication with Q-SYS Core
 */

import WebSocket from 'ws';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load configuration
const configPath = join(__dirname, '../../qsys-core.config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8')).qsysCore;

console.log('🔍 Q-SYS Raw Command Debug Test');
console.log('================================');
console.log(`Target: ${config.host}:${config.port}`);
console.log(`Endpoint: wss://${config.host}:${config.port}/qrc-public-api/v0`);
console.log('');

// Test 1: Direct WebSocket connection
async function testDirectWebSocket() {
  console.log('Test 1: Direct WebSocket Connection');
  console.log('-----------------------------------');
  
  return new Promise((resolve) => {
    const url = `wss://${config.host}:${config.port}/qrc-public-api/v0`;
    const ws = new WebSocket(url, {
      rejectUnauthorized: false
    });
    
    ws.on('open', () => {
      console.log('✅ WebSocket connected');
      
      // Test different command formats
      const commands = [
        // Standard JSON-RPC 2.0 format
        { jsonrpc: '2.0', method: 'NoOp', params: {}, id: 1 },
        { jsonrpc: '2.0', method: 'Status.Get', params: {}, id: 2 },
        { jsonrpc: '2.0', method: 'StatusGet', params: {}, id: 3 },
        // Without params
        { jsonrpc: '2.0', method: 'NoOp', id: 4 },
        { jsonrpc: '2.0', method: 'Status.Get', id: 5 },
        // Different params format
        { jsonrpc: '2.0', method: 'Status.Get', params: null, id: 6 },
        { jsonrpc: '2.0', method: 'Component.GetComponents', params: {}, id: 7 }
      ];
      
      let responseCount = 0;
      const expectedResponses = commands.length;
      
      ws.on('message', (data) => {
        console.log('📨 Received:', data.toString());
        responseCount++;
        
        if (responseCount >= expectedResponses) {
          ws.close();
        }
      });
      
      console.log('📤 Sending test commands...');
      commands.forEach((cmd, idx) => {
        setTimeout(() => {
          console.log(`\nSending command ${idx + 1}:`, JSON.stringify(cmd));
          ws.send(JSON.stringify(cmd));
        }, idx * 500); // Stagger sends
      });
      
      // Close after timeout if no responses
      setTimeout(() => {
        console.log('\n⏱️ Timeout - closing connection');
        ws.close();
      }, 10000);
    });
    
    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
    });
    
    ws.on('close', () => {
      console.log('🔌 WebSocket closed');
      resolve();
    });
  });
}

// Test 2: Test with QRWC library connection
async function testWithQRWC() {
  console.log('\n\nTest 2: Commands After QRWC Connection');
  console.log('--------------------------------------');
  
  const { OfficialQRWCClient } = await import('../../dist/src/qrwc/officialClient.js');
  
  const client = new OfficialQRWCClient({
    host: config.host,
    port: config.port
  });
  
  try {
    console.log('🔌 Connecting via QRWC...');
    await client.connect();
    console.log('✅ QRWC connected');
    
    // Wait for QRWC initialization
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Try raw commands
    console.log('\n📤 Testing raw commands via QRWC...');
    
    const testCommands = [
      { method: 'NoOp', params: {} },
      { method: 'Status.Get', params: {} },
      { method: 'Component.GetComponents', params: {} }
    ];
    
    for (const cmd of testCommands) {
      try {
        console.log(`\nTrying ${cmd.method}...`);
        const result = await Promise.race([
          client.sendRawCommand(cmd.method, cmd.params),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout after 3s')), 3000)
          )
        ]);
        console.log('✅ Success:', result);
      } catch (error) {
        console.log('❌ Failed:', error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Connection error:', error.message);
  } finally {
    console.log('\n🔌 Disconnecting...');
    client.disconnect();
  }
}

// Test 3: Check what messages QRWC sends
async function monitorQRWCMessages() {
  console.log('\n\nTest 3: Monitor QRWC Protocol Messages');
  console.log('--------------------------------------');
  
  const url = `wss://${config.host}:${config.port}/qrc-public-api/v0`;
  const ws = new WebSocket(url, {
    rejectUnauthorized: false
  });
  
  return new Promise((resolve) => {
    ws.on('open', () => {
      console.log('✅ WebSocket connected for monitoring');
      console.log('📡 Listening for protocol messages...\n');
      
      let messageCount = 0;
      
      ws.on('message', (data) => {
        messageCount++;
        const msg = data.toString();
        console.log(`Message ${messageCount}:`, msg.substring(0, 200) + (msg.length > 200 ? '...' : ''));
        
        // Try to parse and identify message type
        try {
          const parsed = JSON.parse(msg);
          if (parsed.method) {
            console.log(`  → Method: ${parsed.method}`);
          }
          if (parsed.result) {
            console.log(`  → Result keys:`, Object.keys(parsed.result).join(', '));
          }
        } catch (e) {
          // Not JSON
        }
        console.log('');
      });
      
      // Let it run for a bit to see initial handshake
      setTimeout(() => {
        console.log(`\n📊 Total messages received: ${messageCount}`);
        ws.close();
      }, 5000);
    });
    
    ws.on('close', () => {
      resolve();
    });
  });
}

// Run all tests
async function runTests() {
  try {
    await testDirectWebSocket();
    await testWithQRWC();
    await monitorQRWCMessages();
  } catch (error) {
    console.error('Test error:', error);
  }
  
  console.log('\n✅ Debug tests complete');
}

runTests();