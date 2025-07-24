#!/usr/bin/env node

/**
 * Live MCP Tools Test Suite
 * Tests all MCP tools against a live Q-SYS Core
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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

// Load configuration
const configPath = join(__dirname, '../../qsys-core.config.json');
let config;
try {
  const configData = JSON.parse(readFileSync(configPath, 'utf8'));
  config = configData.qsysCore; // Extract the qsysCore section
} catch (error) {
  console.error('Failed to load qsys-core.config.json:', error.message);
  console.error('Please run ./setup-env.sh first');
  process.exit(1);
}

// Import modules
const { OfficialQRWCClient } = await import(
  '../../dist/src/qrwc/officialClient.js'
);
const { QRWCClientAdapter } = await import(
  '../../dist/src/mcp/qrwc/adapter.js'
);

// Import individual tools
const { createListComponentsTool } = await import(
  '../../dist/src/mcp/tools/components.js'
);
const {
  createListControlsTool,
  createGetControlValuesTool,
  createSetControlValuesTool,
} = await import('../../dist/src/mcp/tools/controls.js');
const { createQueryCoreStatusTool } = await import(
  '../../dist/src/mcp/tools/status.js'
);

// Create official client and adapter
const officialClient = new OfficialQRWCClient({
  host: config.host,
  port: config.port,
  pollingInterval: config.connectionSettings?.pollingInterval || 350,
  reconnectInterval: config.connectionSettings?.reconnectInterval || 5000,
  maxReconnectAttempts: config.connectionSettings?.maxReconnectAttempts || 5,
  connectionTimeout: config.connectionSettings?.timeout || 10000,
  enableAutoReconnect: config.connectionSettings?.enableAutoReconnect || true,
});

// Import crypto for UUID generation
import { randomUUID } from 'crypto';

// Helper to create test context
const createContext = toolName => ({
  requestId: randomUUID(),
  toolName,
  startTime: Date.now(),
});

// Main test suite
async function runAllTests() {
  console.log('🧪 Live MCP Tools Test Suite');
  console.log(`📍 Target: ${config.host}:${config.port}`);
  console.log(`📅 Date: ${new Date().toISOString()}`);

  try {
    // Connect to Q-SYS
    console.log('\n🔌 Connecting to Q-SYS Core...');
    await officialClient.connect();
    console.log('✅ Connected successfully');

    // Wait for initial data
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Create adapter with connected client
    const adapter = new QRWCClientAdapter(officialClient);

    // Create tool instances
    const tools = {
      list_components: createListComponentsTool(adapter),
      list_controls: createListControlsTool(adapter),
      get_control_values: createGetControlValuesTool(adapter),
      set_control_values: createSetControlValuesTool(adapter),
      query_core_status: createQueryCoreStatusTool(adapter),
    };

    // Test 1: list_components
    await runTest('Tool: list_components (no filter)', async () => {
      const result = await tools.list_components.execute(
        {
          requestId: createContext('list_components').requestId,
        },
        createContext('list_components')
      );

      // Check if this is an error response
      if (result.isError || result.content[0].text.includes('failed:')) {
        throw new Error(result.content[0].text);
      }

      const components = JSON.parse(result.content[0].text);
      console.log(`Found ${components.length} components`);
      if (components.length === 0) throw new Error('No components found');

      // Display first 3 components
      console.log('Sample components:');
      components.slice(0, 3).forEach(comp => {
        console.log(`  - ${comp.Name} (Type: ${comp.Type || 'Unknown'})`);
      });
    });

    // Test 2: list_components with filter
    await runTest('Tool: list_components (with filter "Gain")', async () => {
      const result = await tools.list_components.execute(
        {
          requestId: createContext('list_components').requestId,
          nameFilter: 'Gain',
          includeProperties: true,
        },
        createContext('list_components')
      );

      const components = JSON.parse(result.content[0].text);
      console.log(`Found ${components.length} components matching 'Gain'`);

      if (components.length > 0) {
        console.log(`First match: ${components[0].Name}`);
      }
    });

    // Test 3: list_controls
    await runTest('Tool: list_controls (all types)', async () => {
      const result = await tools.list_controls.execute(
        {
          requestId: createContext('list_controls').requestId,
          controlType: 'all',
          includeMetadata: true,
        },
        createContext('list_controls')
      );

      const controls = JSON.parse(result.content[0].text);
      console.log(`Found ${controls.length} controls total`);

      // Count by type
      const typeCount = {};
      controls.forEach(ctrl => {
        const type = ctrl.type || 'unknown';
        typeCount[type] = (typeCount[type] || 0) + 1;
      });
      console.log('Control type breakdown:', typeCount);
    });

    // Test 4: list_controls (gain type only)
    await runTest('Tool: list_controls (gain controls)', async () => {
      const result = await tools.list_controls.execute(
        {
          requestId: createContext('list_controls').requestId,
          controlType: 'gain',
        },
        createContext('list_controls')
      );

      const controls = JSON.parse(result.content[0].text);
      console.log(`Found ${controls.length} gain controls`);

      if (controls.length > 0) {
        console.log('First 3 gain controls:');
        controls.slice(0, 3).forEach(ctrl => {
          console.log(`  - ${ctrl.name}`);
        });
      }
    });

    // Test 5: query_core_status
    await runTest('Tool: query_core_status', async () => {
      const result = await tools.query_core_status.execute(
        {
          requestId: createContext('query_core_status').requestId,
        },
        createContext('query_core_status')
      );

      const status = JSON.parse(result.content[0].text);
      console.log('Core Status Summary:');
      console.log(`  Platform: ${status.Platform}`);
      console.log(`  Version: ${status.Version}`);
      console.log(`  Design: ${status.DesignName}`);
      console.log(
        `  Status: ${status.Status.Name} (Code: ${status.Status.Code})`
      );
      console.log(`  CPU Usage: ${Math.floor(status.Status.PercentCPU)}%`);

      if (!status.IsConnected) throw new Error('Core reports not connected');
      if (status.Status.Code !== 0)
        throw new Error(`Core has error status: ${status.Status.Code}`);
    });

    // Test 6: get_control_values
    await runTest('Tool: get_control_values', async () => {
      // First get some controls
      const listResult = await tools.list_controls.execute(
        {
          requestId: createContext('list_controls').requestId,
          controlType: 'gain',
        },
        createContext('list_controls')
      );

      const controls = JSON.parse(listResult.content[0].text);
      if (controls.length === 0) {
        console.log('No gain controls available for testing');
        return;
      }

      // Test with first 3 controls
      const testControls = controls.slice(0, 3).map(c => c.name);
      console.log(`Testing with controls: ${testControls.join(', ')}`);

      const result = await tools.get_control_values.execute(
        {
          requestId: createContext('get_control_values').requestId,
          controls: testControls,
        },
        createContext('get_control_values')
      );

      const values = JSON.parse(result.content[0].text);
      console.log('Control values:');
      values.forEach(val => {
        console.log(
          `  - ${val.name}: ${val.value} (position: ${val.position?.toFixed(2) || 'N/A'})`
        );
      });
    });

    // Test 7: set_control_values
    await runTest('Tool: set_control_values (with ramp)', async () => {
      // Find a safe gain control to test
      const listResult = await tools.list_controls.execute(
        {
          requestId: createContext('list_controls').requestId,
          controlType: 'gain',
          includeMetadata: true,
        },
        createContext('list_controls')
      );

      const controls = JSON.parse(listResult.content[0].text);
      const testControl = controls.find(
        c =>
          c.metadata &&
          typeof c.metadata.Min === 'number' &&
          typeof c.metadata.Max === 'number'
      );

      if (!testControl) {
        console.log('No suitable gain control found for testing');
        return;
      }

      console.log(`Using control: ${testControl.name}`);
      console.log(
        `Range: ${testControl.metadata.Min} to ${testControl.metadata.Max}`
      );

      // Get current value
      const currentResult = await tools.get_control_values.execute(
        {
          requestId: createContext('get_control_values').requestId,
          controls: [testControl.name],
        },
        createContext('get_control_values')
      );

      const currentValue = JSON.parse(currentResult.content[0].text)[0];
      console.log(`Current value: ${currentValue.value}`);

      // Set to midpoint with ramp
      const midpoint =
        (testControl.metadata.Min + testControl.metadata.Max) / 2;
      console.log(`Setting to midpoint (${midpoint}) with 0.5s ramp...`);

      const setResult = await tools.set_control_values.execute(
        {
          requestId: createContext('set_control_values').requestId,
          controls: [
            {
              name: testControl.name,
              value: midpoint,
              rampTime: 0.5,
            },
          ],
        },
        createContext('set_control_values')
      );

      console.log(`Result: ${setResult.content[0].text}`);

      // Wait for ramp and verify
      await new Promise(resolve => setTimeout(resolve, 600));

      const verifyResult = await tools.get_control_values.execute(
        {
          requestId: createContext('get_control_values').requestId,
          controls: [testControl.name],
        },
        createContext('get_control_values')
      );

      const newValue = JSON.parse(verifyResult.content[0].text)[0];
      console.log(`New value after ramp: ${newValue.value}`);

      // Restore original
      console.log(`Restoring original value (${currentValue.value})...`);
      await tools.set_control_values.execute(
        {
          requestId: createContext('set_control_values').requestId,
          controls: [
            {
              name: testControl.name,
              value: currentValue.value,
            },
          ],
        },
        createContext('set_control_values')
      );
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
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total tests: ${testResults.length}`);
    console.log(`✅ Passed: ${passCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(
      `Success rate: ${testResults.length > 0 ? ((passCount / testResults.length) * 100).toFixed(1) : 0}%`
    );

    console.log('\nDetailed Results:');
    testResults.forEach(result => {
      const icon = result.status === 'PASS' ? '✅' : '❌';
      const detail =
        result.status === 'PASS'
          ? `(${result.duration}ms)`
          : `- ${result.error}`;
      console.log(`${icon} ${result.name} ${detail}`);
    });

    // Exit with appropriate code
    process.exit(failCount > 0 ? 1 : 0);
  }
}

// Run tests
console.log('Starting MCP Tools Live Test Suite...\n');
runAllTests().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
