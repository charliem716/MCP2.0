#!/usr/bin/env node

/**
 * Simple test for raw command functionality
 */

import { OfficialQRWCClient } from '../dist/src/qrwc/officialClient.js';
import { QRWCClientAdapter } from '../dist/src/mcp/qrwc/adapter.js';
import { createSendRawCommandTool } from '../dist/src/mcp/tools/raw-command.js';

async function testRawCommand() {
  console.log('=== Testing Raw Command Functionality ===\n');

  // Read config
  const config = {
    host: process.env.QSYS_HOST || '192.168.1.100',
    port: parseInt(process.env.QSYS_PORT || '443'),
    enableAutoReconnect: false,
  };

  console.log(`Connecting to Q-SYS Core at ${config.host}:${config.port}...`);

  // Create client and adapter
  const client = new OfficialQRWCClient(config);
  const adapter = new QRWCClientAdapter(client);

  try {
    // Connect to Q-SYS
    await client.connect();
    console.log('✅ Connected to Q-SYS Core\n');

    // Create the raw command tool
    const rawCommandTool = createSendRawCommandTool(adapter);
    console.log(`✅ Created tool: ${rawCommandTool.name}\n`);

    // Test 1: Status.Get
    console.log('Test 1: Sending Status.Get command...');
    const statusResult = await rawCommandTool.execute({
      method: 'Status.Get',
    });

    if (!statusResult.isError) {
      const response = JSON.parse(statusResult.content[0].text);
      console.log('✅ Status response received:');
      console.log(`  - Platform: ${response.response.Platform || 'Unknown'}`);
      console.log(`  - Version: ${response.response.Version || 'Unknown'}`);
      console.log(
        `  - Design: ${response.response.DesignName || 'No design'}\n`
      );
    } else {
      console.error('❌ Status.Get failed:', statusResult.content[0].text);
    }

    // Test 2: Try a blocked command
    console.log('Test 2: Testing blocked command (Core.Reboot)...');
    try {
      await rawCommandTool.execute({
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

    // Test 3: Invalid command
    console.log('Test 3: Testing invalid command...');
    const invalidResult = await rawCommandTool.execute({
      method: 'Invalid.Command',
    });

    if (invalidResult.isError) {
      const response = JSON.parse(invalidResult.content[0].text);
      console.log('✅ Invalid command handled correctly:');
      console.log(`  - Error: ${response.error.message}\n`);
    }

    console.log('=== All tests completed successfully ===');
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    console.log('\nDisconnecting from Q-SYS Core...');
    client.disconnect();
    process.exit(0);
  }
}

// Run the test
testRawCommand().catch(console.error);
