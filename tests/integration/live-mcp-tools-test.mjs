#!/usr/bin/env node

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { config } from 'dotenv';

// Load environment variables
config();

const require = createRequire(import.meta.url);
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
    if (error.stack) {
      console.error(error.stack);
    }
    testResults.push({ name, status: 'FAIL', error: error.message });
    failCount++;
  }
}

// Load configuration
const configPath = join(__dirname, '../../qsys-core.config.json');
let qsysConfig;
try {
  qsysConfig = JSON.parse(readFileSync(configPath, 'utf8'));
} catch (error) {
  console.error('Failed to load qsys-core.config.json:', error.message);
  console.error('Please run ./setup-env.sh first');
  process.exit(1);
}

// Dynamic imports to avoid module resolution issues
let QRWCClientAdapter, MCPHandlers, Repository, winston;

async function loadModules() {
  try {
    // Load built modules
    const adapterModule = await import('../../dist/src/mcp/qrwc/adapter.js');
    const handlersModule = await import('../../dist/src/mcp/handlers/index.js');
    const repositoryModule = await import('../../dist/src/mcp/state/repository.js');
    const loggerModule = await import('../../dist/src/shared/utils/logger.js');
    
    QRWCClientAdapter = adapterModule.QRWCClientAdapter;
    MCPHandlers = handlersModule.MCPHandlers;
    Repository = repositoryModule.Repository;
    winston = loggerModule.logger;
    
    console.log('✅ Modules loaded successfully');
  } catch (error) {
    console.error('Failed to load modules:', error.message);
    process.exit(1);
  }
}

// Main test suite
async function runAllTests() {
  console.log('🧪 Live MCP Tools Test Suite');
  console.log(`📍 Target: ${qsysConfig.host}:${qsysConfig.port}`);
  console.log(`📅 Date: ${new Date().toISOString()}`);
  
  // Load modules first
  await loadModules();
  
  // Initialize components
  const adapter = new QRWCClientAdapter();
  const handlers = new MCPHandlers();
  
  // Connect adapter
  console.log('\n🔌 Connecting to Q-SYS Core...');
  try {
    await adapter.connect(qsysConfig.host, qsysConfig.port, {
      username: qsysConfig.username,
      password: qsysConfig.password
    });
    console.log('✅ Connected successfully');
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    process.exit(1);
  }
  
  // Wait for initial data
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Initialize handlers with adapter
  await handlers.initialize(adapter);
  
  // Test context
  const createContext = (toolName) => ({
    requestId: `live-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    toolName,
    startTime: Date.now()
  });
  
  try {
    // Test 1: list_components
    await runTest('list_components - No filter', async () => {
      const result = await handlers.handleToolCall({
        name: 'list_components',
        arguments: {}
      });
      
      const components = JSON.parse(result.content[0].text);
      console.log(`Found ${components.length} components`);
      if (components.length === 0) throw new Error('No components found');
      
      // Display first 3 components
      console.log('Sample components:');
      components.slice(0, 3).forEach(comp => {
        console.log(`  - ${comp.Name} (Type: ${comp.Type})`);
      });
    });
    
    // Test 2: list_components with filter
    await runTest('list_components - With filter', async () => {
      const result = await handlers.handleToolCall({
        name: 'list_components',
        arguments: {
          nameFilter: 'Gain',
          includeProperties: true
        }
      });
      
      const components = JSON.parse(result.content[0].text);
      console.log(`Found ${components.length} components matching 'Gain'`);
      
      if (components.length > 0) {
        console.log(`First match: ${components[0].Name}`);
        if (components[0].Properties) {
          console.log(`Properties: ${JSON.stringify(components[0].Properties, null, 2)}`);
        }
      }
    });
    
    // Test 3: list_controls - All types
    await runTest('list_controls - All types', async () => {
      const result = await handlers.handleToolCall({
        name: 'list_controls',
        arguments: {
          controlType: 'all',
          includeMetadata: true
        }
      });
      
      const controls = JSON.parse(result.content[0].text);
      console.log(`Found ${controls.length} controls total`);
      
      // Count by type
      const typeCount = {};
      controls.forEach(ctrl => {
        const type = ctrl.Type || 'unknown';
        typeCount[type] = (typeCount[type] || 0) + 1;
      });
      console.log('Control types:', typeCount);
      
      // Show sample control with metadata
      const sampleControl = controls.find(c => c.metadata);
      if (sampleControl) {
        console.log(`Sample control: ${sampleControl.name}`);
        console.log(`Metadata: ${JSON.stringify(sampleControl.metadata, null, 2)}`);
      }
    });
    
    // Test 4: list_controls - Specific type
    await runTest('list_controls - Gain controls only', async () => {
      const result = await handlers.handleToolCall({
        name: 'list_controls',
        arguments: {
          controlType: 'gain'
        }
      });
      
      const controls = JSON.parse(result.content[0].text);
      console.log(`Found ${controls.length} gain controls`);
      
      if (controls.length > 0) {
        console.log('Sample gain controls:');
        controls.slice(0, 3).forEach(ctrl => {
          console.log(`  - ${ctrl.name} (Component: ${ctrl.component || 'N/A'})`);
        });
      }
    });
    
    // Test 5: query_core_status
    await runTest('query_core_status', async () => {
      const result = await handlers.handleToolCall({
        name: 'query_core_status',
        arguments: {}
      });
      
      const status = JSON.parse(result.content[0].text);
      console.log('Core Status:');
      console.log(`  Platform: ${status.Platform}`);
      console.log(`  Version: ${status.Version}`);
      console.log(`  Design: ${status.DesignName} (${status.DesignCode})`);
      console.log(`  Status: ${status.Status.Name} (Code: ${status.Status.Code})`);
      console.log(`  CPU Usage: ${Math.floor(status.Status.PercentCPU)}%`);
      
      if (!status.IsConnected) throw new Error('Core reports not connected');
      if (status.Status.Code !== 0) throw new Error(`Core status code: ${status.Status.Code}`);
    });
    
    // Test 6: get_control_values
    await runTest('get_control_values', async () => {
      // First, get some control names
      const listResult = await handlers.handleToolCall({
        name: 'list_controls',
        arguments: {
          controlType: 'gain'
        }
      });
      
      const controls = JSON.parse(listResult.content[0].text);
      if (controls.length === 0) {
        console.log('No gain controls found to test');
        return;
      }
      
      // Get values for first 3 controls
      const testControls = controls.slice(0, 3).map(c => c.name);
      console.log(`Getting values for: ${testControls.join(', ')}`);
      
      const result = await handlers.handleToolCall({
        name: 'get_control_values',
        arguments: {
          controls: testControls
        }
      });
      
      const values = JSON.parse(result.content[0].text);
      console.log('Control values:');
      values.forEach(val => {
        console.log(`  - ${val.name}: ${val.value} (Position: ${val.position?.toFixed(2) || 'N/A'})`);
      });
    });
    
    // Test 7: set_control_values
    await runTest('set_control_values', async () => {
      // Find a safe control to test (preferably a gain)
      const listResult = await handlers.handleToolCall({
        name: 'list_controls',
        arguments: {
          controlType: 'gain',
          includeMetadata: true
        }
      });
      
      const controls = JSON.parse(listResult.content[0].text);
      const testControl = controls.find(c => 
        c.metadata && 
        typeof c.metadata.Min === 'number' && 
        typeof c.metadata.Max === 'number'
      );
      
      if (!testControl) {
        console.log('No suitable gain control found for testing');
        return;
      }
      
      console.log(`Testing with control: ${testControl.name}`);
      console.log(`Range: ${testControl.metadata.Min} to ${testControl.metadata.Max}`);
      
      // Get current value
      const currentResult = await handlers.handleToolCall({
        name: 'get_control_values',
        arguments: {
          controls: [testControl.name]
        }
      });
      
      const currentValue = JSON.parse(currentResult.content[0].text)[0];
      console.log(`Current value: ${currentValue.value}`);
      
      // Set to midpoint
      const midpoint = (testControl.metadata.Min + testControl.metadata.Max) / 2;
      console.log(`Setting to midpoint: ${midpoint}`);
      
      const result = await handlers.handleToolCall({
        name: 'set_control_values',
        arguments: {
          controls: [{
            name: testControl.name,
            value: midpoint,
            rampTime: 0.5
          }]
        }
      });
      
      console.log('Set result:', result.content[0].text);
      
      // Verify change
      await new Promise(resolve => setTimeout(resolve, 600));
      const verifyResult = await handlers.handleToolCall({
        name: 'get_control_values',
        arguments: {
          controls: [testControl.name]
        }
      });
      
      const newValue = JSON.parse(verifyResult.content[0].text)[0];
      console.log(`New value: ${newValue.value}`);
      
      // Restore original value
      console.log(`Restoring original value: ${currentValue.value}`);
      await handlers.handleToolCall({
        name: 'set_control_values',
        arguments: {
          controls: [{
            name: testControl.name,
            value: currentValue.value
          }]
        }
      });
    });
    
  } catch (error) {
    console.error('\n❌ Fatal test error:', error.message);
    failCount++;
  } finally {
    // Disconnect
    console.log('\n🔌 Disconnecting from Q-SYS Core...');
    await adapter.disconnect();
    
    // Summary
    console.log(`\n${  '='.repeat(60)}`);
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total tests: ${testResults.length}`);
    console.log(`✅ Passed: ${passCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`Success rate: ${((passCount / testResults.length) * 100).toFixed(1)}%`);
    
    console.log('\nDetailed Results:');
    testResults.forEach(result => {
      const icon = result.status === 'PASS' ? '✅' : '❌';
      const detail = result.status === 'PASS' 
        ? `(${result.duration}ms)` 
        : `- ${result.error}`;
      console.log(`${icon} ${result.name} ${detail}`);
    });
    
    // Exit with appropriate code
    process.exit(failCount > 0 ? 1 : 0);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});