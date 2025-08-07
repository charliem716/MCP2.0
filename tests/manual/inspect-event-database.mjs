#!/usr/bin/env node

/**
 * Manual Test for BUG-150: SQLite Event Database Inspector
 * 
 * This script directly inspects the SQLite database to verify:
 * 1. Events are being recorded at 33Hz
 * 2. 30-day retention is configured
 * 3. Timestamps show ~30ms intervals
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..', '..');

console.log('=== BUG-150 Manual Test: Event Database Inspector ===\n');

function findEventDatabases() {
  const dataDir = path.join(projectRoot, 'data', 'events');
  
  if (!fs.existsSync(dataDir)) {
    console.log('⚠️  No event database directory found at:', dataDir);
    console.log('   Run the server with EVENT_MONITORING_ENABLED=true first.');
    return [];
  }
  
  const files = fs.readdirSync(dataDir);
  const dbFiles = files.filter(f => f.endsWith('.db'));
  
  console.log(`Found ${dbFiles.length} database file(s):`);
  dbFiles.forEach(f => console.log(`  - ${f}`));
  
  return dbFiles.map(f => path.join(dataDir, f));
}

function inspectDatabase(dbPath) {
  console.log(`\n📊 Inspecting: ${path.basename(dbPath)}`);
  
  const db = new Database(dbPath, { readonly: true });
  
  try {
    // Check if tables exist
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('\nTables found:', tables.map(t => t.name).join(', '));
    
    // Get total event count
    const totalEvents = db.prepare('SELECT COUNT(*) as count FROM events').get();
    console.log(`\nTotal events recorded: ${totalEvents.count}`);
    
    if (totalEvents.count === 0) {
      console.log('⚠️  No events found in database');
      return;
    }
    
    // Get events by change group
    const groupStats = db.prepare(`
      SELECT change_group_id, COUNT(*) as count, 
             MIN(timestamp) as first_event,
             MAX(timestamp) as last_event
      FROM events 
      GROUP BY change_group_id
    `).all();
    
    console.log('\n=== Events by Change Group ===');
    groupStats.forEach(group => {
      const duration = (group.last_event - group.first_event) / 1000;
      const rate = duration > 0 ? (group.count / duration).toFixed(1) : 0;
      console.log(`  ${group.change_group_id || 'unknown'}: ${group.count} events over ${duration.toFixed(2)}s (${rate} Hz)`);
    });
    
    // Analyze 33Hz polling patterns
    console.log('\n=== 33Hz Polling Analysis ===');
    
    // Get recent events to analyze intervals
    const recentEvents = db.prepare(`
      SELECT id, change_group_id, timestamp, control_id, value
      FROM events 
      ORDER BY timestamp DESC 
      LIMIT 100
    `).all();
    
    if (recentEvents.length > 1) {
      // Group events by change_group_id for interval analysis
      const groupedEvents = {};
      recentEvents.forEach(event => {
        const groupId = event.change_group_id || 'unknown';
        if (!groupedEvents[groupId]) groupedEvents[groupId] = [];
        groupedEvents[groupId].push(event);
      });
      
      Object.entries(groupedEvents).forEach(([groupId, events]) => {
        if (events.length < 2) return;
        
        console.log(`\n  Change Group: ${groupId}`);
        console.log(`  Events analyzed: ${events.length}`);
        
        // Calculate intervals
        const intervals = [];
        for (let i = 1; i < events.length; i++) {
          const interval = events[i-1].timestamp - events[i].timestamp; // Reverse order
          intervals.push(Math.abs(interval));
        }
        
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const minInterval = Math.min(...intervals);
        const maxInterval = Math.max(...intervals);
        
        console.log(`  Average interval: ${avgInterval.toFixed(2)}ms`);
        console.log(`  Min interval: ${minInterval.toFixed(2)}ms`);
        console.log(`  Max interval: ${maxInterval.toFixed(2)}ms`);
        
        // Check if this looks like 33Hz polling
        const looks33Hz = avgInterval >= 25 && avgInterval <= 35;
        const estimatedHz = avgInterval > 0 ? (1000 / avgInterval).toFixed(1) : 0;
        
        console.log(`  Estimated frequency: ${estimatedHz} Hz`);
        console.log(`  33Hz pattern detected: ${looks33Hz ? '✅ YES' : '❌ NO'}`);
      });
    }
    
    // Check database metadata
    const metadata = db.prepare(`
      SELECT key, value FROM metadata
    `).all();
    
    if (metadata.length > 0) {
      console.log('\n=== Database Metadata ===');
      metadata.forEach(m => {
        console.log(`  ${m.key}: ${m.value}`);
      });
    }
    
    // Sample some actual events
    console.log('\n=== Sample Events (last 5) ===');
    const sampleEvents = db.prepare(`
      SELECT datetime(timestamp/1000, 'unixepoch', 'localtime') as time,
             change_group_id, control_id, value
      FROM events 
      ORDER BY timestamp DESC 
      LIMIT 5
    `).all();
    
    sampleEvents.forEach(event => {
      console.log(`  ${event.time} | ${event.change_group_id || 'N/A'} | ${event.control_id} = ${event.value}`);
    });
    
  } finally {
    db.close();
  }
}

function checkRetentionConfig() {
  console.log('\n=== Retention Configuration Check ===');
  
  // Check environment variable
  const envRetention = process.env.EVENT_MONITORING_RETENTION_DAYS;
  if (envRetention) {
    console.log(`✓ EVENT_MONITORING_RETENTION_DAYS = ${envRetention} days`);
  } else {
    console.log('⚠️  EVENT_MONITORING_RETENTION_DAYS not set (will use default)');
  }
  
  // Check source code default
  const monitorPath = path.join(projectRoot, 'src', 'mcp', 'state', 'event-monitor', 'sqlite-event-monitor.ts');
  if (fs.existsSync(monitorPath)) {
    const content = fs.readFileSync(monitorPath, 'utf8');
    const match = content.match(/retentionDays.*?'(\d+)'/);
    if (match) {
      console.log(`✓ Source code default retention: ${match[1]} days`);
    }
  }
}

// Main execution
console.log('Searching for event databases...\n');
const databases = findEventDatabases();

if (databases.length === 0) {
  console.log('\n⚠️  No databases found to inspect.');
  console.log('\nTo generate test data:');
  console.log('1. Set EVENT_MONITORING_ENABLED=true in .env');
  console.log('2. Run: npm start');
  console.log('3. Use test-33hz-polling.mjs to generate events');
  console.log('4. Run this script again');
} else {
  databases.forEach(inspectDatabase);
  checkRetentionConfig();
  
  console.log('\n=== INSPECTION COMPLETE ===');
  console.log('✅ Database inspection successful');
}

process.exit(0);