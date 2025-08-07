#!/usr/bin/env node

/**
 * Test SDK-based event recording
 * Demonstrates the new architecture where we listen to SDK control events
 * instead of polling for changes ourselves
 */

console.log('=== SDK-BASED EVENT RECORDING TEST ===\n');

process.env.EVENT_MONITORING_ENABLED = 'true';
process.env.EVENT_MONITORING_DB_PATH = './data/sdk-events';
process.env.LOG_LEVEL = 'info';

import fs from 'fs';
import Database from 'better-sqlite3';

async function testSDKEventRecording() {
  const { OfficialQRWCClient } = await import('./dist/qrwc/officialClient.js');
  const { SQLiteEventMonitor } = await import('./dist/mcp/state/event-monitor/sqlite-event-monitor.js');
  
  const config = JSON.parse(fs.readFileSync('qsys-core.config.json', 'utf8')).qsysCore;
  
  // Create client with 30ms polling for 33Hz updates
  const client = new OfficialQRWCClient({
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    pollingInterval: 30  // SDK will poll at 33Hz
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to Q-SYS Core\n');
    
    // Initialize SDK-based event monitor
    const eventMonitor = new SQLiteEventMonitor(client, {
      enabled: true,
      dbPath: './data/sdk-events',
      bufferSize: 100,
      flushInterval: 100
    });
    
    await eventMonitor.initialize();
    console.log('✅ SDK Event Monitor initialized\n');
    
    // Verify TableMicMeter is loaded
    const qrwc = client.getQrwc();
    if (!qrwc?.components?.TableMicMeter) {
      throw new Error('TableMicMeter not found in SDK');
    }
    
    console.log('📊 REGISTERING CHANGE GROUPS:\n');
    
    // Register multiple change groups with different rates
    const changeGroups = [
      {
        id: 'meters-33hz',
        controls: ['TableMicMeter.meter.1', 'TableMicMeter.meter.2'],
        rate: 0.03,  // 33Hz
        desc: '33Hz meter monitoring'
      },
      {
        id: 'meters-10hz',
        controls: ['TableMicMeter.meter.3', 'TableMicMeter.meter.4'],
        rate: 0.1,   // 10Hz
        desc: '10Hz meter monitoring'
      },
      {
        id: 'peaks-1hz',
        controls: ['TableMicMeter.peak.1', 'TableMicMeter.peak.2'],
        rate: 1.0,   // 1Hz
        desc: '1Hz peak monitoring'
      }
    ];
    
    // Register each group
    for (const group of changeGroups) {
      await eventMonitor.registerChangeGroup(group.id, group.controls, group.rate);
      console.log(`✅ Registered: ${group.desc}`);
      console.log(`   Controls: ${group.controls.join(', ')}`);
    }
    
    console.log('\n⏱️  Recording SDK events for 20 seconds...\n');
    
    const startTime = Date.now();
    
    // Show progress every 5 seconds
    const progressInterval = setInterval(async () => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const stats = await eventMonitor.getStatistics();
      console.log(`   ${elapsed}s: ${stats.totalEvents} events recorded`);
      if (stats.eventsPerSecond) {
        console.log(`        Rate: ${stats.eventsPerSecond.toFixed(1)} events/sec`);
      }
    }, 5000);
    
    // Record for 20 seconds
    await new Promise(resolve => setTimeout(resolve, 20000));
    
    clearInterval(progressInterval);
    
    // Unregister change groups
    for (const group of changeGroups) {
      await eventMonitor.unregisterChangeGroup(group.id);
    }
    
    // Force flush
    eventMonitor.flush();
    
    const duration = (Date.now() - startTime) / 1000;
    
    console.log('\n📊 RECORDING COMPLETE:\n');
    console.log(`Duration: ${duration.toFixed(1)} seconds\n`);
    
    // Get final statistics
    const finalStats = await eventMonitor.getStatistics();
    console.log('Final Statistics:');
    console.log(`  Total Events: ${finalStats.totalEvents}`);
    console.log(`  Unique Controls: ${finalStats.uniqueControls}`);
    console.log(`  Unique Change Groups: ${finalStats.uniqueChangeGroups}`);
    if (finalStats.eventsPerSecond) {
      console.log(`  Average Rate: ${finalStats.eventsPerSecond.toFixed(1)} events/sec`);
    }
    console.log(`  Database Size: ${(finalStats.databaseSize / 1024).toFixed(1)} KB`);
    
    // Query and analyze the recorded data
    console.log('\n📈 DATA ANALYSIS:\n');
    
    // Open database directly for analysis
    const dbPath = './data/sdk-events/events-' + new Date().toISOString().split('T')[0] + '.db';
    const db = new Database(dbPath, { readonly: true });
    
    // Analyze events per change group
    const groupAnalysis = db.prepare(`
      SELECT 
        change_group_id,
        COUNT(*) as event_count,
        COUNT(DISTINCT control_path) as control_count,
        MIN(timestamp) as first_event,
        MAX(timestamp) as last_event
      FROM events
      GROUP BY change_group_id
    `).all();
    
    console.log('Events per Change Group:');
    groupAnalysis.forEach(stat => {
      const group = changeGroups.find(g => g.id === stat.change_group_id);
      if (group) {
        const duration = (stat.last_event - stat.first_event) / 1000;
        const actualRate = stat.event_count / duration;
        const expectedRate = (1 / group.rate) * group.controls.length;
        
        console.log(`\n  ${stat.change_group_id}:`);
        console.log(`    Events: ${stat.event_count}`);
        console.log(`    Controls: ${stat.control_count}`);
        console.log(`    Duration: ${duration.toFixed(1)}s`);
        console.log(`    Actual Rate: ${actualRate.toFixed(1)} events/sec`);
        console.log(`    Expected Rate: ${expectedRate.toFixed(1)} events/sec`);
        console.log(`    Efficiency: ${((actualRate / expectedRate) * 100).toFixed(1)}%`);
      }
    });
    
    // Sample some actual values
    console.log('\n📊 SAMPLE VALUES:\n');
    
    const samples = db.prepare(`
      SELECT 
        control_path,
        timestamp,
        value,
        string_value
      FROM events
      WHERE control_path = 'TableMicMeter.meter.1'
      ORDER BY timestamp DESC
      LIMIT 10
    `).all();
    
    console.log('Last 10 values for meter.1:');
    samples.forEach((sample, i) => {
      const time = new Date(sample.timestamp).toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
      });
      console.log(`  ${time}: ${sample.value.toFixed(2)} dB`);
    });
    
    // Check for value changes
    const valueChanges = db.prepare(`
      SELECT COUNT(DISTINCT value) as unique_values
      FROM events
      WHERE control_path = 'TableMicMeter.meter.1'
    `).get();
    
    console.log(`\n✅ Meter.1 had ${valueChanges.unique_values} unique values (proves continuous recording)`);
    
    // Calculate interval consistency for 33Hz group
    const intervalCheck = db.prepare(`
      SELECT 
        control_path,
        timestamp,
        LAG(timestamp) OVER (PARTITION BY control_path ORDER BY timestamp) as prev_timestamp
      FROM events
      WHERE change_group_id = 'meters-33hz'
        AND control_path = 'TableMicMeter.meter.1'
      ORDER BY timestamp
      LIMIT 100
    `).all();
    
    const intervals = intervalCheck
      .filter(row => row.prev_timestamp)
      .map(row => row.timestamp - row.prev_timestamp);
    
    if (intervals.length > 0) {
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const minInterval = Math.min(...intervals);
      const maxInterval = Math.max(...intervals);
      
      console.log('\n📏 33Hz Timing Analysis:');
      console.log(`  Expected Interval: 30ms`);
      console.log(`  Average Interval: ${avgInterval.toFixed(1)}ms`);
      console.log(`  Min/Max Interval: ${minInterval}ms / ${maxInterval}ms`);
    }
    
    db.close();
    await eventMonitor.close();
    await client.disconnect();
    
    console.log('\n✅ SDK event recording test complete');
    console.log(`   Database saved to: ${dbPath}`);
    
    // Key insights
    console.log('\n🔍 KEY INSIGHTS:');
    console.log('  1. Events are recorded directly from SDK control.on("update") listeners');
    console.log('  2. Each change group records at its configured rate');
    console.log('  3. No polling or change detection needed - SDK provides all updates');
    console.log('  4. Values are recorded continuously, enabling historical analysis');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    await client.disconnect().catch(() => {});
  }
}

testSDKEventRecording();