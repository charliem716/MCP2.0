#!/usr/bin/env node

/**
 * Integration test for BUG-036: Component.GetComponents
 * Verifies that components return proper Type and Properties
 */

import { OfficialQRWCClient } from '../../dist/src/qrwc/officialClient.js';
import { QRWCClientAdapter } from '../../dist/src/mcp/qrwc/adapter.js';
import fs from 'fs';

// Load config
const configPath = 'qsys-core.config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const { host, port } = config.qsysCore;

console.log('🧪 BUG-036 Integration Test: Component.GetComponents');
console.log('='.repeat(50));

async function runTest() {
  const client = new OfficialQRWCClient({ host, port });
  
  try {
    await client.connect();
    console.log('✅ Connected to Q-SYS Core');
    
    // Create adapter
    const adapter = new QRWCClientAdapter(client);
    
    // Test Component.GetComponents
    console.log('\n📋 Testing Component.GetComponents...');
    const result = await adapter.sendCommand('Component.GetComponents');
    
    console.log(`\n✅ Found ${result.result.length} components`);
    
    // Verify response format
    let hasTypes = true;
    let hasProperties = true;
    let foundNonGenericType = false;
    let foundPropertiesArray = false;
    
    console.log('\n🔍 Analyzing components:');
    result.result.slice(0, 5).forEach(component => {
      console.log(`\n  Component: ${component.Name}`);
      console.log(`  Type: ${component.Type}`);
      console.log(`  Properties: ${component.Properties?.length || 0} items`);
      
      if (!component.Type) hasTypes = false;
      if (component.Type !== 'Component') foundNonGenericType = true;
      if (!Array.isArray(component.Properties)) hasProperties = false;
      if (component.Properties?.length > 0) {
        foundPropertiesArray = true;
        console.log(`  Sample property: ${JSON.stringify(component.Properties[0])}`);
      }
    });
    
    console.log('\n📊 Test Results:');
    console.log(`  ✅ All components have Type field: ${hasTypes}`);
    console.log(`  ✅ Found non-generic types: ${foundNonGenericType}`);
    console.log(`  ✅ All components have Properties array: ${hasProperties}`);
    console.log(`  ✅ Found components with properties: ${foundPropertiesArray}`);
    
    // Verify against API spec format
    const isValidFormat = hasTypes && hasProperties && foundNonGenericType;
    
    if (isValidFormat) {
      console.log('\n✅ BUG-036 FIXED: Response matches Q-SYS API specification');
    } else {
      console.log('\n❌ BUG-036 NOT FIXED: Response format issues detected');
    }
    
    await client.disconnect();
    process.exit(isValidFormat ? 0 : 1);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    await client.disconnect();
    process.exit(1);
  }
}

runTest().catch(console.error);