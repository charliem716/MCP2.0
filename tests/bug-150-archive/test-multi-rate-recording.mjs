#!/usr/bin/env node

/**
 * Test recording multiple change groups at different rates
 * Verifies SQLite database can handle concurrent recording
 */

console.log('=== MULTI-RATE CHANGE GROUP RECORDING TEST ===\n');

process.env.EVENT_MONITORING_ENABLED = 'true';
process.env.EVENT_MONITORING_DB_PATH = './data/events';
process.env.LOG_LEVEL = 'info';

import fs from 'fs';
import Database from 'better-sqlite3';

async function testMultiRateRecording() {
  const { OfficialQRWCClient } = await import('./dist/qrwc/officialClient.js');
  const { QRWCClientAdapter } = await import('./dist/mcp/qrwc/adapter.js');
  const { SimpleStateManager } = await import('./dist/mcp/state/simple-state-manager.js');
  const { SQLiteEventMonitor } = await import('./dist/mcp/state/event-monitor/sqlite-event-monitor.js');
  
  const config = JSON.parse(fs.readFileSync('qsys-core.config.json', 'utf8')).qsysCore;
  
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
    const stateManager = new SimpleStateManager();
    
    // Initialize event monitor
    const eventMonitor = new SQLiteEventMonitor(stateManager, adapter, {
      enabled: true,
      dbPath: './data/events',
      bufferSize: 100,  // Smaller buffer for testing
      flushInterval: 100
    });
    
    await eventMonitor.initialize();
    console.log('✅ Event monitor initialized\n');
    
    // Get TableMicMeter controls
    const controls = await adapter.sendCommand('Component.GetControls', {
      Name: 'TableMicMeter'
    });
    
    if (!controls?.result?.Controls?.length) {
      throw new Error('TableMicMeter not found');
    }
    
    console.log('📊 CREATING 4 CHANGE GROUPS WITH DIFFERENT RATES:\n');
    
    // Create 4 change groups with different polling rates
    const changeGroups = [
      { id: 'group-33hz', rate: 0.03, desc: '33Hz (30ms)', controls: ['meter.1', 'meter.2'] },
      { id: 'group-10hz', rate: 0.1, desc: '10Hz (100ms)', controls: ['meter.3', 'meter.4'] },
      { id: 'group-1hz', rate: 1.0, desc: '1Hz (1s)', controls: ['peak.1', 'peak.2'] },
      { id: 'group-slow', rate: 2.0, desc: '0.5Hz (2s)', controls: ['peak.3', 'peak.4'] }
    ];
    
    // Create and configure each change group
    for (const group of changeGroups) {
      await adapter.sendCommand('ChangeGroup.Create', { Id: group.id });
      
      await adapter.sendCommand('ChangeGroup.AddComponentControl', {
        Id: group.id,
        Component: {
          Name: 'TableMicMeter',
          Controls: group.controls.map(c => ({ Name: c }))
        }
      });
      
      await adapter.sendCommand('ChangeGroup.AutoPoll', {
        Id: group.id,
        Rate: group.rate
      });
      
      console.log(`✅ ${group.id}: ${group.desc} - Controls: ${group.controls.join(', ')}`);
    }
    
    // Track events received
    const eventCounts = new Map();
    changeGroups.forEach(g => eventCounts.set(g.id, 0));
    
    adapter.on('changeGroup:changes', (event) => {
      const count = eventCounts.get(event.groupId) || 0;
      eventCounts.set(event.groupId, count + 1);
    });
    
    console.log('\n⏱️  Recording for 20 seconds...\n');
    
    const startTime = Date.now();
    
    // Show progress every 5 seconds
    const progressInterval = setInterval(() => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`   ${elapsed}s: Events received by group:`);
      changeGroups.forEach(g => {
        const count = eventCounts.get(g.id) || 0;
        const expectedRate = 1 / g.rate;
        const actualRate = count / ((Date.now() - startTime) / 1000);
        console.log(`     ${g.id}: ${count} events (${actualRate.toFixed(1)}/${expectedRate.toFixed(1)} Hz)`);
      });
      console.log('');
    }, 5000);
    
    // Run for 20 seconds
    await new Promise(resolve => setTimeout(resolve, 20000));
    
    clearInterval(progressInterval);
    
    // Stop all change groups
    for (const group of changeGroups) {
      await adapter.sendCommand('ChangeGroup.Destroy', { Id: group.id });
    }
    
    // Force flush any remaining events
    await eventMonitor.flush();
    
    const duration = (Date.now() - startTime) / 1000;
    
    console.log('📊 RECORDING COMPLETE:\n');
    console.log(`Duration: ${duration.toFixed(1)} seconds\n`);
    
    // Query the database to verify recording
    const dbFile = eventMonitor.getDatabaseFilename();
    console.log(`Database: ${dbFile}\n`);
    
    const db = new Database(dbFile, { readonly: true });
    
    // Analyze recorded data
    console.log('📈 DATABASE ANALYSIS:\n');
    
    // Total events
    const totalEvents = db.prepare('SELECT COUNT(*) as count FROM events').get();
    console.log(`Total events recorded: ${totalEvents.count}\n`);
    
    // Events per change group
    console.log('Events by change group:');
    const groupStats = db.prepare(`
      SELECT 
        change_group_id,
        COUNT(*) as event_count,
        MIN(timestamp) as first_event,
        MAX(timestamp) as last_event,
        COUNT(DISTINCT control_name) as unique_controls
      FROM events
      WHERE change_group_id IN (${changeGroups.map(() => '?').join(',')})
      GROUP BY change_group_id
    `).all(...changeGroups.map(g => g.id));
    
    groupStats.forEach(stat => {
      const group = changeGroups.find(g => g.id === stat.change_group_id);
      const duration = (stat.last_event - stat.first_event) / 1000;
      const actualRate = stat.event_count / duration;
      const expectedRate = (1 / group.rate) * group.controls.length;
      
      console.log(`  ${stat.change_group_id}:`);
      console.log(`    Events: ${stat.event_count}`);
      console.log(`    Controls: ${stat.unique_controls}`);
      console.log(`    Duration: ${duration.toFixed(1)}s`);
      console.log(`    Rate: ${actualRate.toFixed(1)} events/sec (expected: ${expectedRate.toFixed(1)})`);
    });
    
    // Sample rate verification
    console.log('\n📊 SAMPLE RATE VERIFICATION:\n');
    
    for (const group of changeGroups.slice(0, 2)) { // Check first 2 groups
      const samples = db.prepare(`
        SELECT 
          control_name,
          timestamp,
          value
        FROM events
        WHERE change_group_id = ?
          AND control_name = ?
        ORDER BY timestamp
        LIMIT 10
      `).all(group.id, `TableMicMeter.${group.controls[0]}`);
      
      if (samples.length > 1) {
        const intervals = [];
        for (let i = 1; i < samples.length; i++) {
          intervals.push(samples[i].timestamp - samples[i-1].timestamp);
        }
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        
        console.log(`${group.id} (${group.controls[0]}):`);
        console.log(`  Expected interval: ${group.rate * 1000}ms`);
        console.log(`  Average interval: ${avgInterval.toFixed(1)}ms`);
        console.log(`  Min/Max: ${Math.min(...intervals)}ms / ${Math.max(...intervals)}ms`);
      }
    }
    
    // Query examples
    console.log('\n💡 EXAMPLE QUERIES:\n');
    
    // 1. Get all values for a specific control in a time range
    const timeRangeQuery = db.prepare(`
      SELECT COUNT(*) as count
      FROM events
      WHERE control_name = 'TableMicMeter.meter.1'
        AND timestamp BETWEEN ? AND ?
    `).get(startTime, startTime + 5000);
    
    console.log(`1. meter.1 events in first 5 seconds: ${timeRangeQuery.count}`);
    
    // 2. Average value per second for a control
    const avgQuery = db.prepare(`
      SELECT 
        CAST(timestamp / 1000 AS INTEGER) as second,
        COUNT(*) as samples,
        AVG(CAST(value AS REAL)) as avg_value
      FROM events
      WHERE control_name = 'TableMicMeter.meter.1'
      GROUP BY second
      LIMIT 5
    `).all();
    
    console.log('\n2. Average meter.1 value per second:');
    avgQuery.forEach(row => {
      const time = new Date(row.second * 1000).toLocaleTimeString();
      console.log(`   ${time}: ${row.avg_value?.toFixed(2) || 'N/A'} dB (${row.samples} samples)`);
    });
    
    db.close();
    await eventMonitor.close();
    await client.disconnect();
    
    console.log('\n✅ Multi-rate recording test complete');
    console.log(`   Database saved to: ${dbFile}`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    await client.disconnect().catch(() => {});
  }
}

testMultiRateRecording();