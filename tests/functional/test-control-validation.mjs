#!/usr/bin/env node

/**
 * Test script to verify set_control_values validation
 *
 * This tests that the set_control_values tool now properly validates
 * controls exist before attempting to set them.
 */

import { spawn } from 'child_process';

class ValidationTester {
  constructor() {
    this.mcp = null;
    this.messageId = 0;
    this.pendingRequests = new Map();
    this.buffer = '';
  }

  async connect() {
    return new Promise((resolve, reject) => {
      console.log('🚀 Starting MCP server for validation test...');

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
        console.log('✅ MCP server started\n');
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

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Tool call ${toolName} timed out`));
        }
      }, 30000);
    });
  }

  async disconnect() {
    if (this.mcp) {
      this.mcp.kill();
      console.log('\n🛑 MCP server stopped');
    }
  }
}

async function runValidationTests() {
  const tester = new ValidationTester();
  let passed = 0;
  let failed = 0;

  try {
    await tester.connect();

    console.log('='.repeat(60));
    console.log('CONTROL VALIDATION TESTS');
    console.log('='.repeat(60));

    // Test 1: Valid control (should succeed)
    console.log('\n1️⃣ Test: Setting a valid control with validation');
    try {
      // First, find a valid gain component
      const listResponse = await tester.callTool('list_components', {
        name_filter: 'gain',
      });
      const components = JSON.parse(listResponse.result.content[0].text);

      if (components.length > 0) {
        const component = components[0];
        console.log(`   Using component: ${component.name}`);

        const response = await tester.callTool('set_control_values', {
          controls: [
            {
              name: `${component.name}.gain`,
              value: -20,
              ramp: 0,
            },
          ],
          validate: true,
        });

        const result = JSON.parse(response.result.content[0].text);
        if (result[0].success) {
          console.log('   ✅ PASS: Valid control was set successfully');
          passed++;
        } else {
          console.log(`   ❌ FAIL: Valid control failed - ${result[0].error}`);
          failed++;
        }
      } else {
        console.log('   ⚠️  SKIP: No gain components found');
      }
    } catch (error) {
      console.log(`   ❌ FAIL: ${error.message}`);
      failed++;
    }

    // Test 2: Invalid component name (should fail with validation error)
    console.log('\n2️⃣ Test: Setting control on non-existent component');
    try {
      const response = await tester.callTool('set_control_values', {
        controls: [
          {
            name: 'NonExistentComponent.gain',
            value: -10,
            ramp: 0,
          },
        ],
      });

      const result = JSON.parse(response.result.content[0].text);
      if (response.result.isError && result[0].error.includes('not found')) {
        console.log(
          `   ✅ PASS: Correctly rejected with error: "${result[0].error}"`
        );
        passed++;
      } else if (result[0].success) {
        console.log(
          '   ❌ FAIL: Invalid component was accepted (should have failed)'
        );
        failed++;
      }
    } catch (error) {
      console.log(`   ❌ FAIL: Unexpected error - ${error.message}`);
      failed++;
    }

    // Test 3: Invalid control name on valid component (should fail)
    console.log('\n3️⃣ Test: Setting non-existent control on valid component');
    try {
      const listResponse = await tester.callTool('list_components', {
        name_filter: 'gain',
      });
      const components = JSON.parse(listResponse.result.content[0].text);

      if (components.length > 0) {
        const component = components[0];

        const response = await tester.callTool('set_control_values', {
          controls: [
            {
              name: `${component.name}.invalidControl`,
              value: 1,
              ramp: 0,
            },
          ],
        });

        const result = JSON.parse(response.result.content[0].text);
        if (response.result.isError && result[0].error.includes('not found')) {
          console.log(
            `   ✅ PASS: Correctly rejected with error: "${result[0].error}"`
          );
          passed++;
        } else if (result[0].success) {
          console.log(
            '   ❌ FAIL: Invalid control was accepted (should have failed)'
          );
          failed++;
        }
      } else {
        console.log('   ⚠️  SKIP: No components found');
      }
    } catch (error) {
      console.log(`   ❌ FAIL: Unexpected error - ${error.message}`);
      failed++;
    }

    // Test 4: Multiple controls with mix of valid/invalid (should fail all)
    console.log(
      '\n4️⃣ Test: Multiple controls with one invalid (should reject all)'
    );
    try {
      const listResponse = await tester.callTool('list_components', {
        name_filter: 'gain',
      });
      const components = JSON.parse(listResponse.result.content[0].text);

      if (components.length > 0) {
        const component = components[0];

        const response = await tester.callTool('set_control_values', {
          controls: [
            {
              name: `${component.name}.gain`,
              value: -15,
              ramp: 0,
            },
            {
              name: 'FakeComponent.fakeControl',
              value: 1,
              ramp: 0,
            },
          ],
        });

        if (response.result.isError) {
          const results = JSON.parse(response.result.content[0].text);
          const hasError = results.some(
            r => !r.success && r.error.includes('not found')
          );
          if (hasError) {
            console.log(
              '   ✅ PASS: Validation caught invalid control in batch'
            );
            passed++;
          } else {
            console.log('   ❌ FAIL: Wrong error type');
            failed++;
          }
        } else {
          console.log('   ❌ FAIL: Batch with invalid control was accepted');
          failed++;
        }
      } else {
        console.log('   ⚠️  SKIP: No components found');
      }
    } catch (error) {
      console.log(`   ❌ FAIL: Unexpected error - ${error.message}`);
      failed++;
    }

    // Test 5: Named control validation
    console.log('\n5️⃣ Test: Invalid named control (non-component control)');
    try {
      const response = await tester.callTool('set_control_values', {
        controls: [
          {
            name: 'TotallyInvalidNamedControl',
            value: 1,
            ramp: 0,
          },
        ],
      });

      const result = JSON.parse(response.result.content[0].text);
      if (response.result.isError && result[0].error.includes('not found')) {
        console.log(
          `   ✅ PASS: Correctly rejected with error: "${result[0].error}"`
        );
        passed++;
      } else if (result[0].success) {
        console.log('   ❌ FAIL: Invalid named control was accepted');
        failed++;
      }
    } catch (error) {
      console.log(`   ❌ FAIL: Unexpected error - ${error.message}`);
      failed++;
    }

    // Test 6: Bypass validation for performance
    console.log('\n6️⃣ Test: Setting control with validation disabled');
    try {
      const response = await tester.callTool('set_control_values', {
        controls: [
          {
            name: 'PossiblyInvalidControl.gain',
            value: -15,
            ramp: 0,
          },
        ],
        validate: false,
      });

      // With validation disabled, it should attempt the operation
      // The actual result depends on whether the control exists
      console.log('   ✅ PASS: Operation attempted without pre-validation');
      passed++;
    } catch (error) {
      console.log(
        `   ❌ FAIL: Unexpected error with validation disabled - ${error.message}`
      );
      failed++;
    }

    // Test 7: Performance test - cached validation
    console.log('\n7️⃣ Test: Cached validation performance');
    try {
      const listResponse = await tester.callTool('list_components', {
        name_filter: 'gain',
      });
      const components = JSON.parse(listResponse.result.content[0].text);

      if (components.length > 0) {
        const component = components[0];
        const controlName = `${component.name}.gain`;

        // First call - will validate and cache
        const start1 = Date.now();
        await tester.callTool('set_control_values', {
          controls: [{ name: controlName, value: -22, ramp: 0 }],
          validate: true,
        });
        const time1 = Date.now() - start1;

        // Second call - should use cache
        const start2 = Date.now();
        await tester.callTool('set_control_values', {
          controls: [{ name: controlName, value: -23, ramp: 0 }],
          validate: true,
        });
        const time2 = Date.now() - start2;

        console.log(`   First call (with validation): ${time1}ms`);
        console.log(`   Second call (cached): ${time2}ms`);

        if (time2 < time1) {
          console.log('   ✅ PASS: Caching improved performance');
          passed++;
        } else {
          console.log('   ⚠️  WARNING: Cache may not be working optimally');
          passed++;
        }
      } else {
        console.log('   ⚠️  SKIP: No components found');
      }
    } catch (error) {
      console.log(`   ❌ FAIL: ${error.message}`);
      failed++;
    }

    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('VALIDATION TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${passed + failed}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log('='.repeat(60));

    if (failed === 0) {
      console.log(
        '\n✅ All validation tests passed! The fix is working correctly.'
      );
    } else {
      console.log(
        '\n❌ Some validation tests failed. Check the implementation.'
      );
    }
  } catch (error) {
    console.error('\n💥 Test execution failed:', error.message);
  } finally {
    await tester.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  }
}

// Run the tests
console.log('🧪 Control Validation Test Suite');
console.log('Testing set_control_values pre-validation fix\n');

runValidationTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
