#!/usr/bin/env node

/**
 * Test Table_Mic_Meter using QRC API directly
 */

console.log('=== Table_Mic_Meter QRC API Test ===\n');

import fs from 'fs';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testTableMicMeterQRC() {
  const { OfficialQRWCClient } = await import('./dist/qrwc/officialClient.js');
  
  // Read config
  const config = JSON.parse(fs.readFileSync('qsys-core.config.json', 'utf8')).qsysCore;
  
  console.log('Connecting to Q-SYS Core...');
  
  const client = new OfficialQRWCClient({
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password
  });
  
  try {
    await client.connect();
    console.log('✅ Connected\n');
    
    // Access the underlying QRWC client
    const qrwc = client.qrwc;
    
    if (!qrwc) {
      throw new Error('QRWC client not available');
    }
    
    // According to QRC reference, Component.GetControls should return all controls
    console.log('Getting controls for Table_Mic_Meter using Component.GetControls...\n');
    
    try {
      const result = await qrwc.sendRaw({
        jsonrpc: '2.0',
        method: 'Component.GetControls',
        params: {
          Name: 'Table_Mic_Meter'
        },
        id: Date.now()
      });
      
      console.log('Component.GetControls result:');
      console.log(JSON.stringify(result, null, 2));
      
      if (result.result?.Controls) {
        console.log(`\n✅ Found ${result.result.Controls.length} controls!\n`);
        
        // Extract control names
        const controlNames = result.result.Controls.map(c => `Table_Mic_Meter.${c.Name}`);
        
        // Now test 33Hz with these controls
        console.log('Testing 33Hz with discovered controls...\n');
        
        // Create change group
        const groupId = 'table-mic-meter-qrc-' + Date.now();
        
        await qrwc.sendRaw({
          jsonrpc: '2.0',
          method: 'ChangeGroup.Create',
          params: { Id: groupId },
          id: Date.now()
        });
        console.log('✅ Change group created');
        
        // Add controls
        await qrwc.sendRaw({
          jsonrpc: '2.0',
          method: 'ChangeGroup.AddComponentControl',
          params: {
            Id: groupId,
            Component: {
              Name: 'Table_Mic_Meter',
              Controls: result.result.Controls.map(c => ({ Name: c.Name }))
            }
          },
          id: Date.now()
        });
        console.log('✅ Controls added to change group\n');
        
        // Set up 33Hz polling
        await qrwc.sendRaw({
          jsonrpc: '2.0',
          method: 'ChangeGroup.AutoPoll',
          params: {
            Id: groupId,
            Rate: 0.03  // 33Hz
          },
          id: Date.now()
        });
        console.log('✅ 33Hz polling started\n');
        
        // Track events
        let eventCount = 0;
        const events = [];
        const startTime = Date.now();
        
        // Listen for responses
        qrwc.on('response', (response) => {
          if (response.method === 'ChangeGroup.Poll' || response.result?.Changes) {
            eventCount++;
            const changes = response.result?.Changes || [];
            
            if (eventCount <= 5 && changes.length > 0) {
              console.log(`Event ${eventCount}:`, changes.slice(0, 2).map(c => 
                `${c.Name}=${c.Value?.toFixed(2)}`
              ).join(', '));
            }
            
            events.push({
              timestamp: Date.now(),
              changes
            });
          }
        });
        
        // Monitor for 10 seconds
        console.log('Monitoring for 10 seconds...\n');
        let lastLog = Date.now();
        
        await new Promise(resolve => {
          const interval = setInterval(() => {
            const now = Date.now();
            const elapsed = now - startTime;
            
            if (now - lastLog >= 2000) {
              const rate = eventCount / (elapsed / 1000);
              console.log(`${(elapsed/1000).toFixed(1)}s: ${eventCount} events (${rate.toFixed(1)} Hz)`);
              lastLog = now;
            }
            
            if (elapsed >= 10000) {
              clearInterval(interval);
              resolve();
            }
          }, 100);
        });
        
        // Stop polling
        await qrwc.sendRaw({
          jsonrpc: '2.0',
          method: 'ChangeGroup.Destroy',
          params: { Id: groupId },
          id: Date.now()
        });
        
        // Results
        const duration = (Date.now() - startTime) / 1000;
        console.log('\n' + '='.repeat(60));
        console.log('RESULTS');
        console.log('='.repeat(60));
        console.log(`Duration: ${duration.toFixed(2)}s`);
        console.log(`Events: ${eventCount}`);
        console.log(`Rate: ${(eventCount / duration).toFixed(1)} Hz`);
        
        // Save to database if we got events
        if (eventCount > 0) {
          const dbDir = path.join(__dirname, 'data', 'table-mic-meter-qrc');
          if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
          }
          
          const dbPath = path.join(dbDir, `events-${Date.now()}.db`);
          const db = new Database(dbPath);
          
          db.exec(`
            CREATE TABLE events (
              id INTEGER PRIMARY KEY,
              timestamp INTEGER,
              control_name TEXT,
              value REAL
            )
          `);
          
          const stmt = db.prepare('INSERT INTO events (timestamp, control_name, value) VALUES (?, ?, ?)');
          events.forEach(event => {
            event.changes.forEach(change => {
              stmt.run(event.timestamp, change.Name || change.Component + '.' + change.Name, change.Value);
            });
          });
          
          db.close();
          console.log(`\n✅ Events saved to: ${dbPath}`);
        }
        
        if (eventCount > duration * 20) {
          console.log('\n🎉 SUCCESS! Table_Mic_Meter 33Hz verified!');
        } else if (eventCount > 0) {
          console.log('\n✅ Some events received');
        } else {
          console.log('\n⚠️  No events received');
        }
        
      }
    } catch (e) {
      console.log('Component.GetControls failed:', e.message);
      console.log('\nTrying alternative approach...\n');
      
      // Try adding controls directly without discovery
      const groupId = 'table-mic-meter-alt';
      
      await qrwc.sendRaw({
        jsonrpc: '2.0',
        method: 'ChangeGroup.Create',
        params: { Id: groupId },
        id: Date.now()
      });
      
      // Try adding the component directly
      await qrwc.sendRaw({
        jsonrpc: '2.0',
        method: 'ChangeGroup.AddComponentControl',
        params: {
          Id: groupId,
          Component: {
            Name: 'Table_Mic_Meter',
            Controls: [
              { Name: '1' },
              { Name: '2' },
              { Name: '3' },
              { Name: '4' }
            ]
          }
        },
        id: Date.now()
      });
      
      console.log('Added controls 1-4 to change group');
      
      // Poll once to see if we get data
      const pollResult = await qrwc.sendRaw({
        jsonrpc: '2.0',
        method: 'ChangeGroup.Poll',
        params: { Id: groupId },
        id: Date.now()
      });
      
      console.log('Poll result:', JSON.stringify(pollResult, null, 2));
      
      await qrwc.sendRaw({
        jsonrpc: '2.0',
        method: 'ChangeGroup.Destroy',
        params: { Id: groupId },
        id: Date.now()
      });
    }
    
    await client.disconnect();
    console.log('\n✅ Test complete');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    await client.disconnect().catch(() => {});
    process.exit(1);
  }
}

// Run test
testTableMicMeterQRC();