#!/usr/bin/env node

/**
 * Test Control.Get with various naming patterns for Table_Mic_Meter
 * Since Component.Get isn't implemented, we'll use Control.Get directly
 */

console.log('=== Testing Control.Get with Various Patterns ===\n');

// Reduce logging
process.env.LOG_LEVEL = 'warn';

import fs from 'fs';

async function testControlGetPatterns() {
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
    
    // Different naming patterns to try
    const patterns = [
      {
        desc: 'Pattern 1: Component.control (Table_Mic_Meter.meter.1)',
        controls: [
          'Table_Mic_Meter.meter.1',
          'Table_Mic_Meter.meter.2',
          'Table_Mic_Meter.meter.3',
          'Table_Mic_Meter.meter.4'
        ]
      },
      {
        desc: 'Pattern 2: Component.index (Table_Mic_Meter.1)',
        controls: [
          'Table_Mic_Meter.1',
          'Table_Mic_Meter.2',
          'Table_Mic_Meter.3',
          'Table_Mic_Meter.4'
        ]
      },
      {
        desc: 'Pattern 3: Component[index] (Table_Mic_Meter[1])',
        controls: [
          'Table_Mic_Meter[1]',
          'Table_Mic_Meter[2]',
          'Table_Mic_Meter[3]',
          'Table_Mic_Meter[4]'
        ]
      },
      {
        desc: 'Pattern 4: Component ch.index (Table_Mic_Meter.ch.1)',
        controls: [
          'Table_Mic_Meter.ch.1',
          'Table_Mic_Meter.ch.2',
          'Table_Mic_Meter.ch.3',
          'Table_Mic_Meter.ch.4'
        ]
      },
      {
        desc: 'Pattern 5: Component level (Table_Mic_Meter.level.1)',
        controls: [
          'Table_Mic_Meter.level.1',
          'Table_Mic_Meter.level.2',
          'Table_Mic_Meter.level.3',
          'Table_Mic_Meter.level.4'
        ]
      },
      {
        desc: 'Pattern 6: Just meter.N (no component prefix)',
        controls: [
          'meter.1',
          'meter.2',
          'meter.3',
          'meter.4'
        ]
      },
      {
        desc: 'Pattern 7: Component meter (Table_Mic_Meter.meter)',
        controls: [
          'Table_Mic_Meter.meter'
        ]
      },
      {
        desc: 'Pattern 8: Component peak/rms (Table_Mic_Meter.peak.1)',
        controls: [
          'Table_Mic_Meter.peak.1',
          'Table_Mic_Meter.rms.1',
          'Table_Mic_Meter.peak.2',
          'Table_Mic_Meter.rms.2'
        ]
      }
    ];
    
    let workingPattern = null;
    let workingControls = null;
    
    console.log('Testing different control naming patterns...\n');
    
    for (const pattern of patterns) {
      console.log(`Testing ${pattern.desc}`);
      console.log('  Controls:', pattern.controls.join(', '));
      
      try {
        const result = await adapter.sendCommand('Control.Get', {
          Controls: pattern.controls
        });
        
        if (result && result.length > 0) {
          // Check if we got actual values (not error responses)
          const hasValidData = result.some(control => 
            control.Value !== undefined && control.Value !== null
          );
          
          if (hasValidData) {
            console.log('  ✅ SUCCESS! Got control values:');
            result.forEach(control => {
              if (control.Value !== undefined) {
                const value = typeof control.Value === 'number' ? 
                  control.Value.toFixed(2) : control.Value;
                console.log(`    ${control.Name}: ${value} (${control.String || 'N/A'})`);
              }
            });
            
            workingPattern = pattern;
            workingControls = result;
            break;
          } else {
            console.log('  ❌ Got response but no valid values');
          }
        } else {
          console.log('  ❌ No response or empty result');
        }
      } catch (e) {
        console.log('  ❌ Error:', e.message);
      }
      
      console.log('');
    }
    
    // If we found working controls, test with ChangeGroup
    if (workingControls && workingPattern) {
      console.log('='.repeat(60));
      console.log('🎉 FOUND WORKING PATTERN!');
      console.log('='.repeat(60));
      console.log('\nWorking pattern:', workingPattern.desc);
      console.log('Control names:', workingPattern.controls.join(', '));
      
      console.log('\nTesting 33Hz polling with ChangeGroup...\n');
      
      const groupId = 'control-get-patterns-test';
      
      console.log('Creating change group...');
      await adapter.sendCommand('ChangeGroup.Create', { Id: groupId });
      
      console.log('Adding controls...');
      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: groupId,
        Controls: workingPattern.controls
      });
      
      console.log('Starting 33Hz polling...\n');
      await adapter.sendCommand('ChangeGroup.AutoPoll', {
        Id: groupId,
        Rate: 0.03
      });
      
      // Monitor for 5 seconds
      let eventCount = 0;
      const startTime = Date.now();
      const valueRanges = new Map();
      
      adapter.on('changeGroup:changes', (event) => {
        eventCount++;
        
        // Track value ranges
        event.changes.forEach(change => {
          if (!valueRanges.has(change.Name)) {
            valueRanges.set(change.Name, {
              min: change.Value,
              max: change.Value,
              count: 0
            });
          }
          const range = valueRanges.get(change.Name);
          range.min = Math.min(range.min, change.Value);
          range.max = Math.max(range.max, change.Value);
          range.count++;
        });
        
        if (eventCount <= 3) {
          console.log(`Event ${eventCount}: ${event.changes.map(c => 
            `${c.Name.split('.').pop()}=${c.Value.toFixed(2)}dB`
          ).join(', ')}`);
        }
      });
      
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      await adapter.sendCommand('ChangeGroup.Destroy', { Id: groupId });
      
      const duration = (Date.now() - startTime) / 1000;
      const rate = eventCount / duration;
      
      console.log('\n' + '='.repeat(60));
      console.log('📊 33Hz POLLING RESULTS');
      console.log('='.repeat(60));
      console.log(`Total events: ${eventCount}`);
      console.log(`Duration: ${duration.toFixed(1)}s`);
      console.log(`Event rate: ${rate.toFixed(1)} Hz`);
      console.log(`Expected at 33Hz: ~${Math.floor(duration * 33)} events`);
      
      if (valueRanges.size > 0) {
        console.log('\n📈 VALUE RANGES:');
        valueRanges.forEach((range, name) => {
          const shortName = name.split('.').pop();
          const variation = range.max - range.min;
          console.log(`  ${shortName}:`);
          console.log(`    Min: ${range.min.toFixed(2)} dB`);
          console.log(`    Max: ${range.max.toFixed(2)} dB`);
          console.log(`    Variation: ${variation.toFixed(2)} dB`);
          console.log(`    Updates: ${range.count}`);
        });
      }
      
      if (eventCount > duration * 20) {
        console.log('\n✅ FULL SUCCESS! 33Hz working perfectly!');
        console.log('\n🎯 WORKING CONTROL NAMES FOR Table_Mic_Meter:');
        workingPattern.controls.forEach(name => console.log('  -', name));
      } else if (eventCount > 0) {
        console.log('\n✅ Partial success - receiving events');
        console.log('  Rate is lower than 33Hz - may need audio activity');
      }
      
    } else {
      console.log('='.repeat(60));
      console.log('❌ NO WORKING PATTERN FOUND');
      console.log('='.repeat(60));
      console.log('\nNone of the tested patterns returned valid control values.');
      console.log('The control naming format may be different for this Q-SYS design.');
      console.log('\nNext steps:');
      console.log('1. Check Q-SYS Designer to see the exact control names');
      console.log('2. Use Named Controls instead of Component controls');
      console.log('3. Verify Table_Mic_Meter is configured correctly in the design');
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
testControlGetPatterns();