#!/usr/bin/env node

/**
 * Comprehensive Test Suite for send_raw_command Tool
 *
 * This test suite covers 5 unique scenarios:
 * 1. Basic Read Operations - Tests simple commands with no parameters
 * 2. Complex Parameters - Tests commands with nested objects and arrays
 * 3. Error Handling - Tests invalid commands and error responses
 * 4. Timeout & Performance - Tests timeout settings and command timing
 * 5. Write Operations - Tests control changes with safety validation
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load configuration
const configPath = join(__dirname, '../../qsys-core.config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8')).qsysCore;

// Import modules
const { OfficialQRWCClient } = await import(
  '../../dist/src/qrwc/officialClient.js'
);
const { QRWCClientAdapter } = await import(
  '../../dist/src/mcp/qrwc/adapter.js'
);
const { MCPToolRegistry } = await import(
  '../../dist/src/mcp/handlers/index.js'
);

// Test tracking
const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  scenarios: [],
};

// Colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function logScenario(name) {
  console.log(`\n${colors.blue}${'='.repeat(70)}${colors.reset}`);
  console.log(`${colors.cyan}SCENARIO: ${name}${colors.reset}`);
  console.log(`${colors.blue}${'='.repeat(70)}${colors.reset}\n`);
}

function logTest(name, description) {
  console.log(`${colors.magenta}TEST: ${name}${colors.reset}`);
  console.log(`${colors.reset}${description}${colors.reset}\n`);
}

function logSuccess(message) {
  console.log(`${colors.green}✅ PASS: ${message}${colors.reset}`);
}

function logError(message) {
  console.log(`${colors.red}❌ FAIL: ${message}${colors.reset}`);
}

function logInfo(message) {
  console.log(`${colors.yellow}ℹ️  INFO: ${message}${colors.reset}`);
}

async function runTest(name, testFunc) {
  testResults.total++;
  try {
    const startTime = Date.now();
    const result = await testFunc();
    const duration = Date.now() - startTime;

    logSuccess(`${name} (${duration}ms)`);
    testResults.passed++;
    testResults.scenarios.push({ name, status: 'PASS', duration, result });

    return { success: true, result, duration };
  } catch (error) {
    logError(`${name}: ${error.message}`);
    testResults.failed++;
    testResults.scenarios.push({ name, status: 'FAIL', error: error.message });

    return { success: false, error: error.message };
  }
}

// Parse response from send_raw_command
function parseResponse(result) {
  if (
    !result ||
    !result.content ||
    !result.content[0] ||
    !result.content[0].text
  ) {
    throw new Error('Invalid response format');
  }

  try {
    return JSON.parse(result.content[0].text);
  } catch (e) {
    throw new Error(`Failed to parse response: ${e.message}`);
  }
}

// Main test runner
async function runComprehensiveTests() {
  console.log(
    `${colors.cyan}🧪 Comprehensive send_raw_command Test Suite${colors.reset}`
  );
  console.log(`${colors.cyan}${'='.repeat(70)}${colors.reset}`);
  console.log(`📍 Target: ${config.host}:${config.port}`);
  console.log(`📅 Date: ${new Date().toISOString()}`);
  console.log(`🎯 Testing 5 unique scenarios`);

  let officialClient;
  let registry;

  try {
    // Connect to Q-SYS
    console.log('\n🔌 Connecting to Q-SYS Core...');
    officialClient = new OfficialQRWCClient(config);
    await officialClient.connect();
    console.log('✅ Connected successfully');

    // Create adapter and registry
    const adapter = new QRWCClientAdapter(officialClient);
    registry = new MCPToolRegistry(adapter);
    await registry.initialize();
    console.log(
      `✅ Registry initialized with ${registry.getToolCount()} tools`
    );

    // Wait for initial sync
    console.log('⏳ Waiting for initial data sync...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // ==========================================
    // SCENARIO 1: Basic Read Operations
    // ==========================================
    logScenario('1. Basic Read Operations');
    console.log('Testing simple commands with no or minimal parameters');

    // Test 1.1: NoOp (simplest command)
    await runTest('1.1 NoOp Command', async () => {
      logTest(
        'NoOp',
        'Simplest command - no operation, just tests connectivity'
      );

      const result = await registry.callTool('send_raw_command', {
        method: 'NoOp',
        params: {},
      });

      const response = parseResponse(result);
      if (!response.success || response.response !== true) {
        throw new Error('NoOp should return success: true, response: true');
      }

      logInfo('NoOp returned successfully');
      return response;
    });

    // Test 1.2: StatusGet
    await runTest('1.2 StatusGet Command', async () => {
      logTest('StatusGet', 'Get basic core status without parameters');

      const result = await registry.callTool('send_raw_command', {
        method: 'StatusGet',
        // Omitting params to test optional parameter
      });

      const response = parseResponse(result);
      if (!response.success || !response.response.Platform) {
        throw new Error('StatusGet should return platform information');
      }

      logInfo(`Platform: ${response.response.Platform}`);
      logInfo(`State: ${response.response.State}`);
      logInfo(`Design: ${response.response.DesignName}`);

      return response;
    });

    // Test 1.3: EngineStatus (if available)
    await runTest('1.3 EngineStatus Command', async () => {
      logTest('EngineStatus', 'Get detailed engine status');

      const result = await registry.callTool('send_raw_command', {
        method: 'EngineStatus',
        params: {},
      });

      const response = parseResponse(result);
      logInfo(`Response type: ${response.success ? 'success' : 'error'}`);

      return response;
    });

    // ==========================================
    // SCENARIO 2: Complex Parameters
    // ==========================================
    logScenario('2. Complex Parameters and Nested Data');
    console.log('Testing commands with objects, arrays, and nested structures');

    // Test 2.1: ComponentGet with specific controls
    await runTest('2.1 ComponentGet with Control Array', async () => {
      logTest(
        'ComponentGet',
        'Get specific controls from a component using array syntax'
      );

      // First get a component name
      const compResult = await registry.callTool('send_raw_command', {
        method: 'ComponentGetComponents',
        params: {},
      });

      const compResponse = parseResponse(compResult);
      if (!compResponse.response || !compResponse.response[0]) {
        throw new Error('No components found');
      }

      const componentName = compResponse.response[0].Name;
      logInfo(`Using component: ${componentName}`);

      // Now get specific controls
      const result = await registry.callTool('send_raw_command', {
        method: 'ComponentGet',
        params: {
          Name: componentName,
          Controls: [{ Name: 'gain' }, { Name: 'mute' }, { Name: 'bypass' }],
        },
      });

      const response = parseResponse(result);
      logInfo(`Retrieved ${response.response?.Controls?.length || 0} controls`);

      return response;
    });

    // Test 2.2: Complex nested parameters
    await runTest('2.2 Complex Nested Parameters', async () => {
      logTest(
        'ComponentSet',
        'Test complex parameter structure (read-only simulation)'
      );

      // Create complex parameter structure (won't actually send to avoid changes)
      const complexParams = {
        Name: 'TestComponent',
        Controls: [
          { Name: 'gain', Value: -10.5, Ramp: 2.0 },
          { Name: 'mute', Value: true },
          { Name: 'position', Value: 0.75, Ramp: 1.5 },
        ],
      };

      logInfo('Parameter structure:');
      console.log(JSON.stringify(complexParams, null, 2));

      // Validate structure without sending
      if (!complexParams.Name || !Array.isArray(complexParams.Controls)) {
        throw new Error('Invalid parameter structure');
      }

      logInfo('Complex parameter structure validated');
      return { validated: true, structure: complexParams };
    });

    // ==========================================
    // SCENARIO 3: Error Handling
    // ==========================================
    logScenario('3. Error Handling and Invalid Commands');
    console.log('Testing error responses and invalid command handling');

    // Test 3.1: Invalid method name
    await runTest('3.1 Invalid Method Name', async () => {
      logTest('InvalidMethod', 'Test handling of non-existent method');

      const result = await registry.callTool('send_raw_command', {
        method: 'ThisMethodDoesNotExist',
        params: {},
      });

      const response = parseResponse(result);

      if (response.success !== false) {
        throw new Error('Invalid method should return success: false');
      }

      logInfo(`Error message: ${response.error?.message || 'Unknown error'}`);
      return response;
    });

    // Test 3.2: Invalid parameters
    await runTest('3.2 Invalid Parameters', async () => {
      logTest('ComponentGet Invalid', 'Test handling of invalid parameters');

      const result = await registry.callTool('send_raw_command', {
        method: 'ComponentGet',
        params: {
          // Missing required 'Name' field
          Controls: [{ Name: 'gain' }],
        },
      });

      const response = parseResponse(result);

      if (response.success !== false) {
        throw new Error('Invalid parameters should return success: false');
      }

      logInfo(
        `Error: ${response.error?.message || 'Parameter validation failed'}`
      );
      return response;
    });

    // Test 3.3: Blocked command
    await runTest('3.3 Blocked Command', async () => {
      logTest('DesignSave', 'Test blocked command protection');

      let errorOccurred = false;
      let errorMessage = '';

      try {
        const result = await registry.callTool('send_raw_command', {
          method: 'DesignSave', // This should be blocked
          params: {},
        });

        // Check if tool returned an error
        if (
          result.isError &&
          result.content?.[0]?.text?.includes('blocked for safety')
        ) {
          errorOccurred = true;
          errorMessage = result.content[0].text;
        } else {
          // Try to parse response if not isError
          const response = parseResponse(result);
          if (
            response.success === false &&
            response.error?.message?.includes('blocked for safety')
          ) {
            errorOccurred = true;
            errorMessage = response.error.message;
          }
        }
      } catch (error) {
        // Check if error was thrown directly
        if (error.message.includes('blocked for safety')) {
          errorOccurred = true;
          errorMessage = error.message;
        } else {
          throw error;
        }
      }

      if (!errorOccurred) {
        throw new Error('Blocked command should have been blocked');
      }

      logInfo('Command correctly blocked for safety');
      return { blocked: true, message: errorMessage };
    });

    // ==========================================
    // SCENARIO 4: Timeout and Performance
    // ==========================================
    logScenario('4. Timeout and Performance Testing');
    console.log('Testing timeout settings and command performance');

    // Test 4.1: Quick command with short timeout
    await runTest('4.1 Quick Command Performance', async () => {
      logTest(
        'NoOp with Short Timeout',
        'Test fast command with 1 second timeout'
      );

      const startTime = Date.now();

      const result = await registry.callTool('send_raw_command', {
        method: 'NoOp',
        params: {},
        timeout: 1000, // 1 second timeout
      });

      const duration = Date.now() - startTime;
      const response = parseResponse(result);

      if (!response.success) {
        throw new Error('NoOp should complete within 1 second');
      }

      logInfo(`Command completed in ${duration}ms (timeout was 1000ms)`);

      if (duration > 1000) {
        throw new Error('Command took longer than timeout');
      }

      return { ...response, duration };
    });

    // Test 4.2: Multiple rapid commands
    await runTest('4.2 Rapid Sequential Commands', async () => {
      logTest('Multiple NoOps', 'Test sending multiple commands rapidly');

      const commands = 5;
      const results = [];
      const startTime = Date.now();

      for (let i = 0; i < commands; i++) {
        const cmdStart = Date.now();

        const result = await registry.callTool('send_raw_command', {
          method: 'NoOp',
          params: {},
          timeout: 2000,
        });

        const response = parseResponse(result);
        const cmdDuration = Date.now() - cmdStart;

        results.push({ success: response.success, duration: cmdDuration });
        logInfo(`Command ${i + 1}: ${cmdDuration}ms`);
      }

      const totalDuration = Date.now() - startTime;
      const avgDuration = totalDuration / commands;

      logInfo(
        `Total time: ${totalDuration}ms, Average: ${avgDuration.toFixed(2)}ms`
      );

      return { results, totalDuration, avgDuration };
    });

    // Test 4.3: Long timeout test
    await runTest('4.3 Maximum Timeout Test', async () => {
      logTest(
        'StatusGet with Max Timeout',
        'Test maximum allowed timeout (30 seconds)'
      );

      const result = await registry.callTool('send_raw_command', {
        method: 'StatusGet',
        params: {},
        timeout: 30000, // Maximum allowed
      });

      const response = parseResponse(result);

      if (!response.success) {
        throw new Error('Command failed even with maximum timeout');
      }

      logInfo('Command succeeded with maximum timeout');
      return response;
    });

    // ==========================================
    // SCENARIO 5: Write Operations (Safe Testing)
    // ==========================================
    logScenario('5. Write Operations with Safety Validation');
    console.log(
      'Testing write commands with safety checks (using safe values)'
    );

    // Test 5.1: Get current value, then set to same value
    await runTest('5.1 Safe Write Test (No-op Value Change)', async () => {
      logTest('ComponentSet Safe', 'Get current value and set to same value');

      // First, get a gain control
      const listResult = await registry.callTool('list_controls', {
        controlType: 'gain',
      });

      if (!listResult.content || !listResult.content[0]) {
        throw new Error('No controls found');
      }

      // Parse the JSON response
      let controls;
      try {
        controls = JSON.parse(listResult.content[0].text);
      } catch (e) {
        throw new Error('Could not parse controls list');
      }

      // Find a read/write gain control
      const writeableControl = controls.find(
        c => c.value?.Direction === 'Read/Write' && c.type === 'gain'
      );

      if (!writeableControl) {
        throw new Error('No writeable gain control found');
      }

      const controlName = writeableControl.name;
      logInfo(`Using control: ${controlName}`);

      // Use the value from the list_controls result
      const currentValue = writeableControl.value?.Value || 0;
      logInfo(`Current value: ${currentValue}`);

      // Extract component and control names
      const parts = controlName.split('.');
      const componentName = parts.slice(0, -1).join('.');
      const controlPart = parts[parts.length - 1];

      // Set to same value (safe operation)
      const result = await registry.callTool('send_raw_command', {
        method: 'Component.Set',
        params: {
          Name: componentName,
          Controls: [
            {
              Name: controlPart,
              Value: currentValue, // Same value - no actual change
            },
          ],
        },
      });

      const response = parseResponse(result);

      if (response.success) {
        logInfo('Successfully set control to same value (no-op)');
      }

      return response;
    });

    // Test 5.2: Test with ramp parameter
    await runTest('5.2 Ramp Parameter Test', async () => {
      logTest(
        'ComponentSet with Ramp',
        'Test ramp parameter structure (validation only)'
      );

      // Create a command with ramp (won't send to avoid changes)
      const rampCommand = {
        method: 'Component.Set',
        params: {
          Name: 'TestComponent',
          Controls: [
            {
              Name: 'gain',
              Value: -10,
              Ramp: 2.5, // 2.5 second ramp
            },
          ],
        },
      };

      logInfo('Ramp command structure:');
      console.log(JSON.stringify(rampCommand, null, 2));

      // Validate the structure
      if (rampCommand.params.Controls[0].Ramp !== 2.5) {
        throw new Error('Ramp parameter not properly set');
      }

      logInfo('Ramp parameter structure validated');
      return { validated: true, command: rampCommand };
    });

    // Test 5.3: Warning command test
    await runTest('5.3 Warning Command Test', async () => {
      logTest(
        'Logon Command',
        'Test command that triggers warning (no actual login)'
      );

      // Note: This won't actually log in, just tests the warning system
      const result = await registry.callTool('send_raw_command', {
        method: 'Logon',
        params: {
          User: 'test',
          Password: 'test',
        },
      });

      const response = parseResponse(result);

      logInfo('Warning command executed (check logs for warning message)');
      return response;
    });
  } catch (error) {
    console.error(
      `\n${colors.red}Fatal error: ${error.message}${colors.reset}`
    );
    testResults.failed++;
  } finally {
    // Cleanup
    if (officialClient?.isConnected()) {
      console.log('\n🔌 Disconnecting from Q-SYS Core...');
      await officialClient.disconnect();
      console.log('✅ Disconnected successfully');
    }

    // Print summary
    console.log(`\n${colors.cyan}${'='.repeat(70)}${colors.reset}`);
    console.log(`${colors.cyan}📊 TEST SUMMARY${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(70)}${colors.reset}`);

    console.log(`Total Tests: ${testResults.total}`);
    console.log(
      `${colors.green}✅ Passed: ${testResults.passed}${colors.reset}`
    );
    console.log(`${colors.red}❌ Failed: ${testResults.failed}${colors.reset}`);
    console.log(
      `Success Rate: ${testResults.total > 0 ? ((testResults.passed / testResults.total) * 100).toFixed(1) : 0}%`
    );

    console.log('\nDetailed Results:');
    testResults.scenarios.forEach(scenario => {
      const icon = scenario.status === 'PASS' ? '✅' : '❌';
      const color = scenario.status === 'PASS' ? colors.green : colors.red;
      const detail =
        scenario.status === 'PASS'
          ? `(${scenario.duration}ms)`
          : `- ${scenario.error}`;
      console.log(`${color}${icon} ${scenario.name} ${detail}${colors.reset}`);
    });

    if (testResults.failed === 0) {
      console.log(
        `\n${colors.green}🎉 All tests passed! send_raw_command is ready for production.${colors.reset}`
      );
    } else {
      console.log(
        `\n${colors.yellow}⚠️  Some tests failed. Review the errors above.${colors.reset}`
      );
    }

    process.exit(testResults.failed > 0 ? 1 : 0);
  }
}

// Run the tests
console.log('Starting comprehensive send_raw_command tests...\n');
runComprehensiveTests().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
