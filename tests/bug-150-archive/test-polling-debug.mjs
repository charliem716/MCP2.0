#!/usr/bin/env node

/**
 * Debug why polling isn't returning events
 */

console.log('=== POLLING DEBUG TEST ===\n');

process.env.LOG_LEVEL = 'warn';

import fs from 'fs';

async function debugPolling() {
  const { OfficialQRWCClient } = await import('./dist/qrwc/officialClient.js');
  const { QRWCClientAdapter } = await import('./dist/mcp/qrwc/adapter.js');
  
  const config = JSON.parse(fs.readFileSync('qsys-core.config.json', 'utf8')).qsysCore;
  
  const client = new OfficialQRWCClient({
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password
  });
  
  try {
    await client.connect();
    console.log('✅ Connected\n');
    
    const adapter = new QRWCClientAdapter(client);
    
    // Get initial values
    const controls = await adapter.sendCommand('Component.GetControls', {
      Name: 'TableMicMeter'
    });
    
    console.log('Initial meter values:');
    controls.result.Controls
      .filter(c => c.Name.startsWith('meter.'))
      .forEach(c => {
        console.log(`  ${c.Name}: ${parseFloat(c.Value).toFixed(2)} dB`);
      });
    
    // Create change group
    const groupId = 'debug-poll';
    await adapter.sendCommand('ChangeGroup.Create', { Id: groupId });
    
    // Add meter controls
    await adapter.sendCommand('ChangeGroup.AddComponentControl', {
      Id: groupId,
      Component: {
        Name: 'TableMicMeter',
        Controls: [
          { Name: 'meter.1' },
          { Name: 'meter.2' },
          { Name: 'meter.3' },
          { Name: 'meter.4' }
        ]
      }
    });
    
    console.log('\nPolling manually 5 times...\n');
    
    // Poll manually a few times
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 500));
      
      const pollResult = await adapter.sendCommand('ChangeGroup.Poll', {
        Id: groupId
      });
      
      console.log(`Poll ${i+1}:`);
      if (pollResult.result.Changes && pollResult.result.Changes.length > 0) {
        pollResult.result.Changes.forEach(c => {
          console.log(`  ${c.Name}: ${parseFloat(c.Value).toFixed(2)} dB`);
        });
      } else {
        console.log('  No changes detected');
      }
    }
    
    // Now check current values again
    console.log('\nCurrent meter values:');
    const currentControls = await adapter.sendCommand('Component.GetControls', {
      Name: 'TableMicMeter'
    });
    
    currentControls.result.Controls
      .filter(c => c.Name.startsWith('meter.'))
      .forEach(c => {
        console.log(`  ${c.Name}: ${parseFloat(c.Value).toFixed(2)} dB`);
      });
    
    // Check if values are actually changing in the SDK
    const qrwc = client.getQrwc();
    if (qrwc?.components?.TableMicMeter) {
      console.log('\nSDK meter values:');
      ['meter.1', 'meter.2', 'meter.3', 'meter.4'].forEach(name => {
        const control = qrwc.components.TableMicMeter.controls[name];
        if (control) {
          console.log(`  ${name}: ${parseFloat(control.state.Value).toFixed(2)} dB`);
        }
      });
    }
    
    await adapter.sendCommand('ChangeGroup.Destroy', { Id: groupId });
    await client.disconnect();
    
    console.log('\n✅ Debug complete');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    await client.disconnect().catch(() => {});
  }
}

debugPolling();