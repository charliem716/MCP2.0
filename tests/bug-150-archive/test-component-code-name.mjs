#!/usr/bin/env node

/**
 * Test component-level Code Names
 * The component itself has a Code Name (e.g., "TableMicMeter")
 * We poll that component to get its individual controls
 */

console.log('=== Testing Component-Level Code Names ===\n');
console.log('Component has Code Name, individual controls are discovered by polling\n');

// Reduce logging
process.env.LOG_LEVEL = 'warn';

import fs from 'fs';

async function testComponentCodeName() {
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
    
    // Test possible component Code Names (without underscores)
    const componentCodeNames = [
      'TableMicMeter',
      'tablemicmeter',
      'MicMeter', 
      'micmeter',
      'TableMic',
      'tablemic',
      'TMM',
      'tmm'
    ];
    
    let workingComponentName = null;
    let workingControls = null;
    
    console.log('STEP 1: Finding component Code Name...\n');
    
    for (const componentName of componentCodeNames) {
      console.log(`Testing component name: ${componentName}`);
      
      try {
        // Try Component.GetControls to get all controls for this component
        const result = await adapter.sendCommand('Component.GetControls', {
          Name: componentName
        });
        
        if (result && result.result) {
          console.log(`  ✅ SUCCESS! Found component with Code Name: ${componentName}`);
          console.log(`  Found ${result.result.length || 0} controls`);
          
          workingComponentName = componentName;
          workingControls = result.result;
          
          if (workingControls && workingControls.length > 0) {
            console.log('\n  Controls found:');
            workingControls.forEach((control, idx) => {
              console.log(`    ${idx + 1}. ${control.Name}`);
              if (control.Value !== undefined) {
                console.log(`       Value: ${control.Value}`);
                console.log(`       Type: ${control.Type || 'unknown'}`);
              }
            });
          }
          break;
        }
      } catch (e) {
        // Try a simpler approach - test if we can access any control
        try {
          // Common meter control names
          const testControlNames = [
            `${componentName}.meter.1`,
            `${componentName}.meter1`,
            `${componentName}.1`,
            `${componentName}.level`,
            `${componentName}.peak`,
            `${componentName}.rms`
          ];
          
          for (const controlName of testControlNames) {
            try {
              const controlResult = await adapter.sendCommand('Control.Get', {
                Controls: [controlName]
              });
              
              if (controlResult && controlResult.length > 0 && controlResult[0].Value !== undefined) {
                console.log(`  ✅ Found working control: ${controlName}`);
                console.log(`     Value: ${controlResult[0].Value}`);
                
                workingComponentName = componentName;
                
                // Try to find all 4 meter controls
                const basePattern = controlName.replace(/[.1-4]+$/, '');
                const possibleControls = [];
                
                if (controlName.includes('meter.')) {
                  possibleControls.push(
                    `${componentName}.meter.1`,
                    `${componentName}.meter.2`,
                    `${componentName}.meter.3`,
                    `${componentName}.meter.4`
                  );
                } else if (controlName.includes('meter')) {
                  possibleControls.push(
                    `${componentName}.meter1`,
                    `${componentName}.meter2`,
                    `${componentName}.meter3`,
                    `${componentName}.meter4`
                  );
                } else {
                  possibleControls.push(
                    `${componentName}.1`,
                    `${componentName}.2`,
                    `${componentName}.3`,
                    `${componentName}.4`
                  );
                }
                
                console.log('\n  Testing all 4 meter controls...');
                const allControlsResult = await adapter.sendCommand('Control.Get', {
                  Controls: possibleControls
                });
                
                if (allControlsResult && allControlsResult.length === 4) {
                  workingControls = possibleControls;
                  console.log('  ✅ Found all 4 meter controls!');
                  break;
                }
              }
            } catch (e2) {
              // Silent fail for individual control tests
            }
          }
          
          if (workingComponentName) break;
        } catch (e) {
          console.log(`  ❌ ${componentName}: ${e.message}`);
        }
      }
      
      console.log('');
    }
    
    // If we found working controls, test 33Hz polling
    if (workingComponentName && workingControls) {
      console.log('='.repeat(60));
      console.log('🎉 FOUND WORKING COMPONENT CODE NAME!');
      console.log('='.repeat(60));
      
      console.log(`\nComponent Code Name: ${workingComponentName}`);
      
      let controlNames;
      if (Array.isArray(workingControls) && typeof workingControls[0] === 'string') {
        // Already have control names
        controlNames = workingControls;
      } else if (Array.isArray(workingControls) && workingControls[0]?.Name) {
        // Have control objects, extract names
        controlNames = workingControls.map(c => `${workingComponentName}.${c.Name}`);
      } else {
        console.log('⚠️  Could not determine control names format');
        await client.disconnect();
        return;
      }
      
      console.log('Control names for ChangeGroup:', controlNames.join(', '));
      
      console.log('\nTesting 33Hz polling with ChangeGroup...\n');
      
      const groupId = 'component-code-name-test';
      
      console.log('Creating change group...');
      await adapter.sendCommand('ChangeGroup.Create', { Id: groupId });
      
      console.log('Adding controls to change group...');
      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: groupId,
        Controls: controlNames
      });
      
      console.log('Starting 33Hz polling (30ms intervals)...\n');
      await adapter.sendCommand('ChangeGroup.AutoPoll', {
        Id: groupId,
        Rate: 0.03  // 33Hz
      });
      
      // Track events
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
              changeCount: 0
            });
          }
          const range = valueRanges.get(change.Name);
          range.min = Math.min(range.min, change.Value);
          range.max = Math.max(range.max, change.Value);
          range.changeCount++;
        });
        
        // Log first few events
        if (eventCount <= 5) {
          const timestamp = Date.now() - startTime;
          console.log(`Event ${eventCount} (${timestamp}ms): ${event.changes.map(c => 
            `${c.Name.split('.').pop()}=${c.Value.toFixed(2)}dB`
          ).join(', ')}`);
        }
      });
      
      // Monitor for 10 seconds
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Stop polling
      await adapter.sendCommand('ChangeGroup.Destroy', { Id: groupId });
      
      const duration = (Date.now() - startTime) / 1000;
      const rate = eventCount / duration;
      
      console.log('\n' + '='.repeat(60));
      console.log('📊 33Hz REAL-WORLD TEST RESULTS');
      console.log('='.repeat(60));
      
      console.log('\n📡 CONNECTION:');
      console.log(`  Q-SYS Core: ${config.host}:${config.port}`);
      console.log(`  Component Code Name: ${workingComponentName}`);
      console.log(`  Control Names: ${controlNames.join(', ')}`);
      
      console.log('\n⏱️  PERFORMANCE:');
      console.log(`  Test duration: ${duration.toFixed(2)} seconds`);
      console.log(`  Total events: ${eventCount}`);
      console.log(`  Event rate: ${rate.toFixed(1)} Hz`);
      console.log(`  Expected at 33Hz: ~${Math.floor(duration * 33)} events`);
      
      if (eventCount > 0) {
        const efficiency = (eventCount / (duration * 33) * 100).toFixed(1);
        console.log(`  Efficiency: ${efficiency}%`);
      }
      
      if (valueRanges.size > 0) {
        console.log('\n📈 METER ACTIVITY:');
        valueRanges.forEach((range, name) => {
          const variation = range.max - range.min;
          const shortName = name.split('.').pop();
          console.log(`\n  ${shortName}:`);
          console.log(`    Min: ${range.min.toFixed(2)} dB`);
          console.log(`    Max: ${range.max.toFixed(2)} dB`);
          console.log(`    Variation: ${variation.toFixed(2)} dB`);
          console.log(`    Updates: ${range.changeCount}`);
        });
      }
      
      console.log('\n' + '='.repeat(60));
      if (eventCount > duration * 25) {
        console.log('🎉 FULL SUCCESS! 33Hz REAL-WORLD FUNCTIONALITY VERIFIED!');
        console.log('\n✅ BUG-150 FULLY RESOLVED:');
        console.log(`  - Component Code Name discovered: ${workingComponentName}`);
        console.log(`  - Control names: ${controlNames.join(', ')}`);
        console.log(`  - 33Hz polling working at ${rate.toFixed(1)} Hz`);
        console.log('  - Real Q-SYS Core integration verified!');
      } else if (eventCount > 0) {
        console.log('✅ PARTIAL SUCCESS');
        console.log(`  Receiving events at ${rate.toFixed(1)} Hz`);
        console.log('  Lower than 33Hz - may need audio activity');
      }
      console.log('='.repeat(60));
      
    } else {
      console.log('='.repeat(60));
      console.log('❌ COMPONENT CODE NAME NOT FOUND');
      console.log('='.repeat(60));
      
      console.log('\nCould not find the component Code Name for Table_Mic_Meter.');
      console.log('\nPossible issues:');
      console.log('1. Component Code Name is different than tested patterns');
      console.log('2. Component.GetControls is not working (circular reference issue)');
      console.log('3. Control names need different format');
      console.log('\nPlease verify in Q-SYS Designer:');
      console.log('- What is the exact Code Name for the Table_Mic_Meter component?');
      console.log('- Does it have Script Access enabled?');
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
testComponentCodeName();