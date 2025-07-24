#!/usr/bin/env node

/**
 * MCP Q-SYS Control Functional Test Script
 *
 * This script tests real-world control operations through the MCP server
 * using direct stdio communication. It dynamically discovers components
 * and performs comprehensive testing with snapshot safety.
 */

import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';

class MCPTestClient {
  constructor() {
    this.mcp = null;
    this.messageId = 0;
    this.pendingRequests = new Map();
    this.buffer = '';
    this.testResults = [];
    this.snapshotName = `mcp_test_snapshot_${Date.now()}`;
    this.testComponents = new Map(); // Store discovered components for testing
  }

  async connect() {
    return new Promise((resolve, reject) => {
      console.log('🚀 Starting MCP server...');

      this.mcp = spawn('npm', ['start'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });

      this.mcp.stdout.on('data', data => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      this.mcp.stderr.on('data', data => {
        console.error('MCP stderr:', data.toString());
      });

      this.mcp.on('error', error => {
        console.error('Failed to start MCP:', error);
        reject(error);
      });

      // Wait for server initialization
      setTimeout(() => {
        console.log('✅ MCP server started');
        resolve();
      }, 5000);
    });
  }

  processBuffer() {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line);
          if (message.id && this.pendingRequests.has(message.id)) {
            const { resolve } = this.pendingRequests.get(message.id);
            this.pendingRequests.delete(message.id);
            resolve(message);
          }
        } catch (e) {
          // Not JSON, ignore
        }
      }
    }
  }

  async callTool(toolName, params = {}) {
    const id = ++this.messageId;
    const request = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params,
      },
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.mcp.stdin.write(`${JSON.stringify(request)}\n`);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Tool call ${toolName} timed out`));
        }
      }, 30000);
    });
  }

  async runTest(name, testFn) {
    console.log(`\n📋 Testing: ${name}`);
    const start = Date.now();

    try {
      await testFn();
      const duration = Date.now() - start;
      this.testResults.push({
        name,
        status: 'PASS',
        duration,
        message: `Completed in ${duration}ms`,
      });
      console.log(`✅ PASS: ${name} (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - start;
      this.testResults.push({
        name,
        status: 'FAIL',
        duration,
        message: error.message,
        error: error.stack,
      });
      console.log(`❌ FAIL: ${name} - ${error.message}`);
    }
  }

  async disconnect() {
    if (this.mcp) {
      this.mcp.kill();
      console.log('🛑 MCP server stopped');
    }
  }

  printSummary() {
    console.log(`\n${'='.repeat(60)}`);
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));

    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    const total = this.testResults.length;

    console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
    console.log('='.repeat(60));

    if (failed > 0) {
      console.log('\nFailed Tests:');
      this.testResults
        .filter(r => r.status === 'FAIL')
        .forEach(result => {
          console.log(`\n❌ ${result.name}`);
          console.log(`   Reason: ${result.message}`);
        });
    }

    console.log(`\n${'='.repeat(60)}`);
  }
}

// Main test execution
async function runTests() {
  const tester = new MCPTestClient();

  try {
    await tester.connect();

    // 1. CONNECTIVITY TESTS
    await tester.runTest('Echo/Ping Test', async () => {
      const response = await tester.callTool('echo', { message: 'test' });
      if (!response.result || response.result.content[0].text !== 'test') {
        throw new Error('Echo did not return expected message');
      }
    });

    await tester.runTest('Core Status Query', async () => {
      const response = await tester.callTool('query_core_status');
      const result = JSON.parse(response.result.content[0].text);

      if (!result.firmware_version) {
        throw new Error('Core status missing firmware version');
      }

      console.log(`   Core: ${result.name} v${result.firmware_version}`);
      console.log(`   Status: ${result.status}`);
    });

    // 2. COMPONENT DISCOVERY TESTS
    await tester.runTest('List All Components', async () => {
      const response = await tester.callTool('list_components');
      const components = JSON.parse(response.result.content[0].text);

      if (!Array.isArray(components) || components.length === 0) {
        throw new Error('No components found in system');
      }

      console.log(`   Found ${components.length} components`);

      // Store components for later tests
      components.forEach(comp => {
        tester.testComponents.set(comp.name, comp);
      });
    });

    await tester.runTest('Filter Components by Type', async () => {
      const response = await tester.callTool('list_components', {
        name_filter: '(gain|mixer|router)',
      });
      const components = JSON.parse(response.result.content[0].text);

      if (!Array.isArray(components)) {
        throw new Error('Invalid component list returned');
      }

      console.log(`   Found ${components.length} gain/mixer/router components`);
    });

    // 3. SNAPSHOT CREATION (SAFETY)
    await tester.runTest('Create Safety Snapshot', async () => {
      // Find snapshot component
      const snapshotComp = Array.from(tester.testComponents.values()).find(c =>
        c.type.toLowerCase().includes('snapshot')
      );

      if (snapshotComp) {
        console.log(`   Using snapshot component: ${snapshotComp.name}`);

        // Save current state
        const response = await tester.callTool('set_control_values', {
          controls: [
            {
              component: snapshotComp.name,
              control: 'save',
              value: 1,
              ramp_time: 0,
            },
          ],
        });

        if (response.error) {
          throw new Error(
            `Failed to create snapshot: ${response.error.message}`
          );
        }

        console.log(`   Snapshot saved: ${tester.snapshotName}`);
      } else {
        console.log(
          '   ⚠️  No snapshot component found - proceeding without safety snapshot'
        );
      }
    });

    // 4. CONTROL DISCOVERY TESTS
    await tester.runTest('List Controls by Type', async () => {
      const response = await tester.callTool('list_controls', {
        control_type: 'gain',
      });
      const controls = JSON.parse(response.result.content[0].text);

      if (!Array.isArray(controls)) {
        throw new Error('Invalid control list returned');
      }

      console.log(`   Found ${controls.length} gain controls`);
    });

    await tester.runTest('Get All Controls with Pagination', async () => {
      const response = await tester.callTool('qsys_get_all_controls', {
        page_size: 100,
        page: 1,
      });
      const result = JSON.parse(response.result.content[0].text);

      if (!result.controls || !Array.isArray(result.controls)) {
        throw new Error('Invalid bulk control response');
      }

      console.log(`   Total controls: ${result.total_controls}`);
      console.log(
        `   Page 1 of ${result.total_pages} (${result.controls.length} controls)`
      );
    });

    // 5. CONTROL VALUE OPERATIONS
    await tester.runTest('Get Control Values', async () => {
      // Find a gain control to test
      const gainControl = Array.from(tester.testComponents.values()).find(c =>
        c.type.toLowerCase().includes('gain')
      );

      if (!gainControl) {
        throw new Error('No gain component found for testing');
      }

      const response = await tester.callTool('get_control_values', {
        controls: [
          { component: gainControl.name, control: 'gain' },
          { component: gainControl.name, control: 'mute' },
        ],
      });

      const values = JSON.parse(response.result.content[0].text);

      if (!Array.isArray(values) || values.length !== 2) {
        throw new Error('Invalid control values response');
      }

      console.log(`   Gain: ${values[0].value} dB`);
      console.log(`   Mute: ${values[1].value ? 'ON' : 'OFF'}`);
    });

    await tester.runTest('Set Control Value with Ramp', async () => {
      // Find a safe control to modify
      const gainControl = Array.from(tester.testComponents.values()).find(c =>
        c.type.toLowerCase().includes('gain')
      );

      if (!gainControl) {
        throw new Error('No gain component found for testing');
      }

      // Get current value first
      const getResponse = await tester.callTool('get_control_values', {
        controls: [{ component: gainControl.name, control: 'gain' }],
      });
      const currentValues = JSON.parse(getResponse.result.content[0].text);
      const originalValue = currentValues[0].value;

      // Set to a safe test value with ramp
      const testValue = -20; // Safe gain value
      const response = await tester.callTool('set_control_values', {
        controls: [
          {
            component: gainControl.name,
            control: 'gain',
            value: testValue,
            ramp_time: 1.0,
          },
        ],
      });

      if (response.error) {
        throw new Error(
          `Failed to set control value: ${response.error.message}`
        );
      }

      console.log(
        `   Set ${gainControl.name}.gain to ${testValue} dB with 1s ramp`
      );

      // Wait for ramp to complete
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Verify the change
      const verifyResponse = await tester.callTool('get_control_values', {
        controls: [{ component: gainControl.name, control: 'gain' }],
      });
      const newValues = JSON.parse(verifyResponse.result.content[0].text);

      if (Math.abs(newValues[0].value - testValue) > 0.1) {
        throw new Error(
          `Value not set correctly. Expected ${testValue}, got ${newValues[0].value}`
        );
      }

      // Restore original value
      await tester.callTool('set_control_values', {
        controls: [
          {
            component: gainControl.name,
            control: 'gain',
            value: originalValue,
            ramp_time: 0.5,
          },
        ],
      });

      console.log(`   Restored to original value: ${originalValue} dB`);
    });

    // 6. COMPONENT-SPECIFIC OPERATIONS
    await tester.runTest('Get Multiple Controls from Component', async () => {
      // Find a mixer or router with multiple controls
      const component = Array.from(tester.testComponents.values()).find(
        c =>
          c.type.toLowerCase().includes('mixer') ||
          c.type.toLowerCase().includes('router')
      );

      if (!component) {
        console.log('   ⚠️  No mixer/router found - skipping test');
        return;
      }

      const response = await tester.callTool('qsys_component_get', {
        component: component.name,
      });

      const controls = JSON.parse(response.result.content[0].text);

      if (!Array.isArray(controls) || controls.length === 0) {
        throw new Error('No controls returned for component');
      }

      console.log(
        `   Retrieved ${controls.length} controls from ${component.name}`
      );

      // Show first few controls
      controls.slice(0, 3).forEach(ctrl => {
        console.log(`   - ${ctrl.name}: ${ctrl.value} ${ctrl.string || ''}`);
      });
    });

    // 7. BULK OPERATIONS TEST
    await tester.runTest('Find Non-Default Values', async () => {
      const response = await tester.callTool('qsys_get_all_controls', {
        filter: 'non_default',
        page_size: 50,
      });

      const result = JSON.parse(response.result.content[0].text);

      console.log(
        `   Found ${result.total_controls} controls with non-default values`
      );

      if (result.controls.length > 0) {
        console.log(`   Examples:`);
        result.controls.slice(0, 3).forEach(ctrl => {
          console.log(`   - ${ctrl.component}.${ctrl.control}: ${ctrl.value}`);
        });
      }
    });

    // 8. ERROR HANDLING TESTS
    await tester.runTest('Invalid Control Name Error', async () => {
      const response = await tester.callTool('get_control_values', {
        controls: [{ component: 'NonExistentComponent', control: 'invalid' }],
      });

      if (
        !response.error &&
        !response.result.content[0].text.includes('error')
      ) {
        throw new Error('Expected error for invalid control');
      }

      console.log('   Correctly handled invalid control error');
    });

    await tester.runTest('Out of Range Value Error', async () => {
      const gainControl = Array.from(tester.testComponents.values()).find(c =>
        c.type.toLowerCase().includes('gain')
      );

      if (!gainControl) {
        console.log('   ⚠️  No gain control found - skipping test');
        return;
      }

      const response = await tester.callTool('set_control_values', {
        controls: [
          {
            component: gainControl.name,
            control: 'gain',
            value: 999, // Clearly out of range
          },
        ],
      });

      if (
        !response.error &&
        !response.result.content[0].text.includes('error')
      ) {
        throw new Error('Expected error for out of range value');
      }

      console.log('   Correctly handled out of range error');
    });

    // 9. PERFORMANCE TEST
    await tester.runTest('Rapid Control Changes', async () => {
      const gainControl = Array.from(tester.testComponents.values()).find(c =>
        c.type.toLowerCase().includes('gain')
      );

      if (!gainControl) {
        console.log('   ⚠️  No gain control found - skipping test');
        return;
      }

      const startTime = Date.now();
      const changes = 10;

      for (let i = 0; i < changes; i++) {
        const value = -30 + i * 2; // -30 to -12 dB
        await tester.callTool('set_control_values', {
          controls: [
            {
              component: gainControl.name,
              control: 'gain',
              value,
              ramp_time: 0,
            },
          ],
        });
      }

      const duration = Date.now() - startTime;
      const avgTime = duration / changes;

      console.log(`   Completed ${changes} changes in ${duration}ms`);
      console.log(`   Average: ${avgTime.toFixed(1)}ms per change`);

      if (avgTime > 1000) {
        throw new Error('Performance too slow - average > 1000ms per change');
      }
    });

    // 10. RESTORE SNAPSHOT (CLEANUP)
    await tester.runTest('Restore Safety Snapshot', async () => {
      const snapshotComp = Array.from(tester.testComponents.values()).find(c =>
        c.type.toLowerCase().includes('snapshot')
      );

      if (snapshotComp) {
        const response = await tester.callTool('set_control_values', {
          controls: [
            {
              component: snapshotComp.name,
              control: 'load',
              value: 1,
              ramp_time: 0,
            },
          ],
        });

        if (response.error) {
          throw new Error(
            `Failed to restore snapshot: ${response.error.message}`
          );
        }

        console.log(`   System restored to pre-test state`);
      } else {
        console.log(
          '   ⚠️  No snapshot component - manual restoration may be needed'
        );
      }
    });
  } catch (error) {
    console.error('\n💥 Test execution failed:', error.message);
  } finally {
    tester.printSummary();
    await tester.disconnect();

    // Exit with appropriate code
    const failed = tester.testResults.filter(r => r.status === 'FAIL').length;
    process.exit(failed > 0 ? 1 : 0);
  }
}

// Run the tests
console.log('🧪 MCP Q-SYS Control Functional Test Suite');
console.log('==========================================\n');

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
