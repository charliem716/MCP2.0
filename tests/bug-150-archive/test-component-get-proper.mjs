#!/usr/bin/env node

/**
 * Test Component.Get with proper QRC format based on documentation
 * The key insight: Component.Get takes Name (component) and Controls array
 * Control names within the component DON'T include the component name prefix
 */

console.log('=== Testing Component.Get with Proper QRC Format ===\n');

// Reduce logging
process.env.LOG_LEVEL = 'warn';

import fs from 'fs';

async function testComponentGetProper() {
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
    
    // STEP 1: Verify Table_Mic_Meter exists
    console.log('STEP 1: Verifying Table_Mic_Meter component exists...\n');
    
    const componentsResult = await adapter.sendCommand('Component.GetComponents');
    const components = componentsResult.result || componentsResult || [];
    
    const tableMicMeter = components.find(c => c.Name === 'Table_Mic_Meter');
    
    if (!tableMicMeter) {
      console.log('❌ Table_Mic_Meter not found');
      await client.disconnect();
      process.exit(1);
    }
    
    console.log('✅ Found Table_Mic_Meter');
    console.log('  Type:', tableMicMeter.Type);
    console.log('  Properties:', JSON.stringify(tableMicMeter.Properties || {}, null, 2));
    
    // STEP 2: Try Component.Get with proper format
    console.log('\nSTEP 2: Using Component.Get with proper QRC format...\n');
    
    // Based on QRC docs, control names within component don't include component prefix
    const testFormats = [
      {
        desc: 'Format 1: Just control names (meter.1, meter.2, etc)',
        params: {
          Name: 'Table_Mic_Meter',
          Controls: [
            { Name: 'meter.1' },
            { Name: 'meter.2' },
            { Name: 'meter.3' },
            { Name: 'meter.4' }
          ]
        }
      },
      {
        desc: 'Format 2: Without dots (meter1, meter2, etc)',
        params: {
          Name: 'Table_Mic_Meter',
          Controls: [
            { Name: 'meter1' },
            { Name: 'meter2' },
            { Name: 'meter3' },
            { Name: 'meter4' }
          ]
        }
      },
      {
        desc: 'Format 3: Channel notation (ch.1, ch.2, etc)',
        params: {
          Name: 'Table_Mic_Meter',
          Controls: [
            { Name: 'ch.1' },
            { Name: 'ch.2' },
            { Name: 'ch.3' },
            { Name: 'ch.4' }
          ]
        }
      },
      {
        desc: 'Format 4: Simple numbers (1, 2, 3, 4)',
        params: {
          Name: 'Table_Mic_Meter',
          Controls: [
            { Name: '1' },
            { Name: '2' },
            { Name: '3' },
            { Name: '4' }
          ]
        }
      }
    ];
    
    let workingFormat = null;
    let workingControls = null;
    
    for (const format of testFormats) {
      console.log(`Testing ${format.desc}...`);
      
      try {
        const result = await adapter.sendCommand('Component.Get', format.params);
        
        if (result && result.Controls && result.Controls.length > 0) {
          console.log('  ✅ SUCCESS! Got control values:');
          result.Controls.forEach(control => {
            console.log(`    ${control.Name}: ${control.Value?.toFixed(2)} dB (${control.String})`);
          });
          
          workingFormat = format;
          workingControls = result.Controls;
          break;
        } else {
          console.log('  ❌ No controls returned');
        }
      } catch (e) {
        console.log('  ❌ Error:', e.message);
      }
    }
    
    // STEP 3: If we found working controls, test with ChangeGroup
    if (workingControls) {
      console.log('\n' + '='.repeat(60));
      console.log('🎉 FOUND WORKING FORMAT!');
      console.log('='.repeat(60));
      
      console.log('\nSTEP 3: Testing ChangeGroup with discovered controls...\n');
      
      // For ChangeGroup, we need full control names
      const fullControlNames = workingControls.map(c => `Table_Mic_Meter.${c.Name}`);
      
      console.log('Full control names for ChangeGroup:');
      fullControlNames.forEach(name => console.log('  -', name));
      
      const groupId = 'component-get-proper-test';
      
      console.log('\nCreating change group...');
      await adapter.sendCommand('ChangeGroup.Create', { Id: groupId });
      
      console.log('Adding controls...');
      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: groupId,
        Controls: fullControlNames
      });
      
      console.log('Starting 33Hz polling...\n');
      await adapter.sendCommand('ChangeGroup.AutoPoll', {
        Id: groupId,
        Rate: 0.03
      });
      
      // Monitor for 5 seconds
      let eventCount = 0;
      const startTime = Date.now();
      
      adapter.on('changeGroup:changes', (event) => {
        eventCount++;
        if (eventCount <= 3) {
          console.log(`Event ${eventCount}: ${event.changes.map(c => 
            `${c.Name.replace('Table_Mic_Meter.', '')}=${c.Value.toFixed(2)}dB`
          ).join(', ')}`);
        }
      });
      
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      await adapter.sendCommand('ChangeGroup.Destroy', { Id: groupId });
      
      const duration = (Date.now() - startTime) / 1000;
      const rate = eventCount / duration;
      
      console.log('\n' + '='.repeat(60));
      console.log('📊 RESULTS');
      console.log('='.repeat(60));
      console.log(`Total events: ${eventCount}`);
      console.log(`Duration: ${duration.toFixed(1)}s`);
      console.log(`Event rate: ${rate.toFixed(1)} Hz`);
      
      if (eventCount > duration * 20) {
        console.log('\n✅ FULL SUCCESS! 33Hz working with Table_Mic_Meter!');
        console.log('\nWORKING CONTROL FORMAT:');
        console.log('  Component.Get params:', JSON.stringify(workingFormat.params, null, 2));
        console.log('\n  ChangeGroup control names:');
        fullControlNames.forEach(name => console.log('    -', name));
      } else if (eventCount > 0) {
        console.log('\n✅ Partial success - receiving events but rate is low');
        console.log('  (May need audio activity in the room)');
      }
      
    } else {
      console.log('\n❌ Could not find working control format');
      console.log('\nTrying Component.GetControls to discover control names...\n');
      
      try {
        const controlsResult = await adapter.sendCommand('Component.GetControls', {
          Name: 'Table_Mic_Meter'
        });
        
        if (controlsResult && controlsResult.length > 0) {
          console.log('Available controls for Table_Mic_Meter:');
          controlsResult.forEach((control, idx) => {
            console.log(`  ${idx + 1}. ${control.Name}`);
            console.log(`     Type: ${control.Type || 'unknown'}`);
            console.log(`     Value: ${control.Value !== undefined ? control.Value : 'N/A'}`);
          });
        }
      } catch (e) {
        console.log('Component.GetControls also failed:', e.message);
      }
    }
    
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
testComponentGetProper();