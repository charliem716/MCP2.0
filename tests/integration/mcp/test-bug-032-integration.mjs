#!/usr/bin/env node

/**
 * Integration test for BUG-032: Component.Get and Component.Set methods
 * This test verifies the methods work correctly through the MCP server
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, '../../../qsys-core.config.json');

// Test configuration
const TEST_TIMEOUT = 30000;

class MCPTestClient {
  constructor() {
    this.server = null;
    this.outputBuffer = '';
    this.errorBuffer = '';
    this.initComplete = false;
  }

  async start() {
    console.log('Starting MCP server...');
    
    this.server = spawn('node', ['dist/index.js'], {
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.server.stdout.on('data', (data) => {
      this.outputBuffer += data.toString();
      if (!this.initComplete && this.outputBuffer.includes('"method":"initialized"')) {
        this.initComplete = true;
      }
    });

    this.server.stderr.on('data', (data) => {
      this.errorBuffer += data.toString();
    });

    // Wait for initialization
    await this.waitForInit();
  }

  async waitForInit() {
    const startTime = Date.now();
    while (!this.initComplete) {
      if (Date.now() - startTime > 10000) {
        throw new Error('Server initialization timeout');
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log('MCP server initialized');
  }

  async sendRequest(method, params = {}) {
    const request = {
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now()
    };
    
    this.server.stdin.write(`${JSON.stringify(request)  }\n`);
    
    // Wait for response
    return new Promise((resolve, reject) => {
      const checkResponse = setInterval(() => {
        const lines = this.outputBuffer.split('\n');
        for (const line of lines) {
          if (line.includes(`"id":${request.id}`)) {
            clearInterval(checkResponse);
            try {
              const response = JSON.parse(line);
              resolve(response);
            } catch (e) {
              reject(new Error(`Failed to parse response: ${line}`));
            }
            return;
          }
        }
      }, 100);
      
      setTimeout(() => {
        clearInterval(checkResponse);
        reject(new Error('Response timeout'));
      }, 10000);
    });
  }

  async callTool(toolName, args) {
    return this.sendRequest('tools/call', {
      name: toolName,
      arguments: args
    });
  }

  async shutdown() {
    if (this.server) {
      this.server.kill();
    }
  }
}

async function runTest() {
  const client = new MCPTestClient();
  let testsPassed = 0;
  let testsFailed = 0;

  try {
    await client.start();

    console.log('\n=== BUG-032 Integration Test: Component.Get and Component.Set ===\n');

    // Test 1: Get list of components
    console.log('Test 1: Getting component list...');
    const listResponse = await client.callTool('qsys_component_list', {});
    
    if (listResponse.error) {
      console.error('❌ Failed to get component list:', listResponse.error);
      testsFailed++;
    } else {
      const components = listResponse.result?.content || [];
      console.log(`✅ Found ${components.length} components`);
      testsPassed++;
      
      if (components.length > 0) {
        // Extract first component name
        const firstComponent = components[0];
        const match = firstComponent.match(/^(\d+)\.\s+(.+?)(?:\s+\(|$)/);
        const componentName = match ? match[2] : null;
        
        if (componentName) {
          console.log(`   Using component: ${componentName}`);
          
          // Test 2: Component.Get
          console.log('\nTest 2: Testing Component.Get...');
          const getResponse = await client.sendRequest('qrwc/send', {
            command: 'Component.Get',
            params: {
              Name: componentName,
              Controls: [
                { Name: 'gain' },
                { Name: 'mute' },
                { Name: 'bypass' }
              ]
            }
          });
          
          if (getResponse.error) {
            console.error('❌ Component.Get failed:', getResponse.error);
            testsFailed++;
          } else if (getResponse.result?.result) {
            const result = getResponse.result.result;
            console.log('✅ Component.Get succeeded');
            console.log(`   Component: ${result.Name}`);
            console.log(`   Controls returned: ${result.Controls?.length || 0}`);
            
            if (result.Controls?.length > 0) {
              result.Controls.forEach(ctrl => {
                console.log(`   - ${ctrl.Name}: ${ctrl.Value} (${ctrl.String})`);
              });
            }
            testsPassed++;
          } else {
            console.error('❌ Component.Get returned unexpected response:', getResponse);
            testsFailed++;
          }
          
          // Test 3: Component.Set
          console.log('\nTest 3: Testing Component.Set...');
          const setResponse = await client.sendRequest('qrwc/send', {
            command: 'Component.Set',
            params: {
              Name: componentName,
              Controls: [
                {
                  Name: 'gain',
                  Value: -10.0,
                  Ramp: 1.0
                }
              ]
            }
          });
          
          if (setResponse.error) {
            console.error('❌ Component.Set failed:', setResponse.error);
            testsFailed++;
          } else if (setResponse.result?.result === true) {
            console.log('✅ Component.Set succeeded');
            
            const details = setResponse.result.details;
            if (details?.length > 0) {
              details.forEach(detail => {
                if (detail.Result === 'Success') {
                  console.log(`   ✅ ${detail.Name}: ${detail.Result}`);
                } else {
                  console.log(`   ❌ ${detail.Name}: ${detail.Result} - ${detail.Error}`);
                }
              });
            }
            testsPassed++;
          } else {
            console.error('❌ Component.Set returned unexpected response:', setResponse);
            testsFailed++;
          }
          
          // Test 4: Test error handling with non-existent component
          console.log('\nTest 4: Testing error handling...');
          const errorResponse = await client.sendRequest('qrwc/send', {
            command: 'Component.Get',
            params: {
              Name: 'NonExistentComponent',
              Controls: [{ Name: 'test' }]
            }
          });
          
          if (errorResponse.error) {
            console.log('✅ Correctly handled non-existent component');
            testsPassed++;
          } else {
            console.error('❌ Should have returned error for non-existent component');
            testsFailed++;
          }
        }
      }
    }

  } catch (error) {
    console.error('Test error:', error);
    testsFailed++;
  } finally {
    await client.shutdown();
    
    console.log('\n=== Test Summary ===');
    console.log(`Tests passed: ${testsPassed}`);
    console.log(`Tests failed: ${testsFailed}`);
    console.log(`Total tests: ${testsPassed + testsFailed}`);
    
    if (testsFailed === 0) {
      console.log('\n✅ All tests passed! BUG-032 is fixed.');
      process.exit(0);
    } else {
      console.log('\n❌ Some tests failed.');
      process.exit(1);
    }
  }
}

// Run the test
runTest().catch(console.error);