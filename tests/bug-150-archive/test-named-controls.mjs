#!/usr/bin/env node

/**
 * Test if Table_Mic_Meter controls are configured as Named Controls
 * Named Controls are different from Component controls - they need to be 
 * explicitly configured in Q-SYS Designer
 */

console.log('=== Testing Named Controls for Table_Mic_Meter ===\n');

// Reduce logging
process.env.LOG_LEVEL = 'warn';

import fs from 'fs';

async function testNamedControls() {
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
    
    // Test various Named Control possibilities
    const namedControlTests = [
      {
        desc: 'Named Controls: Table_Mic_Meter_1, etc',
        controls: [
          'Table_Mic_Meter_1',
          'Table_Mic_Meter_2',
          'Table_Mic_Meter_3',
          'Table_Mic_Meter_4'
        ]
      },
      {
        desc: 'Named Controls: TableMicMeter1, etc',
        controls: [
          'TableMicMeter1',
          'TableMicMeter2',
          'TableMicMeter3',
          'TableMicMeter4'
        ]
      },
      {
        desc: 'Named Controls: Table_Mic_1, etc',
        controls: [
          'Table_Mic_1',
          'Table_Mic_2',
          'Table_Mic_3',
          'Table_Mic_4'
        ]
      },
      {
        desc: 'Named Controls: Mic_Meter_1, etc',
        controls: [
          'Mic_Meter_1',
          'Mic_Meter_2',
          'Mic_Meter_3',
          'Mic_Meter_4'
        ]
      },
      {
        desc: 'Named Controls: meter1, meter2, etc',
        controls: [
          'meter1',
          'meter2',
          'meter3',
          'meter4'
        ]
      },
      {
        desc: 'Named Controls: Meter.1, Meter.2, etc',
        controls: [
          'Meter.1',
          'Meter.2',
          'Meter.3',
          'Meter.4'
        ]
      }
    ];
    
    let workingControls = null;
    let workingPattern = null;
    
    console.log('Testing potential Named Control configurations...\n');
    
    for (const test of namedControlTests) {
      console.log(`Testing ${test.desc}`);
      console.log('  Controls:', test.controls.join(', '));
      
      try {
        // For Named Controls, we use Control.Get without component prefix
        const result = await adapter.sendCommand('Control.Get', {
          Controls: test.controls
        });
        
        if (result && result.length > 0) {
          const hasValidData = result.some(control => 
            control.Value !== undefined && control.Value !== null
          );
          
          if (hasValidData) {
            console.log('  ✅ SUCCESS! Found Named Controls:');
            result.forEach(control => {
              if (control.Value !== undefined) {
                const value = typeof control.Value === 'number' ? 
                  control.Value.toFixed(2) : control.Value;
                console.log(`    ${control.Name}: ${value} dB`);
              }
            });
            
            workingControls = result;
            workingPattern = test;
            break;
          } else {
            console.log('  ❌ Got response but no valid values');
          }
        } else {
          console.log('  ❌ No response');
        }
      } catch (e) {
        console.log('  ❌ Error:', e.message);
      }
      
      console.log('');
    }
    
    if (!workingControls) {
      console.log('Testing if any meter-related Named Controls exist...\n');
      
      // Try some generic meter names
      const genericTests = [
        'meter', 'Meter', 'METER',
        'level', 'Level', 'LEVEL',
        'mic', 'Mic', 'MIC',
        'audio', 'Audio', 'AUDIO',
        'input', 'Input', 'INPUT'
      ];
      
      for (const name of genericTests) {
        try {
          console.log(`Trying: ${name}`);
          const result = await adapter.sendCommand('Control.Get', {
            Controls: [name]
          });
          
          if (result && result.length > 0 && result[0].Value !== undefined) {
            console.log(`  ✅ Found control: ${name} = ${result[0].Value}`);
          }
        } catch (e) {
          // Silent fail for generic tests
        }
      }
    }
    
    // If we found working controls, test 33Hz
    if (workingControls && workingPattern) {
      console.log('\n' + '='.repeat(60));
      console.log('🎉 FOUND WORKING NAMED CONTROLS!');
      console.log('='.repeat(60));
      
      console.log('\nWorking Named Controls:', workingPattern.controls.join(', '));
      console.log('\nTesting 33Hz polling...\n');
      
      const groupId = 'named-controls-test';
      
      await adapter.sendCommand('ChangeGroup.Create', { Id: groupId });
      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: groupId,
        Controls: workingPattern.controls
      });
      
      await adapter.sendCommand('ChangeGroup.AutoPoll', {
        Id: groupId,
        Rate: 0.03
      });
      
      let eventCount = 0;
      const startTime = Date.now();
      
      adapter.on('changeGroup:changes', (event) => {
        eventCount++;
        if (eventCount <= 3) {
          console.log(`Event ${eventCount}: ${event.changes.map(c => 
            `${c.Name}=${c.Value.toFixed(2)}dB`
          ).join(', ')}`);
        }
      });
      
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      await adapter.sendCommand('ChangeGroup.Destroy', { Id: groupId });
      
      const duration = (Date.now() - startTime) / 1000;
      const rate = eventCount / duration;
      
      console.log('\n📊 RESULTS:');
      console.log(`Total events: ${eventCount}`);
      console.log(`Event rate: ${rate.toFixed(1)} Hz`);
      
      if (eventCount > duration * 20) {
        console.log('\n✅ FULL SUCCESS WITH NAMED CONTROLS!');
        console.log('\n🎯 WORKING NAMED CONTROL NAMES:');
        workingPattern.controls.forEach(name => console.log('  -', name));
      }
      
    } else {
      console.log('\n' + '='.repeat(60));
      console.log('❌ NO NAMED CONTROLS FOUND');
      console.log('='.repeat(60));
      
      console.log('\nTable_Mic_Meter controls are not configured as Named Controls.');
      console.log('\nTo use Table_Mic_Meter with the MCP server:');
      console.log('1. Open the Q-SYS design in Q-SYS Designer');
      console.log('2. Right-click on the Table_Mic_Meter component');
      console.log('3. Select the meter controls you want to expose');
      console.log('4. Add them to Named Controls');
      console.log('5. Give them names like "Table_Mic_Meter_1", etc');
      console.log('6. Save and deploy the design');
      console.log('7. Re-run this test');
      
      console.log('\nAlternatively:');
      console.log('- The component may need Component.Get support in the adapter');
      console.log('- Or the control names may have a different format');
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
testNamedControls();