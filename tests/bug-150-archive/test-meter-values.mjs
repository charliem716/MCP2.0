#!/usr/bin/env node

/**
 * Check if meter values are changing in QRWC SDK
 */

console.log('=== METER VALUE MONITORING ===\n');

process.env.LOG_LEVEL = 'warn';

import fs from 'fs';

async function monitorMeterValues() {
  const { OfficialQRWCClient } = await import('./dist/qrwc/officialClient.js');
  
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
    
    const qrwc = client.getQrwc();
    
    if (!qrwc?.components?.TableMicMeter) {
      throw new Error('TableMicMeter not found in QRWC components');
    }
    
    const meter1 = qrwc.components.TableMicMeter.controls['meter.1'];
    const meter2 = qrwc.components.TableMicMeter.controls['meter.2'];
    
    if (!meter1 || !meter2) {
      throw new Error('Meter controls not found');
    }
    
    console.log('Monitoring meter values for 10 seconds...\n');
    console.log('Initial values:');
    console.log(`  meter.1: ${meter1.state.Value.toFixed(6)} dB`);
    console.log(`  meter.2: ${meter2.state.Value.toFixed(6)} dB`);
    
    // Track value changes
    let lastValue1 = meter1.state.Value;
    let lastValue2 = meter2.state.Value;
    let changeCount1 = 0;
    let changeCount2 = 0;
    let samples = [];
    
    // Monitor for 10 seconds
    const startTime = Date.now();
    const interval = setInterval(() => {
      const current1 = meter1.state.Value;
      const current2 = meter2.state.Value;
      
      // Check if values changed
      if (current1 !== lastValue1) {
        changeCount1++;
        const diff = Math.abs(current1 - lastValue1);
        if (changeCount1 <= 5) {
          console.log(`meter.1 changed: ${lastValue1.toFixed(6)} -> ${current1.toFixed(6)} (diff: ${diff.toFixed(6)})`);
        }
        lastValue1 = current1;
      }
      
      if (current2 !== lastValue2) {
        changeCount2++;
        const diff = Math.abs(current2 - lastValue2);
        if (changeCount2 <= 5) {
          console.log(`meter.2 changed: ${lastValue2.toFixed(6)} -> ${current2.toFixed(6)} (diff: ${diff.toFixed(6)})`);
        }
        lastValue2 = current2;
      }
      
      samples.push({ meter1: current1, meter2: current2 });
      
      // Stop after 10 seconds
      if (Date.now() - startTime > 10000) {
        clearInterval(interval);
        
        console.log('\n📊 RESULTS:');
        console.log(`  Duration: 10 seconds`);
        console.log(`  Samples collected: ${samples.length}`);
        console.log(`  meter.1 changes: ${changeCount1}`);
        console.log(`  meter.2 changes: ${changeCount2}`);
        
        // Calculate value ranges
        const values1 = samples.map(s => s.meter1);
        const values2 = samples.map(s => s.meter2);
        
        const min1 = Math.min(...values1);
        const max1 = Math.max(...values1);
        const min2 = Math.min(...values2);
        const max2 = Math.max(...values2);
        
        console.log(`\n  meter.1 range: ${min1.toFixed(2)} to ${max1.toFixed(2)} dB`);
        console.log(`  meter.2 range: ${min2.toFixed(2)} to ${max2.toFixed(2)} dB`);
        
        if (changeCount1 === 0 && changeCount2 === 0) {
          console.log('\n⚠️  WARNING: No value changes detected!');
          console.log('   Meters may be static or not receiving audio');
        } else {
          console.log('\n✅ Meter values are changing as expected');
        }
        
        client.disconnect();
      }
    }, 100); // Check every 100ms
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    await client.disconnect().catch(() => {});
  }
}

monitorMeterValues();