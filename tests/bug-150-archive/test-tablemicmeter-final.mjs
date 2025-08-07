#!/usr/bin/env node

/**
 * FINAL TEST: TableMicMeter component with correct name
 * The component is named "TableMicMeter" not "TableMicMute"!
 */

console.log('=== Testing TableMicMeter Component (Correct Name) ===\n');

// Reduce logging
process.env.LOG_LEVEL = 'warn';

import fs from 'fs';

async function testTableMicMeter() {
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
    
    // TEST 1: Component.GetControls with TableMicMeter
    console.log('TEST 1: Component.GetControls with TableMicMeter');
    console.log('=' .repeat(50));
    
    const controlsResult = await adapter.sendCommand('Component.GetControls', {
      Name: 'TableMicMeter'
    });
    
    if (controlsResult?.result?.Controls?.length > 0) {
      console.log(`✅ Found TableMicMeter component with ${controlsResult.result.Controls.length} controls!`);
      
      // Show controls with initial values
      console.log('\nControls:');
      controlsResult.result.Controls.forEach((c, idx) => {
        console.log(`   ${idx + 1}. ${c.Name}`);
        console.log(`      Type: ${c.Type || 'unknown'}`);
        console.log(`      Value: ${c.Value !== undefined ? c.Value : 'N/A'}`);
        console.log(`      String: ${c.String || 'N/A'}`);
      });
      
      // Check if we have real values
      const hasRealValues = controlsResult.result.Controls.some(c => 
        c.Value !== 0 && c.Value !== undefined
      );
      
      if (hasRealValues) {
        console.log('\n✅ Got real meter values from Component.GetControls!');
      }
      
      // TEST 2: Set up 33Hz polling
      console.log('\nTEST 2: 33Hz Polling with TableMicMeter');
      console.log('=' .repeat(50));
      
      const groupId = 'tablemicmeter-final-test';
      
      // Create change group
      console.log('Creating change group...');
      await adapter.sendCommand('ChangeGroup.Create', { Id: groupId });
      
      // Add controls using QRWC SDK format
      console.log('Adding controls to change group...');
      const addResult = await adapter.sendCommand('ChangeGroup.AddComponentControl', {
        Id: groupId,
        Component: {
          Name: 'TableMicMeter',
          Controls: controlsResult.result.Controls.map(c => ({ Name: c.Name }))
        }
      });
      
      console.log(`Added controls: ${addResult?.result?.Controls?.join(', ') || 'none'}\n`);
      
      // Start 33Hz polling
      console.log('Starting 33Hz polling...\n');
      await adapter.sendCommand('ChangeGroup.AutoPoll', {
        Id: groupId,
        Rate: 0.03  // 33Hz
      });
      
      // Monitor for events
      let eventCount = 0;
      let uniqueValues = new Set();
      const startTime = Date.now();
      let lastEventTime = startTime;
      const intervals = [];
      
      adapter.on('changeGroup:changes', (event) => {
        const now = Date.now();
        const interval = now - lastEventTime;
        lastEventTime = now;
        
        eventCount++;
        if (eventCount > 1) {  // Skip first interval
          intervals.push(interval);
        }
        
        // Track unique values to confirm we're getting real data
        event.changes.forEach(c => {
          uniqueValues.add(`${c.Name}:${c.Value.toFixed(3)}`);
        });
        
        // Show first few events
        if (eventCount <= 5) {
          const timestamp = now - startTime;
          console.log(`Event ${eventCount} (${timestamp}ms, interval: ${interval}ms):`);
          event.changes.forEach(c => {
            console.log(`   ${c.Name} = ${c.Value.toFixed(2)} dB`);
          });
        }
      });
      
      // Run for 10 seconds
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Clean up
      await adapter.sendCommand('ChangeGroup.Destroy', { Id: groupId });
      
      const duration = (Date.now() - startTime) / 1000;
      const rate = eventCount / duration;
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      
      console.log('\n' + '='.repeat(60));
      console.log('🎯 FINAL TEST RESULTS:');
      console.log('='.repeat(60));
      console.log(`   Events received: ${eventCount}`);
      console.log(`   Duration: ${duration.toFixed(1)}s`);
      console.log(`   Actual rate: ${rate.toFixed(1)} Hz`);
      console.log(`   Average interval: ${avgInterval.toFixed(1)} ms`);
      console.log(`   Expected events: ~${Math.floor(duration * 33)}`);
      console.log(`   Unique values seen: ${uniqueValues.size}`);
      
      if (eventCount > duration * 25 && uniqueValues.size > 10) {
        console.log('\n🎉 FULL SUCCESS! BUG-150 COMPLETELY RESOLVED!');
        console.log('   ✅ TableMicMeter component accessible');
        console.log('   ✅ Real meter values received');
        console.log('   ✅ 33Hz polling working perfectly');
        console.log('   ✅ All infrastructure verified');
        console.log('\n   BUG-150 can be closed as 100% RESOLVED!');
      } else if (eventCount > 0) {
        console.log('\n⚠️  Receiving events but not at full 33Hz rate');
        console.log(`   Unique values: ${uniqueValues.size} (need >10 for real data)`);
      } else {
        console.log('\n❌ No events received');
      }
    } else {
      console.log('❌ No controls found for TableMicMeter');
      console.log('   This might mean the component doesn\'t have Script Access');
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
testTableMicMeter();