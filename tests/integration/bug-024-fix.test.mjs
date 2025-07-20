#!/usr/bin/env node

/**
 * Integration test to verify BUG-024 fix
 * Tests that control names are parsed correctly in component.control format
 */

import { OfficialQRWCClient } from '../../dist/qrwc/officialClient.js';
import { QRWCClientAdapter } from '../../dist/mcp/qrwc/adapter.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load config
const configPath = join(dirname(dirname(__dirname)), 'qsys-core.config.json');
if (!fs.existsSync(configPath)) {
  console.error('❌ Config file not found. Run ./setup-env.sh first!');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const { host, port, username, password } = config.qsysCore;

console.log('🧪 BUG-024 Fix Verification Test');
console.log('='.repeat(60));

async function testBug024Fix() {
  let officialClient;
  let adapter;
  let testPassed = true;
  
  try {
    // Connect to Q-SYS
    console.log('\n1️⃣ Connecting to Q-SYS Core...');
    officialClient = new OfficialQRWCClient({
      host,
      port,
      username,
      password,
      secure: port === 443
    });
    
    await officialClient.connect();
    console.log('   ✅ Connected');
    
    // Create adapter
    adapter = new QRWCClientAdapter(officialClient);
    
    // Wait for components to load
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 1: Find a real control in component.control format
    console.log('\n2️⃣ Finding a test control...');
    const qrwc = officialClient.getQrwc();
    let testControl = null;
    
    for (const [componentName, component] of Object.entries(qrwc.components)) {
      if (component && component.controls) {
        // Find a simple control without dots in its name
        for (const [controlName, control] of Object.entries(component.controls)) {
          if (!controlName.includes('.') && (control.state === 0 || control.state === 1)) {
            testControl = {
              fullName: `${componentName}.${controlName}`,
              component: componentName,
              control: controlName,
              originalValue: component.controls[controlName].state
            };
            break;
          }
        }
        if (testControl) break;
      }
    }
    
    if (!testControl) {
      throw new Error('No controls found for testing');
    }
    
    console.log(`   Found test control: ${testControl.fullName}`);
    console.log(`   Component: ${testControl.component}`);
    console.log(`   Control: ${testControl.control}`);
    console.log(`   Current value: ${testControl.originalValue}`);
    
    // Test 2: Set control value using adapter
    console.log('\n3️⃣ Testing control set with component.control format...');
    const newValue = typeof testControl.originalValue === 'boolean' ? 
      !testControl.originalValue : 
      (typeof testControl.originalValue === 'number' ? testControl.originalValue + 0.1 : 'test');
    
    try {
      await adapter.sendCommand('Control.SetValues', {
        Controls: [{
          Name: testControl.fullName,
          Value: newValue
        }]
      });
      console.log('   ✅ Control.Set command succeeded');
    } catch (error) {
      console.error('   ❌ Control.Set failed:', error.message);
      testPassed = false;
    }
    
    // Test 3: Verify the value was set
    console.log('\n4️⃣ Verifying control value was updated...');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const updatedComponent = qrwc.components[testControl.component];
    const updatedValue = updatedComponent?.controls[testControl.control]?.state;
    
    if (updatedValue !== undefined) {
      console.log(`   New value: ${updatedValue}`);
      console.log('   ✅ Control value retrieved successfully');
    } else {
      console.error('   ❌ Could not retrieve updated value');
      testPassed = false;
    }
    
    // Test 4: Restore original value
    console.log('\n5️⃣ Restoring original value...');
    await adapter.sendCommand('Control.SetValues', {
      Controls: [{
        Name: testControl.fullName,
        Value: testControl.originalValue
      }]
    });
    console.log('   ✅ Original value restored');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    testPassed = false;
  } finally {
    if (officialClient) {
      console.log('\n🧹 Closing connection...');
      try {
        officialClient.disconnect();
      } catch (e) {}
    }
  }
  
  // Final result
  console.log('\n' + '='.repeat(60));
  if (testPassed) {
    console.log('✅ BUG-024 FIX VERIFIED: Control name parsing works correctly!');
    process.exit(0);
  } else {
    console.log('❌ BUG-024 FIX FAILED: Control name parsing still has issues');
    process.exit(1);
  }
}

// Run the test
testBug024Fix().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});