#!/usr/bin/env node

/**
 * Discover microphone components and their controls
 */

console.log('=== Discovering Microphone Components ===\n');

// Reduce logging noise
process.env.LOG_LEVEL = 'warn';

import fs from 'fs';

async function discoverMicComponents() {
  const { OfficialQRWCClient } = await import('./dist/qrwc/officialClient.js');
  const { QRWCClientAdapter } = await import('./dist/mcp/qrwc/adapter.js');
  
  // Read config
  const config = JSON.parse(fs.readFileSync('qsys-core.config.json', 'utf8')).qsysCore;
  
  console.log('Connecting to Q-SYS Core at', config.host, '...\n');
  
  const client = new OfficialQRWCClient({
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to Q-SYS Core\n');
    
    const adapter = new QRWCClientAdapter(client);
    
    // Get all components
    console.log('Discovering all components...');
    const componentsResult = await adapter.sendCommand('Component.GetComponents');
    const components = componentsResult.result || componentsResult || [];
    
    console.log(`Found ${components.length} total components\n`);
    
    // Find components with "mic" in the name
    const micComponents = components.filter(comp => 
      comp.Name.toLowerCase().includes('mic') ||
      comp.Type?.toLowerCase().includes('mic') ||
      comp.Type?.toLowerCase().includes('beamformer')
    );
    
    console.log(`Found ${micComponents.length} microphone-related components:\n`);
    
    // Display all mic components
    micComponents.forEach(comp => {
      console.log(`Component: ${comp.Name}`);
      console.log(`  Type: ${comp.Type || 'unknown'}`);
      console.log(`  Properties:`, JSON.stringify(comp.Properties || {}, null, 2));
      console.log('');
    });
    
    // Look for the actual Table_Mic component (not Table_Mic_Meter)
    const tableMic = components.find(c => 
      c.Name === 'Table_Mic[Mute;AEC;Meter]' || 
      c.Name === 'Table_Mic'
    );
    
    if (tableMic) {
      console.log('\n=== Found Table Mic Component ===');
      console.log('Name:', tableMic.Name);
      console.log('Type:', tableMic.Type);
      console.log('\nTrying to get controls...\n');
      
      // Try different methods to get controls
      const methods = [
        { cmd: 'Control.Get', params: { Name: `${tableMic.Name}.meter` } },
        { cmd: 'Control.Get', params: { Name: `${tableMic.Name}.meter.1` } },
        { cmd: 'Control.Get', params: { Name: `${tableMic.Name}.level` } },
        { cmd: 'Control.Get', params: { Name: `${tableMic.Name}.Level` } },
        { cmd: 'Control.Get', params: { Name: `${tableMic.Name}.peak` } },
        { cmd: 'Control.Get', params: { Name: `${tableMic.Name}.rms` } }
      ];
      
      for (const method of methods) {
        try {
          console.log(`Trying: ${method.cmd} with ${method.params.Name}`);
          const result = await adapter.sendCommand(method.cmd, method.params);
          if (result) {
            console.log(`  ✅ SUCCESS! Found control:`, JSON.stringify(result, null, 2));
          }
        } catch (e) {
          console.log(`  ❌ Failed:`, e.message);
        }
      }
    }
    
    // Disconnect
    await client.disconnect();
    console.log('\n✅ Discovery complete');
    
  } catch (error) {
    console.error('\n❌ Discovery failed:', error.message);
    await client.disconnect().catch(() => {});
    process.exit(1);
  }
}

// Run discovery
discoverMicComponents();