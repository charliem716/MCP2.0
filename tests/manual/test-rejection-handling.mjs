#!/usr/bin/env node

/**
 * Test rejection handling with simulated failures
 */

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../..');

console.log('🧪 Testing Promise Rejection Handling with Simulated Failures');
console.log('==================================================');

// Start with invalid Q-SYS host to trigger connection failures
const proc = spawn('node', [join(rootDir, 'dist/src/index.js')], {
  env: { 
    ...process.env, 
    NODE_ENV: 'test',
    QSYS_HOST: '192.168.99.99', // Invalid host to trigger connection failure
    QSYS_PORT: '443'
  },
  stdio: ['pipe', 'pipe', 'pipe']
});

let rejectionHandled = false;
let processStable = true;
let crashDetected = false;

proc.stdout.on('data', (data) => {
  console.log('[STDOUT]', data.toString().trim());
});

proc.stderr.on('data', (data) => {
  const output = data.toString();
  console.log('[STDERR]', output.trim());
  
  // Check if our handler caught the rejection
  if (output.includes('💥 Unhandled Rejection') || 
      output.includes('Error during') ||
      output.includes('Failed to connect')) {
    rejectionHandled = true;
  }
  
  // Check for Node.js unhandled rejection warnings
  if (output.includes('UnhandledPromiseRejectionWarning')) {
    processStable = false;
  }
});

proc.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    crashDetected = true;
  }
});

// Run for 5 seconds
setTimeout(() => {
  console.log('\n==================================================');
  console.log('📊 Test Results:');
  console.log(`- Rejection Handled by Our Code: ${rejectionHandled ? 'Yes ✅' : 'No ❌'}`);
  console.log(`- No Unhandled Rejection Warnings: ${processStable ? 'Yes ✅' : 'No ❌'}`);
  console.log(`- Process Did Not Crash: ${!crashDetected ? 'Yes ✅' : 'No ❌'}`);
  
  const allPassed = rejectionHandled && processStable && !crashDetected;
  
  console.log(`\n${allPassed ? '✅ PASSED' : '❌ FAILED'}: Promise rejection handling ${allPassed ? 'working correctly' : 'has issues'}`);
  console.log('==================================================');
  
  proc.kill('SIGTERM');
  process.exit(allPassed ? 0 : 1);
}, 5000);