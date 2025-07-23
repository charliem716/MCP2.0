#!/usr/bin/env node

/**
 * Comprehensive Live MCP Tools Test Suite
 * Tests all MCP tools against a live Q-SYS Core with proper error handling
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Test result tracking
const testResults = [];
let passCount = 0;
let failCount = 0;

// Helper function to run a test
async function runTest(name, testFunc) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log(`${'='.repeat(60)}`);
  
  try {
    const startTime = Date.now();
    await testFunc();
    const duration = Date.now() - startTime;
    console.log(`✅ PASS: ${name} (${duration}ms)`);
    testResults.push({ name, status: 'PASS', duration });
    passCount++;
  } catch (error) {
    console.error(`❌ FAIL: ${name}`);
    console.error(`Error: ${error.message}`);
    testResults.push({ name, status: 'FAIL', error: error.message });
    failCount++;
  }
}

// Helper to parse tool response
function parseToolResponse(result) {
  // Check if this is an error response
  if (result.isError) {
    throw new Error(result.content[0].text);
  }
  
  const text = result.content[0].text;
  
  // Check for error messages in text
  if (text.includes('failed:') || text.includes('Error:')) {
    throw new Error(text);
  }
  
  // Try to parse as JSON
  try {
    return JSON.parse(text);
  } catch (e) {
    // If not JSON, return the raw text
    return text;
  }
}

// Load configuration
const configPath = join(__dirname, '../../qsys-core.config.json');
let config;
try {
  const configData = JSON.parse(readFileSync(configPath, 'utf8'));
  config = configData.qsysCore;
} catch (error) {
  console.error('Failed to load qsys-core.config.json:', error.message);
  console.error('Please run ./setup-env.sh first');
  process.exit(1);
}

// Import modules
const { OfficialQRWCClient } = await import('../../dist/src/qrwc/officialClient.js');
const { QRWCClientAdapter } = await import('../../dist/src/mcp/qrwc/adapter.js');

// Import individual tools
const { createListComponentsTool } = await import('../../dist/src/mcp/tools/components.js');
const { createListControlsTool, createGetControlValuesTool, createSetControlValuesTool } = await import('../../dist/src/mcp/tools/controls.js');
const { createQueryCoreStatusTool } = await import('../../dist/src/mcp/tools/status.js');

// Create official client
const officialClient = new OfficialQRWCClient({
  host: config.host,
  port: config.port,
  pollingInterval: config.connectionSettings?.pollingInterval || 350,
  reconnectInterval: config.connectionSettings?.reconnectInterval || 5000,
  maxReconnectAttempts: config.connectionSettings?.maxReconnectAttempts || 5,
  connectionTimeout: config.connectionSettings?.timeout || 10000,
  enableAutoReconnect: config.connectionSettings?.enableAutoReconnect || true
});

// Helper to create test context with valid UUID
const createContext = (toolName) => ({
  requestId: randomUUID(),
  toolName,
  startTime: Date.now()
});

// Main test suite
async function runAllTests() {
  console.log('🧪 Comprehensive Live MCP Tools Test Suite');
  console.log(`📍 Target: ${config.host}:${config.port}`);
  console.log(`📅 Date: ${new Date().toISOString()}`);
  console.log(`🔑 Using valid UUIDs for requestId`);
  
  try {
    // Connect to Q-SYS
    console.log('\n🔌 Connecting to Q-SYS Core...');
    await officialClient.connect();
    console.log('✅ Connected successfully');
    
    // Wait for initial data
    console.log('⏳ Waiting for initial data sync...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Create adapter with connected client
    const adapter = new QRWCClientAdapter(officialClient);
    
    // Create tool instances
    const tools = {
      list_components: createListComponentsTool(adapter),
      list_controls: createListControlsTool(adapter),
      get_control_values: createGetControlValuesTool(adapter),
      set_control_values: createSetControlValuesTool(adapter),
      query_core_status: createQueryCoreStatusTool(adapter)
    };
    
    // Test 1: list_components (no filter)
    await runTest('Tool: list_components (no filter)', async () => {
      const ctx = createContext('list_components');
      const result = await tools.list_components.execute({
        requestId: ctx.requestId
      }, ctx);
      
      const components = parseToolResponse(result);
      console.log(`Found ${components.length} components`);
      
      if (!Array.isArray(components) || components.length === 0) {
        throw new Error('No components found or invalid response format');
      }
      
      // Display first 3 components
      console.log('Sample components:');
      components.slice(0, 3).forEach(comp => {
        console.log(`  - ${comp.Name} (Type: ${comp.Type || 'Unknown'})`);
      });
    });
    
    // Test 2: list_components with filter
    await runTest('Tool: list_components (with filter "Gain")', async () => {
      const ctx = createContext('list_components');
      const result = await tools.list_components.execute({
        requestId: ctx.requestId,
        nameFilter: 'Gain',
        includeProperties: true
      }, ctx);
      
      const components = parseToolResponse(result);
      console.log(`Found ${components.length} components matching 'Gain'`);
      
      if (Array.isArray(components) && components.length > 0) {
        const comp = components[0];
        console.log(`First match: ${comp.Name}`);
        if (comp.Properties) {
          console.log(`Has ${Object.keys(comp.Properties).length} properties`);
        }
      }
    });
    
    // Test 3: list_controls (all types)
    await runTest('Tool: list_controls (all types)', async () => {
      const ctx = createContext('list_controls');
      const result = await tools.list_controls.execute({
        requestId: ctx.requestId,
        controlType: 'all',
        includeMetadata: true
      }, ctx);
      
      const controls = parseToolResponse(result);
      console.log(`Found ${controls.length} controls total`);
      
      if (!Array.isArray(controls)) {
        throw new Error('Invalid response format - expected array of controls');
      }
      
      // Count by type
      const typeCount = {};
      controls.forEach(ctrl => {
        const type = ctrl.type || ctrl.Type || 'unknown';
        typeCount[type] = (typeCount[type] || 0) + 1;
      });
      console.log('Control type breakdown:', JSON.stringify(typeCount, null, 2));
    });
    
    // Test 4: list_controls (gain type only)
    await runTest('Tool: list_controls (gain controls)', async () => {
      const ctx = createContext('list_controls');
      const result = await tools.list_controls.execute({
        requestId: ctx.requestId,
        controlType: 'gain'
      }, ctx);
      
      const controls = parseToolResponse(result);
      console.log(`Found ${controls.length} gain controls`);
      
      if (Array.isArray(controls) && controls.length > 0) {
        console.log('First 3 gain controls:');
        controls.slice(0, 3).forEach(ctrl => {
          console.log(`  - ${ctrl.name || ctrl.Name}`);
        });
      }
    });
    
    // Test 5: query_core_status
    await runTest('Tool: query_core_status', async () => {
      const ctx = createContext('query_core_status');
      const result = await tools.query_core_status.execute({
        requestId: ctx.requestId
      }, ctx);
      
      const status = parseToolResponse(result);
      console.log('Core Status Summary:');
      console.log(`  Platform: ${status.Platform}`);
      console.log(`  Version: ${status.Version}`);
      console.log(`  Design: ${status.DesignName || 'N/A'}`);
      console.log(`  Status: ${status.Status?.Name || 'Unknown'} (Code: ${status.Status?.Code || 'N/A'})`);
      
      if (status.Status?.PercentCPU !== undefined) {
        console.log(`  CPU Usage: ${Math.floor(status.Status.PercentCPU)}%`);
      }
      
      if (status.IsConnected === false) {
        throw new Error('Core reports not connected');
      }
      
      if (status.Status?.Code && status.Status.Code !== 0) {
        console.warn(`⚠️  Core has non-zero status code: ${status.Status.Code}`);
      }
    });
    
    // Test 6: get_control_values
    await runTest('Tool: get_control_values', async () => {
      // First get some controls
      const listCtx = createContext('list_controls');
      const listResult = await tools.list_controls.execute({
        requestId: listCtx.requestId,
        controlType: 'gain'
      }, listCtx);
      
      const controls = parseToolResponse(listResult);
      
      if (!Array.isArray(controls) || controls.length === 0) {
        console.log('No gain controls available for testing');
        return;
      }
      
      // Test with first 3 controls
      const testControls = controls.slice(0, 3).map(c => c.name || c.Name);
      console.log(`Testing with controls: ${testControls.join(', ')}`);
      
      const ctx = createContext('get_control_values');
      const result = await tools.get_control_values.execute({
        requestId: ctx.requestId,
        controls: testControls
      }, ctx);
      
      const values = parseToolResponse(result);
      
      if (!Array.isArray(values)) {
        throw new Error('Invalid response format - expected array of values');
      }
      
      console.log('Control values:');
      values.forEach(val => {
        const position = val.position !== undefined ? val.position.toFixed(2) : 'N/A';
        console.log(`  - ${val.name}: ${val.value} (position: ${position})`);
      });
    });
    
    // Test 7: set_control_values
    await runTest('Tool: set_control_values (with ramp)', async () => {
      // Find a safe gain control to test
      const listCtx = createContext('list_controls');
      const listResult = await tools.list_controls.execute({
        requestId: listCtx.requestId,
        controlType: 'gain',
        includeMetadata: true
      }, listCtx);
      
      const controls = parseToolResponse(listResult);
      
      if (!Array.isArray(controls)) {
        throw new Error('Invalid response format - expected array of controls');
      }
      
      const testControl = controls.find(c => 
        c.metadata && 
        typeof c.metadata.Min === 'number' && 
        typeof c.metadata.Max === 'number'
      );
      
      if (!testControl) {
        console.log('No suitable gain control with metadata found for testing');
        console.log('Available controls:', controls.length);
        return;
      }
      
      const controlName = testControl.name || testControl.Name;
      console.log(`Using control: ${controlName}`);
      console.log(`Range: ${testControl.metadata.Min} to ${testControl.metadata.Max}`);
      
      // Get current value
      const getCtx = createContext('get_control_values');
      const currentResult = await tools.get_control_values.execute({
        requestId: getCtx.requestId,
        controls: [controlName]
      }, getCtx);
      
      const currentValues = parseToolResponse(currentResult);
      const currentValue = currentValues[0];
      console.log(`Current value: ${currentValue.value}`);
      
      // Set to midpoint with ramp
      const midpoint = (testControl.metadata.Min + testControl.metadata.Max) / 2;
      console.log(`Setting to midpoint (${midpoint}) with 0.5s ramp...`);
      
      const setCtx = createContext('set_control_values');
      const setResult = await tools.set_control_values.execute({
        requestId: setCtx.requestId,
        controls: [{
          name: controlName,
          value: midpoint,
          rampTime: 0.5
        }]
      }, setCtx);
      
      const setResponse = parseToolResponse(setResult);
      console.log(`Result: ${typeof setResponse === 'string' ? setResponse : 'Success'}`);
      
      // Wait for ramp and verify
      console.log('Waiting for ramp to complete...');
      await new Promise(resolve => setTimeout(resolve, 600));
      
      const verifyCtx = createContext('get_control_values');
      const verifyResult = await tools.get_control_values.execute({
        requestId: verifyCtx.requestId,
        controls: [controlName]
      }, verifyCtx);
      
      const newValues = parseToolResponse(verifyResult);
      const newValue = newValues[0];
      console.log(`New value after ramp: ${newValue.value}`);
      
      // Restore original value
      console.log(`Restoring original value (${currentValue.value})...`);
      const restoreCtx = createContext('set_control_values');
      await tools.set_control_values.execute({
        requestId: restoreCtx.requestId,
        controls: [{
          name: controlName,
          value: currentValue.value
        }]
      }, restoreCtx);
    });
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    failCount++;
  } finally {
    // Disconnect
    console.log('\n🔌 Disconnecting from Q-SYS Core...');
    try {
      await officialClient.disconnect();
      console.log('✅ Disconnected successfully');
    } catch (error) {
      console.error('⚠️  Error during disconnect:', error.message);
    }
    
    // Summary
    console.log(`\n${  '='.repeat(60)}`);
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total tests: ${testResults.length}`);
    console.log(`✅ Passed: ${passCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`Success rate: ${testResults.length > 0 ? ((passCount / testResults.length) * 100).toFixed(1) : 0}%`);
    
    console.log('\nDetailed Results:');
    testResults.forEach(result => {
      const icon = result.status === 'PASS' ? '✅' : '❌';
      const detail = result.status === 'PASS' 
        ? `(${result.duration}ms)` 
        : `- ${result.error}`;
      console.log(`${icon} ${result.name} ${detail}`);
    });
    
    if (failCount === 0) {
      console.log('\n🎉 All tests passed! MCP tools are working correctly.');
    } else {
      console.log('\n⚠️  Some tests failed. Please review the errors above.');
    }
    
    // Exit with appropriate code
    process.exit(failCount > 0 ? 1 : 0);
  }
}

// Run tests
console.log('Starting Comprehensive MCP Tools Live Test Suite...\n');
runAllTests().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});