#!/usr/bin/env node

/**
 * Test 33Hz with Table_Mic_Meter (meter2 component)
 */

console.log('=== 33Hz Test with Table_Mic_Meter ===\n');

// Reduce logging noise  
process.env.LOG_LEVEL = 'warn';

import fs from 'fs';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function test33HzTableMicMeter() {
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
    
    // We know Table_Mic_Meter is a meter2 component with 4 channels
    console.log('Component: Table_Mic_Meter');
    console.log('Type: meter2 (4 channels)\n');
    
    // Try different control name patterns for meter2 components
    const controlPatterns = [
      // Standard meter2 control names
      'Table_Mic_Meter.meter.1',
      'Table_Mic_Meter.meter.2', 
      'Table_Mic_Meter.meter.3',
      'Table_Mic_Meter.meter.4',
      // Alternative patterns
      'Table_Mic_Meter.level.1',
      'Table_Mic_Meter.level.2',
      'Table_Mic_Meter.level.3',
      'Table_Mic_Meter.level.4',
      // Peak/RMS patterns
      'Table_Mic_Meter.peak.1',
      'Table_Mic_Meter.rms.1'
    ];
    
    // Test each control pattern with Control.Get
    console.log('Testing control patterns with Control.Get...\n');
    
    const validControls = [];
    
    for (const controlName of controlPatterns) {
      try {
        // Control.Get requires Controls array parameter
        const result = await adapter.sendCommand('Control.Get', {
          Controls: [controlName]
        });
        
        if (result && result.length > 0) {
          console.log(`✅ Found valid control: ${controlName}`);
          console.log(`   Value: ${result[0].Value}, String: ${result[0].String}`);
          validControls.push(controlName);
        }
      } catch (e) {
        // Silent fail - control doesn't exist
      }
    }
    
    if (validControls.length === 0) {
      console.log('No valid controls found. Trying with simpler names...\n');
      
      // Try without component prefix
      const simplePatterns = ['meter.1', 'meter.2', 'meter.3', 'meter.4'];
      
      for (const pattern of simplePatterns) {
        try {
          const result = await adapter.sendCommand('Control.Get', {
            Controls: [`Table_Mic_Meter.${pattern}`]
          });
          
          if (result && result.length > 0) {
            console.log(`✅ Found: Table_Mic_Meter.${pattern}`);
            validControls.push(`Table_Mic_Meter.${pattern}`);
          }
        } catch (e) {
          // Silent
        }
      }
    }
    
    if (validControls.length === 0) {
      console.log('⚠️  Could not find valid meter controls');
      console.log('Continuing with assumed control names...\n');
      
      // Use assumed names
      validControls.push(
        'Table_Mic_Meter.meter.1',
        'Table_Mic_Meter.meter.2',
        'Table_Mic_Meter.meter.3',
        'Table_Mic_Meter.meter.4'
      );
    }
    
    console.log(`\nUsing ${validControls.length} controls for change group\n`);
    
    // Create change group
    const groupId = 'table-mic-meter-33hz';
    
    console.log('Creating change group...');
    await adapter.sendCommand('ChangeGroup.Create', { Id: groupId });
    
    // Add controls
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
    
    adapter.on('changeGroup:changes', (event) => {
      eventCount++;
      
      // Log first few events
      if (eventCount <= 3) {
        console.log(`Event ${eventCount}:`, event.changes.map(c => 
          `${c.Name}=${c.Value.toFixed(2)}dB`
        ).join(', '));
      }
      
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
    
    // Monitor for 5 seconds
    const testDuration = 5000;
    
    await new Promise(resolve => {
      const interval = setInterval(() => {
        const now = Date.now();
        const elapsed = now - startTime;
        
        // Status update every second
        if (now - lastLogTime >= 1000) {
          console.log(`${(elapsed/1000).toFixed(1)}s: ${eventCount} events`);
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
    
    console.log('\n' + '='.repeat(50));
    console.log('RESULTS');
    console.log('='.repeat(50));
    console.log(`Duration: ${duration.toFixed(2)}s`);
    console.log(`Events: ${eventCount}`);
    console.log(`Rate: ${(eventCount / duration).toFixed(1)} events/second`);
    console.log(`Expected at 33Hz: ~${Math.floor(duration * 33)}`);
    
    // Save to database if we got events
    if (eventCount > 0) {
      const dbDir = path.join(__dirname, 'data', 'table-mic-meter');
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
      
      db.close();
      console.log(`\n✅ Events saved to: ${dbPath}`);
    }
    
    // Verdict
    if (eventCount > duration * 20) {
      console.log('\n🎉 SUCCESS! 33Hz data flow confirmed!');
    } else if (eventCount > 0) {
      console.log('\n✅ Some events recorded');
    } else {
      console.log('\n⚠️  No events recorded');
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    await client.disconnect().catch(() => {});
    process.exit(1);
  }
}

// Run test
test33HzTableMicMeter();