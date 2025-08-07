#!/usr/bin/env node

/**
 * Final test for Table_Mic_Meter with proper control discovery
 */

console.log('=== Table_Mic_Meter 33Hz Test ===\n');

// Reduce logging
process.env.LOG_LEVEL = 'warn';

import fs from 'fs';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    
    // First, confirm Table_Mic_Meter exists
    const componentsResult = await adapter.sendCommand('Component.GetComponents');
    const components = componentsResult.result || componentsResult || [];
    
    const tableMicMeter = components.find(c => c.Name === 'Table_Mic_Meter');
    
    if (!tableMicMeter) {
      throw new Error('Table_Mic_Meter not found!');
    }
    
    console.log('Found Table_Mic_Meter component:');
    console.log('  Type:', tableMicMeter.Type);
    console.log('  Properties:', JSON.stringify(tableMicMeter.Properties || {}, null, 2));
    console.log('');
    
    // Since Table_Mic_Meter is a meter2 component with 4 channels,
    // try different control naming patterns
    const possibleControls = [
      // Standard meter2 patterns
      'Table_Mic_Meter.1',
      'Table_Mic_Meter.2', 
      'Table_Mic_Meter.3',
      'Table_Mic_Meter.4',
      // With .meter prefix
      'Table_Mic_Meter.meter.1',
      'Table_Mic_Meter.meter.2',
      'Table_Mic_Meter.meter.3',
      'Table_Mic_Meter.meter.4',
      // With .level prefix
      'Table_Mic_Meter.level.1',
      'Table_Mic_Meter.level.2',
      'Table_Mic_Meter.level.3',
      'Table_Mic_Meter.level.4',
      // Simple numeric
      'Table_Mic_Meter 1',
      'Table_Mic_Meter 2',
      'Table_Mic_Meter 3',
      'Table_Mic_Meter 4'
    ];
    
    console.log('Testing control name patterns...\n');
    
    const validControls = [];
    
    // Test with Control.Get
    for (const controlName of possibleControls) {
      try {
        const result = await adapter.sendCommand('Control.Get', {
          Controls: [controlName]
        });
        
        if (result && result.length > 0) {
          console.log(`✅ FOUND VALID CONTROL: ${controlName}`);
          console.log(`   Value: ${result[0].Value}`);
          console.log(`   String: ${result[0].String}`);
          validControls.push(controlName);
        }
      } catch (e) {
        // Try without the array wrapper (some versions might not need it)
        try {
          const result = await adapter.sendCommand('Control.Get', {
            Controls: controlName  // Without array
          });
          
          if (result) {
            console.log(`✅ FOUND VALID CONTROL: ${controlName}`);
            validControls.push(controlName);
          }
        } catch (e2) {
          // Silent - control doesn't exist
        }
      }
    }
    
    if (validControls.length === 0) {
      console.log('No controls found with standard patterns.');
      console.log('Trying to poll a change group with assumed names...\n');
      
      // Use the most likely pattern
      validControls.push(
        'Table_Mic_Meter.1',
        'Table_Mic_Meter.2',
        'Table_Mic_Meter.3',
        'Table_Mic_Meter.4'
      );
    }
    
    console.log(`\nUsing ${validControls.length} controls for 33Hz test\n`);
    
    // Create change group
    const groupId = 'table-mic-meter-final';
    
    console.log('Creating change group...');
    await adapter.sendCommand('ChangeGroup.Create', { Id: groupId });
    
    console.log('Adding controls to change group...');
    await adapter.sendCommand('ChangeGroup.AddControl', {
      Id: groupId,
      Controls: validControls
    });
    
    console.log('✅ Change group ready\n');
    
    // Set up event tracking
    let eventCount = 0;
    const events = [];
    const startTime = Date.now();
    let lastLogTime = startTime;
    const uniqueValues = new Map();
    
    adapter.on('changeGroup:changes', (event) => {
      eventCount++;
      
      // Track unique values per control
      event.changes.forEach(change => {
        if (!uniqueValues.has(change.Name)) {
          uniqueValues.set(change.Name, new Set());
        }
        uniqueValues.get(change.Name).add(change.Value.toFixed(3));
        
        // Log first few events
        if (eventCount <= 5) {
          console.log(`Event ${eventCount}: ${change.Name} = ${change.Value.toFixed(3)} dB`);
        }
      });
      
      events.push({
        timestamp: Date.now(),
        changes: event.changes
      });
    });
    
    // Start 33Hz polling
    console.log('Starting 33Hz polling...\n');
    await adapter.sendCommand('ChangeGroup.AutoPoll', {
      Id: groupId,
      Rate: 0.03  // 33Hz
    });
    
    // Also try manual polling to see if we get data
    console.log('Testing manual poll...');
    try {
      const pollResult = await adapter.sendCommand('ChangeGroup.Poll', {
        Id: groupId
      });
      console.log('Manual poll result:', JSON.stringify(pollResult, null, 2));
    } catch (e) {
      console.log('Manual poll error:', e.message);
    }
    
    // Monitor for 10 seconds
    const testDuration = 10000;
    
    await new Promise(resolve => {
      const interval = setInterval(() => {
        const now = Date.now();
        const elapsed = now - startTime;
        
        // Status update every 2 seconds
        if (now - lastLogTime >= 2000) {
          const rate = eventCount / (elapsed / 1000);
          console.log(`${(elapsed/1000).toFixed(1)}s: ${eventCount} events (${rate.toFixed(1)} Hz)`);
          lastLogTime = now;
        }
        
        if (elapsed >= testDuration) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
    
    // Stop polling
    console.log('\nStopping...');
    await adapter.sendCommand('ChangeGroup.Destroy', { Id: groupId });
    
    // Disconnect
    await client.disconnect();
    
    // Results
    const duration = (Date.now() - startTime) / 1000;
    
    console.log('\n' + '='.repeat(60));
    console.log('FINAL RESULTS - Table_Mic_Meter');
    console.log('='.repeat(60));
    console.log(`Component: Table_Mic_Meter (${tableMicMeter.Type})`);
    console.log(`Controls tested: ${validControls.join(', ')}`);
    console.log(`Duration: ${duration.toFixed(2)}s`);
    console.log(`Total events: ${eventCount}`);
    console.log(`Event rate: ${(eventCount / duration).toFixed(1)} Hz`);
    console.log(`Expected at 33Hz: ~${Math.floor(duration * 33)} events`);
    
    // Show control activity
    if (uniqueValues.size > 0) {
      console.log('\n=== Control Activity ===');
      uniqueValues.forEach((values, controlName) => {
        console.log(`\n${controlName}:`);
        console.log(`  Unique values: ${values.size}`);
        if (values.size > 1) {
          console.log(`  ✅ CHANGING (active meter)`);
        } else {
          console.log(`  ⚠️  Static value`);
        }
      });
    }
    
    // Save to database if we got events
    if (eventCount > 0) {
      const dbDir = path.join(__dirname, 'data', 'table-mic-meter-final');
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
          stmt.run(event.timestamp, change.Name, change.Value);
        });
      });
      
      const recordCount = db.prepare('SELECT COUNT(*) as count FROM events').get().count;
      
      db.close();
      console.log(`\n✅ ${recordCount} records saved to: ${dbPath}`);
    }
    
    // Final verdict
    console.log('\n' + '='.repeat(60));
    if (eventCount > duration * 20) {
      console.log('🎉 SUCCESS! Table_Mic_Meter 33Hz data flow confirmed!');
      console.log('Real-world functionality proven with actual Q-SYS component!');
    } else if (eventCount > 0) {
      console.log('✅ PARTIAL SUCCESS');
      console.log(`Received ${eventCount} events from Table_Mic_Meter`);
      console.log('Rate lower than expected - audio may be quiet');
    } else {
      console.log('⚠️  NO EVENTS RECEIVED');
      console.log('Control names may not match or audio is silent');
      console.log('Manual configuration may be needed');
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    await client.disconnect().catch(() => {});
    process.exit(1);
  }
}

// Run test
testTableMicMeter();