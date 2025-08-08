#!/usr/bin/env node

import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

console.log('BUG-169 Verification Test');
console.log('=========================\n');

const env = {
  ...process.env,
  EVENT_MONITORING_ENABLED: 'true',
  EVENT_MONITORING_DB_PATH: './data/bug169-test',
  LOG_LEVEL: 'info'
};

const child = spawn('npm', ['start'], { env, stdio: ['pipe', 'pipe', 'pipe'] });

let checkpoints = {
  serverStarted: false,
  sigTermReceived: false,
  mcpShutdown: false,
  adapterDispose: false,
  stateManagerShutdown: false,
  cleanupCompleted: false,
  exitCode: null
};

child.stdout.on('data', (data) => {
  const text = data.toString();
  
  if (text.includes('MCP Voice/Text-Controlled Q-SYS Demo is ready')) {
    checkpoints.serverStarted = true;
  }
  if (text.includes('SIGTERM received')) {
    checkpoints.sigTermReceived = true;
  }
  if (text.includes('MCP server shutdown completed')) {
    checkpoints.mcpShutdown = true;
  }
  if (text.includes('Disposing QRWCClientAdapter') || text.includes('Disposing control system adapter')) {
    checkpoints.adapterDispose = true;
  }
  if (text.includes('Shutting down state manager') || text.includes('State manager shutdown')) {
    checkpoints.stateManagerShutdown = true;
  }
  if (text.includes('Cleanup completed')) {
    checkpoints.cleanupCompleted = true;
  }
});

child.on('exit', (code) => {
  checkpoints.exitCode = code;
  
  console.log('\nShutdown Chain Verification:');
  console.log('-----------------------------');
  console.log(`1. Server Started:          ${checkpoints.serverStarted ? '✅' : '❌'}`);
  console.log(`2. SIGTERM Received:        ${checkpoints.sigTermReceived ? '✅' : '❌'}`);
  console.log(`3. MCP Server Shutdown:     ${checkpoints.mcpShutdown ? '✅' : '❌'}`);
  console.log(`4. Adapter Disposed:        ${checkpoints.adapterDispose ? '✅' : '❌'}`);
  console.log(`5. State Manager Shutdown:  ${checkpoints.stateManagerShutdown ? '✅' : '⚠️  (if configured)'}`);
  console.log(`6. Cleanup Completed:       ${checkpoints.cleanupCompleted ? '✅' : '❌'}`);
  console.log(`7. Exit Code 0:             ${code === 0 ? '✅' : '❌'} (${code})`);
  
  const critical = checkpoints.serverStarted && 
                   checkpoints.sigTermReceived && 
                   checkpoints.cleanupCompleted && 
                   code === 0;
  
  console.log('\n' + '='.repeat(40));
  console.log(`BUG-169 Status: ${critical ? '✅ RESOLVED' : '❌ STILL FAILING'}`);
  console.log('='.repeat(40));
  
  process.exit(critical ? 0 : 1);
});

// Wait for server to start
await setTimeout(3000);

// Send SIGTERM
child.kill('SIGTERM');

// Wait for shutdown
await setTimeout(10000);

// Force kill if needed
if (!child.killed) {
  child.kill('SIGKILL');
}
