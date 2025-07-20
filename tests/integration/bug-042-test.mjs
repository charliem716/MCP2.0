#!/usr/bin/env node

/**
 * BUG-042 Integration Test
 * Verifies that MCP tools return JSON instead of human-readable text
 */

import { createListComponentsTool } from '../../dist/src/mcp/tools/components.js';
import { createListControlsTool, createGetControlValuesTool } from '../../dist/src/mcp/tools/controls.js';
import { createQueryCoreStatusTool } from '../../dist/src/mcp/tools/status.js';
import { randomUUID } from 'crypto';

// Mock QRWC client
const mockQrwcClient = {
  sendCommand: async (command) => {
    switch (command) {
      case 'Component.GetComponents':
        return {
          result: [
            { Name: 'TestComponent1', Type: 'mixer' },
            { Name: 'TestComponent2', Type: 'amplifier' }
          ]
        };
      case 'Component.GetAllControls':
        return {
          result: [
            { Name: 'control1', Type: 'gain', Value: 0 },
            { Name: 'control2', Type: 'mute', Value: false }
          ]
        };
      case 'Status.Get':
        return {
          result: {
            Platform: 'Core 510i',
            Version: '9.5.0',
            connected: true
          }
        };
      default:
        return { result: [] };
    }
  }
};

const context = {
  requestId: randomUUID(),
  toolName: 'test',
  startTime: Date.now()
};

let passCount = 0;
let failCount = 0;

async function testTool(name, tool, params = {}) {
  console.log(`\nTesting ${name}...`);
  
  try {
    const result = await tool.execute({ requestId: randomUUID(), ...params }, context);
    
    // Verify response is JSON
    const text = result.content[0].text;
    const parsed = JSON.parse(text);
    
    console.log(`✅ Returns valid JSON`);
    console.log(`   Type: ${Array.isArray(parsed) ? 'array' : typeof parsed}`);
    console.log(`   Sample: ${JSON.stringify(parsed).substring(0, 100)}...`);
    
    passCount++;
    return true;
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}`);
    failCount++;
    return false;
  }
}

async function runTests() {
  console.log('BUG-042 Integration Test');
  console.log('=======================');
  
  // Test each tool
  await testTool('list_components', createListComponentsTool(mockQrwcClient));
  await testTool('list_controls', createListControlsTool(mockQrwcClient), { controlType: 'all' });
  await testTool('get_control_values', createGetControlValuesTool(mockQrwcClient), { 
    controls: ['control1', 'control2'] 
  });
  await testTool('query_core_status', createQueryCoreStatusTool(mockQrwcClient));
  
  // Summary
  console.log('\n' + '='.repeat(40));
  console.log(`Total: ${passCount + failCount}, Passed: ${passCount}, Failed: ${failCount}`);
  
  if (failCount === 0) {
    console.log('\n✅ BUG-042 is FIXED - All tools return JSON');
  } else {
    console.log('\n❌ BUG-042 NOT FIXED - Some tools still return text');
  }
  
  process.exit(failCount > 0 ? 1 : 0);
}

runTests();