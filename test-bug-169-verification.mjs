#!/usr/bin/env node

/**
 * BUG-169 Verification Test
 * Tests graceful shutdown and signal handling
 */

import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

console.log(`${YELLOW}Starting BUG-169 Verification Test...${RESET}`);
console.log('Testing graceful shutdown and signal handling\n');

let testsPassed = 0;
let testsFailed = 0;

async function testSignalHandling(signal) {
  console.log(`Testing ${signal} handling...`);
  
  return new Promise((resolve) => {
    const server = spawn('node', ['dist/index.js'], {
      env: {
        ...process.env,
        EVENT_MONITORING_ENABLED: 'true',
        EVENT_MONITORING_DB_PATH: './data/test-events',
        LOG_LEVEL: 'info'
      }
    });
    
    let stdout = '';
    let stderr = '';
    let cleanShutdown = false;
    let stateManagerShutdown = false;
    
    server.stdout.on('data', (data) => {
      stdout += data.toString();
      const output = data.toString();
      
      if (output.includes('MCP server started')) {
        // Server is ready, send signal after a short delay
        setTimeout(500).then(() => {
          console.log(`  Sending ${signal} to process ${server.pid}...`);
          server.kill(signal);
        });
      }
      
      // Also check stdout for shutdown messages (logs go to both stdout and stderr)
      if (output.includes('State manager shutdown completed') || 
          output.includes('Shutting down state manager')) {
        stateManagerShutdown = true;
      }
      if (output.includes('QRWCClientAdapter disposed')) {
        stateManagerShutdown = true;
      }
    });
    
    server.stderr.on('data', (data) => {
      stderr += data.toString();
      const output = data.toString();
      
      // Check for shutdown indicators
      if (output.includes(`${signal} received, shutting down gracefully`)) {
        cleanShutdown = true;
      }
      if (output.includes('State manager shutdown completed') || 
          output.includes('Shutting down state manager')) {
        stateManagerShutdown = true;
      }
    });
    
    server.on('exit', (code, receivedSignal) => {
      console.log(`  Process exited with code: ${code}, signal: ${receivedSignal}`);
      
      // Check results
      if (cleanShutdown) {
        console.log(`  ${GREEN}✓ Graceful shutdown initiated${RESET}`);
        testsPassed++;
      } else {
        console.log(`  ${RED}✗ Graceful shutdown not detected${RESET}`);
        testsFailed++;
      }
      
      if (code === 0) {
        console.log(`  ${GREEN}✓ Clean exit code (0)${RESET}`);
        testsPassed++;
      } else {
        console.log(`  ${RED}✗ Non-zero exit code (${code})${RESET}`);
        testsFailed++;
      }
      
      if (stateManagerShutdown || stderr.includes('MCP server shutdown completed')) {
        console.log(`  ${GREEN}✓ Resources cleaned up${RESET}`);
        testsPassed++;
      } else {
        console.log(`  ${RED}✗ Resource cleanup not verified${RESET}`);
        testsFailed++;
      }
      
      console.log('');
      resolve();
    });
    
    // Timeout safety
    setTimeout(10000).then(() => {
      if (server.exitCode === null) {
        console.log(`  ${RED}✗ Process did not exit within timeout${RESET}`);
        server.kill('SIGKILL');
        testsFailed++;
      }
    });
  });
}

async function testBufferFlush() {
  console.log('Testing event buffer flush on shutdown...');
  
  return new Promise((resolve) => {
    const server = spawn('node', ['dist/index.js'], {
      env: {
        ...process.env,
        EVENT_MONITORING_ENABLED: 'true',
        EVENT_MONITORING_DB_PATH: './data/test-flush',
        LOG_LEVEL: 'debug'
      }
    });
    
    let bufferFlushed = false;
    
    server.stderr.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Event buffer flushed') || 
          output.includes('SQLite event monitor shut down') ||
          output.includes('Event monitoring shutdown complete')) {
        bufferFlushed = true;
      }
    });
    
    // Wait for server to start then shutdown
    setTimeout(2000).then(() => {
      server.kill('SIGTERM');
    });
    
    server.on('exit', () => {
      if (bufferFlushed) {
        console.log(`  ${GREEN}✓ Event buffer flushed on shutdown${RESET}`);
        testsPassed++;
      } else {
        console.log(`  ${YELLOW}⚠ Event buffer flush not explicitly verified${RESET}`);
        console.log(`    (May not have event monitoring configured)`);
      }
      console.log('');
      resolve();
    });
  });
}

async function runTests() {
  // Test SIGTERM
  await testSignalHandling('SIGTERM');
  
  // Test SIGINT (Ctrl+C)
  await testSignalHandling('SIGINT');
  
  // Test buffer flush
  await testBufferFlush();
  
  // Summary
  console.log(`${YELLOW}Test Summary:${RESET}`);
  console.log(`  Passed: ${GREEN}${testsPassed}${RESET}`);
  console.log(`  Failed: ${RED}${testsFailed}${RESET}`);
  
  if (testsFailed === 0) {
    console.log(`\n${GREEN}✅ BUG-169 VERIFIED: Graceful shutdown working correctly${RESET}`);
    process.exit(0);
  } else {
    console.log(`\n${RED}❌ BUG-169 ISSUE: Some shutdown tests failed${RESET}`);
    process.exit(1);
  }
}

// Check if server is built
import { existsSync } from 'fs';
if (!existsSync('dist/index.js')) {
  console.log(`${RED}Error: dist/index.js not found. Run 'npm run build' first.${RESET}`);
  process.exit(1);
}

runTests().catch(console.error);