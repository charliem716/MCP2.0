#!/usr/bin/env node

/**
 * Comprehensive Live MCP Tools Test Suite v2
 * Tests ALL MCP tools against a live Q-SYS Core with proper organization
 * 
 * Tools tested:
 * 1. list_components - List all components in the Q-SYS design
 * 2. get_component_controls - Get controls for a specific Q-SYS component
 * 3. list_controls - List all available controls in Q-SYS
 * 4. get_control_values - Get current values of specified Q-SYS controls
 * 5. set_control_values - Set values for specified Q-SYS controls
 * 6. query_core_status - Query Q-SYS Core system status
 * 7. send_raw_command - Send a raw QRC command to Q-SYS Core
 * 8. get_all_controls - Get all controls with detailed metadata and values
 * 9. query_qsys_api - Query Q-SYS Core API endpoints
 * 10. echo - Echo back the provided message
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
let skipCount = 0;

// Helper function to run a test
async function runTest(name, testFunc, options = {}) {
  const { skip = false, skipReason = '' } = options;
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log(`${'='.repeat(60)}`);
  
  if (skip) {
    console.log(`⚠️  SKIP: ${name}`);
    console.log(`   Reason: ${skipReason}`);
    testResults.push({ name, status: 'SKIP', reason: skipReason });
    skipCount++;
    return;
  }
  
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
  // Handle new ToolExecutionResult format
  if (result.executionTimeMs !== undefined) {
    // This is the new format with metadata
    if (result.isError) {
      throw new Error(result.content[0].text);
    }
    const text = result.content[0].text;
    
    // Try to parse as JSON
    try {
      return JSON.parse(text);
    } catch (e) {
      return text;
    }
  }
  
  // Handle legacy format
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
const { MCPToolRegistry } = await import('../../dist/src/mcp/handlers/index.js');

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
  console.log('🧪 Comprehensive Live MCP Tools Test Suite v2');
  console.log(`📍 Target: ${config.host}:${config.port}`);
  console.log(`📅 Date: ${new Date().toISOString()}`);
  console.log(`🔑 Using valid UUIDs for requestId`);
  console.log(`📊 Testing ALL 10 MCP tools`);
  
  try {
    // Connect to Q-SYS
    console.log('\n🔌 Connecting to Q-SYS Core...');
    await officialClient.connect();
    console.log('✅ Connected successfully');
    
    // Wait for initial data
    console.log('⏳ Waiting for initial data sync...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Create adapter and registry
    const adapter = new QRWCClientAdapter(officialClient);
    const registry = new MCPToolRegistry(adapter);
    await registry.initialize();
    
    console.log(`✅ Registry initialized with ${registry.getToolCount()} tools`);
    
    // List all available tools
    console.log('\n📋 Available MCP Tools:');
    const tools = await registry.listTools();
    tools.forEach((tool, index) => {
      console.log(`${index + 1}. ${tool.name}: ${tool.description}`);
    });
    
    // Test 1: list_components
    await runTest('Tool: list_components', async () => {
      const result = await registry.callTool('list_components', {
        includeProperties: true
      });
      
      const response = parseToolResponse(result);
      console.log(`Response type: ${typeof response}`);
      if (typeof response === 'string') {
        console.log('Raw response:', response.substring(0, 200) + '...');
      } else {
        console.log(`Found ${Array.isArray(response) ? response.length : 'N/A'} components`);
      }
    });
    
    // Test 2: qsys_component_get
    await runTest('Tool: qsys_component_get', async () => {
      // First get a component
      const listResult = await registry.callTool('list_components', {});
      const listResponse = parseToolResponse(listResult);
      
      let componentName;
      if (typeof listResponse === 'string') {
        // Parse from string format
        const match = listResponse.match(/• ([^(]+) \(/);
        componentName = match ? match[1].trim() : null;
      } else if (Array.isArray(listResponse) && listResponse.length > 0) {
        componentName = listResponse[0].Name;
      }
      
      if (!componentName) {
        throw new Error('No components found to test with');
      }
      
      console.log(`Testing with component: ${componentName}`);
      
      const result = await registry.callTool('qsys_component_get', {
        component: componentName,
        controls: ['gain', 'mute']  // Try common control names
      });
      
      const response = parseToolResponse(result);
      console.log('Component controls retrieved successfully');
      if (typeof response === 'string') {
        console.log(response.substring(0, 200) + '...');
      }
    });
    
    // Test 3: list_controls
    await runTest('Tool: list_controls', async () => {
      const result = await registry.callTool('list_controls', {
        controlType: 'all',
        includeMetadata: true
      });
      
      const response = parseToolResponse(result);
      console.log(`Response type: ${typeof response}`);
      if (Array.isArray(response)) {
        console.log(`Found ${response.length} controls`);
        
        // Count by type
        const typeCount = {};
        response.forEach(ctrl => {
          const type = ctrl.type || ctrl.Type || 'unknown';
          typeCount[type] = (typeCount[type] || 0) + 1;
        });
        console.log('Control types:', JSON.stringify(typeCount, null, 2));
      } else {
        console.log('Controls listed successfully');
      }
    });
    
    // Test 4: get_control_values
    await runTest('Tool: get_control_values', async () => {
      // Get some controls first
      const listResult = await registry.callTool('list_controls', {
        controlType: 'gain'
      });
      
      const listResponse = parseToolResponse(listResult);
      let controlNames = [];
      
      if (Array.isArray(listResponse) && listResponse.length > 0) {
        controlNames = listResponse.slice(0, 3).map(c => c.name || c.Name);
      } else if (typeof listResponse === 'string') {
        // Try to parse from string
        const matches = listResponse.match(/• ([^:]+):/g);
        if (matches) {
          controlNames = matches.slice(0, 3).map(m => m.replace(/[•:]/g, '').trim());
        }
      }
      
      if (controlNames.length === 0) {
        throw new Error('No controls found to test with');
      }
      
      console.log(`Testing with controls: ${controlNames.join(', ')}`);
      
      const result = await registry.callTool('get_control_values', {
        controls: controlNames
      });
      
      const response = parseToolResponse(result);
      console.log('Control values retrieved successfully');
      if (Array.isArray(response)) {
        response.forEach(val => {
          console.log(`  - ${val.name}: ${val.value}`);
        });
      }
    });
    
    // Test 5: set_control_values
    await runTest('Tool: set_control_values', async () => {
      // Find a safe control to test - look for a test or unused control
      const listResult = await registry.callTool('list_controls', {
        controlType: 'gain'
      });
      
      const listResponse = parseToolResponse(listResult);
      let testControlName = null;
      
      // Look for a control that might be safe to test (e.g., contains "test" or "unused")
      if (Array.isArray(listResponse)) {
        const safeControl = listResponse.find(c => {
          const name = (c.name || c.Name || '').toLowerCase();
          return name.includes('test') || name.includes('unused') || name.includes('spare');
        });
        
        if (safeControl) {
          testControlName = safeControl.name || safeControl.Name;
        }
      }
      
      if (!testControlName) {
        // No safe control found, create a minimal test
        console.log('No test control found, using minimal value change test');
        
        // Get the first gain control
        if (Array.isArray(listResponse) && listResponse.length > 0) {
          testControlName = listResponse[0].name || listResponse[0].Name;
          
          // Get current value
          const getResult = await registry.callTool('get_control_values', {
            controls: [testControlName]
          });
          const currentValues = parseToolResponse(getResult);
          
          // Extract the actual numeric value
          let currentValue;
          if (Array.isArray(currentValues) && currentValues.length > 0) {
            const controlData = currentValues[0];
            // Handle different response formats
            if (typeof controlData.value === 'number') {
              currentValue = controlData.value;
            } else if (controlData.value && typeof controlData.value.Value === 'number') {
              currentValue = controlData.value.Value;
            } else if (typeof controlData.Value === 'number') {
              currentValue = controlData.Value;
            } else {
              // Default to 0 for gain controls
              currentValue = 0;
              console.log('Could not extract current value, using default 0');
            }
          }
          
          // Set to same value (no actual change)
          const result = await registry.callTool('set_control_values', {
            controls: [{
              name: testControlName,
              value: currentValue  // Same value - no change
            }]
          });
          
          const response = parseToolResponse(result);
          console.log('Set control to same value (no-op test)');
          console.log(`Control: ${testControlName}`);
          console.log(`Value: ${currentValue} (unchanged)`);
          return;
        }
      }
      
      throw new Error('No controls available for safe testing');
    });
    
    // Test 6: query_core_status
    await runTest('Tool: query_core_status', async () => {
      const result = await registry.callTool('query_core_status', {
        includeDetails: true,
        includeNetworkInfo: true,
        includePerformance: true
      });
      
      const response = parseToolResponse(result);
      if (typeof response === 'object') {
        console.log('Core Status:');
        console.log(`  Platform: ${response.Platform || 'N/A'}`);
        console.log(`  Version: ${response.Version || 'N/A'}`);
        console.log(`  Design: ${response.DesignName || 'N/A'}`);
        console.log(`  Status: ${response.Status?.Name || 'Unknown'}`);
        if (response.Status?.PercentCPU !== undefined) {
          console.log(`  CPU: ${response.Status.PercentCPU}%`);
        }
      } else {
        console.log('Status retrieved successfully');
      }
    });
    
    // Test 7: send_raw_command
    await runTest('Tool: send_raw_command', async () => {
      // Use the correct camelCase format that Q-SYS expects
      const result = await registry.callTool('send_raw_command', {
        method: 'StatusGet',  // Use camelCase, not dot notation
        params: {},
        timeout: 5000
      });
      
      const response = parseToolResponse(result);
      console.log('Raw command executed successfully');
      console.log(`Response type: ${typeof response}`);
      
      if (response && response.response) {
        console.log('Status received:');
        console.log(`  Platform: ${response.response.Platform || 'N/A'}`);
        console.log(`  State: ${response.response.State || 'N/A'}`);
        console.log(`  Design: ${response.response.DesignName || 'N/A'}`);
      }
    });
    
    // Test 8: qsys_get_all_controls
    await runTest('Tool: qsys_get_all_controls', async () => {
      const result = await registry.callTool('qsys_get_all_controls', {
        limit: 5,
        offset: 0,
        includeValues: true,
        includeMetadata: true
      });
      
      const response = parseToolResponse(result);
      console.log('All controls retrieved with pagination');
      if (typeof response === 'object' && response.controls) {
        console.log(`Total controls: ${response.total || 'N/A'}`);
        console.log(`Retrieved: ${response.controls.length} controls`);
      } else {
        console.log('Response received successfully');
      }
    });
    
    // Test 9: query_qsys_api
    await runTest('Tool: query_qsys_api', async () => {
      const result = await registry.callTool('query_qsys_api', {
        query_type: 'methods',  // Query available API methods
        search: 'Status'  // Search for status-related methods
      });
      
      const response = parseToolResponse(result);
      console.log('API query executed successfully');
      console.log(`Response type: ${typeof response}`);
      if (response && typeof response === 'object') {
        console.log('API response received');
      }
    });
    
    // Test 10: echo
    await runTest('Tool: echo', async () => {
      const testMessage = 'Hello from MCP Tools Test v2!';
      const result = await registry.callTool('echo', {
        message: testMessage
      });
      
      const response = parseToolResponse(result);
      if (response !== `Echo: ${testMessage}`) {
        throw new Error(`Unexpected echo response: ${response}`);
      }
      console.log('Echo test successful:', response);
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
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total tests: ${testResults.length}`);
    console.log(`✅ Passed: ${passCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`⚠️  Skipped: ${skipCount}`);
    console.log(`Success rate: ${testResults.length > 0 ? ((passCount / (testResults.length - skipCount)) * 100).toFixed(1) : 0}%`);
    
    console.log('\nDetailed Results:');
    testResults.forEach(result => {
      const icon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';
      const detail = result.status === 'PASS' 
        ? `(${result.duration}ms)` 
        : result.status === 'FAIL'
        ? `- ${result.error}`
        : `- ${result.reason}`;
      console.log(`${icon} ${result.name} ${detail}`);
    });
    
    if (failCount === 0 && skipCount < testResults.length) {
      console.log('\n🎉 All active tests passed! MCP tools are working correctly.');
    } else if (failCount > 0) {
      console.log('\n⚠️  Some tests failed. Please review the errors above.');
    }
    
    // Exit with appropriate code
    process.exit(failCount > 0 ? 1 : 0);
  }
}

// Run tests
console.log('Starting Comprehensive MCP Tools Live Test Suite v2...\n');
runAllTests().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});