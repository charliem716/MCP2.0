#!/usr/bin/env node

import { readFileSync } from 'fs';
import { OfficialQRWCClient } from '../dist/src/qrwc/officialClient.js';
import { QRWCClientAdapter } from '../dist/src/mcp/qrwc/adapter.js';
import { createListComponentsTool } from '../dist/src/mcp/tools/components.js';
import { createListControlsTool } from '../dist/src/mcp/tools/controls.js';
import { createQueryCoreStatusTool } from '../dist/src/mcp/tools/status.js';
import { randomUUID } from 'crypto';

const config = JSON.parse(readFileSync('./qsys-core.config.json', 'utf8')).qsysCore;
const client = new OfficialQRWCClient({ host: config.host, port: config.port, connectionTimeout: 10000 });

console.log('BUG-042 Final Verification\n');

(async () => {
  await client.connect();
  console.log('✅ Connected to Q-SYS Core\n');
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const adapter = new QRWCClientAdapter(client);
  const tools = {
    list_components: createListComponentsTool(adapter),
    list_controls: createListControlsTool(adapter),
    query_core_status: createQueryCoreStatusTool(adapter)
  };
  
  const context = { requestId: randomUUID(), toolName: 'test', startTime: Date.now() };
  
  // Test 1: list_components
  console.log('1. Testing list_components:');
  const compResult = await tools.list_components.execute({ requestId: randomUUID() }, context);
  const compText = compResult.content[0].text;
  console.log(`   Raw response (first 100 chars): ${compText.substring(0, 100)}...`);
  
  try {
    const components = JSON.parse(compText);
    console.log(`   ✅ Valid JSON - Array of ${components.length} components`);
    console.log(`   Sample: ${JSON.stringify(components[0])}\n`);
  } catch (e) {
    console.log(`   ❌ Not JSON: ${e.message}\n`);
  }
  
  // Test 2: list_controls  
  console.log('2. Testing list_controls:');
  const ctrlResult = await tools.list_controls.execute({ 
    requestId: randomUUID(), 
    controlType: 'gain' 
  }, context);
  const ctrlText = ctrlResult.content[0].text;
  console.log(`   Raw response (first 100 chars): ${ctrlText.substring(0, 100)}...`);
  
  try {
    const controls = JSON.parse(ctrlText);
    console.log(`   ✅ Valid JSON - Array of ${controls.length} controls`);
    console.log(`   Sample: ${JSON.stringify(controls[0])}\n`);
  } catch (e) {
    console.log(`   ❌ Not JSON: ${e.message}\n`);
  }
  
  // Test 3: query_core_status
  console.log('3. Testing query_core_status:');
  const statusResult = await tools.query_core_status.execute({ requestId: randomUUID() }, context);
  const statusText = statusResult.content[0].text;
  console.log(`   Raw response (first 100 chars): ${statusText.substring(0, 100)}...`);
  
  try {
    const status = JSON.parse(statusText);
    console.log(`   ✅ Valid JSON - Object with keys: ${Object.keys(status).slice(0, 5).join(', ')}...`);
  } catch (e) {
    console.log(`   ❌ Not JSON: ${e.message}`);
  }
  
  await client.disconnect();
  console.log('\n✅ Test complete');
})().catch(console.error);