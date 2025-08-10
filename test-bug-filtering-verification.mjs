#!/usr/bin/env node

/**
 * Manual verification script for component filtering and pagination bug fixes
 * Tests the SQLiteEventMonitor's queryEvents method with proper filtering
 */

import { SQLiteEventMonitor } from './dist/mcp/state/event-monitor/sqlite-event-monitor.js';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const TEST_DB_PATH = path.join(process.cwd(), `test-filter-verify-${Date.now()}.db`);

async function setupTestData() {
  // Create monitor with a unique database
  const monitor = new SQLiteEventMonitor(undefined, {
    enabled: true,
    dbPath: TEST_DB_PATH,
    bufferSize: 0, // Immediate flush
    flushInterval: 1000,
  });

  await monitor.initialize();
  
  // Get database and insert test data directly
  const db = monitor.getDatabase();
  if (!db) throw new Error('Database not initialized');
  
  // Insert test events with different components
  const stmt = db.prepare(`
    INSERT INTO events (
      timestamp, change_group_id, control_path,
      component_name, control_name, value, string_value, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = Date.now();
  const testEvents = [
    // Component A events
    { timestamp: now - 10000, changeGroupId: 'group1', controlPath: 'CompA.control1', 
      componentName: 'CompA', controlName: 'control1', value: 1, stringValue: '1', source: 'test' },
    { timestamp: now - 9000, changeGroupId: 'group1', controlPath: 'CompA.control2', 
      componentName: 'CompA', controlName: 'control2', value: 2, stringValue: '2', source: 'test' },
    { timestamp: now - 8000, changeGroupId: 'group1', controlPath: 'CompA.control3', 
      componentName: 'CompA', controlName: 'control3', value: 3, stringValue: '3', source: 'test' },
    
    // Component B events
    { timestamp: now - 7000, changeGroupId: 'group2', controlPath: 'CompB.control1', 
      componentName: 'CompB', controlName: 'control1', value: 4, stringValue: '4', source: 'test' },
    { timestamp: now - 6000, changeGroupId: 'group2', controlPath: 'CompB.control2', 
      componentName: 'CompB', controlName: 'control2', value: 5, stringValue: '5', source: 'test' },
    { timestamp: now - 5000, changeGroupId: 'group2', controlPath: 'CompB.control3', 
      componentName: 'CompB', controlName: 'control3', value: 6, stringValue: '6', source: 'test' },
    
    // Component C events
    { timestamp: now - 4000, changeGroupId: 'group3', controlPath: 'CompC.control1', 
      componentName: 'CompC', controlName: 'control1', value: 7, stringValue: '7', source: 'test' },
    { timestamp: now - 3000, changeGroupId: 'group3', controlPath: 'CompC.control2', 
      componentName: 'CompC', controlName: 'control2', value: 8, stringValue: '8', source: 'test' },
    { timestamp: now - 2000, changeGroupId: 'group3', controlPath: 'CompC.control3', 
      componentName: 'CompC', controlName: 'control3', value: 9, stringValue: '9', source: 'test' },
    { timestamp: now - 1000, changeGroupId: 'group3', controlPath: 'CompC.control4', 
      componentName: 'CompC', controlName: 'control4', value: 10, stringValue: '10', source: 'test' },
  ];

  // Insert all test events
  for (const event of testEvents) {
    stmt.run(
      event.timestamp,
      event.changeGroupId,
      event.controlPath,
      event.componentName,
      event.controlName,
      event.value,
      event.stringValue,
      event.source
    );
  }
  
  console.log(`✅ Inserted ${testEvents.length} test events into database`);
  
  return monitor;
}

async function testComponentFiltering(monitor) {
  console.log('\n📋 Testing Component Name Filtering...');
  
  // Test 1: Filter by single component
  const compAEvents = await monitor.queryEvents({
    componentNames: ['CompA']
  });
  
  if (compAEvents.length === 3 && compAEvents.every(e => e.component_name === 'CompA')) {
    console.log('✅ Single component filtering works correctly');
  } else {
    console.error(`❌ Single component filtering FAILED: Got ${compAEvents.length} events, expected 3`);
    console.error('   Components:', [...new Set(compAEvents.map(e => e.component_name))]);
  }
  
  // Test 2: Filter by multiple components
  const compBCEvents = await monitor.queryEvents({
    componentNames: ['CompB', 'CompC']
  });
  
  if (compBCEvents.length === 7 && compBCEvents.every(e => e.component_name === 'CompB' || e.component_name === 'CompC')) {
    console.log('✅ Multiple component filtering works correctly');
  } else {
    console.error(`❌ Multiple component filtering FAILED: Got ${compBCEvents.length} events, expected 7`);
    console.error('   Components:', [...new Set(compBCEvents.map(e => e.component_name))]);
  }
  
  // Test 3: Non-existent component
  const noEvents = await monitor.queryEvents({
    componentNames: ['NonExistent']
  });
  
  if (noEvents.length === 0) {
    console.log('✅ Non-existent component returns empty array');
  } else {
    console.error(`❌ Non-existent component FAILED: Got ${noEvents.length} events, expected 0`);
  }
}

async function testPagination(monitor) {
  console.log('\n📋 Testing Pagination with Offset...');
  
  // Test 1: Different pages should have different events
  const page1 = await monitor.queryEvents({
    limit: 3,
    offset: 0
  });
  
  const page2 = await monitor.queryEvents({
    limit: 3,
    offset: 3
  });
  
  const page3 = await monitor.queryEvents({
    limit: 3,
    offset: 6
  });
  
  // Check that pages have correct lengths
  if (page1.length === 3 && page2.length === 3 && page3.length === 3) {
    console.log('✅ Pagination returns correct page sizes');
  } else {
    console.error(`❌ Pagination page sizes FAILED: Page1=${page1.length}, Page2=${page2.length}, Page3=${page3.length}`);
  }
  
  // Check that pages have different events (no overlap)
  const page1Ids = page1.map(e => e.id);
  const page2Ids = page2.map(e => e.id);
  const page3Ids = page3.map(e => e.id);
  
  const hasOverlap = page1Ids.some(id => page2Ids.includes(id)) ||
                     page1Ids.some(id => page3Ids.includes(id)) ||
                     page2Ids.some(id => page3Ids.includes(id));
  
  if (!hasOverlap) {
    console.log('✅ Pagination returns different events for different offsets');
  } else {
    console.error('❌ Pagination FAILED: Pages have overlapping events');
    console.error('   Page 1 IDs:', page1Ids);
    console.error('   Page 2 IDs:', page2Ids);
    console.error('   Page 3 IDs:', page3Ids);
  }
  
  // Test 2: Offset beyond available records
  const beyondEvents = await monitor.queryEvents({
    limit: 5,
    offset: 100
  });
  
  if (beyondEvents.length === 0) {
    console.log('✅ Offset beyond available records returns empty array');
  } else {
    console.error(`❌ Offset beyond records FAILED: Got ${beyondEvents.length} events, expected 0`);
  }
}

async function testCombinedFilters(monitor) {
  console.log('\n📋 Testing Combined Filters...');
  
  // Test: Component filter + pagination
  const page1 = await monitor.queryEvents({
    componentNames: ['CompC'],
    limit: 2,
    offset: 0
  });
  
  const page2 = await monitor.queryEvents({
    componentNames: ['CompC'],
    limit: 2,
    offset: 2
  });
  
  if (page1.length === 2 && page2.length === 2 && 
      [...page1, ...page2].every(e => e.component_name === 'CompC')) {
    console.log('✅ Combined component filter + pagination works correctly');
  } else {
    console.error(`❌ Combined filters FAILED: Page1=${page1.length}, Page2=${page2.length}`);
    console.error('   Components:', [...new Set([...page1, ...page2].map(e => e.component_name))]);
  }
  
  // Test: Time filter + component filter + pagination
  const now = Date.now();
  const complexQuery = await monitor.queryEvents({
    startTime: now - 8000,
    endTime: now - 2000,
    componentNames: ['CompB', 'CompC'],
    limit: 3,
    offset: 1
  });
  
  // Should get events from -7000 to -2000 for CompB and CompC
  // That's 3 CompB events + 2 CompC events = 5 total
  // With offset 1 and limit 3, should get events 2-4
  if (complexQuery.length === 3) {
    console.log('✅ Complex combined filters work correctly');
  } else {
    console.error(`❌ Complex filters FAILED: Got ${complexQuery.length} events, expected 3`);
  }
}

async function cleanup(monitor) {
  await monitor.close();
  
  // Remove test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
    console.log('\n🧹 Cleaned up test database');
  }
}

async function main() {
  console.log('🔧 Component Filtering and Pagination Bug Fix Verification');
  console.log('=' . repeat(60));
  
  let monitor;
  
  try {
    monitor = await setupTestData();
    
    await testComponentFiltering(monitor);
    await testPagination(monitor);
    await testCombinedFilters(monitor);
    
    console.log('\n' + '=' . repeat(60));
    console.log('✅ All tests completed!');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    process.exit(1);
  } finally {
    if (monitor) {
      await cleanup(monitor);
    }
  }
}

main().catch(console.error);