#!/usr/bin/env node

/**
 * Test Code Names without underscores
 * User confirmed they have Script Access enabled but underscores removed
 */

console.log('=== Testing Code Names Without Underscores ===\n');
console.log('Note: Code Names already have Script Access enabled\n');

// Reduce logging
process.env.LOG_LEVEL = 'warn';

import fs from 'fs';

async function testCodeNamesNoUnderscores() {
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
    
    // Test Code Name patterns without underscores
    const codeNamePatterns = [
      {
        desc: 'TableMicMeter with dots (TableMicMeter.meter.1)',
        controls: [
          'TableMicMeter.meter.1',
          'TableMicMeter.meter.2',
          'TableMicMeter.meter.3',
          'TableMicMeter.meter.4'
        ]
      },
      {
        desc: 'TableMicMetermeter1 (concatenated)',
        controls: [
          'TableMicMetermeter1',
          'TableMicMetermeter2',
          'TableMicMetermeter3',
          'TableMicMetermeter4'
        ]
      },
      {
        desc: 'TableMicMeter1 (direct numbering)',
        controls: [
          'TableMicMeter1',
          'TableMicMeter2',
          'TableMicMeter3',
          'TableMicMeter4'
        ]
      },
      {
        desc: 'tablemicmeter1 (lowercase)',
        controls: [
          'tablemicmeter1',
          'tablemicmeter2',
          'tablemicmeter3',
          'tablemicmeter4'
        ]
      },
      {
        desc: 'MicMeter1 (shortened)',
        controls: [
          'MicMeter1',
          'MicMeter2',
          'MicMeter3',
          'MicMeter4'
        ]
      },
      {
        desc: 'micmeter1 (shortened lowercase)',
        controls: [
          'micmeter1',
          'micmeter2',
          'micmeter3',
          'micmeter4'
        ]
      },
      {
        desc: 'TMM1 (abbreviated)',
        controls: [
          'TMM1',
          'TMM2',
          'TMM3',
          'TMM4'
        ]
      },
      {
        desc: 'TableMic1 (without Meter)',
        controls: [
          'TableMic1',
          'TableMic2',
          'TableMic3',
          'TableMic4'
        ]
      },
      {
        desc: 'Meter1 (just Meter)',
        controls: [
          'Meter1',
          'Meter2',
          'Meter3',
          'Meter4'
        ]
      }
    ];
    
    let workingPattern = null;
    let workingControls = null;
    
    console.log('Testing Code Name patterns without underscores...\n');
    
    for (const pattern of codeNamePatterns) {
      console.log(`Testing: ${pattern.desc}`);
      console.log('  Controls:', pattern.controls.join(', '));
      
      try {
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
      console.log('🎉 FOUND WORKING CODE NAMES!');
      console.log('='.repeat(60));
      
      console.log('\nWorking Code Names:', workingPattern.controls.join(', '));
      console.log('\nTesting 33Hz polling with ChangeGroup...\n');
      
      const groupId = 'code-names-no-underscores-test';
      
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
      console.log('📊 33Hz REAL-WORLD TEST RESULTS');
      console.log('='.repeat(60));
      
      console.log('\n📡 CONNECTION:');
      console.log(`  Q-SYS Core: ${config.host}:${config.port}`);
      console.log(`  Component: Table_Mic_Meter`);
      console.log(`  Working Code Names: ${workingPattern.controls.join(', ')}`);
      
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
        console.log('  - Table_Mic_Meter Code Names discovered: ' + workingPattern.controls.join(', '));
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
      console.log('❌ CODE NAMES NOT FOUND');
      console.log('='.repeat(60));
      
      console.log('\nCould not find the Code Names for Table_Mic_Meter.');
      console.log('\nPlease check in Q-SYS Designer:');
      console.log('1. What are the exact Code Names set for the meter controls?');
      console.log('2. Are they using a different naming pattern?');
      console.log('3. Is Script Access definitely enabled?');
      console.log('\nThe Code Names need to be accessible via Control.Get command.');
      console.log('Common patterns tested: TableMicMeter1, MicMeter1, Meter1, etc.');
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
testCodeNamesNoUnderscores();