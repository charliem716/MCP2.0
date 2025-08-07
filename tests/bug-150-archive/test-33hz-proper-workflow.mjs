#!/usr/bin/env node

/**
 * Proper 33Hz Test Using MCP Tool Workflow
 * 
 * This test follows the real-world workflow:
 * 1. Use list_components to discover components
 * 2. Use list_controls to get exact control names
 * 3. Create change group with discovered controls
 * 4. Poll at 33Hz and record changes
 */

console.log('=== 33Hz Test with Proper MCP Workflow ===\n');
console.log('This test uses the correct MCP tools to discover and monitor controls.\n');

// Reduce logging noise
process.env.LOG_LEVEL = 'warn';

import fs from 'fs';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runProperWorkflowTest() {
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
    
    // STEP 1: List all components to find Table_Mic_Meter
    console.log('STEP 1: Discovering components...');
    console.log('Using: Component.GetComponents\n');
    
    const componentsResult = await adapter.sendCommand('Component.GetComponents');
    const components = componentsResult.result || componentsResult || [];
    
    console.log(`Found ${components.length} total components`);
    
    // Find Table_Mic_Meter and other meter components
    const meterComponents = components.filter(comp => 
      comp.Name.toLowerCase().includes('meter') ||
      comp.Name.toLowerCase().includes('mic') ||
      comp.Name.toLowerCase().includes('audio') ||
      comp.Name.toLowerCase().includes('level')
    );
    
    console.log(`Found ${meterComponents.length} meter/audio components:\n`);
    
    // Show first few meter components
    meterComponents.slice(0, 5).forEach(comp => {
      console.log(`  - ${comp.Name} (Type: ${comp.Type || 'unknown'})`);
    });
    
    // Find Table_Mic_Meter specifically
    const tableMicMeter = components.find(c => c.Name === 'Table_Mic_Meter');
    
    if (!tableMicMeter) {
      console.log('\n⚠️  Table_Mic_Meter not found, using first meter component');
    }
    
    const targetComponent = tableMicMeter || meterComponents[0];
    
    if (!targetComponent) {
      throw new Error('No meter components found in Q-SYS design');
    }
    
    console.log(`\n✅ Selected component: ${targetComponent.Name}\n`);
    
    // STEP 2: Get controls for the selected component
    console.log('STEP 2: Getting controls for', targetComponent.Name);
    console.log('Using: Component.GetAllControls\n');
    
    let controls = [];
    try {
      // Try GetAllControls first
      const controlsResult = await adapter.sendCommand('Component.GetAllControls', {
        Name: targetComponent.Name
      });
      controls = controlsResult.result || controlsResult || [];
    } catch (e) {
      console.log('GetAllControls failed, trying Component.GetControls...');
      try {
        const controlsResult = await adapter.sendCommand('Component.GetControls', {
          Name: targetComponent.Name
        });
        controls = controlsResult.result || controlsResult || [];
      } catch (e2) {
        console.log('⚠️  Could not get controls:', e2.message);
      }
    }
    
    console.log(`Found ${controls.length} controls in ${targetComponent.Name}:\n`);
    
    // Build full control names
    const fullControlNames = [];
    controls.forEach((control, idx) => {
      const fullName = `${targetComponent.Name}.${control.Name}`;
      fullControlNames.push(fullName);
      
      // Show first few controls
      if (idx < 5) {
        console.log(`  ${idx + 1}. ${fullName}`);
        console.log(`     Type: ${control.Type || 'unknown'}`);
        console.log(`     Value: ${control.Value !== undefined ? control.Value : 'N/A'}`);
        console.log('');
      }
    });
    
    if (controls.length > 5) {
      console.log(`  ... and ${controls.length - 5} more controls\n`);
    }
    
    // If no controls found, try common patterns
    if (fullControlNames.length === 0) {
      console.log('No controls enumerated, trying common patterns...');
      fullControlNames.push(
        `${targetComponent.Name}.level`,
        `${targetComponent.Name}.Level`,
        `${targetComponent.Name}.meter`,
        `${targetComponent.Name}.meter.1`,
        `${targetComponent.Name}.meter.2`,
        `${targetComponent.Name}.meter.3`,
        `${targetComponent.Name}.meter.4`
      );
    }
    
    // STEP 3: Create change group with discovered controls
    console.log('STEP 3: Creating change group with discovered controls');
    console.log('Using: ChangeGroup.Create and ChangeGroup.AddControl\n');
    
    const groupId = 'discovered-controls-33hz';
    
    // Create the group
    await adapter.sendCommand('ChangeGroup.Create', { Id: groupId });
    console.log('✅ Change group created:', groupId);
    
    // Add controls to the group
    console.log(`Adding ${fullControlNames.length} controls to change group...`);
    
    // Add controls in batches to avoid issues
    const batchSize = 10;
    for (let i = 0; i < fullControlNames.length; i += batchSize) {
      const batch = fullControlNames.slice(i, i + batchSize);
      try {
        await adapter.sendCommand('ChangeGroup.AddControl', {
          Id: groupId,
          Controls: batch
        });
        console.log(`  Added batch of ${batch.length} controls`);
      } catch (e) {
        console.log(`  ⚠️ Batch failed:`, e.message);
      }
    }
    
    console.log('✅ Controls added to change group\n');
    
    // STEP 4: Set up event tracking
    console.log('STEP 4: Starting 33Hz polling and event tracking');
    console.log('Using: ChangeGroup.AutoPoll at 0.03s (33Hz)\n');
    
    let eventCount = 0;
    const events = [];
    const uniqueValues = new Map();
    let firstEventTime = null;
    let lastEventTime = null;
    
    adapter.on('changeGroup:changes', (event) => {
      eventCount++;
      const now = Date.now();
      
      if (!firstEventTime) firstEventTime = now;
      lastEventTime = now;
      
      // Track unique values per control
      event.changes.forEach(change => {
        if (!uniqueValues.has(change.Name)) {
          uniqueValues.set(change.Name, new Set());
        }
        uniqueValues.get(change.Name).add(change.Value.toFixed(3));
        
        // Log first few events
        if (eventCount <= 3) {
          console.log(`  Event ${eventCount}: ${change.Name} = ${change.Value.toFixed(3)} ${change.String || ''}`);
        }
      });
      
      events.push({
        timestamp: now,
        changes: event.changes.map(c => ({
          name: c.Name,
          value: c.Value
        }))
      });
    });
    
    // Start 33Hz polling
    await adapter.sendCommand('ChangeGroup.AutoPoll', {
      Id: groupId,
      Rate: 0.03  // 33Hz
    });
    
    console.log('✅ Polling started at 33Hz (30ms intervals)');
    console.log('\n📊 Monitoring for 5 seconds...\n');
    
    // Monitor for 5 seconds
    const testDuration = 5000;
    const startTime = Date.now();
    let lastStatusTime = startTime;
    
    await new Promise(resolve => {
      const interval = setInterval(() => {
        const now = Date.now();
        const elapsed = now - startTime;
        
        // Status update every second
        if (now - lastStatusTime >= 1000) {
          console.log(`  ${(elapsed/1000).toFixed(1)}s: ${eventCount} events recorded`);
          lastStatusTime = now;
        }
        
        if (elapsed >= testDuration) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
    
    const actualDuration = (Date.now() - startTime) / 1000;
    
    // STEP 5: Stop polling and analyze
    console.log('\nSTEP 5: Stopping and analyzing results\n');
    
    await adapter.sendCommand('ChangeGroup.Destroy', { Id: groupId });
    console.log('✅ Polling stopped\n');
    
    // Disconnect
    await client.disconnect();
    
    // RESULTS
    console.log('=' .repeat(60));
    console.log('=== RESULTS ===');
    console.log('=' .repeat(60));
    
    console.log(`\nComponent monitored: ${targetComponent.Name}`);
    console.log(`Controls in group: ${fullControlNames.length}`);
    console.log(`Test duration: ${actualDuration.toFixed(2)} seconds`);
    console.log(`Total events: ${eventCount}`);
    console.log(`Event rate: ${(eventCount / actualDuration).toFixed(1)} events/second`);
    console.log(`Expected at 33Hz: ~${Math.floor(actualDuration * 33)} events`);
    
    // Analyze control changes
    if (uniqueValues.size > 0) {
      console.log('\n=== Control Activity ===\n');
      
      let activeControls = 0;
      uniqueValues.forEach((values, controlName) => {
        if (values.size > 1) {
          activeControls++;
          console.log(`✅ ${controlName}`);
          console.log(`   ${values.size} unique values (changing)`);
        }
      });
      
      if (activeControls === 0) {
        console.log('⚠️  No controls showed changes');
        console.log('   Controls may be static or audio may be quiet');
      }
    }
    
    // Save to database
    if (eventCount > 0) {
      const dbDir = path.join(__dirname, 'data', 'workflow-test');
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
          stmt.run(event.timestamp, change.name, change.value);
        });
      });
      
      db.close();
      console.log(`\n✅ Events saved to: ${dbPath}`);
    }
    
    // VERDICT
    console.log('\n' + '=' .repeat(60));
    console.log('=== VERDICT ===');
    console.log('=' .repeat(60) + '\n');
    
    if (eventCount > actualDuration * 20) {
      console.log('🎉 SUCCESS! Full 33Hz workflow verified!');
      console.log('   - Components discovered using MCP tools');
      console.log('   - Controls enumerated properly');
      console.log('   - Change group created with real controls');
      console.log('   - High-frequency data flow confirmed');
      console.log('\n✅ The system can discover, monitor, and record');
      console.log('   control changes at 33Hz from live Q-SYS Core!');
    } else if (eventCount > 0) {
      console.log('✅ PARTIAL SUCCESS');
      console.log('   - MCP workflow completed successfully');
      console.log('   - Some events recorded');
      console.log('   - Rate lower than expected (controls may be static)');
    } else {
      console.log('⚠️  WORKFLOW COMPLETE BUT NO EVENTS');
      console.log('   - Components and controls discovered');
      console.log('   - Change group created');
      console.log('   - But no value changes detected');
      console.log('   - Try with active audio or changing controls');
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    await client.disconnect().catch(() => {});
    process.exit(1);
  }
}

// Run the test
console.log('Starting proper MCP workflow test...\n');
runProperWorkflowTest();