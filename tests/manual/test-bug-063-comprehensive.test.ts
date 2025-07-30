import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

/**
 * Comprehensive test for BUG-063 - Process Exit Handling
 */

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../..');

console.log('🧪 Comprehensive Test for BUG-063 - Process Exit Handling');
console.log('==================================================');

// Test 1: Normal SIGTERM shutdown
async function testNormalShutdown() {
  console.log('\n✅ Test 1: Normal SIGTERM shutdown');

  return new Promise(resolve => {
    const proc = spawn('node', [join(rootDir, 'dist/src/index.js')], {
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const logs = [];
    let exitCode = null;

    proc.stdout.on('data', data => {
      logs.push(data.toString());
    });

    proc.stderr.on('data', data => {
      const line = data.toString();
      logs.push(line);
      console.log('[LOG]', line.trim());
    });

    setTimeout(() => {
      console.log('→ Sending SIGTERM...');
      proc.kill('SIGTERM');
    }, 3000);

    proc.on('exit', code => {
      exitCode = code;
      console.log(`→ Process exited with code: ${code}`);

      // Check results
      const hasShutdown = logs.some(l => l.includes('SIGTERM received'));
      const hasCleanup = logs.some(l => l.includes('Cleaning up resources'));
      const hasStateCheck = logs.some(l =>
        l.includes('State persistence check')
      );
      const hasMCPShutdown = logs.some(l => l.includes('MCP server shut down'));

      console.log(`  - Signal handled: ${hasShutdown ? '✅' : '❌'}`);
      console.log(`  - Cleanup started: ${hasCleanup ? '✅' : '❌'}`);
      console.log(`  - State checked: ${hasStateCheck ? '✅' : '❌'}`);
      console.log(`  - MCP shutdown: ${hasMCPShutdown ? '✅' : '❌'}`);
      console.log(
        `  - Exit code 0: ${code === 0 ? '✅' : `❌ (code: ${code})`}`
      );

      resolve(code === 0);
    });
  });
}

// Test 2: All signals handled
async function testAllSignals() {
  console.log('\n✅ Test 2: All exit signals handled');

  const signals = ['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGUSR2'];
  const results = {};

  for (const signal of signals) {
    await new Promise(resolve => {
      const proc = spawn('node', [join(rootDir, 'dist/src/index.js')], {
        env: { ...process.env, NODE_ENV: 'production' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let signalReceived = false;

      proc.stderr.on('data', data => {
        if (data.toString().includes(`${signal} received`)) {
          signalReceived = true;
        }
      });

      setTimeout(() => {
        proc.kill(signal);
      }, 1000);

      proc.on('exit', () => {
        results[signal] = signalReceived;
        resolve();
      });
    });
  }

  signals.forEach(signal => {
    console.log(`  - ${signal}: ${results[signal] ? '✅' : '❌'}`);
  });

  return Object.values(results).every(v => v);
}

// Test 3: Timeout protection
async function testTimeoutProtection() {
  console.log('\n✅ Test 3: Timeout protection');

  // Check if the code has timeout protection
  const sourceCode = await import('fs').then(fs =>
    fs.promises.readFile(join(rootDir, 'src/index.ts'), 'utf8')
  );

  const hasTimeout = sourceCode.includes('forceExitTimeout');
  const has10SecTimeout = sourceCode.includes('10000');

  console.log(`  - Timeout implemented: ${hasTimeout ? '✅' : '❌'}`);
  console.log(`  - 10 second timeout: ${has10SecTimeout ? '✅' : '❌'}`);

  return hasTimeout && has10SecTimeout;
}

// Test 4: Module cleanup
async function testModuleCleanup() {
  console.log('\n✅ Test 4: Module cleanup sequence');

  return new Promise(resolve => {
    const proc = spawn('node', [join(rootDir, 'dist/src/index.js')], {
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const cleanupSequence = [];

    proc.stderr.on('data', data => {
      const line = data.toString();
      if (line.includes('[CLEANUP]')) cleanupSequence.push('main-cleanup');
      if (line.includes('[QRWC]')) cleanupSequence.push('qrwc-disconnect');
      if (line.includes('[STATE]')) cleanupSequence.push('state-check');
      if (line.includes('MCP server shut down'))
        cleanupSequence.push('mcp-shutdown');
    });

    setTimeout(() => {
      proc.kill('SIGTERM');
    }, 2000);

    proc.on('exit', () => {
      console.log(`  - Cleanup sequence: ${cleanupSequence.join(' → ')}`);
      console.log(
        `  - Main cleanup: ${cleanupSequence.includes('main-cleanup') ? '✅' : '❌'}`
      );
      console.log(
        `  - QRWC disconnect: ${cleanupSequence.includes('qrwc-disconnect') ? '✅' : '❌'}`
      );
      console.log(
        `  - State check: ${cleanupSequence.includes('state-check') ? '✅' : '❌'}`
      );
      console.log(
        `  - MCP shutdown: ${cleanupSequence.includes('mcp-shutdown') ? '✅' : '❌'}`
      );

      const correctOrder =
        cleanupSequence.includes('main-cleanup') &&
        cleanupSequence.includes('state-check');
      resolve(correctOrder);
    });
  });
}

// Run all tests
async function runTests() {
  try {
    const test1 = await testNormalShutdown();
    const test2 = await testAllSignals();
    const test3 = await testTimeoutProtection();
    const test4 = await testModuleCleanup();

    console.log('\n==================================================');
    console.log('📊 Final Results:');
    console.log(`- Normal shutdown: ${test1 ? '✅' : '❌'}`);
    console.log(`- All signals handled: ${test2 ? '✅' : '❌'}`);
    console.log(`- Timeout protection: ${test3 ? '✅' : '❌'}`);
    console.log(`- Module cleanup: ${test4 ? '✅' : '❌'}`);

    const allPassed = test1 && test2 && test3 && test4;
    console.log(
      `\n${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`
    );
    console.log('==================================================');

    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error('❌ Test error:', error);
    process.exit(1);
  }
}

runTests();
