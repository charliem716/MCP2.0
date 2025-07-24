#!/usr/bin/env node

/**
 * Test script for the new send_raw_command MCP tool
 */

import { MCPServer } from '../../dist/src/mcp/server.js';
import { createLogger } from '../../dist/src/shared/utils/logger.js';

const logger = createLogger('test-raw-command');

async function testRawCommandTool() {
  console.log('=== Testing send_raw_command MCP Tool ===\n');

  // Create and start MCP server
  const server = new MCPServer();

  try {
    console.log('Starting MCP server...');
    await server.start();
    console.log('MCP server started successfully\n');

    // Get the tool registry
    const registry = server.getToolRegistry();

    // Check if tool is registered
    if (!registry.hasTool('send_raw_command')) {
      throw new Error('send_raw_command tool not found in registry!');
    }
    console.log('✅ send_raw_command tool is registered\n');

    // Test 1: Status.Get command
    console.log('Test 1: Sending Status.Get command...');
    try {
      const statusResult = await registry.callTool('send_raw_command', {
        method: 'Status.Get',
      });

      console.log('✅ Status.Get response:');
      console.log(JSON.parse(statusResult.content[0].text), '\n');
    } catch (error) {
      console.error('❌ Status.Get failed:', error.message);
    }

    // Test 2: Invalid command (should fail gracefully)
    console.log('Test 2: Sending invalid command...');
    try {
      const invalidResult = await registry.callTool('send_raw_command', {
        method: 'Invalid.Command',
        params: { test: true },
      });

      const response = JSON.parse(invalidResult.content[0].text);
      if (response.success === false) {
        console.log('✅ Invalid command handled correctly:');
        console.log(response.error, '\n');
      }
    } catch (error) {
      console.log(
        '✅ Invalid command rejected as expected:',
        error.message,
        '\n'
      );
    }

    // Test 3: Blocked command (should be rejected)
    console.log('Test 3: Testing blocked command (Core.Reboot)...');
    try {
      await registry.callTool('send_raw_command', {
        method: 'Core.Reboot',
      });
      console.error('❌ Blocked command was not rejected!');
    } catch (error) {
      console.log(
        '✅ Blocked command rejected correctly:',
        error.message,
        '\n'
      );
    }

    // Test 4: Component.Get command
    console.log('Test 4: Getting component info...');
    try {
      const components = await registry.callTool('list_components', {});
      const componentList = JSON.parse(components.content[0].text);

      if (componentList.components && componentList.components.length > 0) {
        const firstComponent = componentList.components[0];
        console.log(`Testing Component.Get for: ${firstComponent.name}`);

        const componentResult = await registry.callTool('send_raw_command', {
          method: 'Component.Get',
          params: {
            Name: firstComponent.name,
          },
        });

        console.log('✅ Component.Get response:');
        console.log(JSON.parse(componentResult.content[0].text), '\n');
      }
    } catch (error) {
      console.error('❌ Component.Get failed:', error.message);
    }

    console.log('=== All tests completed ===');
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    console.log('\nShutting down MCP server...');
    await server.shutdown();
    process.exit(0);
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT, shutting down...');
  process.exit(0);
});

// Run the test
testRawCommandTool().catch(console.error);
