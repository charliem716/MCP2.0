#!/usr/bin/env node

// MCP Server Wrapper for Claude Desktop
// This ensures the server runs with proper MCP-compatible settings

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Change to the project directory
process.chdir(__dirname);

// Set up environment for MCP mode
// Disable all console output that would interfere with JSON-RPC
process.env.NODE_ENV = 'production';
process.env.MCP_MODE = 'true';
process.env.LOG_LEVEL = 'error'; // Only log errors
process.env.DISABLE_CONSOLE_LOGS = 'true';

// Spawn the actual MCP server
const server = spawn('node', ['dist/src/index.js'], {
  cwd: __dirname,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    MCP_MODE: 'true',
    LOG_LEVEL: 'error',
    DISABLE_CONSOLE_LOGS: 'true',
  },
});

// Handle exit
server.on('error', err => {
  // Don't use console.error in MCP mode
  process.exit(1);
});

server.on('exit', code => {
  process.exit(code || 0);
});
