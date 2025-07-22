#!/usr/bin/env node

/**
 * Direct test of QRWC adapter Component.GetAllControls
 */

import { OfficialQRWCClient } from './dist/src/qrwc/officialClient.js';
import { QRWCClientAdapter } from './dist/src/mcp/qrwc/adapter.js';
import fs from 'fs';

console.log('🧪 Testing QRWC Adapter Component.GetAllControls\n');

// Load config
const config = JSON.parse(fs.readFileSync('qsys-core.config.json', 'utf-8'));
const { host, port } = config.qsysCore;

// Create official client
const officialClient = new OfficialQRWCClient({ host, port });

// Connect
await officialClient.connect();
console.log('✅ Connected to Q-SYS Core\n');

// Create adapter
const adapter = new QRWCClientAdapter(officialClient);

try {
  console.log('📋 Testing Component.GetAllControls...');
  const response = await adapter.sendCommand('Component.GetAllControls');
  
  console.log('\n📊 Raw adapter response:');
  console.log(JSON.stringify(response, null, 2).substring(0, 500) + '...\n');
  
  // Check response structure
  if (response?.result?.Controls && Array.isArray(response.result.Controls)) {
    console.log(`✅ Response has correct structure!`);
    console.log(`   - result.Name: "${response.result.Name}"`);
    console.log(`   - result.Controls: Array with ${response.result.Controls.length} items\n`);
    
    // Show first few controls
    console.log('First 5 controls:');
    response.result.Controls.slice(0, 5).forEach(ctrl => {
      console.log(`   - ${ctrl.Name} (Component: ${ctrl.Component}, Type: ${ctrl.Type}): ${ctrl.Value}`);
    });
    
    // Check component diversity
    const uniqueComponents = new Set(response.result.Controls.map(c => c.Component));
    console.log(`\n✅ Found ${uniqueComponents.size} unique components`);
    console.log('First 5 components:', Array.from(uniqueComponents).slice(0, 5));
  } else {
    console.log('❌ Response structure is incorrect!');
    console.log('Expected: { result: { Name: string, Controls: Array } }');
    console.log('Actual:', typeof response);
  }
  
  // Test Component.GetControls for specific component
  console.log('\n📋 Testing Component.GetControls for "Soundbar"...');
  const soundbarResponse = await adapter.sendCommand('Component.GetControls', { Name: 'Soundbar' });
  
  if (soundbarResponse?.result?.Controls && Array.isArray(soundbarResponse.result.Controls)) {
    console.log(`✅ Soundbar response has correct structure!`);
    console.log(`   - result.Name: "${soundbarResponse.result.Name}"`);
    console.log(`   - result.Controls: Array with ${soundbarResponse.result.Controls.length} items`);
  } else {
    console.log('❌ Soundbar response structure is incorrect!');
  }
  
} catch (error) {
  console.error('❌ Error:', error.message);
} finally {
  await officialClient.disconnect();
  console.log('\n👋 Disconnected');
}