#!/usr/bin/env node

/**
 * Direct test using MCP tools to list components and controls
 */

console.log('=== Using MCP Tools to Discover Components and Controls ===\n');

import fs from 'fs';

async function testMCPTools() {
  const { OfficialQRWCClient } = await import('./dist/qrwc/officialClient.js');
  const { listComponentsTool } = await import('./dist/mcp/tools/discovery.js');
  const { listControlsTool } = await import('./dist/mcp/tools/components.js');
  
  // Read config
  const config = JSON.parse(fs.readFileSync('qsys-core.config.json', 'utf8')).qsysCore;
  
  console.log('Connecting to Q-SYS Core...');
  
  const client = new OfficialQRWCClient({
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to Q-SYS Core\n');
    
    // STEP 1: List all components using MCP tool
    console.log('STEP 1: Using list_components MCP tool...\n');
    
    const componentsResult = await listComponentsTool({}, client);
    
    console.log(`Found ${componentsResult.components.length} components\n`);
    
    // Filter for meter components
    const meterComponents = componentsResult.components.filter(comp => 
      comp.name.toLowerCase().includes('meter') ||
      comp.type?.toLowerCase().includes('meter')
    );
    
    console.log('Meter Components:');
    meterComponents.forEach(comp => {
      console.log(`  - ${comp.name} (Type: ${comp.type || 'unknown'})`);
    });
    
    // Find Table_Mic_Meter specifically
    const tableMicMeter = componentsResult.components.find(c => 
      c.name === 'Table_Mic_Meter'
    );
    
    if (tableMicMeter) {
      console.log('\n✅ Found Table_Mic_Meter!');
      console.log('  Type:', tableMicMeter.type);
      console.log('  Properties:', JSON.stringify(tableMicMeter.properties || {}, null, 2));
      
      // STEP 2: List controls for Table_Mic_Meter
      console.log('\nSTEP 2: Using list_controls MCP tool for Table_Mic_Meter...\n');
      
      try {
        const controlsResult = await listControlsTool({
          component: 'Table_Mic_Meter'
        }, client);
        
        console.log('Controls for Table_Mic_Meter:');
        
        if (controlsResult.controls && controlsResult.controls.length > 0) {
          controlsResult.controls.forEach((control, idx) => {
            console.log(`\n  ${idx + 1}. ${control.name}`);
            console.log(`     Type: ${control.type || 'unknown'}`);
            console.log(`     Value: ${control.value !== undefined ? control.value : 'N/A'}`);
            if (control.value_min !== undefined) {
              console.log(`     Range: ${control.value_min} to ${control.value_max}`);
            }
          });
          
          console.log('\n✅ EXACT CONTROL NAMES FOR CHANGE GROUP:');
          controlsResult.controls.forEach(control => {
            // Full control name for change group
            const fullName = control.name.includes('.') ? 
              control.name : 
              `Table_Mic_Meter.${control.name}`;
            console.log(`  - ${fullName}`);
          });
          
        } else {
          console.log('  No controls returned (may need different access method)');
        }
        
      } catch (e) {
        console.log('Error getting controls:', e.message);
      }
      
    } else {
      console.log('\n⚠️  Table_Mic_Meter not found in components list');
    }
    
    // Also show all meter components' types
    console.log('\n=== All Meter Component Types ===');
    const uniqueTypes = new Set();
    meterComponents.forEach(comp => {
      if (comp.type) uniqueTypes.add(comp.type);
    });
    
    console.log('Unique meter types found:');
    uniqueTypes.forEach(type => console.log('  -', type));
    
    await client.disconnect();
    console.log('\n✅ Discovery complete');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    await client.disconnect().catch(() => {});
    process.exit(1);
  }
}

// Run test
testMCPTools();