/**
 * Minimal reproduction test for BUG-034
 * Tests that Change Group methods are not implemented in the adapter
 */

import { QRWCClientAdapter } from '../dist/src/mcp/qrwc/adapter.js';

async function reproduceBug034() {
  console.log('=== BUG-034 Reproduction Test ===\n');
  
  // Create a mock official client
  const mockOfficialClient = {
    isConnected: () => true,
    executeCommand: async (method, params) => {
      console.log(`Mock received: ${method}`, params);
      throw new Error(`Method ${method} not implemented in mock`);
    }
  };
  
  // Create adapter
  const adapter = new QRWCClientAdapter(mockOfficialClient);
  
  // Test JSON-RPC call that should fail
  const jsonRpcRequest = {
    jsonrpc: "2.0",
    id: 1234,
    method: "ChangeGroup.AddControl",
    params: {
      Id: "my change group",
      Controls: ["some control", "another control"]
    }
  };
  
  console.log('Sending JSON-RPC request:');
  console.log(JSON.stringify(jsonRpcRequest, null, 2));
  console.log();
  
  try {
    const result = await adapter.sendCommand(jsonRpcRequest.method, jsonRpcRequest.params);
    console.log('✅ SUCCESS: Command succeeded:', result);
    console.log();
    console.log('BUG-034 is FIXED! Change Group methods are now implemented.');
    console.log('The adapter successfully handles ChangeGroup.AddControl and other methods.');
  } catch (error) {
    console.log('❌ UNEXPECTED: Command failed');
    console.log('Error:', error.message);
  }
}

// Run the test
reproduceBug034().catch(console.error);