#!/usr/bin/env node

/**
 * Live 33Hz test with all microphone components
 */

console.log('=== Live 33Hz Test with All Microphone Components ===\n');

// Reduce logging
process.env.LOG_LEVEL = 'warn';

import fs from 'fs';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testLiveWith33Hz() {
  const { OfficialQRWCClient } = await import('./dist/qrwc/officialClient.js');
  const { QRWCClientAdapter } = await import('./dist/mcp/qrwc/adapter.js');
  
  // Read config
  const config = JSON.parse(fs.readFileSync('qsys-core.config.json', 'utf8')).qsysCore;
  
  console.log('Connecting to LIVE Q-SYS Core at', config.host, '...');
  
  const client = new OfficialQRWCClient({
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to LIVE Q-SYS Core\n');
    
    const adapter = new QRWCClientAdapter(client);
    
    // Get all components
    const componentsResult = await adapter.sendCommand('Component.GetComponents');
    const components = componentsResult.result || componentsResult || [];
    
    // Find ALL microphone and meter components
    const audioComponents = components.filter(comp => 
      comp.Name.toLowerCase().includes('mic') ||
      comp.Name.toLowerCase().includes('meter') ||
      comp.Name.toLowerCase().includes('gain') ||
      comp.Type?.toLowerCase().includes('mixer') ||
      comp.Type?.toLowerCase().includes('beamformer') ||
      comp.Type?.toLowerCase().includes('gain')
    );
    
    console.log(`Found ${audioComponents.length} audio-related components:\n`);
    
    // List components we're testing
    audioComponents.forEach(comp => {
      console.log(`  - ${comp.Name} (${comp.Type || 'unknown'})`);
    });
    
    // Build list of potential control names to test
    const controlsToTest = [];
    
    // For each component, try common control patterns
    audioComponents.forEach(comp => {
      // Common control patterns for different component types
      if (comp.Type === 'meter2' || comp.Name.includes('Meter')) {
        // Meter controls
        for (let i = 1; i <= 4; i++) {
          controlsToTest.push(`${comp.Name}.meter.${i}`);
          controlsToTest.push(`${comp.Name}.level.${i}`);
        }
      }
      
      if (comp.Type === 'gain' || comp.Name.includes('gain')) {
        // Gain controls
        controlsToTest.push(`${comp.Name}.gain`);
        controlsToTest.push(`${comp.Name}.mute`);
        for (let i = 1; i <= 4; i++) {
          controlsToTest.push(`${comp.Name}.gain.${i}`);
        }
      }
      
      if (comp.Type?.includes('mixer')) {
        // Mixer controls
        for (let i = 1; i <= 8; i++) {
          controlsToTest.push(`${comp.Name}.input.${i}.level`);
          controlsToTest.push(`${comp.Name}.input.${i}.gain`);
        }
      }
      
      // Generic patterns
      controlsToTest.push(`${comp.Name}.level`);
      controlsToTest.push(`${comp.Name}.peak`);
      controlsToTest.push(`${comp.Name}.rms`);
    });
    
    console.log(`\nTesting ${controlsToTest.length} potential control names...`);
    
    // Test each control with Control.Get to find valid ones
    const validControls = [];
    let tested = 0;
    
    for (const controlName of controlsToTest) {
      tested++;
      if (tested % 20 === 0) {
        process.stdout.write('.');
      }
      
      try {
        const result = await adapter.sendCommand('Control.Get', {
          Controls: [controlName]
        });
        
        if (result && result.length > 0 && result[0].Name) {
          validControls.push(controlName);
          if (validControls.length <= 5) {
            console.log(`\n✅ Found: ${controlName} = ${result[0].Value}`);
          }
        }
      } catch (e) {
        // Silent - control doesn't exist
      }
    }
    
    console.log(`\n\nFound ${validControls.length} valid controls\n`);
    
    if (validControls.length === 0) {
      console.log('⚠️  No valid controls found. Testing with assumed names...');
      // Add some assumed controls
      validControls.push(
        'Table_Mic_Meter.meter.1',
        'Table_Mic[gain;no_mute].gain.1'
      );
    }
    
    // Create change group with all valid controls
    const groupId = 'live-all-mics-33hz';
    
    console.log('Creating change group...');
    await adapter.sendCommand('ChangeGroup.Create', { Id: groupId });
    
    // Add controls in batches
    const batchSize = 20;
    for (let i = 0; i < validControls.length; i += batchSize) {
      const batch = validControls.slice(i, i + batchSize);
      try {
        await adapter.sendCommand('ChangeGroup.AddControl', {
          Id: groupId,
          Controls: batch
        });
        console.log(`  Added ${batch.length} controls`);
      } catch (e) {
        console.log(`  Warning: ${e.message}`);
      }
    }
    
    console.log('✅ Change group ready\n');
    
    // Set up event tracking
    let eventCount = 0;
    const events = [];
    const startTime = Date.now();
    const controlActivity = new Map();
    
    adapter.on('changeGroup:changes', (event) => {
      eventCount++;
      
      // Track activity per control
      event.changes.forEach(change => {
        if (!controlActivity.has(change.Name)) {
          controlActivity.set(change.Name, {
            count: 0,
            values: new Set(),
            lastValue: null
          });
        }
        
        const activity = controlActivity.get(change.Name);
        activity.count++;
        activity.values.add(change.Value.toFixed(3));
        activity.lastValue = change.Value;
      });
      
      // Log first few events
      if (eventCount <= 3) {
        console.log(`Event ${eventCount}:`, event.changes.slice(0, 2).map(c => 
          `${c.Name}=${c.Value.toFixed(2)}`
        ).join(', '));
      }
      
      events.push({
        timestamp: Date.now(),
        changes: event.changes
      });
    });
    
    // Start 33Hz polling
    console.log('Starting 33Hz polling on LIVE system...\n');
    await adapter.sendCommand('ChangeGroup.AutoPoll', {
      Id: groupId,
      Rate: 0.03  // 33Hz
    });
    
    // Monitor for 10 seconds
    const testDuration = 10000;
    let lastLogTime = startTime;
    
    await new Promise(resolve => {
      const interval = setInterval(() => {
        const now = Date.now();
        const elapsed = now - startTime;
        
        // Status update every 2 seconds
        if (now - lastLogTime >= 2000) {
          console.log(`${(elapsed/1000).toFixed(1)}s: ${eventCount} events from ${controlActivity.size} active controls`);
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
    console.log('LIVE RESULTS');
    console.log('='.repeat(60));
    console.log(`Duration: ${duration.toFixed(2)}s`);
    console.log(`Valid controls tested: ${validControls.length}`);
    console.log(`Total events: ${eventCount}`);
    console.log(`Event rate: ${(eventCount / duration).toFixed(1)} events/second`);
    console.log(`Expected at 33Hz: ~${Math.floor(duration * 33)}`);
    
    // Show active controls
    if (controlActivity.size > 0) {
      console.log('\n=== Active Controls ===');
      let shown = 0;
      controlActivity.forEach((activity, name) => {
        if (activity.count > 0 && shown < 10) {
          console.log(`\n${name}:`);
          console.log(`  Events: ${activity.count}`);
          console.log(`  Unique values: ${activity.values.size}`);
          console.log(`  Last value: ${activity.lastValue?.toFixed(3)}`);
          shown++;
        }
      });
      
      if (controlActivity.size > 10) {
        console.log(`\n... and ${controlActivity.size - 10} more active controls`);
      }
    }
    
    // Save to database if we got events
    if (eventCount > 0) {
      const dbDir = path.join(__dirname, 'data', 'live-33hz');
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
      
      const eventCountInDb = db.prepare('SELECT COUNT(*) as count FROM events').get().count;
      
      db.close();
      console.log(`\n✅ ${eventCountInDb} events saved to: ${dbPath}`);
    }
    
    // Verdict
    console.log('\n' + '='.repeat(60));
    if (eventCount > duration * 20) {
      console.log('🎉 SUCCESS! Live 33Hz data flow confirmed!');
      console.log('The system is receiving and recording control changes');
      console.log('at high frequency from the LIVE Q-SYS Core!');
    } else if (eventCount > 0) {
      console.log('✅ PARTIAL SUCCESS');
      console.log('Some events recorded from live system');
      console.log('Try with more active audio sources for higher event rate');
    } else {
      console.log('⚠️  No events recorded');
      console.log('Controls may be static or audio may be quiet');
      console.log('Try generating audio in the room or adjusting controls');
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    await client.disconnect().catch(() => {});
    process.exit(1);
  }
}

// Run test
testLiveWith33Hz();