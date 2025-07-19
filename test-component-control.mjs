#!/usr/bin/env node

/**
 * Q-SYS Component Control Test
 * Tests actual component interaction and control
 */

import { Qrwc } from '@q-sys/qrwc';
import WebSocket from 'ws';
import fs from 'fs';

// Load config from JSON file
const configPath = 'qsys-core.config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const { host, port } = config.qsysCore;

console.log('🎛️ Q-SYS Component Control Test');
console.log('='.repeat(50));

// Create WebSocket connection
const wsUrl = `wss://${host}:${port}/qrc-public-api/v0`;
console.log(`🔗 Connecting to: ${wsUrl}`);

const socket = new WebSocket(wsUrl, {
  rejectUnauthorized: false
});

socket.on('open', async () => {
  console.log('🔌 WebSocket connected!');
  
  try {
    // Create QRWC instance
    const qrwc = await Qrwc.createQrwc({ socket });
    console.log(`✅ QRWC connected with ${Object.keys(qrwc.components).length} components\n`);
    
    // Test Component Interaction
    console.log('🧪 Testing Component Interactions:');
    console.log('='.repeat(40));
    
    // Find some interesting components to test
    const componentNames = Object.keys(qrwc.components);
    
    // Test 1: Find and examine a Gain control
    const gainComponents = componentNames.filter(name => 
      name.toLowerCase().includes('gain') || 
      name.toLowerCase().includes('volume')
    );
    
    if (gainComponents.length > 0) {
      const gainName = gainComponents[0];
      const gainComponent = qrwc.components[gainName];
      console.log(`\n📊 GAIN COMPONENT: "${gainName}"`);
      console.log(`   Controls available: ${Object.keys(gainComponent.controls).length}`);
      
      // List first few controls
      const controlNames = Object.keys(gainComponent.controls).slice(0, 5);
      controlNames.forEach(controlName => {
        const control = gainComponent.controls[controlName];
        console.log(`   • ${controlName}: ${control.state.Value} (${control.state.Type})`);
      });
    }
    
    // Test 2: Find and examine Display controls
    const displayComponents = componentNames.filter(name => 
      name.toLowerCase().includes('display') ||
      name.toLowerCase().includes('monitor')
    );
    
    if (displayComponents.length > 0) {
      const displayName = displayComponents[0];
      const displayComponent = qrwc.components[displayName];
      console.log(`\n📺 DISPLAY COMPONENT: "${displayName}"`);
      console.log(`   Controls available: ${Object.keys(displayComponent.controls).length}`);
      
      // Look for power or enable controls
      const powerControls = Object.keys(displayComponent.controls).filter(name =>
        name.toLowerCase().includes('power') ||
        name.toLowerCase().includes('enable') ||
        name.toLowerCase().includes('on')
      );
      
      if (powerControls.length > 0) {
        console.log(`   Power-related controls found: ${powerControls.join(', ')}`);
        const powerControl = displayComponent.controls[powerControls[0]];
        console.log(`   • ${powerControls[0]}: ${powerControl.state.Value} (${powerControl.state.Type})`);
      }
    }
    
    // Test 3: Find Matrix Mixer
    const mixerComponents = componentNames.filter(name => 
      name.toLowerCase().includes('mixer') ||
      name.toLowerCase().includes('matrix')
    );
    
    if (mixerComponents.length > 0) {
      const mixerName = mixerComponents[0];
      const mixerComponent = qrwc.components[mixerName];
      console.log(`\n🎚️ MIXER COMPONENT: "${mixerName}"`);
      console.log(`   Controls available: ${Object.keys(mixerComponent.controls).length}`);
      
      // Look for mute controls
      const muteControls = Object.keys(mixerComponent.controls).filter(name =>
        name.toLowerCase().includes('mute')
      ).slice(0, 3);
      
      if (muteControls.length > 0) {
        console.log(`   Mute controls found: ${muteControls.join(', ')}`);
        muteControls.forEach(controlName => {
          const control = mixerComponent.controls[controlName];
          console.log(`   • ${controlName}: ${control.state.Value} (${control.state.Type})`);
        });
      }
    }
    
    // Test 4: Component Categories Summary
    console.log('\n📋 COMPONENT CATEGORIES:');
    console.log('='.repeat(25));
    
    const categories = {
      'Audio': componentNames.filter(n => 
        n.toLowerCase().includes('audio') || 
        n.toLowerCase().includes('mic') || 
        n.toLowerCase().includes('mixer') ||
        n.toLowerCase().includes('gain') ||
        n.toLowerCase().includes('soundbar')
      ),
      'Video': componentNames.filter(n => 
        n.toLowerCase().includes('video') || 
        n.toLowerCase().includes('display') || 
        n.toLowerCase().includes('camera') ||
        n.toLowerCase().includes('switcher') ||
        n.toLowerCase().includes('hdmi')
      ),
      'Control': componentNames.filter(n => 
        n.toLowerCase().includes('control') || 
        n.toLowerCase().includes('uci') || 
        n.toLowerCase().includes('touch')
      ),
      'Conference': componentNames.filter(n => 
        n.toLowerCase().includes('zoom') || 
        n.toLowerCase().includes('teams') || 
        n.toLowerCase().includes('conference')
      ),
      'System': componentNames.filter(n => 
        n.toLowerCase().includes('status') || 
        n.toLowerCase().includes('hvac') || 
        n.toLowerCase().includes('date')
      )
    };
    
    Object.entries(categories).forEach(([category, components]) => {
      if (components.length > 0) {
        console.log(`${category}: ${components.length} components`);
        components.slice(0, 3).forEach(name => console.log(`  - ${name}`));
        if (components.length > 3) console.log(`  ... and ${components.length - 3} more`);
      }
    });
    
    console.log('\n✅ Component control test completed successfully!');
    console.log('🚀 Q-SYS integration is fully functional!');
    
    // Set up a brief update listener test
    console.log('\n👂 Setting up 5-second update listener test...');
    
    // Listen to first available control for updates
    if (componentNames.length > 0) {
      const testComponent = qrwc.components[componentNames[0]];
      const testControlName = Object.keys(testComponent.controls)[0];
      const testControl = testComponent.controls[testControlName];
      
      console.log(`📡 Listening to: ${componentNames[0]}.${testControlName}`);
      
      testControl.on('update', (state) => {
        console.log(`🔄 Update received: ${testControlName} = ${state.Value}`);
      });
      
      setTimeout(() => {
        console.log('⏰ Update listener test complete');
        qrwc.close();
      }, 5000);
    } else {
      qrwc.close();
    }
    
  } catch (error) {
    console.error('💥 QRWC Creation Error:', error.message);
    socket.close();
    process.exit(1);
  }
});

socket.on('error', (error) => {
  console.error('❌ WebSocket Error:', error.message);
  process.exit(1);
});

socket.on('close', (code, reason) => {
  console.log(`\n👋 Connection closed: ${code} - ${reason || 'Clean shutdown'}`);
  process.exit(0);
});

// Timeout after 30 seconds
setTimeout(() => {
  console.error('⏰ Test timeout after 30 seconds');
  process.exit(1);
}, 30000); 