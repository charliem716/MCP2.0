#!/usr/bin/env node

/**
 * Test implementing Component.Get support
 * This is the missing piece for accessing Table_Mic_Meter controls
 */

console.log('=== Testing Component.Get Implementation ===\n');

// Reduce logging
process.env.LOG_LEVEL = 'warn';

import fs from 'fs';

async function testComponentGet() {
  const { OfficialQRWCClient } = await import('./dist/qrwc/officialClient.js');
  
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
    
    // Get the QRWC instance to access the raw SDK
    const qrwc = client.getQrwc();
    
    if (!qrwc) {
      console.log('❌ QRWC instance not available');
      await client.disconnect();
      return;
    }
    
    console.log('Testing raw QRWC SDK methods for Table_Mic_Meter...\n');
    
    // Method 1: Try using the components directly
    console.log('Method 1: Checking qrwc.components...');
    if (qrwc.components) {
      const componentNames = Object.keys(qrwc.components);
      console.log(`  Found ${componentNames.length} components in QRWC`);
      
      const tableMicMeter = qrwc.components['Table_Mic_Meter'];
      if (tableMicMeter) {
        console.log('  ✅ Found Table_Mic_Meter in components!');
        console.log('  Component:', tableMicMeter);
        
        if (tableMicMeter.controls) {
          console.log('  Controls available:', Object.keys(tableMicMeter.controls));
        }
      } else {
        console.log('  ❌ Table_Mic_Meter not in components object');
      }
    }
    
    // Method 2: Try getting component directly via QRC command
    console.log('\nMethod 2: Using raw QRC command...');
    
    // The QRWC SDK should have a way to send raw commands
    if (qrwc.send || qrwc.sendCommand || qrwc.request) {
      console.log('  Found command method on QRWC');
      
      // Try different command methods
      const commandMethods = ['send', 'sendCommand', 'request', 'execute'];
      
      for (const method of commandMethods) {
        if (typeof qrwc[method] === 'function') {
          console.log(`  Trying qrwc.${method}()...`);
          
          try {
            // Try Component.Get command
            const componentGetRequest = {
              jsonrpc: '2.0',
              method: 'Component.Get',
              params: {
                Name: 'Table_Mic_Meter',
                Controls: [
                  { Name: 'meter.1' },
                  { Name: 'meter.2' },
                  { Name: 'meter.3' },
                  { Name: 'meter.4' }
                ]
              },
              id: Date.now()
            };
            
            const result = await qrwc[method](componentGetRequest);
            
            if (result) {
              console.log('    ✅ Got response:', JSON.stringify(result, null, 2));
              
              if (result.result && result.result.Controls) {
                console.log('\n🎉 SUCCESS! Found controls via Component.Get:');
                result.result.Controls.forEach(control => {
                  console.log(`  ${control.Name}: ${control.Value} (${control.String})`);
                });
                
                // Now test with ChangeGroup
                console.log('\nTesting 33Hz polling with discovered controls...\n');
                
                const groupId = 'component-get-impl-test';
                const controlNames = result.result.Controls.map(c => 
                  `Table_Mic_Meter.${c.Name}`
                );
                
                // Create change group using raw commands
                await qrwc[method]({
                  jsonrpc: '2.0',
                  method: 'ChangeGroup.Create',
                  params: { Id: groupId },
                  id: Date.now()
                });
                
                await qrwc[method]({
                  jsonrpc: '2.0',
                  method: 'ChangeGroup.AddControl',
                  params: { 
                    Id: groupId,
                    Controls: controlNames
                  },
                  id: Date.now()
                });
                
                await qrwc[method]({
                  jsonrpc: '2.0',
                  method: 'ChangeGroup.AutoPoll',
                  params: { 
                    Id: groupId,
                    Rate: 0.03
                  },
                  id: Date.now()
                });
                
                console.log('33Hz polling started. Monitoring for 5 seconds...\n');
                
                // Monitor for events
                let eventCount = 0;
                const startTime = Date.now();
                
                // Poll manually a few times
                for (let i = 0; i < 10; i++) {
                  await new Promise(resolve => setTimeout(resolve, 500));
                  
                  const pollResult = await qrwc[method]({
                    jsonrpc: '2.0',
                    method: 'ChangeGroup.Poll',
                    params: { Id: groupId },
                    id: Date.now()
                  });
                  
                  if (pollResult && pollResult.result && pollResult.result.Changes) {
                    eventCount++;
                    console.log(`Poll ${i+1}: ${pollResult.result.Changes.length} changes`);
                  }
                }
                
                // Clean up
                await qrwc[method]({
                  jsonrpc: '2.0',
                  method: 'ChangeGroup.Destroy',
                  params: { Id: groupId },
                  id: Date.now()
                });
                
                console.log(`\n✅ Component.Get works! Method: qrwc.${method}()`);
                console.log('This method can be used to implement Component.Get in the adapter');
                
                break;
              }
            }
          } catch (e) {
            console.log(`    ❌ ${method} failed:`, e.message);
          }
        }
      }
    }
    
    // Method 3: Check what methods are available on QRWC
    console.log('\nMethod 3: Available QRWC methods:');
    const qrwcMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(qrwc))
      .filter(name => typeof qrwc[name] === 'function');
    console.log('  Methods:', qrwcMethods.join(', '));
    
    // Method 4: Try using addControl if available
    if (qrwc.addControl) {
      console.log('\nMethod 4: Using addControl method...');
      try {
        const control = await qrwc.addControl('Table_Mic_Meter.meter.1');
        if (control) {
          console.log('  ✅ Added control:', control);
          console.log('  Value:', control.value);
        }
      } catch (e) {
        console.log('  ❌ addControl failed:', e.message);
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
testComponentGet();