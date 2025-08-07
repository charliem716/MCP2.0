#!/usr/bin/env node

/**
 * Test Component.Get to find the right control format
 */

console.log('=== Testing Component.Get for Table_Mic_Meter ===\n');

// Reduce logging
process.env.LOG_LEVEL = 'warn';

import fs from 'fs';

async function testComponentGet() {
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
    
    // Try different control name patterns with Component.Get
    const testPatterns = [
      // Without dots
      { Name: 'Table_Mic_Meter', Controls: [{ Name: 'meter1' }] },
      { Name: 'Table_Mic_Meter', Controls: [{ Name: 'meter2' }] },
      { Name: 'Table_Mic_Meter', Controls: [{ Name: 'meter3' }] },
      { Name: 'Table_Mic_Meter', Controls: [{ Name: 'meter4' }] },
      // With dots
      { Name: 'Table_Mic_Meter', Controls: [{ Name: 'meter.1' }] },
      { Name: 'Table_Mic_Meter', Controls: [{ Name: 'meter.2' }] },
      { Name: 'Table_Mic_Meter', Controls: [{ Name: 'meter.3' }] },
      { Name: 'Table_Mic_Meter', Controls: [{ Name: 'meter.4' }] },
      // Just numbers
      { Name: 'Table_Mic_Meter', Controls: [{ Name: '1' }] },
      { Name: 'Table_Mic_Meter', Controls: [{ Name: '2' }] },
      { Name: 'Table_Mic_Meter', Controls: [{ Name: '3' }] },
      { Name: 'Table_Mic_Meter', Controls: [{ Name: '4' }] },
      // All at once
      { Name: 'Table_Mic_Meter', Controls: [
        { Name: 'meter.1' },
        { Name: 'meter.2' },
        { Name: 'meter.3' },
        { Name: 'meter.4' }
      ]}
    ];
    
    console.log('Testing Component.Get patterns:\n');
    
    const workingControls = [];
    
    for (const params of testPatterns) {
      try {
        const result = await adapter.sendCommand('Component.Get', params);
        
        if (result && result.Controls && result.Controls.length > 0) {
          console.log('✅ SUCCESS with:', JSON.stringify(params));
          console.log('   Result:', JSON.stringify(result, null, 2));
          
          // Store working control names
          result.Controls.forEach(c => {
            if (c.Name && !workingControls.includes(c.Name)) {
              workingControls.push(c.Name);
            }
          });
        }
      } catch (e) {
        // Silent fail for most
        if (params.Controls.length > 1) {
          console.log('❌ Failed with multiple controls:', e.message);
        }
      }
    }
    
    if (workingControls.length > 0) {
      console.log('\n✅ WORKING CONTROL NAMES FOUND:');
      workingControls.forEach(name => console.log('  -', name));
      
      // Now test change group with these exact names
      console.log('\nTesting change group with working controls...\n');
      
      const groupId = 'component-test-' + Date.now();
      await adapter.sendCommand('ChangeGroup.Create', { Id: groupId });
      
      // For Component controls, we need to use AddComponentControl
      // But since our adapter doesn't have it, we'll add them as full paths
      const fullPaths = workingControls.map(name => `Table_Mic_Meter.${name}`);
      
      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: groupId,
        Controls: fullPaths
      });
      
      console.log('Added controls:', fullPaths.join(', '));
      
      // Poll once to see values
      const pollResult = await adapter.sendCommand('ChangeGroup.Poll', { Id: groupId });
      console.log('\nPoll result:', JSON.stringify(pollResult, null, 2));
      
      // Clean up
      await adapter.sendCommand('ChangeGroup.Destroy', { Id: groupId });
      
    } else {
      console.log('\n⚠️  No working control patterns found');
    }
    
    await client.disconnect();
    console.log('\n✅ Test complete');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    await client.disconnect().catch(() => {});
    process.exit(1);
  }
}

// Run test
testComponentGet();