#!/usr/bin/env node

/**
 * Check what tool descriptions agents would see
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load modules
const { OfficialQRWCClient } = await import(
  '../../dist/src/qrwc/officialClient.js'
);
const { QRWCClientAdapter } = await import(
  '../../dist/src/mcp/qrwc/adapter.js'
);
const { MCPToolRegistry } = await import(
  '../../dist/src/mcp/handlers/index.js'
);

// Load config
const configPath = join(__dirname, '../../qsys-core.config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8')).qsysCore;

console.log('MCP Tool Descriptions (What Agents See)');
console.log('======================================\n');

// Create mock client and registry
const client = new OfficialQRWCClient(config);
const adapter = new QRWCClientAdapter(client);
const registry = new MCPToolRegistry(adapter);

// Initialize to load tools
await registry.initialize();

// Get all tools
const tools = await registry.listTools();

// Find and display send_raw_command
const rawCmdTool = tools.find(t => t.name === 'send_raw_command');
if (rawCmdTool) {
  console.log('Tool: send_raw_command');
  console.log('Description:');
  console.log(rawCmdTool.description);
  console.log('\nInput Schema:');
  console.log(JSON.stringify(rawCmdTool.inputSchema, null, 2));
} else {
  console.log('send_raw_command tool not found!');
}

process.exit(0);
