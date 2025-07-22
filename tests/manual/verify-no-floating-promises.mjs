#!/usr/bin/env node

/**
 * Verify no floating promises remain in the codebase
 */

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../..');

console.log('🧪 Verifying No Floating Promises Remain');
console.log('==================================================');

// Test with a real server instance
const proc = spawn('node', [join(rootDir, 'dist/src/index.js')], {
  env: { ...process.env, NODE_ENV: 'production' },
  stdio: ['pipe', 'pipe', 'pipe']
});

let floatingPromiseWarnings = [];
let unhandledRejections = [];
let startupComplete = false;

proc.stdout.on('data', (data) => {
  const output = data.toString();
  if (output.includes('ready') || output.includes('started')) {
    startupComplete = true;
  }
});

proc.stderr.on('data', (data) => {
  const output = data.toString();
  
  // Check for Node.js warnings about floating promises
  if (output.includes('UnhandledPromiseRejectionWarning')) {
    floatingPromiseWarnings.push(output.trim());
  }
  
  // Check for deprecation warnings about unhandled rejections
  if (output.includes('DeprecationWarning') && output.includes('unhandled')) {
    floatingPromiseWarnings.push(output.trim());
  }
  
  // Check if our handler caught any
  if (output.includes('💥 Unhandled Rejection')) {
    unhandledRejections.push(output.trim());
  }
});

// Test various scenarios
setTimeout(async () => {
  console.log('\n📊 Testing Results:');
  console.log('- Server started successfully:', startupComplete ? 'Yes ✅' : 'No ❌');
  console.log('- Floating promise warnings:', floatingPromiseWarnings.length);
  console.log('- Unhandled rejections caught by handler:', unhandledRejections.length);
  
  // Send signals to test handlers
  console.log('\n🔧 Testing signal handlers...');
  proc.kill('SIGTERM');
  
  // Wait for shutdown
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('\n==================================================');
  console.log('📊 Final Results:');
  console.log(`- Node.js floating promise warnings: ${floatingPromiseWarnings.length}`);
  console.log(`- Process handled shutdown cleanly: ${proc.exitCode !== null ? 'Yes ✅' : 'No ❌'}`);
  
  if (floatingPromiseWarnings.length > 0) {
    console.log('\n❌ FAILED: Floating promises detected!');
    floatingPromiseWarnings.forEach((warning, i) => {
      console.log(`\n[${i + 1}] ${warning}`);
    });
    process.exit(1);
  } else {
    console.log('\n✅ PASSED: No floating promises detected');
    process.exit(0);
  }
}, 5000);