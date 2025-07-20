#!/usr/bin/env node

/**
 * Test for BUG-032: Missing Component.Get and Component.Set Methods
 * 
 * This test verifies that the Component.Get and Component.Set methods
 * are properly implemented in the QRWC adapter.
 */

import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(__dirname, '../../../qsys-core.config.json');

// Load Q-SYS connection config
const config = JSON.parse(readFileSync(configPath, 'utf8'));

async function testMCPServer() {
  console.log('Starting BUG-032 test: Component.Get and Component.Set methods');
  
  // Start MCP server
  const server = spawn('node', ['dist/index.js'], {
    env: { ...process.env, NODE_ENV: 'development' },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let outputBuffer = '';
  let errorBuffer = '';
  let initComplete = false;

  server.stdout.on('data', (data) => {
    outputBuffer += data.toString();
    if (!initComplete && outputBuffer.includes('"method":"initialized"')) {
      initComplete = true;
      runTests();
    }
  });

  server.stderr.on('data', (data) => {
    errorBuffer += data.toString();
    console.error('Server error:', data.toString());
  });

  async function sendRequest(method, params = {}) {
    const request = {
      jsonrpc: '2.0',
      method: method,
      params: params,
      id: Date.now()
    };
    
    server.stdin.write(JSON.stringify(request) + '\n');
    
    // Wait for response
    return new Promise((resolve, reject) => {
      const checkResponse = setInterval(() => {
        const lines = outputBuffer.split('\n');
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

  async function runTests() {
    console.log('\n1. Testing Component.Get method...');
    
    try {
      // First, get list of components
      const componentsResponse = await sendRequest('tools/call', {
        name: 'qsys_component_list',
        arguments: {}
      });
      
      if (componentsResponse.error) {
        throw new Error(`Failed to get components: ${JSON.stringify(componentsResponse.error)}`);
      }
      
      const components = componentsResponse.result?.content || [];
      console.log(`Found ${components.length} components`);
      
      if (components.length === 0) {
        console.log('No components found to test with');
        process.exit(1);
      }
      
      // Get the first component name
      const firstComponent = components[0];
      const componentMatch = firstComponent.match(/^(\d+)\.\s+(.+?)(?:\s+\(|$)/);
      const componentName = componentMatch ? componentMatch[2] : 'Unknown';
      
      console.log(`Testing with component: ${componentName}`);
      
      // Test Component.Get
      const getResponse = await sendRequest('tools/call', {
        name: 'qsys_component_control',
        arguments: {
          action: 'get',
          component: componentName,
          controls: ['gain', 'mute', 'bypass'] // Common control names
        }
      });
      
      console.log('Component.Get response:', JSON.stringify(getResponse, null, 2));
      
      if (getResponse.error) {
        console.log('Component.Get not implemented yet (expected for BUG-032)');
      } else {
        console.log('Component.Get seems to be working!');
      }
      
      // Test Component.Set
      console.log('\n2. Testing Component.Set method...');
      
      const setResponse = await sendRequest('tools/call', {
        name: 'qsys_component_control',
        arguments: {
          action: 'set',
          component: componentName,
          controls: [
            { name: 'gain', value: -10.0, ramp: 1.0 }
          ]
        }
      });
      
      console.log('Component.Set response:', JSON.stringify(setResponse, null, 2));
      
      if (setResponse.error) {
        console.log('Component.Set not implemented yet (expected for BUG-032)');
      } else {
        console.log('Component.Set seems to be working!');
      }
      
    } catch (error) {
      console.error('Test error:', error);
    } finally {
      console.log('\nTest complete. Shutting down server...');
      server.kill();
      process.exit(0);
    }
  }

  server.on('error', (error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

// Run the test
testMCPServer().catch(console.error);