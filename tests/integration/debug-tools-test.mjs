#!/usr/bin/env node

/**
 * Debug version of MCP Tools Test
 * Shows raw responses to understand what's happening
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load configuration
const configPath = join(__dirname, '../../qsys-core.config.json');
const configData = JSON.parse(readFileSync(configPath, 'utf8'));
const config = configData.qsysCore;

// Import modules
const { OfficialQRWCClient } = await import(
  '../../dist/src/qrwc/officialClient.js'
);
const { QRWCClientAdapter } = await import(
  '../../dist/src/mcp/qrwc/adapter.js'
);
const { createListComponentsTool } = await import(
  '../../dist/src/mcp/tools/components.js'
);

async function debugTest() {
  console.log('🧪 Debug MCP Tools Test');
  console.log(`📍 Target: ${config.host}:${config.port}`);

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

    // Create adapter and tool
    const adapter = new QRWCClientAdapter(officialClient);
    const listComponentsTool = createListComponentsTool(adapter);

    // Test list_components
    console.log('\n📋 Testing list_components...');
    const ctx = {
      requestId: randomUUID(),
      toolName: 'list_components',
      startTime: Date.now(),
    };

    const result = await listComponentsTool.execute(
      {
        requestId: ctx.requestId,
      },
      ctx
    );

    console.log('\n📦 Raw result:');
    console.log(JSON.stringify(result, null, 2));

    console.log('\n📄 Content type:', typeof result.content[0].text);
    console.log('📏 Content length:', result.content[0].text.length);
    console.log(
      '🔤 First 200 chars:',
      result.content[0].text.substring(0, 200)
    );

    // Try to parse
    try {
      const parsed = JSON.parse(result.content[0].text);
      console.log('\n✅ Successfully parsed as JSON');
      console.log(
        '🔢 Array length:',
        Array.isArray(parsed) ? parsed.length : 'Not an array'
      );
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log('📋 First item:', JSON.stringify(parsed[0], null, 2));
      }
    } catch (e) {
      console.log('\n❌ Failed to parse as JSON:', e.message);
    }
  } finally {
    console.log('\n🔌 Disconnecting...');
    await officialClient.disconnect();
    console.log('✅ Disconnected');
  }
}

debugTest().catch(console.error);
