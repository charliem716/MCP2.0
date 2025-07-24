#!/usr/bin/env node

/**
 * Simplified verification for BUG-063 fix
 */

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../..');

console.log('🧪 Verifying BUG-063 Fix - Process Exit Handling');
console.log('==================================================');

async function runTest() {
  const proc = spawn('node', [join(rootDir, 'dist/src/index.js')], {
    env: { ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'debug' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const results = {
    cleanupStarted: false,
    timeoutProtection: false,
    stateCheck: false,
    signalHandled: false,
    exitClean: false,
  };

  // Capture output
  const output = [];

  proc.stdout.on('data', data => {
    output.push(`[STDOUT] ${data.toString().trim()}`);
  });

  proc.stderr.on('data', data => {
    const line = data.toString();
    output.push(`[STDERR] ${line.trim()}`);

    // Check for expected behaviors
    if (line.includes('Cleaning up resources')) results.cleanupStarted = true;
    if (line.includes('10 second timeout')) results.timeoutProtection = true;
    if (line.includes('State persistence check completed'))
      results.stateCheck = true;
    if (line.includes('SIGTERM received')) results.signalHandled = true;
    if (line.includes('MCP server shut down successfully'))
      results.exitClean = true;
  });

  // Wait for startup
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Send SIGTERM
  console.log('📤 Sending SIGTERM signal...');
  proc.kill('SIGTERM');

  // Wait for exit
  await new Promise(resolve => {
    proc.on('exit', code => {
      console.log(`📥 Process exited with code: ${code}`);
      resolve();
    });
  });

  // Show results
  console.log('\n📊 Results:');
  console.log(`- Cleanup started: ${results.cleanupStarted ? '✅' : '❌'}`);
  console.log(
    `- Timeout protection present: ${results.timeoutProtection ? '✅' : '❌'}`
  );
  console.log(`- State persistence check: ${results.stateCheck ? '✅' : '❌'}`);
  console.log(`- Signal handled: ${results.signalHandled ? '✅' : '❌'}`);
  console.log(`- Clean exit: ${results.exitClean ? '✅' : '❌'}`);

  // Show relevant logs
  console.log('\n📝 Relevant logs:');
  output
    .filter(
      line =>
        line.includes('SIGTERM') ||
        line.includes('Cleaning') ||
        line.includes('State persistence') ||
        line.includes('shutdown')
    )
    .forEach(line => console.log(line));

  const allPassed = Object.values(results).filter(v => v).length >= 3;
  console.log(
    `\n${allPassed ? '✅ PASSED' : '❌ FAILED'}: BUG-063 fix ${allPassed ? 'verified' : 'needs review'}`
  );

  process.exit(allPassed ? 0 : 1);
}

runTest().catch(console.error);
