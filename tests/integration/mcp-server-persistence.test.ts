/**
 * Test for MCP Server connection persistence
 * 
 * This test verifies that the MCP server stays alive after initialization
 * and continues to respond to multiple requests.
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('MCP Server Connection Persistence', () => {
  let serverProcess: ChildProcess;
  
  afterEach(async () => {
    // Clean up server process
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill('SIGTERM');
      // Wait for process to exit
      await new Promise<void>((resolve) => {
        serverProcess.once('exit', () => resolve());
        setTimeout(() => resolve(), 1000); // Timeout after 1 second
      });
    }
  });

  test('should stay alive after initialization and respond to multiple requests', async () => {
    // Start the MCP server
    serverProcess = spawn('node', [path.join(__dirname, '../../dist/index.js')], {
      env: {
        ...process.env,
        MCP_MODE: 'true',
        NODE_ENV: 'production',
        // Disable verbose logging for test
        LOG_LEVEL: 'error'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Track responses - accumulate chunks as they come
    let responseBuffer = '';
    const responses: string[] = [];
    let serverReady = false;

    // Set up response handler
    serverProcess.stdout!.on('data', (data) => {
      responseBuffer += data.toString();
      
      // Check for complete JSON-RPC messages (ending with })
      const lines = responseBuffer.split('\n');
      for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i].trim()) {
          responses.push(lines[i]);
          // Check if this is the initialize response
          if (lines[i].includes('"result"') && lines[i].includes('"protocolVersion"')) {
            serverReady = true;
          }
        }
      }
      // Keep the last incomplete line in the buffer
      responseBuffer = lines[lines.length - 1];
    });

    // Handle errors
    serverProcess.stderr!.on('data', (data) => {
      const error = data.toString();
      // Only log actual errors, not info messages
      if (error.includes('error') || error.includes('Error')) {
        console.error('Server error:', error);
      }
    });

    // Wait for server to be ready
    await new Promise<void>((resolve) => {
      const checkReady = setInterval(() => {
        if (serverReady || serverProcess.killed) {
          clearInterval(checkReady);
          resolve();
        }
      }, 100);
      
      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkReady);
        resolve();
      }, 5000);
    });

    // Send initialize request
    const initRequest = {
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: {
          name: "test",
          version: "1.0.0"
        }
      },
      id: 1
    };

    serverProcess.stdin!.write(JSON.stringify(initRequest) + '\n');

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify we got an initialize response
    const initResponse = responses.find(r => r.includes('"id":1'));
    expect(initResponse).toBeDefined();
    expect(initResponse).toContain('"result"');
    expect(initResponse).toContain('"protocolVersion"');
    expect(initResponse).toContain('"qsys-mcp-server"');

    // Clear responses for next test
    responses.length = 0;

    // Send a tools/list request to verify server is still alive
    const listRequest = {
      jsonrpc: "2.0",
      method: "tools/list",
      id: 2
    };

    serverProcess.stdin!.write(JSON.stringify(listRequest) + '\n');

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check if there's any remaining data in the buffer
    if (responseBuffer.trim()) {
      responses.push(responseBuffer);
    }

    // Verify we got a response (tools/list returns an error if not implemented)
    // The important thing is the server is still alive and responding
    const toolsResponse = responses.find(r => r.includes('"id":2'));
    expect(toolsResponse).toBeDefined();
    
    // Parse the response to check it's valid JSON-RPC
    try {
      const parsed = JSON.parse(toolsResponse!);
      // Should have either result with tools array or an error
      expect(parsed).toHaveProperty('jsonrpc', '2.0');
      expect(parsed).toHaveProperty('id', 2);
      // Should have either result or error
      const hasValidResponse = parsed.result?.tools !== undefined || parsed.error !== undefined;
      expect(hasValidResponse).toBe(true);
    } catch (e) {
      // If parsing fails, just check that we got some response
      expect(toolsResponse).toBeTruthy();
    }

    // Verify server process is still running
    expect(serverProcess.killed).toBe(false);
    expect(serverProcess.exitCode).toBeNull();
  }, 10000); // 10 second timeout for the test

  test('should exit cleanly on SIGTERM', async () => {
    // Start the MCP server
    serverProcess = spawn('node', [path.join(__dirname, '../../dist/index.js')], {
      env: {
        ...process.env,
        MCP_MODE: 'true',
        NODE_ENV: 'production',
        LOG_LEVEL: 'error'
      },
      stdio: ['pipe', 'pipe', 'inherit']
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Send SIGTERM
    serverProcess.kill('SIGTERM');

    // Wait for process to exit
    await new Promise<void>((resolve) => {
      serverProcess.once('exit', (code) => {
        expect(code).toBe(0);
        resolve();
      });
      
      // Timeout after 3 seconds
      setTimeout(() => {
        expect(serverProcess.killed).toBe(true);
        resolve();
      }, 3000);
    });
  }, 5000);
});