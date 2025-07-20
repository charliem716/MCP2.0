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

console.log('🔇 Simple Mute Test');
console.log('='.repeat(60));
console.log(`🎯 Target: ${host}:${port}`);
console.log('='.repeat(60));

async function testMute() {
  let officialClient;
  
  try {
    // 1. Connect
    console.log('\n1️⃣ Connecting...');
    officialClient = new OfficialQRWCClient({
      host,
      port,
      username,
      password,
      secure: port === 443
    });
    
    await officialClient.connect();
    console.log('   ✅ Connected');
    
    // 2. Wait for components to load
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 3. Get QRWC instance and find first mute control
    const qrwc = officialClient.getQrwc();
    if (!qrwc) {
      throw new Error('No QRWC instance');
    }
    
    console.log('\n2️⃣ Finding a mute control...');
    let targetControl = null;
    
    for (const [componentName, component] of Object.entries(qrwc.components)) {
      if (component && component.controls) {
        for (const [controlName, control] of Object.entries(component.controls)) {
          if (controlName.toLowerCase().includes('mute')) {
            targetControl = control;
            console.log(`   ✅ Found: ${componentName}.${controlName}`);
            break;
          }
        }
        if (targetControl) break;
      }
    }
    
    if (!targetControl) {
      console.log('   ❌ No mute control found');
      return;
    }
    
    // 4. Get current state
    const originalState = targetControl.state.Bool;
    console.log('\n3️⃣ Current state:', originalState ? '🔇 MUTED' : '🔊 UNMUTED');
    
    // 5. Toggle mute
    console.log('\n4️⃣ Toggling mute...');
    await targetControl.update(!originalState ? 1 : 0);
    
    // 6. Wait and check
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('   New state:', targetControl.state.Bool ? '🔇 MUTED' : '🔊 UNMUTED');
    
    // 7. Restore
    console.log('\n5️⃣ Restoring original state in 2 seconds...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    await targetControl.update(originalState ? 1 : 0);
    console.log('   Restored to:', originalState ? '🔇 MUTED' : '🔊 UNMUTED');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    if (officialClient) {
      console.log('\n🧹 Closing...');
      try {
        officialClient.disconnect();
      } catch (e) {}
    }
  }
}

testMute()
  .catch(console.error)
  .finally(() => {
    setTimeout(() => process.exit(0), 1000);
  });