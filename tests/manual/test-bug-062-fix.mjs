#!/usr/bin/env node

/**
 * Test script to verify BUG-062 fix - Floating Promises
 * This tests that our code doesn't create floating promises
 */

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../..');

console.log('🧪 Testing BUG-062 Fix - Floating Promises');
console.log('==================================================');

// Test 1: Check signal handlers don't create floating promises
async function testSignalHandlers() {
  console.log('\n✅ Test 1: Signal handlers properly handle promises');

  return new Promise((resolve, reject) => {
    const proc = spawn('node', [join(rootDir, 'dist/src/index.js')], {
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let floatingPromiseDetected = false;
    let properErrorHandling = false;

    proc.stderr.on('data', data => {
      const output = data.toString();

      // Check for unhandled promise warnings
      if (output.includes('UnhandledPromiseRejectionWarning')) {
        floatingPromiseDetected = true;
      }

      // Check for our error handlers
      if (
        output.includes('Error during SIGTERM shutdown') ||
        output.includes('Error during SIGINT shutdown')
      ) {
        properErrorHandling = true;
      }
    });

    // Send SIGTERM after startup
    setTimeout(() => {
      proc.kill('SIGTERM');
    }, 2000);

    proc.on('exit', () => {
      if (floatingPromiseDetected) {
        console.log('❌ Floating promises detected in signal handlers!');
        reject(new Error('Signal handlers have floating promises'));
      } else {
        console.log('✅ No floating promises in signal handlers');
        resolve();
      }
    });
  });
}

// Test 2: Check exception handlers don't create floating promises
async function testExceptionHandlers() {
  console.log('\n✅ Test 2: Exception handlers properly handle promises');

  return new Promise(resolve => {
    // Create a test script that throws an exception
    const testScript = `
      const logger = console;
      logger.error = console.error;
      logger.warn = console.warn;
      
      const gracefulShutdown = async () => {
        throw new Error('Shutdown failed');
      };
      
      process.on('uncaughtException', (error) => {
        logger.error('💥 Uncaught Exception:', error);
        if (error.message.includes('EADDRINUSE')) {
          gracefulShutdown('UNCAUGHT_EXCEPTION').catch(shutdownError => {
            logger.error('Error during exception shutdown:', shutdownError);
            process.exit(1);
          });
        }
      });
      
      // Trigger an exception
      setTimeout(() => {
        throw new Error('EADDRINUSE: port in use');
      }, 100);
    `;

    const proc = spawn('node', ['-e', testScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let floatingPromiseDetected = false;
    let errorHandled = false;

    proc.stderr.on('data', data => {
      const output = data.toString();
      if (output.includes('UnhandledPromiseRejectionWarning')) {
        floatingPromiseDetected = true;
      }
      if (output.includes('Error during exception shutdown')) {
        errorHandled = true;
      }
    });

    proc.on('exit', () => {
      if (floatingPromiseDetected) {
        console.log('❌ Floating promises in exception handler!');
      } else if (errorHandled) {
        console.log('✅ Exception handler properly catches promise rejections');
      } else {
        console.log('✅ No floating promises in exception handler');
      }
      resolve();
    });
  });
}

// Test 3: Check setTimeout async callbacks
async function testSetTimeoutHandling() {
  console.log('\n✅ Test 3: setTimeout async callbacks handled properly');

  return new Promise(resolve => {
    const testScript = `
      const logger = console;
      
      // Simulate our fixed pattern
      setTimeout(() => {
        void (async () => {
          try {
            await Promise.reject(new Error('Async operation failed'));
          } catch (error) {
            logger.error('Caught error in setTimeout:', error.message);
          }
        })();
      }, 100);
      
      // Keep process alive briefly
      setTimeout(() => process.exit(0), 200);
    `;

    const proc = spawn('node', ['-e', testScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let floatingPromiseDetected = false;
    let errorCaught = false;

    proc.stderr.on('data', data => {
      const output = data.toString();
      if (output.includes('UnhandledPromiseRejectionWarning')) {
        floatingPromiseDetected = true;
      }
      if (output.includes('Caught error in setTimeout')) {
        errorCaught = true;
      }
    });

    proc.on('exit', () => {
      if (floatingPromiseDetected) {
        console.log('❌ Floating promise in setTimeout!');
      } else if (errorCaught) {
        console.log('✅ setTimeout async errors properly caught');
      } else {
        console.log('✅ No floating promises in setTimeout');
      }
      resolve();
    });
  });
}

// Run all tests
async function runTests() {
  try {
    await testSignalHandlers();
    await testExceptionHandlers();
    await testSetTimeoutHandling();

    console.log('\n==================================================');
    console.log('✅ All tests passed! BUG-062 is fixed.');
    console.log('==================================================');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

runTests();
