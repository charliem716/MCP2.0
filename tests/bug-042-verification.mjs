#!/usr/bin/env node

/**
 * BUG-042 Verification Test
 * Verifies that MCP tools return JSON instead of human-readable text
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load configuration
const configPath = join(__dirname, '../qsys-core.config.json');
const configData = JSON.parse(readFileSync(configPath, 'utf8'));
const config = configData.qsysCore;

// Import modules
const { OfficialQRWCClient } = await import(
  '../dist/src/qrwc/officialClient.js'
);
const { QRWCClientAdapter } = await import('../dist/src/mcp/qrwc/adapter.js');

// Import tools
const { createListComponentsTool } = await import(
  '../dist/src/mcp/tools/components.js'
);
const {
  createListControlsTool,
  createGetControlValuesTool,
  createSetControlValuesTool,
} = await import('../dist/src/mcp/tools/controls.js');
const { createQueryCoreStatusTool } = await import(
  '../dist/src/mcp/tools/status.js'
);

// Test results
const results = [];
let passCount = 0;
let failCount = 0;

async function testTool(name, tool, params) {
  console.log(`\n📋 Testing ${name}...`);

  try {
    const ctx = {
      requestId: randomUUID(),
      toolName: name,
      startTime: Date.now(),
    };

    const result = await tool.execute(params, ctx);

    // Check if response is JSON
    const text = result.content[0].text;
    console.log(`Response length: ${text.length} chars`);
    console.log(`First 100 chars: ${text.substring(0, 100)}...`);

    // Try to parse as JSON
    const parsed = JSON.parse(text);

    // Verify it's the expected data structure
    if (name === 'list_components' || name === 'list_controls') {
      if (!Array.isArray(parsed)) {
        throw new Error(`Expected array, got ${typeof parsed}`);
      }
      console.log(`✅ Returns valid JSON array with ${parsed.length} items`);
    } else if (name === 'get_control_values') {
      if (!Array.isArray(parsed)) {
        throw new Error(`Expected array, got ${typeof parsed}`);
      }
      console.log(`✅ Returns valid JSON array of control values`);
    } else if (name === 'set_control_values') {
      if (!Array.isArray(parsed)) {
        throw new Error(`Expected array, got ${typeof parsed}`);
      }
      console.log(`✅ Returns valid JSON array of results`);
    } else if (name === 'query_core_status') {
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error(`Expected object, got ${typeof parsed}`);
      }
      console.log(`✅ Returns valid JSON object`);
    }

    results.push({ tool: name, status: 'PASS' });
    passCount++;
  } catch (error) {
    console.error(`❌ FAIL: ${error.message}`);
    results.push({ tool: name, status: 'FAIL', error: error.message });
    failCount++;
  }
}

async function runTests() {
  console.log('🧪 BUG-042 Verification Test');
  console.log('Testing that all MCP tools return JSON responses');
  console.log(`Target: ${config.host}:${config.port}`);

  // Create and connect client
  const officialClient = new OfficialQRWCClient({
    host: config.host,
    port: config.port,
    connectionTimeout: 10000,
  });

  try {
    console.log('\n🔌 Connecting...');
    await officialClient.connect();
    console.log('✅ Connected');

    // Wait for sync
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Create adapter and tools
    const adapter = new QRWCClientAdapter(officialClient);
    const tools = {
      list_components: createListComponentsTool(adapter),
      list_controls: createListControlsTool(adapter),
      get_control_values: createGetControlValuesTool(adapter),
      set_control_values: createSetControlValuesTool(adapter),
      query_core_status: createQueryCoreStatusTool(adapter),
    };

    // Test each tool
    await testTool('list_components', tools.list_components, {
      requestId: randomUUID(),
    });

    await testTool('list_controls', tools.list_controls, {
      requestId: randomUUID(),
      controlType: 'all',
    });

    await testTool('query_core_status', tools.query_core_status, {
      requestId: randomUUID(),
    });

    // Test get_control_values (need some controls first)
    const listResult = await tools.list_controls.execute(
      {
        requestId: randomUUID(),
        controlType: 'gain',
      },
      {
        requestId: randomUUID(),
        toolName: 'list_controls',
        startTime: Date.now(),
      }
    );

    const controls = JSON.parse(listResult.content[0].text);
    if (controls.length > 0) {
      const testControls = controls.slice(0, 3).map(c => c.name || c.Name);
      await testTool('get_control_values', tools.get_control_values, {
        requestId: randomUUID(),
        controls: testControls,
      });

      // Test set_control_values
      await testTool('set_control_values', tools.set_control_values, {
        requestId: randomUUID(),
        controls: [
          {
            name: testControls[0],
            value: 0,
          },
        ],
      });
    } else {
      console.log('\n⚠️  No controls available for get/set tests');
    }
  } finally {
    console.log('\n🔌 Disconnecting...');
    await officialClient.disconnect();
  }

  // Summary
  console.log(`\n${'='.repeat(50)}`);
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(50));
  console.log(`Total tests: ${results.length}`);
  console.log(`✅ Passed: ${passCount}`);
  console.log(`❌ Failed: ${failCount}`);

  console.log('\nDetailed Results:');
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    const detail = r.error ? ` - ${r.error}` : '';
    console.log(`${icon} ${r.tool}${detail}`);
  });

  if (failCount === 0) {
    console.log('\n🎉 BUG-042 FIXED! All tools return valid JSON.');
  } else {
    console.log('\n⚠️  BUG-042 NOT FIXED - Some tools still return non-JSON.');
  }

  process.exit(failCount > 0 ? 1 : 0);
}

runTests().catch(console.error);
