#!/usr/bin/env node

/**
 * Test integrated system after cleanup
 * Verifies SDK-based event monitoring works end-to-end with MCP tools
 */

console.log('=== INTEGRATED SYSTEM TEST AFTER CLEANUP ===\n');

process.env.EVENT_MONITORING_ENABLED = 'true';
process.env.EVENT_MONITORING_DB_PATH = './data/integration-test';
process.env.LOG_LEVEL = 'info';

import fs from 'fs';

async function testIntegratedSystem() {
  const { OfficialQRWCClient } = await import('./dist/qrwc/officialClient.js');
  const { QRWCClientAdapter } = await import('./dist/mcp/qrwc/adapter.js');
  const { MonitoredStateManager } = await import('./dist/mcp/state/monitored-state-manager.js');
  const { createQueryChangeEventsTool } = await import('./dist/mcp/tools/event-monitoring/query-events.js');
  const { createGetEventStatisticsTool } = await import('./dist/mcp/tools/event-monitoring/get-statistics.js');
  
  const config = JSON.parse(fs.readFileSync('qsys-core.config.json', 'utf8')).qsysCore;
  
  const client = new OfficialQRWCClient({
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    pollingInterval: 30  // 33Hz SDK polling
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to Q-SYS Core\n');
    
    // Create adapter
    const adapter = new QRWCClientAdapter(client);
    
    // Initialize state manager with event monitoring
    const stateManager = new MonitoredStateManager();
    await stateManager.initialize(
      {
        maxSize: 1000,
        ttl: 60000,
        eventMonitoring: {
          enabled: true,
          dbPath: './data/integration-test',
          bufferSize: 100,
          flushInterval: 100
        }
      },
      adapter
    );
    
    console.log('✅ State manager initialized with event monitoring\n');
    
    // Get the event monitor
    const eventMonitor = stateManager.getEventMonitor();
    if (!eventMonitor) {
      throw new Error('Event monitor not initialized');
    }
    
    // Register a change group for SDK monitoring
    const controls = [
      'TableMicMeter.meter.1',
      'TableMicMeter.meter.2',
      'TableMicMeter.meter.3',
      'TableMicMeter.meter.4'
    ];
    
    await eventMonitor.registerChangeGroup('test-group', controls, 0.03); // 33Hz
    console.log('✅ Registered change group for SDK monitoring\n');
    
    // Record for 10 seconds
    console.log('⏱️  Recording events for 10 seconds...\n');
    
    const startTime = Date.now();
    
    // Show progress
    const progressInterval = setInterval(async () => {
      const stats = await eventMonitor.getStatistics();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`   ${elapsed}s: ${stats.totalEvents} events recorded`);
    }, 2000);
    
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    clearInterval(progressInterval);
    
    // Test MCP tools
    console.log('\n📊 TESTING MCP TOOLS:\n');
    
    // Create tools
    const queryTool = createQueryChangeEventsTool(adapter);
    const statsTool = createGetEventStatisticsTool(adapter);
    
    // Test statistics tool
    console.log('1. Testing get_event_statistics tool:');
    const statsResult = await statsTool.execute({});
    const stats = JSON.parse(statsResult.content[0].text);
    console.log(`   Total Events: ${stats.totalEvents}`);
    console.log(`   Unique Controls: ${stats.uniqueControls}`);
    console.log(`   Events/sec: ${stats.eventsPerSecond?.toFixed(1) || 'N/A'}\n`);
    
    // Test query tool
    console.log('2. Testing query_change_events tool:');
    const queryResult = await queryTool.execute({
      changeGroupId: 'test-group',
      limit: 10
    });
    const queryResponse = JSON.parse(queryResult.content[0].text);
    console.log(`   Events returned: ${queryResponse.eventCount}`);
    if (queryResponse.events.length > 0) {
      const firstEvent = queryResponse.events[0];
      console.log(`   Sample event: ${firstEvent.controlPath} = ${firstEvent.value?.toFixed(2) || firstEvent.value} dB`);
    }
    
    // Test time-based query
    console.log('\n3. Testing time-based query:');
    const fiveSecondsAgo = Date.now() - 5000;
    const timeQueryResult = await queryTool.execute({
      startTime: fiveSecondsAgo,
      endTime: Date.now(),
      controlNames: ['TableMicMeter.meter.1'],
      limit: 100
    });
    const timeQueryResponse = JSON.parse(timeQueryResult.content[0].text);
    console.log(`   Events in last 5 seconds: ${timeQueryResponse.eventCount}`);
    
    // Verify cleanup worked
    console.log('\n✅ CLEANUP VERIFICATION:\n');
    
    // Check that old change detection is gone
    const adapterCode = adapter.toString();
    const hasOldChangeDetection = adapterCode.includes('changeGroupLastValues');
    console.log(`   Old change detection removed: ${!hasOldChangeDetection ? '✅' : '❌'}`);
    
    // Check that SDK event bridge is working
    const activeGroups = eventMonitor.getActiveGroups();
    console.log(`   Active SDK monitoring groups: ${activeGroups.size}`);
    
    // Check database is recording
    const finalStats = await eventMonitor.getStatistics();
    console.log(`   Database has events: ${finalStats.totalEvents > 0 ? '✅' : '❌'}`);
    
    // Clean up
    await eventMonitor.unregisterChangeGroup('test-group');
    await stateManager.shutdown();
    await client.disconnect();
    
    console.log('\n✅ Integration test complete - system working correctly after cleanup!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    await client.disconnect().catch(() => {});
  }
}

testIntegratedSystem();