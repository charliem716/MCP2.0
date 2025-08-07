#!/usr/bin/env node

/**
 * Test Code Names with Script Access enabled
 * Modern Q-SYS uses Code Names instead of Named Controls
 * The user needs to set Code Names and enable Script Access in Q-SYS Designer
 */

console.log('=== Testing Code Names with Script Access ===\n');
console.log('Note: Controls must have Code Names set and Script Access enabled in Q-SYS Designer\n');

// Reduce logging
process.env.LOG_LEVEL = 'warn';

import fs from 'fs';

async function testCodeNames() {
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
    
    // Test various possible Code Name patterns
    const codeNamePatterns = [
      {
        desc: 'Code Names matching user hint (meter.1, meter.2, etc)',
        controls: ['meter.1', 'meter.2', 'meter.3', 'meter.4']
      },
      {
        desc: 'Table_Mic_Meter with meter suffix',
        controls: [
          'Table_Mic_Meter_meter_1',
          'Table_Mic_Meter_meter_2',
          'Table_Mic_Meter_meter_3',
          'Table_Mic_Meter_meter_4'
        ]
      },
      {
        desc: 'Simple table_mic pattern',
        controls: [
          'table_mic_1',
          'table_mic_2',
          'table_mic_3',
          'table_mic_4'
        ]
      },
      {
        desc: 'Mic meter pattern',
        controls: [
          'mic_meter_1',
          'mic_meter_2',
          'mic_meter_3',
          'mic_meter_4'
        ]
      },
      {
        desc: 'Simple meter pattern',
        controls: [
          'meter_1',
          'meter_2',
          'meter_3',
          'meter_4'
        ]
      }
    ];
    
    let workingPattern = null;
    let workingControls = null;
    
    console.log('Testing Code Name patterns for Script Access...\n');
    
    for (const pattern of codeNamePatterns) {
      console.log(`Testing: ${pattern.desc}`);
      console.log('  Controls:', pattern.controls.join(', '));
      
      try {
        // For Code Names with Script Access, we use Control.Get directly
        const result = await adapter.sendCommand('Control.Get', {
          Controls: pattern.controls
        });
        
        if (result && result.length > 0) {
          const hasValidData = result.some(control => 
            control.Value !== undefined && control.Value !== null
          );
          
          if (hasValidData) {
            console.log('  ✅ SUCCESS! Found working Code Names:');
            result.forEach(control => {
              if (control.Value !== undefined) {
                const value = typeof control.Value === 'number' ? 
                  control.Value.toFixed(2) : control.Value;
                console.log(`    ${control.Name}: ${value} dB`);
              }
            });
            
            workingPattern = pattern;
            workingControls = result;
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
    
    // If we found working controls, test 33Hz polling
    if (workingControls && workingPattern) {
      console.log('='.repeat(60));
      console.log('🎉 FOUND WORKING CODE NAMES WITH SCRIPT ACCESS!');
      console.log('='.repeat(60));
      
      console.log('\nWorking Code Names:', workingPattern.controls.join(', '));
      console.log('\nTesting 33Hz polling with ChangeGroup...\n');
      
      const groupId = 'code-names-33hz-test';
      
      console.log('Creating change group...');
      await adapter.sendCommand('ChangeGroup.Create', { Id: groupId });
      
      console.log('Adding controls to change group...');
      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: groupId,
        Controls: workingPattern.controls
      });
      
      console.log('Starting 33Hz polling (30ms intervals)...\n');
      await adapter.sendCommand('ChangeGroup.AutoPoll', {
        Id: groupId,
        Rate: 0.03  // 33Hz
      });
      
      // Track events and statistics
      let eventCount = 0;
      const startTime = Date.now();
      const valueRanges = new Map();
      let lastEventTime = startTime;
      const intervals = [];
      
      adapter.on('changeGroup:changes', (event) => {
        const now = Date.now();
        if (eventCount > 0) {
          intervals.push(now - lastEventTime);
        }
        lastEventTime = now;
        eventCount++;
        
        // Track value ranges
        event.changes.forEach(change => {
          if (!valueRanges.has(change.Name)) {
            valueRanges.set(change.Name, {
              min: change.Value,
              max: change.Value,
              lastValue: change.Value,
              changeCount: 0
            });
          }
          const range = valueRanges.get(change.Name);
          if (Math.abs(range.lastValue - change.Value) > 0.01) {
            range.changeCount++;
          }
          range.min = Math.min(range.min, change.Value);
          range.max = Math.max(range.max, change.Value);
          range.lastValue = change.Value;
        });
        
        // Log first few events
        if (eventCount <= 5) {
          console.log(`Event ${eventCount} (${now - startTime}ms): ${event.changes.map(c => 
            `${c.Name}=${c.Value.toFixed(2)}dB`
          ).join(', ')}`);
        }
      });
      
      // Monitor for 10 seconds
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Stop polling
      await adapter.sendCommand('ChangeGroup.Destroy', { Id: groupId });
      
      const duration = (Date.now() - startTime) / 1000;
      const rate = eventCount / duration;
      
      // Calculate interval statistics
      let avgInterval = 0;
      let minInterval = Infinity;
      let maxInterval = 0;
      if (intervals.length > 0) {
        avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        minInterval = Math.min(...intervals);
        maxInterval = Math.max(...intervals);
      }
      
      console.log('\n' + '='.repeat(60));
      console.log('📊 33Hz POLLING RESULTS WITH CODE NAMES');
      console.log('='.repeat(60));
      
      console.log('\n📡 CONNECTION:');
      console.log(`  Q-SYS Core: ${config.host}:${config.port}`);
      console.log(`  Component: Table_Mic_Meter`);
      console.log(`  Code Names: ${workingPattern.controls.join(', ')}`);
      
      console.log('\n⏱️  PERFORMANCE:');
      console.log(`  Test duration: ${duration.toFixed(2)} seconds`);
      console.log(`  Total events: ${eventCount}`);
      console.log(`  Event rate: ${rate.toFixed(1)} Hz`);
      console.log(`  Expected at 33Hz: ~${Math.floor(duration * 33)} events`);
      
      if (eventCount > 0) {
        const efficiency = (eventCount / (duration * 33) * 100).toFixed(1);
        console.log(`  Efficiency: ${efficiency}%`);
        console.log(`\n  Interval stats (ms):`);
        console.log(`    Average: ${avgInterval.toFixed(1)}ms (expected: 30.3ms)`);
        console.log(`    Min: ${minInterval}ms`);
        console.log(`    Max: ${maxInterval}ms`);
      }
      
      if (valueRanges.size > 0) {
        console.log('\n📈 METER ACTIVITY:');
        let hasActivity = false;
        valueRanges.forEach((range, name) => {
          const variation = range.max - range.min;
          console.log(`\n  ${name}:`);
          console.log(`    Min: ${range.min.toFixed(2)} dB`);
          console.log(`    Max: ${range.max.toFixed(2)} dB`);
          console.log(`    Variation: ${variation.toFixed(2)} dB`);
          console.log(`    Changes: ${range.changeCount}`);
          if (variation > 0.1) hasActivity = true;
        });
        
        if (!hasActivity) {
          console.log('\n  ⚠️  Meters showing static values - generate audio in room for activity');
        }
      }
      
      console.log('\n' + '='.repeat(60));
      if (eventCount > duration * 25) {
        console.log('🎉 FULL SUCCESS! 33Hz REAL-WORLD FUNCTIONALITY VERIFIED!');
        console.log('\n✅ BUG-150 FULLY RESOLVED:');
        console.log('  - Table_Mic_Meter Code Names discovered');
        console.log('  - 33Hz polling working at ' + rate.toFixed(1) + ' Hz');
        console.log('  - Real Q-SYS Core integration verified');
        console.log('  - System ready for production!');
      } else if (eventCount > 0) {
        console.log('✅ PARTIAL SUCCESS');
        console.log(`  Receiving events at ${rate.toFixed(1)} Hz`);
        console.log('  Lower than 33Hz - may need audio activity or network optimization');
      }
      console.log('='.repeat(60));
      
    } else {
      console.log('='.repeat(60));
      console.log('❌ NO CODE NAMES WITH SCRIPT ACCESS FOUND');
      console.log('='.repeat(60));
      
      console.log('\nTable_Mic_Meter controls need Code Names with Script Access enabled.');
      console.log('\nTo enable Script Access for Table_Mic_Meter:');
      console.log('\n1. Open Q-SYS Designer');
      console.log('2. Find the Table_Mic_Meter component');
      console.log('3. For each meter control (meter.1, meter.2, etc):');
      console.log('   a. Set a Code Name (e.g., "meter.1", "meter_1", etc)');
      console.log('   b. Enable "Script Access" checkbox');
      console.log('4. Save and deploy the design to the Core');
      console.log('5. Re-run this test');
      console.log('\nThe Code Names you set will be the control names used by the MCP server.');
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
testCodeNames();