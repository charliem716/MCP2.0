#!/usr/bin/env node

/**
 * Use MCP tools via adapter to discover components and controls
 */

console.log('=== Using MCP Tools: list_components and list_controls ===\n');

import fs from 'fs';

async function useMCPTools() {
  const { OfficialQRWCClient } = await import('./dist/qrwc/officialClient.js');
  const { QRWCClientAdapter } = await import('./dist/mcp/qrwc/adapter.js');
  
  // Read config
  const config = JSON.parse(fs.readFileSync('qsys-core.config.json', 'utf8')).qsysCore;
  
  console.log('Connecting to Q-SYS Core at', config.host, '...');
  
  const client = new OfficialQRWCClient({
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password
  });
  
  try {
    await client.connect();
    console.log('✅ Connected\n');
    
    const adapter = new QRWCClientAdapter(client);
    
    // STEP 1: Use list_components (which calls Component.GetComponents)
    console.log('STEP 1: Using list_components MCP tool...\n');
    
    const componentsResult = await adapter.sendCommand('Component.GetComponents');
    const components = componentsResult.result || componentsResult || [];
    
    console.log(`Found ${components.length} components\n`);
    
    // Find meter components
    const meterComponents = components.filter(comp => 
      comp.Name.toLowerCase().includes('meter') ||
      comp.Type?.toLowerCase().includes('meter')
    );
    
    console.log('Meter Components:');
    meterComponents.forEach(comp => {
      console.log(`  - ${comp.Name} (Type: ${comp.Type || 'unknown'})`);
    });
    
    // Find Table_Mic_Meter
    const tableMicMeter = components.find(c => c.Name === 'Table_Mic_Meter');
    
    if (tableMicMeter) {
      console.log('\n✅ Found Table_Mic_Meter!');
      console.log('  Type:', tableMicMeter.Type);
      console.log('  Properties:', JSON.stringify(tableMicMeter.Properties || [], null, 2));
      
      // STEP 2: Try to get controls for Table_Mic_Meter
      console.log('\nSTEP 2: Attempting to get controls for Table_Mic_Meter...\n');
      
      // Since Component.GetControls has issues, let's test with direct control access
      // For meter2 components, the standard naming is meter.1, meter.2, etc.
      
      console.log('Based on meter2 type, the control names should be:');
      console.log('  - meter.1');
      console.log('  - meter.2');
      console.log('  - meter.3');
      console.log('  - meter.4');
      
      console.log('\nTesting control access with Control.Get...\n');
      
      // Test if we can get values using Control.Get with the full path
      const testControls = [
        'Table_Mic_Meter.meter.1',
        'Table_Mic_Meter.meter.2',
        'Table_Mic_Meter.meter.3',
        'Table_Mic_Meter.meter.4'
      ];
      
      try {
        const result = await adapter.sendCommand('Control.Get', {
          Controls: testControls
        });
        
        if (result && result.length > 0) {
          console.log('✅ SUCCESS! Got control values:');
          result.forEach((control, idx) => {
            console.log(`  ${testControls[idx]}: ${control.Value} (${control.String})`);
          });
        } else {
          console.log('No values returned from Control.Get');
        }
      } catch (e) {
        console.log('Control.Get failed:', e.message);
      }
      
      // Now create a change group with these controls
      console.log('\nSTEP 3: Creating change group with discovered controls...\n');
      
      const groupId = 'mcp-tools-test';
      await adapter.sendCommand('ChangeGroup.Create', { Id: groupId });
      
      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: groupId,
        Controls: testControls
      });
      
      console.log('Controls added to change group');
      
      // Poll to check for data
      console.log('Polling change group...\n');
      
      const pollResult = await adapter.sendCommand('ChangeGroup.Poll', { Id: groupId });
      
      if (pollResult.Changes && pollResult.Changes.length > 0) {
        console.log('🎉 GOT DATA FROM CHANGE GROUP:');
        pollResult.Changes.forEach(change => {
          console.log(`  ${change.Name}: ${change.Value?.toFixed(3)} dB`);
        });
      } else {
        console.log('No changes in poll result (meters may be static)');
      }
      
      // Cleanup
      await adapter.sendCommand('ChangeGroup.Destroy', { Id: groupId });
      
    } else {
      console.log('\n⚠️  Table_Mic_Meter not found');
    }
    
    await client.disconnect();
    console.log('\n✅ Complete');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    await client.disconnect().catch(() => {});
    process.exit(1);
  }
}

// Run
useMCPTools();