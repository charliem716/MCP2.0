#!/usr/bin/env node

/**
 * Demonstration of the BEST ways to monitor rapidly changing audio meter values
 * using the QRWC SDK's native capabilities
 */

console.log('=== BEST PRACTICES FOR AUDIO METER MONITORING ===\n');

process.env.LOG_LEVEL = 'warn';

import fs from 'fs';

async function demonstrateBestPractices() {
  const { OfficialQRWCClient } = await import('./dist/qrwc/officialClient.js');
  
  const config = JSON.parse(fs.readFileSync('qsys-core.config.json', 'utf8')).qsysCore;
  
  const client = new OfficialQRWCClient({
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    pollingInterval: 30  // Set SDK to 33Hz polling
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to Q-SYS Core\n');
    
    const qrwc = client.getQrwc();
    
    if (!qrwc?.components?.TableMicMeter) {
      throw new Error('TableMicMeter not found');
    }
    
    // Get meter controls
    const meters = [
      qrwc.components.TableMicMeter.controls['meter.1'],
      qrwc.components.TableMicMeter.controls['meter.2'],
      qrwc.components.TableMicMeter.controls['meter.3'],
      qrwc.components.TableMicMeter.controls['meter.4']
    ].filter(Boolean);
    
    console.log(`Found ${meters.length} meter controls\n`);
    
    // ============================================================
    // METHOD 1: Event Listeners (BEST for event-driven updates)
    // ============================================================
    console.log('METHOD 1: SDK Event Listeners');
    console.log('=' .repeat(50));
    
    let eventCount = 0;
    let eventStartTime = Date.now();
    
    // Attach listeners to each meter
    meters.forEach((meter, idx) => {
      meter.on('update', (state) => {
        eventCount++;
        if (eventCount <= 10) {
          console.log(`  meter.${idx + 1} update: ${state.Value.toFixed(2)} dB`);
        }
      });
    });
    
    // Wait 3 seconds to collect events
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const eventDuration = (Date.now() - eventStartTime) / 1000;
    const eventRate = eventCount / eventDuration;
    console.log(`\n  Results: ${eventCount} events in ${eventDuration.toFixed(1)}s = ${eventRate.toFixed(1)} Hz`);
    
    // Remove listeners
    meters.forEach(meter => meter.removeAllListeners());
    
    // ============================================================
    // METHOD 2: Direct State Polling (BEST for fixed-rate sampling)
    // ============================================================
    console.log('\nMETHOD 2: Direct State Polling at 33Hz');
    console.log('=' .repeat(50));
    
    let pollCount = 0;
    const pollStartTime = Date.now();
    const pollValues = new Map();
    
    // Poll at exactly 33Hz
    const pollInterval = setInterval(() => {
      pollCount++;
      
      meters.forEach((meter, idx) => {
        const key = `meter.${idx + 1}`;
        const value = meter.state.Value;
        
        // Track unique values
        if (!pollValues.has(key)) {
          pollValues.set(key, new Set());
        }
        pollValues.get(key).add(value.toFixed(2));
        
        if (pollCount === 1) {
          console.log(`  ${key}: ${value.toFixed(2)} dB`);
        }
      });
      
      // Stop after 3 seconds
      if (Date.now() - pollStartTime > 3000) {
        clearInterval(pollInterval);
        
        const pollDuration = (Date.now() - pollStartTime) / 1000;
        const pollRate = pollCount / pollDuration;
        
        console.log(`\n  Results: ${pollCount} polls in ${pollDuration.toFixed(1)}s = ${pollRate.toFixed(1)} Hz`);
        
        // Show value diversity
        pollValues.forEach((values, key) => {
          console.log(`  ${key}: ${values.size} unique values`);
        });
      }
    }, 30); // 33Hz = 30ms interval
    
    // Wait for polling to complete
    await new Promise(resolve => setTimeout(resolve, 3500));
    
    // ============================================================
    // METHOD 3: Hybrid Approach (BEST for efficiency + accuracy)
    // ============================================================
    console.log('\nMETHOD 3: Hybrid - Event-Driven with Rate Limiting');
    console.log('=' .repeat(50));
    
    // This approach uses events but throttles processing
    const processInterval = 30; // Process at 33Hz max
    let lastProcessTime = 0;
    let hybridCount = 0;
    const hybridStartTime = Date.now();
    
    meters.forEach((meter, idx) => {
      meter.on('update', (state) => {
        const now = Date.now();
        
        // Rate limit processing to 33Hz
        if (now - lastProcessTime >= processInterval) {
          hybridCount++;
          if (hybridCount <= 10) {
            console.log(`  meter.${idx + 1}: ${state.Value.toFixed(2)} dB (throttled)`);
          }
          lastProcessTime = now;
        }
      });
    });
    
    // Wait 3 seconds
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const hybridDuration = (Date.now() - hybridStartTime) / 1000;
    const hybridRate = hybridCount / hybridDuration;
    console.log(`\n  Results: ${hybridCount} processed in ${hybridDuration.toFixed(1)}s = ${hybridRate.toFixed(1)} Hz`);
    
    // ============================================================
    // COMPARISON SUMMARY
    // ============================================================
    console.log('\n' + '=' .repeat(60));
    console.log('📊 MONITORING METHOD COMPARISON:');
    console.log('=' .repeat(60));
    
    console.log('\n1. SDK Event Listeners:');
    console.log('   ✅ Pros: Automatic, efficient, real-time');
    console.log('   ❌ Cons: Rate depends on SDK polling interval');
    console.log(`   Rate: ${eventRate.toFixed(1)} Hz`);
    
    console.log('\n2. Direct State Polling:');
    console.log('   ✅ Pros: Exact sampling rate, always current values');
    console.log('   ❌ Cons: May sample same value multiple times');
    console.log(`   Rate: ${pollRate.toFixed(1)} Hz (exact)`);
    
    console.log('\n3. Hybrid Approach:');
    console.log('   ✅ Pros: Event-driven + rate control');
    console.log('   ❌ Cons: More complex implementation');
    console.log(`   Rate: ${hybridRate.toFixed(1)} Hz (throttled)`);
    
    console.log('\n🎯 RECOMMENDATIONS:');
    console.log('   - For VU meters/displays: Use Direct State Polling');
    console.log('   - For recording/logging: Use SDK Event Listeners');
    console.log('   - For triggers/thresholds: Use Hybrid Approach');
    
    await client.disconnect();
    console.log('\n✅ Test complete');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    await client.disconnect().catch(() => {});
  }
}

demonstrateBestPractices();