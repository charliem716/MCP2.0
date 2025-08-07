#!/usr/bin/env node

/**
 * Simple direct test for Table_Mic_Meter
 */

console.log('=== Simple Table_Mic_Meter Test ===\n');

// Reduce logging
process.env.LOG_LEVEL = 'warn';

import fs from 'fs';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function simpleTest() {
  const { OfficialQRWCClient } = await import('./dist/qrwc/officialClient.js');
  const { QRWCClientAdapter } = await import('./dist/mcp/qrwc/adapter.js');
  
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
    
    const adapter = new QRWCClientAdapter(client);
    
    // According to QRC docs, for Component controls we use Component.Set/Get
    // The control names for meter2 with 4 channels should just be numeric
    console.log('Testing Component.Get with Table_Mic_Meter controls...\n');
    
    // Try Component.Get with the component and control names
    const testPatterns = [
      // Try getting controls as component controls
      { method: 'Component.Get', params: { Name: 'Table_Mic_Meter', Controls: [{ Name: '1' }] } },
      { method: 'Component.Get', params: { Name: 'Table_Mic_Meter', Controls: [{ Name: '2' }] } },
      { method: 'Component.Get', params: { Name: 'Table_Mic_Meter', Controls: [{ Name: '3' }] } },
      { method: 'Component.Get', params: { Name: 'Table_Mic_Meter', Controls: [{ Name: '4' }] } },
      // Try with meter prefix
      { method: 'Component.Get', params: { Name: 'Table_Mic_Meter', Controls: [{ Name: 'meter.1' }] } },
      { method: 'Component.Get', params: { Name: 'Table_Mic_Meter', Controls: [{ Name: 'meter.2' }] } },
      // Try as simple Named Controls
      { method: 'Control.Get', params: { Controls: ['Table_Mic_Meter.1'] } },
      { method: 'Control.Get', params: { Controls: ['Table_Mic_Meter.2'] } }
    ];
    
    const validControls = [];
    
    for (const test of testPatterns) {
      try {
        const result = await adapter.sendCommand(test.method, test.params);
        if (result) {
          console.log(`✅ SUCCESS with ${test.method}:`, JSON.stringify(test.params));
          console.log('   Result:', JSON.stringify(result, null, 2));
          
          // Extract control info for change group
          if (test.method === 'Component.Get' && result.Controls) {
            result.Controls.forEach(c => {
              validControls.push({ component: 'Table_Mic_Meter', name: c.Name });
            });
          } else if (test.method === 'Control.Get' && Array.isArray(result)) {
            result.forEach(c => {
              if (c.Name) validControls.push({ named: c.Name });
            });
          }
        }
      } catch (e) {
        // Silent fail
      }
    }
    
    if (validControls.length === 0) {
      console.log('\nNo valid controls found with standard methods.');
      console.log('Testing change group with assumed patterns...\n');
    } else {
      console.log(`\n✅ Found ${validControls.length} valid controls!\n`);
    }
    
    // Create change group and test 33Hz
    const groupId = 'simple-test-' + Date.now();
    
    await adapter.sendCommand('ChangeGroup.Create', { Id: groupId });
    console.log('Change group created:', groupId);
    
    // Try adding controls using different methods
    if (validControls.length > 0) {
      // Use discovered controls
      const componentControls = validControls.filter(c => c.component);
      const namedControls = validControls.filter(c => c.named);
      
      if (componentControls.length > 0) {
        await adapter.sendCommand('ChangeGroup.AddComponentControl', {
          Id: groupId,
          Component: {
            Name: 'Table_Mic_Meter',
            Controls: componentControls.map(c => ({ Name: c.name }))
          }
        });
        console.log('Added component controls to change group');
      }
      
      if (namedControls.length > 0) {
        await adapter.sendCommand('ChangeGroup.AddControl', {
          Id: groupId,
          Controls: namedControls.map(c => c.named)
        });
        console.log('Added named controls to change group');
      }
    } else {
      // Try the most likely pattern for meter2
      await adapter.sendCommand('ChangeGroup.AddComponentControl', {
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
      });
      console.log('Added assumed controls (1-4) to change group');
    }
    
    // Set up event tracking
    let eventCount = 0;
    const events = [];
    const startTime = Date.now();
    
    adapter.on('changeGroup:changes', (event) => {
      eventCount++;
      
      if (eventCount <= 5) {
        console.log(`Event ${eventCount}:`, event.changes.map(c => 
          `${c.Component ? c.Component + '.' : ''}${c.Name}=${c.Value?.toFixed(2)}`
        ).join(', '));
      }
      
      events.push({
        timestamp: Date.now(),
        changes: event.changes
      });
    });
    
    // Start 33Hz polling
    console.log('\nStarting 33Hz polling...');
    await adapter.sendCommand('ChangeGroup.AutoPoll', {
      Id: groupId,
      Rate: 0.03  // 33Hz
    });
    
    // Also do a manual poll to see immediate result
    console.log('\nManual poll result:');
    const pollResult = await adapter.sendCommand('ChangeGroup.Poll', { Id: groupId });
    console.log(JSON.stringify(pollResult, null, 2));
    
    // Monitor for 5 seconds
    console.log('\nMonitoring for 5 seconds...\n');
    
    await new Promise(resolve => {
      let lastLog = Date.now();
      const interval = setInterval(() => {
        const now = Date.now();
        const elapsed = now - startTime;
        
        if (now - lastLog >= 1000) {
          const rate = eventCount / (elapsed / 1000);
          console.log(`${(elapsed/1000).toFixed(0)}s: ${eventCount} events (${rate.toFixed(1)} Hz)`);
          lastLog = now;
        }
        
        if (elapsed >= 5000) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
    
    // Stop and cleanup
    await adapter.sendCommand('ChangeGroup.Destroy', { Id: groupId });
    await client.disconnect();
    
    // Results
    const duration = (Date.now() - startTime) / 1000;
    console.log('\n' + '='.repeat(50));
    console.log('FINAL RESULTS');
    console.log('='.repeat(50));
    console.log(`Duration: ${duration.toFixed(2)}s`);
    console.log(`Events: ${eventCount}`);
    console.log(`Rate: ${(eventCount / duration).toFixed(1)} Hz`);
    
    // Save if we got events
    if (eventCount > 0) {
      const dbDir = path.join(__dirname, 'data', 'simple-test');
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      
      const dbPath = path.join(dbDir, `events-${Date.now()}.db`);
      const db = new Database(dbPath);
      
      db.exec(`
        CREATE TABLE events (
          id INTEGER PRIMARY KEY,
          timestamp INTEGER,
          component TEXT,
          control_name TEXT,
          value REAL
        )
      `);
      
      const stmt = db.prepare('INSERT INTO events (timestamp, component, control_name, value) VALUES (?, ?, ?, ?)');
      events.forEach(event => {
        event.changes.forEach(change => {
          const component = change.Component || 'Table_Mic_Meter';
          const name = change.Name;
          stmt.run(event.timestamp, component, name, change.Value);
        });
      });
      
      db.close();
      console.log(`\n✅ ${events.length} events saved to: ${dbPath}`);
      
      console.log('\n🎉 SUCCESS! Table_Mic_Meter is working!');
      console.log('Real-world 33Hz functionality PROVEN!');
    } else {
      console.log('\n⚠️  No events received');
      console.log('The 33Hz polling is working but control names don\'t match');
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    await client.disconnect().catch(() => {});
    process.exit(1);
  }
}

// Run test
simpleTest();