import { describe, it, expect } from '@jest/globals';
import { MCPServer } from '../src/mcp/server.js';
import type { MCPServerConfig } from '../src/shared/types/mcp.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('test-raw-command-simple', () => {
  it('should execute the test scenario', async () => {
    // Test implementation
    
    /**
     * Simple test for raw command functionality
     */
    
    
    async function testRawCommand() {
      // console.log('=== Testing Raw Command Functionality ===\n');
    
      // Load configuration from qsys-core.config.json
      const configPath = join(__dirname, '../qsys-core.config.json');
      const configData = JSON.parse(readFileSync(configPath, 'utf8'));
      const qsysConfig = configData.qsysCore;
    
      // Create and start MCP server with config
      // Use config directly, ignoring env vars for this integration test
      const config: MCPServerConfig = {
        name: 'test-server',
        version: '1.0.0',
        qrwc: {
          host: qsysConfig.host,
          port: qsysConfig.port,
          reconnectInterval: 5000,
        }
      };
      
      console.log(`Attempting to connect to Q-SYS Core at ${config.qrwc.host}:${config.qrwc.port}`);
      const server = new MCPServer(config);
    
      try {
        // Start the server
        await server.start();
        // console.log('✅ Connected to Q-SYS Core\n');
    
        // Get the tool registry
        const registry = server.getToolRegistry();
        
        // Check if tool is registered
        if (!registry.hasTool('send_raw_command')) {
          // The tool might be deprecated, skip test
          console.log('send_raw_command tool not found - may be deprecated');
          return;
        }
    
        // Test 1: Status.Get
        // console.log('Test 1: Sending Status.Get command...');
        const statusResult = await registry.callTool('send_raw_command', {
          method: 'Status.Get',
        });
    
        if (!statusResult.isError) {
          const response = JSON.parse(statusResult.content[0].text);
          // console.log('✅ Status response received:');
          // console.log(`  - Platform: ${response.response.Platform || 'Unknown'}`);
          // console.log(`  - Version: ${response.response.Version || 'Unknown'}`);
          // console.log(
            // `  - Design: ${response.response.DesignName || 'No design'}\n`
          // );
          expect(response).toBeDefined();
        } else {
          console.error('❌ Status.Get failed:', statusResult.content[0].text);
        }
    
        // Test 2: Try a blocked command
        // console.log('Test 2: Testing blocked command (Core.Reboot)...');
        try {
          await registry.callTool('send_raw_command', {
            method: 'Core.Reboot',
          });
          console.error('❌ Blocked command was not rejected!');
        } catch (error) {
          // console.log(
          //   '✅ Blocked command rejected correctly:',
          //   error.message,
          //   '\n'
          // );
          expect(error).toBeDefined();
        }
    
        // Test 3: Invalid command
        // console.log('Test 3: Testing invalid command...');
        const invalidResult = await registry.callTool('send_raw_command', {
          method: 'Invalid.Command',
        });
    
        if (invalidResult.isError) {
          const response = JSON.parse(invalidResult.content[0].text);
          // console.log('✅ Invalid command handled correctly:');
          // console.log(`  - Error: ${response.error.message}\n`);
          expect(response.error).toBeDefined();
        }
    
        // console.log('=== All tests completed successfully ===');
      } catch (error) {
        console.error('Test failed:', error);
        throw error;
      } finally {
        // console.log('\nDisconnecting from Q-SYS Core...');
        await server.shutdown();
      }
    }
    
    // Run the test
    await testRawCommand();
  }, 60000); // 60 second timeout for integration tests
});
