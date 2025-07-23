#!/usr/bin/env node

/**
 * BUG-036 Verification Script
 * 
 * This script verifies the Component.GetComponents response format
 * to ensure it matches the Q-SYS API specification exactly.
 * 
 * Expected format per component:
 * {
 *   "Name": "Component Name",
 *   "Type": "component_type",  // e.g., "apm", "delay_matrix", etc.
 *   "Properties": [            // Array of configuration properties
 *     {
 *       "Name": "property_name",
 *       "Value": "property_value"
 *     }
 *   ]
 * }
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import necessary modules
import { OfficialQRWCClient } from '../dist/src/qrwc/officialClient.js';
import { QRWCClientAdapter } from '../dist/src/mcp/qrwc/adapter.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load configuration
const configPath = path.join(__dirname, '..', 'qsys-core.config.json');
let config;

try {
  const configData = fs.readFileSync(configPath, 'utf8');
  config = JSON.parse(configData);
  console.log('✓ Configuration loaded from:', configPath);
} catch (error) {
  console.error('✗ Failed to load configuration:', error.message);
  console.error('  Please run ./setup-env.sh first');
  process.exit(1);
}

// Create client and adapter
const officialClient = new OfficialQRWCClient({
  host: config.qsysCore.host,
  port: config.qsysCore.port || 443,
  username: config.qsysCore.username,
  password: config.qsysCore.password,
  secure: true,
  rejectUnauthorized: false
});

const adapter = new QRWCClientAdapter(officialClient);

async function verifyComponentFormat() {
  try {
    console.log('\n=== BUG-036 Component.GetComponents Format Verification ===\n');
    
    // Connect to Q-SYS
    console.log('Connecting to Q-SYS Core at', `${config.qsysCore.host  }:${  config.qsysCore.port || 443}`);
    await officialClient.connect();
    console.log('✓ Connected successfully\n');
    
    // Get components using the adapter
    console.log('Fetching components via adapter.sendCommand()...');
    const response = await adapter.sendCommand('Component.GetComponents');
    
    // Check response structure
    console.log('\n=== Response Analysis ===\n');
    
    if (!response || !response.result) {
      console.error('✗ Invalid response structure - missing result field');
      console.log('Full response:', JSON.stringify(response, null, 2));
      return;
    }
    
    const components = response.result;
    console.log(`✓ Received ${components.length} components\n`);
    
    // Display first 3 components for analysis
    console.log('=== First 3 Components (Pretty-Printed) ===\n');
    const displayCount = Math.min(3, components.length);
    
    for (let i = 0; i < displayCount; i++) {
      const comp = components[i];
      console.log(`Component ${i + 1}:`);
      console.log(JSON.stringify(comp, null, 2));
      console.log();
      
      // Analyze component structure
      console.log('Structure Analysis:');
      console.log(`  - Name field: ${comp.Name ? '✓ Present' : '✗ Missing'}`);
      console.log(`  - Type field: ${comp.Type ? `✓ Present (${comp.Type})` : '✗ Missing'}`);
      console.log(`  - Properties field: ${comp.Properties ? `✓ Present (${comp.Properties.length} items)` : '✗ Missing'}`);
      
      // Check if Type is specific or generic
      if (comp.Type === 'Component' || comp.Type === 'generic') {
        console.log('  ⚠ Type appears to be generic, not specific component type');
      }
      
      // Analyze Properties array if present
      if (comp.Properties && comp.Properties.length > 0) {
        console.log('  Properties structure:');
        const firstProp = comp.Properties[0];
        console.log(`    - Name field: ${firstProp.Name ? '✓ Present' : '✗ Missing'}`);
        console.log(`    - Value field: ${firstProp.Value !== undefined ? '✓ Present' : '✗ Missing'}`);
      }
      
      console.log(`\n${  '-'.repeat(60)  }\n`);
    }
    
    // Summary analysis
    console.log('=== Summary Analysis ===\n');
    
    // Check all components for compliance
    let compliantCount = 0;
    let missingTypeCount = 0;
    let missingPropertiesCount = 0;
    let genericTypeCount = 0;
    
    for (const comp of components) {
      const hasName = !!comp.Name;
      const hasType = !!comp.Type;
      const hasProperties = Array.isArray(comp.Properties);
      const isGenericType = comp.Type === 'Component' || comp.Type === 'generic';
      
      if (hasName && hasType && hasProperties) {
        compliantCount++;
      }
      if (!hasType) missingTypeCount++;
      if (!hasProperties) missingPropertiesCount++;
      if (isGenericType) genericTypeCount++;
    }
    
    console.log(`Total components: ${components.length}`);
    console.log(`Fully compliant (Name, Type, Properties): ${compliantCount}`);
    console.log(`Missing Type field: ${missingTypeCount}`);
    console.log(`Missing Properties array: ${missingPropertiesCount}`);
    console.log(`Generic/placeholder Type: ${genericTypeCount}`);
    
    // Verdict
    console.log('\n=== Verdict ===\n');
    if (compliantCount === components.length && genericTypeCount === 0) {
      console.log('✓ PASS: All components match Q-SYS API specification exactly!');
    } else {
      console.log('✗ FAIL: Components do not match Q-SYS API specification');
      console.log('\nIssues found:');
      if (missingPropertiesCount > 0) {
        console.log(`  - ${missingPropertiesCount} components missing Properties array`);
      }
      if (genericTypeCount > 0) {
        console.log(`  - ${genericTypeCount} components have generic Type instead of specific type`);
      }
      if (missingTypeCount > 0) {
        console.log(`  - ${missingTypeCount} components missing Type field entirely`);
      }
    }
    
    // Show expected vs actual format
    console.log('\n=== Expected Format (per Q-SYS API spec) ===\n');
    console.log(JSON.stringify({
      Name: "My Delay Mixer",
      Type: "delay_matrix",  // Specific type, not "Component"
      Properties: [
        { Name: "n_inputs", Value: "8" },
        { Name: "n_outputs", Value: "8" },
        { Name: "max_delay", Value: "0.5" }
      ]
    }, null, 2));
    
  } catch (error) {
    console.error('\n✗ Error during verification:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    // Disconnect
    try {
      await officialClient.disconnect();
      console.log('\n✓ Disconnected from Q-SYS Core');
    } catch (error) {
      console.error('✗ Error disconnecting:', error.message);
    }
  }
}

// Run verification
verifyComponentFormat().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});