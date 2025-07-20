#!/usr/bin/env node

import { OfficialQRWCClient } from './dist/qrwc/officialClient.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load config
const configPath = join(__dirname, 'qsys-core.config.json');
if (!fs.existsSync(configPath)) {
  console.error('❌ Config file not found. Run ./setup-env.sh first!');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const { host, port, username, password } = config.qsysCore;

console.log('🔍 Q-SYS Component Discovery Test');
console.log('='.repeat(60));
console.log(`🎯 Target: ${host}:${port}`);
console.log('='.repeat(60));

async function testComponents() {
  let officialClient;
  
  try {
    // 1. Connect to Q-SYS Core
    console.log('\n1️⃣ Connecting to Q-SYS Core...');
    officialClient = new OfficialQRWCClient({
      host,
      port,
      username,
      password,
      secure: port === 443
    });
    
    await officialClient.connect();
    console.log('   ✅ Connected!');
    
    // 2. Get QRWC instance
    console.log('\n2️⃣ Getting QRWC instance...');
    const qrwc = officialClient.getQrwc();
    if (!qrwc) {
      throw new Error('QRWC instance not available');
    }
    console.log('   ✅ QRWC instance obtained');
    
    // 3. Wait a moment for components to be populated
    console.log('\n3️⃣ Waiting for components to load...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 4. Check components
    console.log('\n4️⃣ Checking components...');
    const components = qrwc.components;
    const componentNames = Object.keys(components);
    console.log(`   Found ${componentNames.length} components`);
    
    if (componentNames.length > 0) {
      console.log('\n   First 10 components:');
      componentNames.slice(0, 10).forEach((name, i) => {
        const component = components[name];
        console.log(`   ${i + 1}. ${name}`);
        
        // Try to get controls for this component
        if (component) {
          const controls = component.controls;
          const controlNames = Object.keys(controls || {});
          console.log(`      └─ ${controlNames.length} controls`);
          
          // Show mute controls if any
          const muteControls = controlNames.filter(ctrl => 
            ctrl.toLowerCase().includes('mute')
          );
          if (muteControls.length > 0) {
            console.log(`      └─ 🔇 Mute controls: ${muteControls.join(', ')}`);
          }
        }
      });
    }
    
    // 5. Look specifically for mute controls
    console.log('\n5️⃣ Searching for mute controls across all components...');
    let muteControlsFound = 0;
    
    for (const [componentName, component] of Object.entries(components)) {
      if (component) {
        const controls = component.controls;
        const controlNames = Object.keys(controls || {});
        const muteControls = controlNames.filter(ctrl => 
          ctrl.toLowerCase().includes('mute')
        );
        
        if (muteControls.length > 0) {
          muteControlsFound += muteControls.length;
          console.log(`   🔇 ${componentName}: ${muteControls.join(', ')}`);
        }
      }
    }
    
    console.log(`\n   Total mute controls found: ${muteControlsFound}`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    if (officialClient) {
      console.log('\n🧹 Closing connection...');
      try {
        officialClient.disconnect();
      } catch (error) {
        // Ignore disconnect errors
      }
    }
  }
}

// Run the test
testComponents()
  .catch(console.error)
  .finally(() => {
    setTimeout(() => process.exit(0), 1000);
  });