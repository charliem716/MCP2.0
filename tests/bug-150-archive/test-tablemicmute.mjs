#!/usr/bin/env node

/**
 * Test for TableMicMute component Code Name
 */

console.log('=== Testing TableMicMute Component ===\n');

// Reduce logging
process.env.LOG_LEVEL = 'warn';

import fs from 'fs';

async function testTableMicMute() {
  const { OfficialQRWCClient } = await import('./dist/qrwc/officialClient.js');
  const { QRWCClientAdapter } = await import('./dist/mcp/qrwc/adapter.js');
  
  // Read config
  const config = JSON.parse(fs.readFileSync('qsys-core.config.json', 'utf8')).qsysCore;
  
  console.log('Connecting to Q-SYS Core at', config.host, '...');
  
  const client = new OfficialQRWCClient({
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to Q-SYS Core\n');
    
    const adapter = new QRWCClientAdapter(client);
    
    // TEST 1: Component.GetControls with TableMicMute
    console.log('TEST 1: Component.GetControls with TableMicMute');
    console.log('=' .repeat(50));
    
    try {
      const result = await adapter.sendCommand('Component.GetControls', {
        Name: 'TableMicMute'
      });
      
      if (result && result.result) {
        console.log('✅ Found TableMicMute component!');
        console.log(`   Component: ${result.result.Name}`);
        console.log(`   Controls found: ${result.result.Controls?.length || 0}`);
        
        if (result.result.Controls && result.result.Controls.length > 0) {
          console.log('\n   Available controls:');
          result.result.Controls.forEach((c, idx) => {
            console.log(`     ${idx + 1}. ${c.Name}`);
            console.log(`        Type: ${c.Type || 'unknown'}`);
            console.log(`        Value: ${c.Value !== undefined ? c.Value : 'N/A'}`);
            console.log(`        String: ${c.String || 'N/A'}`);
          });
        }
      }
    } catch (e) {
      console.log('❌ Component.GetControls failed:', e.message);
    }
    
    console.log('\n');
    
    // TEST 2: Component.Get with TableMicMute and meter controls
    console.log('TEST 2: Component.Get with TableMicMute');
    console.log('=' .repeat(50));
    
    const meterControlTests = [
      { Name: 'meter.1' },
      { Name: 'meter.2' }, 
      { Name: 'meter.3' },
      { Name: 'meter.4' }
    ];
    
    try {
      const result = await adapter.sendCommand('Component.Get', {
        Name: 'TableMicMute',
        Controls: meterControlTests
      });
      
      if (result && result.result) {
        console.log('✅ Component.Get succeeded with TableMicMute!');
        console.log(`   Component: ${result.result.Name}`);
        console.log(`   Controls returned: ${result.result.Controls?.length || 0}`);
        
        if (result.result.Controls) {
          console.log('\n   Control values:');
          result.result.Controls.forEach(c => {
            console.log(`     ${c.Name}: ${c.Value} (${c.String})`);
          });
          
          // Check if we got real values (not just placeholders)
          const hasRealValues = result.result.Controls.some(c => 
            c.Value !== 0 || c.String !== 'N/A'
          );
          
          if (hasRealValues) {
            console.log('\n🎉 SUCCESS! Got real meter values!');
            
            // Test 33Hz polling with these controls
            console.log('\nTEST 3: 33Hz Polling with TableMicMute meters');
            console.log('=' .repeat(50));
            
            const groupId = 'tablemicmute-33hz-test';
            const controlNames = result.result.Controls.map(c => `TableMicMute.${c.Name}`);
            
            console.log('Creating change group...');
            await adapter.sendCommand('ChangeGroup.Create', { Id: groupId });
            
            console.log('Adding controls:', controlNames.join(', '));
            await adapter.sendCommand('ChangeGroup.AddControl', {
              Id: groupId,
              Controls: controlNames
            });
            
            console.log('Starting 33Hz polling...\n');
            await adapter.sendCommand('ChangeGroup.AutoPoll', {
              Id: groupId,
              Rate: 0.03  // 33Hz
            });
            
            // Monitor for events
            let eventCount = 0;
            const startTime = Date.now();
            
            adapter.on('changeGroup:changes', (event) => {
              eventCount++;
              if (eventCount <= 5) {
                const timestamp = Date.now() - startTime;
                console.log(`Event ${eventCount} (${timestamp}ms): ${event.changes.map(c => 
                  `${c.Name.split('.').pop()}=${c.Value.toFixed(2)}dB`
                ).join(', ')}`);
              }
            });
            
            // Run for 10 seconds
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            await adapter.sendCommand('ChangeGroup.Destroy', { Id: groupId });
            
            const duration = (Date.now() - startTime) / 1000;
            const rate = eventCount / duration;
            
            console.log('\n🎯 33Hz TEST RESULTS:');
            console.log(`   Events: ${eventCount}`);
            console.log(`   Duration: ${duration.toFixed(1)}s`);
            console.log(`   Rate: ${rate.toFixed(1)} Hz`);
            console.log(`   Expected: ~${Math.floor(duration * 33)} events`);
            
            if (eventCount > duration * 25) {
              console.log('\n🎉 FULL SUCCESS! BUG-150 FULLY RESOLVED!');
              console.log('   - TableMicMute component found');
              console.log('   - Meter controls accessible');
              console.log('   - 33Hz polling working with real data');
            }
          }
        }
      }
    } catch (e) {
      console.log('❌ Component.Get failed:', e.message);
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
testTableMicMute();