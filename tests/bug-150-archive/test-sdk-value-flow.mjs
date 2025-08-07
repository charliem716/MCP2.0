#!/usr/bin/env node

/**
 * Deep dive into how QRWC SDK tracks and outputs meter values
 * Tracing the complete flow from Q-SYS Core to SDK to our code
 */

console.log('=== QRWC SDK VALUE FLOW ANALYSIS ===\n');

process.env.LOG_LEVEL = 'warn';

import fs from 'fs';

async function analyzeSDKValueFlow() {
  const { OfficialQRWCClient } = await import('./dist/qrwc/officialClient.js');
  
  const config = JSON.parse(fs.readFileSync('qsys-core.config.json', 'utf8')).qsysCore;
  
  const client = new OfficialQRWCClient({
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    pollingInterval: 30  // This sets the SDK's internal ChangeGroup polling rate
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to Q-SYS Core\n');
    
    const qrwc = client.getQrwc();
    
    // Get meter.1 control
    const meter1 = qrwc.components.TableMicMeter?.controls['meter.1'];
    if (!meter1) {
      throw new Error('meter.1 not found');
    }
    
    console.log('📊 UNDERSTANDING THE VALUE FLOW:\n');
    console.log('=' .repeat(60));
    
    // ============================================================
    // LEVEL 1: The Control Object State
    // ============================================================
    console.log('LEVEL 1: Control.state (Always Current)\n');
    console.log('The control object has a .state property that ALWAYS reflects');
    console.log('the current value, updated by the SDK\'s internal mechanisms:\n');
    
    console.log(`  meter1.state.Value = ${meter1.state.Value.toFixed(2)} dB`);
    
    // Show that it updates continuously
    console.log('\n  Checking state updates over 2 seconds:');
    let stateChecks = [];
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 400));
      stateChecks.push(meter1.state.Value);
      console.log(`    ${i*400}ms: ${meter1.state.Value.toFixed(2)} dB`);
    }
    
    const stateChanged = stateChecks.some(v => v !== stateChecks[0]);
    console.log(`\n  ✅ State updates automatically: ${stateChanged ? 'YES' : 'NO'}`);
    
    // ============================================================
    // LEVEL 2: Control Event Listeners
    // ============================================================
    console.log('\n' + '=' .repeat(60));
    console.log('LEVEL 2: Control.on("update") Events\n');
    console.log('The SDK emits "update" events when the control value changes.');
    console.log('These events are triggered by the SDK\'s internal ChangeGroup:\n');
    
    let updateCount = 0;
    let updateValues = [];
    
    const updateHandler = (state) => {
      updateCount++;
      updateValues.push(state.Value);
      if (updateCount <= 5) {
        console.log(`  Update ${updateCount}: ${state.Value.toFixed(2)} dB`);
      }
    };
    
    meter1.on('update', updateHandler);
    
    console.log('  Listening for 3 seconds...');
    await new Promise(r => setTimeout(r, 3000));
    
    meter1.removeListener('update', updateHandler);
    
    const updateRate = updateCount / 3;
    console.log(`\n  Received ${updateCount} updates in 3s = ${updateRate.toFixed(1)} Hz`);
    console.log(`  This rate is controlled by the SDK's polling interval (${client.options.pollingInterval}ms)`);
    
    // ============================================================
    // LEVEL 3: SDK's Internal ChangeGroup
    // ============================================================
    console.log('\n' + '=' .repeat(60));
    console.log('LEVEL 3: SDK\'s Internal ChangeGroup\n');
    console.log('When you create a Qrwc instance, it automatically creates an');
    console.log('internal ChangeGroup that polls Q-SYS at the specified interval.\n');
    
    console.log('The SDK flow:');
    console.log('  1. Qrwc.createQrwc() creates internal ChangeGroup');
    console.log('  2. ChangeGroup registers all controls via WebSocket');
    console.log('  3. ChangeGroup.startPolling() begins at pollingInterval');
    console.log('  4. Every poll sends "ChangeGroup.Poll" to Q-SYS Core');
    console.log('  5. Q-SYS returns changed values');
    console.log('  6. SDK updates Control.state and emits "update" events');
    
    // ============================================================
    // LEVEL 4: Our Adapter's Change Groups
    // ============================================================
    console.log('\n' + '=' .repeat(60));
    console.log('LEVEL 4: Our Adapter\'s Change Groups\n');
    console.log('When we create our own change groups, we\'re trying to');
    console.log('intercept/simulate what the SDK already does internally:\n');
    
    const { QRWCClientAdapter } = await import('./dist/mcp/qrwc/adapter.js');
    const adapter = new QRWCClientAdapter(client);
    
    // Create our own change group
    await adapter.sendCommand('ChangeGroup.Create', { Id: 'test-33hz' });
    await adapter.sendCommand('ChangeGroup.AddComponentControl', {
      Id: 'test-33hz',
      Component: {
        Name: 'TableMicMeter',
        Controls: [{ Name: 'meter.1' }]
      }
    });
    
    console.log('  Created adapter change group "test-33hz"');
    
    // Start auto-polling at 33Hz
    await adapter.sendCommand('ChangeGroup.AutoPoll', {
      Id: 'test-33hz',
      Rate: 0.03  // 33Hz
    });
    
    console.log('  Started 33Hz polling\n');
    
    let adapterEvents = 0;
    adapter.on('changeGroup:changes', (event) => {
      if (event.groupId === 'test-33hz') {
        adapterEvents++;
      }
    });
    
    console.log('  Monitoring adapter events for 3 seconds...');
    await new Promise(r => setTimeout(r, 3000));
    
    await adapter.sendCommand('ChangeGroup.Destroy', { Id: 'test-33hz' });
    
    console.log(`  Adapter events received: ${adapterEvents} (${(adapterEvents/3).toFixed(1)} Hz)`);
    
    // ============================================================
    // THE PROBLEM
    // ============================================================
    console.log('\n' + '=' .repeat(60));
    console.log('⚠️  THE ARCHITECTURAL ISSUE:\n');
    
    console.log('1. SDK already has its own ChangeGroup polling Q-SYS');
    console.log('2. SDK updates Control.state continuously from its polling');
    console.log('3. Our adapter intercepts ChangeGroup.Poll commands');
    console.log('4. Our adapter compares current state with last state');
    console.log('5. But SDK already updated the state, so no "change" detected!');
    
    console.log('\n🔄 ACTUAL FLOW:');
    console.log('  Q-SYS Core → WebSocket → SDK ChangeGroup → Control.state → Control events');
    console.log('                              ↓');
    console.log('                     (polls at SDK rate)');
    
    console.log('\n❌ OUR ATTEMPTED FLOW:');
    console.log('  Our ChangeGroup.Poll → Read Control.state → Compare → Emit if changed');
    console.log('                          ↑');
    console.log('                  (already updated by SDK!)');
    
    // ============================================================
    // THE SOLUTION
    // ============================================================
    console.log('\n' + '=' .repeat(60));
    console.log('✅ SOLUTIONS FOR RECORDING:\n');
    
    console.log('OPTION 1: Use SDK Control Events (Simplest)');
    console.log('  - Listen to control.on("update") events');
    console.log('  - Record every event with timestamp');
    console.log('  - Rate limited by SDK polling interval\n');
    
    console.log('OPTION 2: Direct State Sampling (Most Flexible)');
    console.log('  - Use setInterval to sample control.state.Value');
    console.log('  - Sample at any rate you want (33Hz, 10Hz, etc)');
    console.log('  - Always gets current value\n');
    
    console.log('OPTION 3: Bypass Adapter for Monitoring (Most Accurate)');
    console.log('  - Create separate QRWC instance just for monitoring');
    console.log('  - Set its pollingInterval to desired rate');
    console.log('  - Use its native events\n');
    
    console.log('OPTION 4: Fix Adapter (Most Complex)');
    console.log('  - Modify adapter to record ALL polls, not just changes');
    console.log('  - Or forward ChangeGroup.Poll to actual Q-SYS');
    console.log('  - Requires architectural changes');
    
    await client.disconnect();
    console.log('\n✅ Analysis complete');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    await client.disconnect().catch(() => {});
  }
}

analyzeSDKValueFlow();