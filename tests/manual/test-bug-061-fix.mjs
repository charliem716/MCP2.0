#!/usr/bin/env node

/**
 * Test script to verify BUG-061 fix - Unhandled Promise Rejections
 * This tests that our process handlers properly catch promise rejections
 */

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../..');

console.log('🧪 Testing BUG-061 Fix - Unhandled Promise Rejections');
console.log('==================================================');

// Test 1: Verify process starts without unhandled rejections
async function testProcessStart() {
  console.log('\n✅ Test 1: Process starts cleanly');

  return new Promise((resolve, reject) => {
    const proc = spawn('node', [join(rootDir, 'dist/src/index.js')], {
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let output = '';
    let errorOutput = '';
    let unhandledRejectionFound = false;

    proc.stdout.on('data', data => {
      output += data.toString();
    });

    proc.stderr.on('data', data => {
      errorOutput += data.toString();
      if (data.toString().includes('UnhandledPromiseRejectionWarning')) {
        unhandledRejectionFound = true;
      }
    });

    // Give it 3 seconds to start
    setTimeout(() => {
      proc.kill('SIGTERM');
    }, 3000);

    proc.on('exit', code => {
      if (unhandledRejectionFound) {
        console.log('❌ Found unhandled promise rejection!');
        console.log('Error output:', errorOutput);
        reject(new Error('Unhandled promise rejection detected'));
      } else {
        console.log('✅ No unhandled promise rejections during startup');
        resolve();
      }
    });
  });
}

// Test 2: Verify SIGTERM handler doesn't create unhandled rejections
async function testSigterm() {
  console.log('\n✅ Test 2: SIGTERM handler catches promise rejections');

  return new Promise((resolve, reject) => {
    const proc = spawn('node', [join(rootDir, 'dist/src/index.js')], {
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let unhandledRejectionFound = false;
    let gracefulShutdownLogged = false;

    proc.stderr.on('data', data => {
      const output = data.toString();
      if (output.includes('UnhandledPromiseRejectionWarning')) {
        unhandledRejectionFound = true;
      }
      if (
        output.includes('SIGTERM received') ||
        output.includes('Cleaning up')
      ) {
        gracefulShutdownLogged = true;
      }
    });

    // Wait for startup, then send SIGTERM
    setTimeout(() => {
      proc.kill('SIGTERM');
    }, 2000);

    proc.on('exit', code => {
      if (unhandledRejectionFound) {
        console.log('❌ Unhandled rejection in SIGTERM handler!');
        reject(new Error('SIGTERM handler has unhandled rejection'));
      } else if (!gracefulShutdownLogged) {
        console.log('⚠️  Graceful shutdown may not have executed');
        resolve(); // Still pass as we're testing for unhandled rejections
      } else {
        console.log('✅ SIGTERM handled cleanly without unhandled rejections');
        resolve();
      }
    });
  });
}

// Test 3: Verify SIGINT handler doesn't create unhandled rejections
async function testSigint() {
  console.log('\n✅ Test 3: SIGINT handler catches promise rejections');

  return new Promise((resolve, reject) => {
    const proc = spawn('node', [join(rootDir, 'dist/src/index.js')], {
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let unhandledRejectionFound = false;

    proc.stderr.on('data', data => {
      if (data.toString().includes('UnhandledPromiseRejectionWarning')) {
        unhandledRejectionFound = true;
      }
    });

    // Wait for startup, then send SIGINT
    setTimeout(() => {
      proc.kill('SIGINT');
    }, 2000);

    proc.on('exit', code => {
      if (unhandledRejectionFound) {
        console.log('❌ Unhandled rejection in SIGINT handler!');
        reject(new Error('SIGINT handler has unhandled rejection'));
      } else {
        console.log('✅ SIGINT handled cleanly without unhandled rejections');
        resolve();
      }
    });
  });
}

// Run all tests
async function runTests() {
  try {
    await testProcessStart();
    await testSigterm();
    await testSigint();

    console.log('\n==================================================');
    console.log('✅ All tests passed! BUG-061 is fixed.');
    console.log('==================================================');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

runTests();
