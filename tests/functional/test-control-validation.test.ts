import { describe, it, expect, jest } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';

describe('Control validation test', () => {
  jest.setTimeout(60000); // 60 second timeout for integration tests
  
  it('should validate controls exist before setting them', async () => {
    console.log('🧪 Control Validation Test Suite');
    console.log('Testing set_control_values pre-validation fix\n');
    
    let mcp: ChildProcess | null = null;
    let messageId = 0;
    const pendingRequests = new Map<number, { resolve: Function; reject: Function }>();
    let buffer = '';
    
    function processBuffer() {
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line);
            if (message.id && pendingRequests.has(message.id)) {
              const { resolve, reject } = pendingRequests.get(message.id)!;
              pendingRequests.delete(message.id);
              if (message.error) {
                reject(new Error(message.error.message));
              } else {
                resolve(message.result);
              }
            }
          } catch {
            // Not JSON, ignore
          }
        }
      }
    }
    
    async function sendRequest(method: string, params: any = {}): Promise<any> {
      return new Promise((resolve, reject) => {
        const id = ++messageId;
        pendingRequests.set(id, { resolve, reject });
        
        const request = {
          jsonrpc: '2.0',
          id,
          method,
          params,
        };
        
        mcp!.stdin!.write(JSON.stringify(request) + '\n');
        
        // Timeout after 30 seconds
        setTimeout(() => {
          if (pendingRequests.has(id)) {
            pendingRequests.delete(id);
            reject(new Error(`Request ${method} timed out`));
          }
        }, 30000);
      });
    }
    
    try {
      // Start MCP server
      console.log('🚀 Starting MCP server for validation test...');
      
      mcp = spawn('npm', ['start'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });
      
      mcp.stdout!.on('data', data => {
        buffer += data.toString();
        processBuffer();
      });
      
      mcp.stderr!.on('data', data => {
        console.error('MCP stderr:', data.toString());
      });
      
      // Wait for server initialization
      await new Promise(resolve => setTimeout(resolve, 3000));
      console.log('✅ MCP server started\n');
      
      // Initialize connection
      await sendRequest('initialize', {
        protocolVersion: '0.1.0',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      });
      
      // List available tools
      const toolsResult = await sendRequest('tools/list');
      const hasSetControlValues = toolsResult.tools?.some(
        (tool: any) => tool.name === 'set_control_values'
      );
      
      expect(hasSetControlValues).toBe(true);
      console.log('✅ Found set_control_values tool');
      
      // Test 1: Valid control
      console.log('\n📝 Test 1: Setting existing control (should succeed)');
      
      // First, list controls to get a valid one
      const listResult = await sendRequest('tools/call', {
        name: 'list_controls',
        arguments: { controlType: 'gain' },
      });
      
      const controls = JSON.parse(listResult.content?.[0]?.text || '[]');
      
      if (controls.length > 0) {
        const testControl = controls[0].name;
        console.log(`Using control: ${testControl}`);
        
        const setResult = await sendRequest('tools/call', {
          name: 'set_control_values',
          arguments: {
            controls: [{ name: testControl, value: 0 }],
          },
        });
        
        expect(setResult.isError).toBeFalsy();
        console.log('✅ Test 1 PASSED: Valid control was set successfully');
      } else {
        console.log('⚠️  No gain controls available, skipping valid control test');
      }
      
      // Test 2: Invalid control
      console.log('\n📝 Test 2: Setting non-existent control (should fail gracefully)');
      
      const invalidResult = await sendRequest('tools/call', {
        name: 'set_control_values',
        arguments: {
          controls: [{ name: 'NonExistent.Invalid.Control', value: 0 }],
        },
      });
      
      const invalidResponse = JSON.parse(invalidResult.content?.[0]?.text || '[]');
      expect(invalidResponse[0]).toHaveProperty('error');
      console.log('✅ Test 2 PASSED: Invalid control returned error as expected');
      
      // Test 3: Mixed valid and invalid
      console.log('\n📝 Test 3: Mixed valid and invalid controls');
      
      if (controls.length > 0) {
        const mixedResult = await sendRequest('tools/call', {
          name: 'set_control_values',
          arguments: {
            controls: [
              { name: controls[0].name, value: 0 },
              { name: 'Invalid.Control', value: 1 },
              { name: controls[0].name, value: -10 },
            ],
          },
        });
        
        const mixedResponse = JSON.parse(mixedResult.content?.[0]?.text || '[]');
        expect(mixedResponse).toHaveLength(3);
        expect(mixedResponse[0].success).toBe(true);
        expect(mixedResponse[1]).toHaveProperty('error');
        expect(mixedResponse[2].success).toBe(true);
        console.log('✅ Test 3 PASSED: Mixed controls handled correctly');
      }
      
      console.log('\n🎉 All validation tests completed successfully!');
      
    } finally {
      // Clean up
      if (mcp) {
        console.log('\n🛑 Stopping MCP server...');
        mcp.kill();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }, 60000); // 60 second timeout
});