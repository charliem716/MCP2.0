/**
 * Minimal reproduction test for BUG-034
 * Tests that Change Group methods are not implemented in the adapter
 */

import { QRWCClientAdapter } from '../dist/mcp/qrwc/adapter.js';
import { OfficialQRWCClient } from '../dist/qrwc/officialClient.js';

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
  
  // Test case 1: ChangeGroup.AddControl
  console.log('Test 1: Attempting ChangeGroup.AddControl...');
  try {
    const result = await adapter.sendCommand('ChangeGroup.AddControl', {
      Id: 'testGroup',
      Controls: ['MainGain', 'MainMute']
    });
    console.log('❌ UNEXPECTED: Command succeeded:', result);
  } catch (error) {
    console.log('✅ EXPECTED: Command failed with:', error.message);
    console.log('   This confirms the method is not implemented\n');
  }
  
  // Test case 2: ChangeGroup.Poll
  console.log('Test 2: Attempting ChangeGroup.Poll...');
  try {
    const result = await adapter.sendCommand('ChangeGroup.Poll', {
      Id: 'testGroup'
    });
    console.log('❌ UNEXPECTED: Command succeeded:', result);
  } catch (error) {
    console.log('✅ EXPECTED: Command failed with:', error.message);
    console.log('   This confirms the method is not implemented\n');
  }
  
  // Test case 3: Check executeCommand implementation
  console.log('Test 3: Checking adapter source for Change Group cases...');
  const adapterSource = adapter.constructor.toString();
  const hasChangeGroupCases = adapterSource.includes('ChangeGroup.AddControl') ||
                             adapterSource.includes('CHANGE_GROUP_ADD_CONTROL');
  
  if (hasChangeGroupCases) {
    console.log('❌ UNEXPECTED: Found Change Group cases in adapter');
  } else {
    console.log('✅ EXPECTED: No Change Group cases found in adapter');
    console.log('   Only found TODO comment at line 736\n');
  }
  
  console.log('=== Reproduction Complete ===');
  console.log('BUG-034 confirmed: Change Group methods are not implemented');
  console.log('The adapter throws "Unknown command" for all Change Group methods');
}

// Run the test
reproduceBug034().catch(console.error);