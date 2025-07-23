#!/usr/bin/env node

/**
 * Simple Q-SYS Core Connection Test
 * Tests the official @q-sys/qrwc SDK connection with detailed logging
 */

import { Qrwc } from '@q-sys/qrwc';
import WebSocket from 'ws';
import fs from 'fs';

// Load config from JSON file
const configPath = 'qsys-core.config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const { host, port, username, password } = config.qsysCore;

console.log('🧪 Q-SYS Connection Test');
console.log('='.repeat(50));
console.log(`🎯 Host: ${host}`);
console.log(`🔌 Port: ${port}`);
console.log(`👤 Username: "${username}" ${username ? '(with auth)' : '(no auth)'}`);
console.log(`🔐 Password: "${password ? '***' : ''}" ${password ? '(with auth)' : '(no auth)'}`);
console.log('='.repeat(50));

// Create WebSocket URL - try different endpoints
const endpoints = [
  `/qrc-public-api/v0`,
  `/qrc`,
  `/rpc`,
  `/jsonrpc`,
  `/websocket`,
  ``  // Direct connection
];

console.log(`🔗 Testing WebSocket endpoints on ${host}:${port}:`);
endpoints.forEach((endpoint, i) => {
  console.log(`   ${i + 1}. ws://${host}:${port}${endpoint}`);
});

// Try both WS and WSS protocols
const protocols = ['wss', 'ws'];
const wsUrl = `wss://${host}:${port}/qrc-public-api/v0`;
console.log(`\n🚀 Attempting WSS (Secure WebSocket): ${wsUrl}`);

// Create WebSocket connection with SSL options for self-signed certificates
const socket = new WebSocket(wsUrl, {
  rejectUnauthorized: false // Allow self-signed certificates
});
let qrwc;

socket.on('open', async () => {
  console.log('🔌 WebSocket connected successfully!');
  
  try {
    // Create QRWC instance with the open socket
    console.log('🏗️ Creating QRWC instance...');
    qrwc = await Qrwc.createQrwc({
      socket,
      pollingInterval: 350, // Default polling interval
      timeout: 5000 // 5 second timeout
    });
    
    console.log('✅ QRWC instance created successfully!');
    console.log(`📦 Components found: ${Object.keys(qrwc.components).length}`);
    
    // List all available components
    const componentNames = Object.keys(qrwc.components);
    if (componentNames.length > 0) {
      console.log('🎛️ Available components:');
      componentNames.forEach(name => {
        const controlCount = Object.keys(qrwc.components[name].controls).length;
        console.log(`  - ${name} (${controlCount} controls)`);
      });
    } else {
      console.log('⚠️  No scriptable components found. Make sure components are marked as scriptable in Q-SYS Designer.');
    }
    
    // Set up disconnect handler
    qrwc.on('disconnected', (reason) => {
      console.log('👋 QRWC disconnected:', reason);
      process.exit(0);
    });
    
    // Close connection after test
    setTimeout(() => {
      console.log('🧹 Closing test connection...');
      qrwc.close();
    }, 3000);
    
  } catch (error) {
    console.error('💥 FATAL QRWC CREATION ERROR:', error.message);
    console.error('📝 Full error:', error);
    socket.close();
    process.exit(1);
  }
});

socket.on('error', (error) => {
  console.error('❌ WEBSOCKET ERROR:', error.message);
  console.error('📝 Error details:', error);
  
  // Common error interpretations
  if (error.code === 'ECONNREFUSED') {
    console.error('');
    console.error('🔍 TROUBLESHOOTING:');
    console.error('   • Check if Q-SYS Core is powered on and accessible');
    console.error('   • Verify the IP address and port are correct');
    console.error('   • Ensure "Allow External Control" is enabled in Q-SYS Designer');
    console.error('   • Try different ports: 443 (HTTPS) or 1710 (HTTP)');
  } else if (error.code === 'ENOTFOUND') {
    console.error('');
    console.error('🔍 TROUBLESHOOTING:');
    console.error('   • Check if the IP address is correct');
    console.error(`   • Verify network connectivity with: ping ${  host}`);
  }
  
  process.exit(1);
});

socket.on('close', (code, reason) => {
  console.log(`👋 WebSocket closed: ${code} - ${reason}`);
  process.exit(0);
});

// Timeout if connection takes too long
setTimeout(() => {
  console.error('⏰ CONNECTION TIMEOUT - No response after 15 seconds');
  socket.close();
  process.exit(1);
}, 15000); 