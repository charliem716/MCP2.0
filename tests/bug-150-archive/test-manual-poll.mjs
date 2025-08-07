#!/usr/bin/env node

/**
 * Manual poll test to debug why we're not seeing events
 */

console.log('=== Manual Poll Test for Table_Mic_Meter ===\n');

import fs from 'fs';

async function manualPollTest() {
  const { OfficialQRWCClient } = await import('./dist/qrwc/officialClient.js');
  const { QRWCClientAdapter } = await import('./dist/mcp/qrwc/adapter.js');
  
  // Read config
  const config = JSON.parse(fs.readFileSync('qsys-core.config.json', 'utf8')).qsysCore;
  
  console.log('Connecting to Q-SYS Core...');
  
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
    
    // Create change group
    const groupId = 'manual-poll-test';
    await adapter.sendCommand('ChangeGroup.Create', { Id: groupId });
    console.log('Change group created:', groupId);
    
    // Try different control name formats
    const controlSets = [
      {
        name: 'With dots (meter.1 format)',
        controls: ['Table_Mic_Meter.meter.1', 'Table_Mic_Meter.meter.2', 'Table_Mic_Meter.meter.3', 'Table_Mic_Meter.meter.4']
      },
      {
        name: 'Without component prefix',
        controls: ['meter.1', 'meter.2', 'meter.3', 'meter.4']
      },
      {
        name: 'Just numbers',
        controls: ['Table_Mic_Meter.1', 'Table_Mic_Meter.2', 'Table_Mic_Meter.3', 'Table_Mic_Meter.4']
      }
    ];
    
    for (const set of controlSets) {
      console.log(`\nTesting: ${set.name}`);
      console.log('Controls:', set.controls.join(', '));
      
      // Clear the group first
      try {
        await adapter.sendCommand('ChangeGroup.Clear', { Id: groupId });
      } catch (e) {
        // May not be implemented
      }
      
      // Add controls
      try {
        await adapter.sendCommand('ChangeGroup.AddControl', {
          Id: groupId,
          Controls: set.controls
        });
        console.log('✅ Controls added');
      } catch (e) {
        console.log('❌ Failed to add controls:', e.message);
        continue;
      }
      
      // Manual poll
      console.log('Polling...');
      const result = await adapter.sendCommand('ChangeGroup.Poll', { Id: groupId });
      
      if (result && result.Changes && result.Changes.length > 0) {
        console.log('🎉 GOT DATA!');
        console.log('Changes:', JSON.stringify(result.Changes, null, 2));
        
        // Poll multiple times to see if values change
        console.log('\nPolling 5 times to see value changes:');
        for (let i = 0; i < 5; i++) {
          await new Promise(resolve => setTimeout(resolve, 100));
          const pollResult = await adapter.sendCommand('ChangeGroup.Poll', { Id: groupId });
          if (pollResult.Changes && pollResult.Changes.length > 0) {
            console.log(`Poll ${i+1}:`, pollResult.Changes.map(c => 
              `${c.Name || c.Component + '.' + c.Name}=${c.Value?.toFixed(3)}`
            ).join(', '));
          } else {
            console.log(`Poll ${i+1}: No changes`);
          }
        }
        
        break; // Found working format
      } else {
        console.log('No changes returned');
      }
    }
    
    // Cleanup
    await adapter.sendCommand('ChangeGroup.Destroy', { Id: groupId });
    await client.disconnect();
    
    console.log('\n✅ Test complete');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    await client.disconnect().catch(() => {});
    process.exit(1);
  }
}

// Run test
manualPollTest();