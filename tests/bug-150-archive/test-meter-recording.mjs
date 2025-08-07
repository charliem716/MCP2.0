#!/usr/bin/env node

/**
 * Continuous meter value recording for historical analysis
 * Records ALL values (not just changes) with timestamps
 * Enables queries like "show me meter.1 values between 10:00-10:05"
 */

console.log('=== CONTINUOUS METER RECORDING FOR HISTORICAL ANALYSIS ===\n');

process.env.LOG_LEVEL = 'warn';
process.env.EVENT_MONITORING_ENABLED = 'true';
process.env.EVENT_MONITORING_DB_PATH = './data/meters';

import fs from 'fs';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function continuousMeterRecording() {
  const { OfficialQRWCClient } = await import('./dist/qrwc/officialClient.js');
  
  const config = JSON.parse(fs.readFileSync('qsys-core.config.json', 'utf8')).qsysCore;
  
  // Ensure database directory exists
  if (!fs.existsSync('./data/meters')) {
    fs.mkdirSync('./data/meters', { recursive: true });
  }
  
  // Open SQLite database for meter values
  const db = await open({
    filename: './data/meters/meter-values.db',
    driver: sqlite3.Database
  });
  
  // Create table for meter values
  await db.exec(`
    CREATE TABLE IF NOT EXISTS meter_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp_ms BIGINT NOT NULL,
      timestamp_iso TEXT NOT NULL,
      component_name TEXT NOT NULL,
      control_name TEXT NOT NULL,
      value_db REAL NOT NULL,
      value_string TEXT,
      peak_detected BOOLEAN DEFAULT 0,
      clipping_detected BOOLEAN DEFAULT 0,
      INDEX idx_timestamp (timestamp_ms),
      INDEX idx_component_control (component_name, control_name),
      INDEX idx_clipping (clipping_detected, timestamp_ms)
    )
  `);
  
  const client = new OfficialQRWCClient({
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to Q-SYS Core');
    console.log('📁 Database: ./data/meters/meter-values.db\n');
    
    const qrwc = client.getQrwc();
    
    if (!qrwc?.components?.TableMicMeter) {
      throw new Error('TableMicMeter not found');
    }
    
    // Get all meter and peak controls
    const controls = [];
    ['meter.1', 'meter.2', 'meter.3', 'meter.4', 
     'peak.1', 'peak.2', 'peak.3', 'peak.4'].forEach(name => {
      const control = qrwc.components.TableMicMeter.controls[name];
      if (control) {
        controls.push({ name, control });
      }
    });
    
    console.log(`📊 Recording ${controls.length} controls at 33Hz\n`);
    
    // Prepare batch insert statement
    const insertStmt = await db.prepare(`
      INSERT INTO meter_values 
      (timestamp_ms, timestamp_iso, component_name, control_name, 
       value_db, value_string, peak_detected, clipping_detected)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    let sampleCount = 0;
    let clippingEvents = 0;
    const startTime = Date.now();
    const CLIPPING_THRESHOLD = -3.0; // dB threshold for clipping detection
    const BATCH_SIZE = 100; // Insert in batches for efficiency
    let batch = [];
    
    // Display initial values
    console.log('Initial values:');
    controls.forEach(({ name, control }) => {
      console.log(`  ${name}: ${control.state.Value.toFixed(2)} dB`);
    });
    
    console.log('\nRecording... (Press Ctrl+C to stop)\n');
    
    // CORE RECORDING LOOP - Fixed 33Hz sampling
    const recordingInterval = setInterval(async () => {
      const timestamp = Date.now();
      const timestampISO = new Date(timestamp).toISOString();
      
      // Sample ALL controls at this exact moment
      for (const { name, control } of controls) {
        const value = control.state.Value;
        const valueString = control.state.String || `${value.toFixed(2)}dB`;
        const isPeak = name.startsWith('peak');
        const isClipping = value >= CLIPPING_THRESHOLD;
        
        if (isClipping) {
          clippingEvents++;
          console.log(`⚠️  CLIPPING: ${name} = ${value.toFixed(2)} dB at ${timestampISO}`);
        }
        
        // Add to batch
        batch.push([
          timestamp,
          timestampISO,
          'TableMicMeter',
          name,
          value,
          valueString,
          isPeak ? 1 : 0,
          isClipping ? 1 : 0
        ]);
        
        sampleCount++;
      }
      
      // Insert batch when full
      if (batch.length >= BATCH_SIZE) {
        await db.run('BEGIN TRANSACTION');
        for (const row of batch) {
          await insertStmt.run(...row);
        }
        await db.run('COMMIT');
        batch = [];
        
        // Show progress
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = sampleCount / elapsed;
        process.stdout.write(`\r  Recorded: ${sampleCount} samples | Rate: ${rate.toFixed(1)} Hz | Clipping: ${clippingEvents} events`);
      }
    }, 30); // 33Hz = 30ms interval
    
    // Run for 30 seconds (or until Ctrl+C)
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    clearInterval(recordingInterval);
    
    // Insert remaining batch
    if (batch.length > 0) {
      await db.run('BEGIN TRANSACTION');
      for (const row of batch) {
        await insertStmt.run(...row);
      }
      await db.run('COMMIT');
    }
    
    await insertStmt.finalize();
    
    const duration = (Date.now() - startTime) / 1000;
    const actualRate = sampleCount / duration;
    
    console.log('\n\n📊 RECORDING COMPLETE:');
    console.log('=' .repeat(60));
    console.log(`  Duration: ${duration.toFixed(1)} seconds`);
    console.log(`  Total Samples: ${sampleCount}`);
    console.log(`  Sampling Rate: ${actualRate.toFixed(1)} Hz`);
    console.log(`  Clipping Events: ${clippingEvents}`);
    console.log(`  Database Size: ${(await db.get('SELECT COUNT(*) as count FROM meter_values')).count} rows`);
    
    // DEMONSTRATE QUERIES
    console.log('\n📈 EXAMPLE QUERIES:');
    console.log('=' .repeat(60));
    
    // Query 1: Average levels over last 5 seconds
    console.log('\n1. Average levels (last 5 seconds):');
    const avgQuery = await db.all(`
      SELECT 
        control_name,
        AVG(value_db) as avg_db,
        MIN(value_db) as min_db,
        MAX(value_db) as max_db,
        COUNT(*) as samples
      FROM meter_values
      WHERE timestamp_ms > ?
        AND control_name LIKE 'meter.%'
      GROUP BY control_name
    `, Date.now() - 5000);
    
    avgQuery.forEach(row => {
      console.log(`   ${row.control_name}: Avg ${row.avg_db.toFixed(2)} dB (${row.min_db.toFixed(2)} to ${row.max_db.toFixed(2)})`);
    });
    
    // Query 2: Clipping events
    console.log('\n2. Clipping events:');
    const clippingQuery = await db.all(`
      SELECT 
        timestamp_iso,
        control_name,
        value_db
      FROM meter_values
      WHERE clipping_detected = 1
      ORDER BY timestamp_ms DESC
      LIMIT 5
    `);
    
    if (clippingQuery.length > 0) {
      clippingQuery.forEach(row => {
        console.log(`   ${row.timestamp_iso}: ${row.control_name} = ${row.value_db.toFixed(2)} dB`);
      });
    } else {
      console.log('   No clipping detected');
    }
    
    // Query 3: Level changes over time (trend analysis)
    console.log('\n3. Level trend (10-second windows):');
    const trendQuery = await db.all(`
      SELECT 
        CAST((timestamp_ms / 10000) * 10000 AS INTEGER) as window,
        control_name,
        AVG(value_db) as avg_db
      FROM meter_values
      WHERE control_name = 'meter.1'
      GROUP BY window, control_name
      ORDER BY window DESC
      LIMIT 3
    `);
    
    trendQuery.forEach(row => {
      const time = new Date(row.window).toLocaleTimeString();
      console.log(`   ${time}: ${row.avg_db.toFixed(2)} dB`);
    });
    
    // Query 4: Peak detection
    console.log('\n4. Highest peaks detected:');
    const peakQuery = await db.all(`
      SELECT 
        control_name,
        MAX(value_db) as peak_db,
        timestamp_iso
      FROM meter_values
      WHERE control_name LIKE 'peak.%'
      GROUP BY control_name
    `);
    
    peakQuery.forEach(row => {
      console.log(`   ${row.control_name}: ${row.peak_db.toFixed(2)} dB at ${row.timestamp_iso}`);
    });
    
    console.log('\n💡 QUERY EXAMPLES:');
    console.log('   - Get all values for meter.1 between timestamps:');
    console.log('     SELECT * FROM meter_values WHERE control_name="meter.1" AND timestamp_ms BETWEEN ? AND ?');
    console.log('   - Find periods of silence (< -60dB):');
    console.log('     SELECT * FROM meter_values WHERE value_db < -60 GROUP BY timestamp_ms');
    console.log('   - Calculate RMS over time windows:');
    console.log('     SELECT AVG(POW(10, value_db/20)) FROM meter_values WHERE control_name LIKE "rms.%"');
    
    await db.close();
    await client.disconnect();
    
    console.log('\n✅ Recording complete. Database saved to: ./data/meters/meter-values.db');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    await db.close().catch(() => {});
    await client.disconnect().catch(() => {});
  }
}

continuousMeterRecording();