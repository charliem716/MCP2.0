#!/usr/bin/env node

import { createStateRepository } from './dist/mcp/state/factory.js';
import { EventEmitter } from 'events';
import * as fs from 'fs';

async function debugEventRecording() {
  console.log('DEBUG: Event Recording Issue\n');
  
  const testDbPath = './test-debug-events';
  
  // Clean up
  try {
    fs.rmSync(testDbPath, { recursive: true, force: true });
  } catch (e) {}
  fs.mkdirSync(testDbPath, { recursive: true });

  const changeGroupEmitter = new EventEmitter();
  const changeGroups = new Map();
  
  const mockAdapter = {
    on: changeGroupEmitter.on.bind(changeGroupEmitter),
    emit: changeGroupEmitter.emit.bind(changeGroupEmitter),
    removeListener: changeGroupEmitter.removeListener.bind(changeGroupEmitter),
    removeAllListeners: changeGroupEmitter.removeAllListeners.bind(changeGroupEmitter),
    getAllChangeGroups: async () => changeGroups,
  };

  const sm = await createStateRepository('monitored', {
    eventMonitoring: { 
      enabled: true, 
      dbPath: testDbPath,
      bufferSize: 5,
      flushInterval: 50,
    },
  }, mockAdapter);
  
  // Setup change group
  changeGroups.set('test', { id: 'test', controls: ['Test.Control'] });
  console.log('1. Change group created');
  
  // Subscribe BEFORE setting state
  changeGroupEmitter.emit('changeGroupSubscribed', 'test');
  console.log('2. Change group subscribed');
  
  // Wait a moment for subscription to process
  await new Promise(r => setTimeout(r, 10));
  
  // Now record events
  console.log('3. Setting state values...');
  await sm.setState('Test.Control', { value: 1, source: 'test' });
  console.log('   - Set value to 1');
  
  await sm.setState('Test.Control', { value: 2, source: 'test' });
  console.log('   - Set value to 2');
  
  await sm.setState('Test.Control', { value: 3, source: 'test' });
  console.log('   - Set value to 3');
  
  // Wait for flush
  console.log('4. Waiting for buffer flush...');
  await new Promise(r => setTimeout(r, 100));
  
  // Check what was recorded
  const monitor = sm.getEventMonitor();
  if (monitor) {
    const events = await monitor.query({});
    console.log(`5. Events recorded: ${events.length}`);
    events.forEach((e, i) => {
      console.log(`   Event ${i + 1}: value=${JSON.parse(e.value)}, timestamp=${new Date(e.timestamp).toISOString()}`);
    });
    
    // Check if the issue is with the first event
    if (events.length < 3) {
      console.log('\n⚠️  Issue detected: Not all events were recorded');
      console.log('   This might be because:');
      console.log('   - The first setState might not trigger a change event (no previous value)');
      console.log('   - Events might be getting deduplicated');
    }
  }
  
  await sm.shutdown();
  
  // Clean up
  try {
    fs.rmSync(testDbPath, { recursive: true, force: true });
  } catch (e) {}
}

debugEventRecording().catch(console.error);