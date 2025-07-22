#!/usr/bin/env node

/**
 * Test for any remaining unhandled promise rejections
 */

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../..');

console.log('🧪 Testing for Unhandled Promise Rejections');
console.log('==================================================');

// Monitor process for 10 seconds for any unhandled rejections
const proc = spawn('node', [join(rootDir, 'dist/src/index.js')], {
  env: { ...process.env, NODE_ENV: 'production' },
  stdio: ['pipe', 'pipe', 'pipe']
});

let unhandledRejections = [];
let unhandledExceptions = [];
let output = '';
let errorOutput = '';

proc.stdout.on('data', (data) => {
  output += data.toString();
  console.log('[STDOUT]', data.toString().trim());
});

proc.stderr.on('data', (data) => {
  errorOutput += data.toString();
  console.log('[STDERR]', data.toString().trim());
  
  // Check for unhandled promise rejection warnings
  if (data.toString().includes('UnhandledPromiseRejectionWarning')) {
    unhandledRejections.push(data.toString());
  }
  
  // Check for deprecation warning about unhandled rejections
  if (data.toString().includes('DeprecationWarning') && data.toString().includes('unhandled')) {
    unhandledRejections.push(data.toString());
  }
});

// Test for 10 seconds
setTimeout(() => {
  console.log('\n==================================================');
  console.log('📊 Test Results:');
  console.log(`- Unhandled Rejections Found: ${unhandledRejections.length}`);
  console.log(`- Process Stable: ${proc.exitCode === null ? 'Yes' : 'No'}`);
  
  if (unhandledRejections.length > 0) {
    console.log('\n❌ FAILED: Found unhandled promise rejections:');
    unhandledRejections.forEach((rejection, i) => {
      console.log(`\n[${i + 1}] ${rejection}`);
    });
  } else {
    console.log('\n✅ PASSED: No unhandled promise rejections detected');
  }
  
  // Check if "Unhandled Rejection" was logged by our handler
  if (errorOutput.includes('💥 Unhandled Rejection')) {
    console.log('\n✅ Unhandled rejection handler is active and catching rejections');
  }
  
  console.log('==================================================');
  
  proc.kill('SIGTERM');
  process.exit(unhandledRejections.length > 0 ? 1 : 0);
}, 10000);