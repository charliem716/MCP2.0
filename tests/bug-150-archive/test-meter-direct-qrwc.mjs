#!/usr/bin/env node

/**
 * Direct QRWC test to get Table_Mic_Meter control names
 */

console.log('=== Direct QRWC Test for Table_Mic_Meter ===\n');

import fs from 'fs';

async function testDirectQRWC() {
  const qrwcModule = await import('@q-sys/qrwc');
  const QRWC = qrwcModule.default || qrwcModule.QRWC;
  
  // Read config
  const config = JSON.parse(fs.readFileSync('qsys-core.config.json', 'utf8')).qsysCore;
  
  console.log('Connecting directly with official QRWC SDK...');
  
  const qrwc = new QRWC({
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    rejectUnauthorized: false
  });
  
  try {
    await qrwc.connect();
    console.log('✅ Connected\n');
    
    // Try different methods to get Table_Mic_Meter controls
    console.log('Testing different control access methods:\n');
    
    // Method 1: Direct control names (meter2 typically uses numeric suffixes)
    const testControls = [
      'Table_Mic_Meter.1',
      'Table_Mic_Meter.2',
      'Table_Mic_Meter.3',
      'Table_Mic_Meter.4'
    ];
    
    console.log('Method 1: Testing direct control names...');
    for (const control of testControls) {
      try {
        const result = await qrwc.sendRaw({
          method: 'Control.Get',
          params: {
            Controls: [control]
          }
        });
        
        if (result && result.result) {
          console.log(`✅ FOUND: ${control}`);
          console.log(`   Result:`, JSON.stringify(result.result, null, 2));
        }
      } catch (e) {
        console.log(`❌ ${control}: ${e.message}`);
      }
    }
    
    console.log('\nMethod 2: Using Component.GetControls...');
    try {
      const result = await qrwc.sendRaw({
        method: 'Component.GetControls',
        params: {
          Name: 'Table_Mic_Meter'
        }
      });
      
      console.log('Component.GetControls result:', JSON.stringify(result, null, 2));
    } catch (e) {
      console.log('Component.GetControls failed:', e.message);
    }
    
    console.log('\nMethod 3: Creating change group and polling...');
    
    // Create a change group
    const groupId = 'test-direct-' + Date.now();
    
    await qrwc.sendRaw({
      method: 'ChangeGroup.Create',
      params: { Id: groupId }
    });
    console.log('✅ Change group created:', groupId);
    
    // Add controls with different patterns
    const patterns = [
      ['Table_Mic_Meter.1', 'Table_Mic_Meter.2', 'Table_Mic_Meter.3', 'Table_Mic_Meter.4'],
      ['Table_Mic_Meter'],
      ['Table_Mic_Meter.meter.1', 'Table_Mic_Meter.meter.2']
    ];
    
    for (const controls of patterns) {
      try {
        await qrwc.sendRaw({
          method: 'ChangeGroup.AddControl',
          params: {
            Id: groupId,
            Controls: controls
          }
        });
        console.log(`Added controls: ${controls.join(', ')}`);
        
        // Poll to see if we get data
        const pollResult = await qrwc.sendRaw({
          method: 'ChangeGroup.Poll',
          params: { Id: groupId }
        });
        
        console.log('Poll result:', JSON.stringify(pollResult.result, null, 2));
        
        if (pollResult.result?.Changes?.length > 0) {
          console.log('✅ FOUND WORKING CONTROLS!');
          console.log('Control names:', pollResult.result.Changes.map(c => c.Name).join(', '));
          break;
        }
      } catch (e) {
        console.log(`Failed with ${controls[0]}: ${e.message}`);
      }
    }
    
    // Cleanup
    await qrwc.sendRaw({
      method: 'ChangeGroup.Destroy',
      params: { Id: groupId }
    });
    
    await qrwc.disconnect();
    console.log('\n✅ Test complete');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    await qrwc.disconnect().catch(() => {});
    process.exit(1);
  }
}

// Run test
testDirectQRWC();