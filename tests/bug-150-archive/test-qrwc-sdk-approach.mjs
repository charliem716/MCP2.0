#!/usr/bin/env node

/**
 * Test using the QRWC SDK's actual approach:
 * 1. Component.GetControls to get initial state
 * 2. ChangeGroup.AddComponentControl to add controls
 * 3. ChangeGroup.Poll to get updates
 * 
 * There is NO Component.Get in the official SDK!
 */

console.log('=== Testing with QRWC SDK Approach ===\n');

// Reduce logging
process.env.LOG_LEVEL = 'warn';

import fs from 'fs';

async function testQRWCApproach() {
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
    
    // STEP 1: Get all components
    console.log('STEP 1: Component.GetComponents');
    console.log('=' .repeat(50));
    
    const componentsResponse = await adapter.sendCommand('Component.GetComponents', 'test');
    const componentsResult = componentsResponse?.result || [];
    console.log(`Found ${componentsResult.length} components\n`);
    
    // Find TableMicMute
    const tableMicMute = componentsResult.find(c => c.Name === 'TableMicMute');
    
    if (!tableMicMute) {
      console.log('❌ TableMicMute component not found!');
      console.log('Available components with "Table" or "Mic":');
      componentsResult.forEach(c => {
        if (c.Name.toLowerCase().includes('table') || c.Name.toLowerCase().includes('mic')) {
          console.log(`  - ${c.Name} (Type: ${c.Type})`);
        }
      });
    } else {
      console.log('✅ Found TableMicMute component!');
      console.log(`   Name: ${tableMicMute.Name}`);
      console.log(`   Type: ${tableMicMute.Type}`);
      console.log(`   ID: ${tableMicMute.ID}\n`);
      
      // STEP 2: Get controls for TableMicMute
      console.log('STEP 2: Component.GetControls for TableMicMute');
      console.log('=' .repeat(50));
      
      const controlsResult = await adapter.sendCommand('Component.GetControls', {
        Name: 'TableMicMute'
      });
      
      if (controlsResult?.result?.Controls?.length > 0) {
        console.log(`✅ Found ${controlsResult.result.Controls.length} controls:`);
        
        // Show all controls with their initial values
        controlsResult.result.Controls.forEach((c, idx) => {
          console.log(`   ${idx + 1}. ${c.Name}`);
          console.log(`      Type: ${c.Type || 'unknown'}`);
          console.log(`      Value: ${c.Value !== undefined ? c.Value : 'N/A'}`);
          console.log(`      String: ${c.String || 'N/A'}`);
        });
        
        // Find meter controls
        const meterControls = controlsResult.result.Controls.filter(c => 
          c.Name.includes('meter')
        );
        
        if (meterControls.length > 0) {
          console.log(`\n✅ Found ${meterControls.length} meter controls!\n`);
          
          // STEP 3: Set up change group for polling
          console.log('STEP 3: Setting up ChangeGroup for 33Hz polling');
          console.log('=' .repeat(50));
          
          const groupId = 'qrwc-sdk-test';
          
          // Create change group (not in official SDK but our adapter supports it)
          console.log('Creating change group...');
          await adapter.sendCommand('ChangeGroup.Create', { Id: groupId });
          
          // Add controls using official SDK format
          console.log('Adding controls to change group...');
          const addResult = await adapter.sendCommand('ChangeGroup.AddComponentControl', {
            Id: groupId,
            Component: {
              Name: 'TableMicMute',
              Controls: meterControls.map(c => ({ Name: c.Name }))
            }
          });
          
          console.log(`Added controls: ${addResult?.result?.Controls?.join(', ') || 'none'}\n`);
          
          // Start auto-polling at 33Hz
          console.log('Starting 33Hz auto-polling...\n');
          await adapter.sendCommand('ChangeGroup.AutoPoll', {
            Id: groupId,
            Rate: 0.03  // 33Hz
          });
          
          // Monitor for events
          let eventCount = 0;
          let lastValues = {};
          const startTime = Date.now();
          
          adapter.on('changeGroup:changes', (event) => {
            eventCount++;
            
            // Track value changes
            event.changes.forEach(c => {
              if (!lastValues[c.Name] || Math.abs(lastValues[c.Name] - c.Value) > 0.1) {
                if (eventCount <= 10) {
                  const timestamp = Date.now() - startTime;
                  console.log(`Event ${eventCount} (${timestamp}ms): ${c.Name}=${c.Value.toFixed(2)}dB`);
                }
                lastValues[c.Name] = c.Value;
              }
            });
          });
          
          // Run for 10 seconds
          await new Promise(resolve => setTimeout(resolve, 10000));
          
          // Clean up
          await adapter.sendCommand('ChangeGroup.Destroy', { Id: groupId });
          
          const duration = (Date.now() - startTime) / 1000;
          const rate = eventCount / duration;
          
          console.log('\n🎯 TEST RESULTS:');
          console.log(`   Events received: ${eventCount}`);
          console.log(`   Duration: ${duration.toFixed(1)}s`);
          console.log(`   Actual rate: ${rate.toFixed(1)} Hz`);
          console.log(`   Expected: ~${Math.floor(duration * 33)} events`);
          
          if (eventCount > duration * 25) {
            console.log('\n🎉 SUCCESS! 33Hz polling working with TableMicMute!');
            console.log('   BUG-150 can be closed - all functionality verified!');
          } else if (eventCount > 0) {
            console.log('\n⚠️  Receiving events but not at 33Hz rate');
          } else {
            console.log('\n❌ No events received - meters may not be changing');
          }
        } else {
          console.log('\n❌ No meter controls found in TableMicMute');
        }
      } else {
        console.log('❌ No controls found for TableMicMute');
        console.log('   Component may not have Script Access enabled');
      }
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
testQRWCApproach();