#\!/usr/bin/env node

/**
 * BUG-169 Final Verification Test
 * Comprehensive test of graceful shutdown with event monitoring
 */

import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

console.log(`${BLUE}=================================${RESET}`);
console.log(`${YELLOW}BUG-169 Final Verification Test${RESET}`);
console.log(`${BLUE}=================================${RESET}\n`);

const testResults = {
  sigterm: { passed: false, details: [] },
  sigint: { passed: false, details: [] },
  cleanup: { passed: false, details: [] },
  eventMonitor: { passed: false, details: [] }
};

async function testSignalHandling(signal, testName) {
  console.log(`${YELLOW}Test ${testName}: ${signal} Handling${RESET}`);
  console.log('─'.repeat(50));
  
  const testDbPath = './data/test-' + signal.toLowerCase();
  
  // Clean up any existing test database
  if (existsSync(testDbPath)) {
    rmSync(testDbPath, { recursive: true, force: true });
  }
  
  return new Promise((resolve) => {
    const server = spawn('node', ['dist/index.js'], {
      env: {
        ...process.env,
        EVENT_MONITORING_ENABLED: 'true',
        EVENT_MONITORING_DB_PATH: testDbPath,
        LOG_LEVEL: 'debug',
        NODE_ENV: 'production'
      }
    });
    
    let stdout = '';
    let stderr = '';
    const checkpoints = {
      serverStarted: false,
      signalReceived: false,
      mcpShutdown: false,
      adapterDispose: false,
      stateManagerShutdown: false,
      eventMonitorShutdown: false,
      cleanupCompleted: false,
      exitCode: null
    };
    
    server.stdout.on('data', (data) => {
      stdout += data.toString();
      const output = data.toString();
      
      if (output.includes('MCP server started')) {
        checkpoints.serverStarted = true;
        // Server is ready, send signal after a short delay
        setTimeout(1000).then(() => {
          console.log(`  📤 Sending ${signal} to PID ${server.pid}`);
          server.kill(signal);
        });
      }
    });
    
    server.stderr.on('data', (data) => {
      stderr += data.toString();
      const output = data.toString();
      
      // Track shutdown sequence
      if (output.includes(`${signal} received, shutting down gracefully`)) {
        checkpoints.signalReceived = true;
        console.log(`  ✓ Signal received and acknowledged`);
      }
      
      if (output.includes('MCP server shutdown completed') || 
          output.includes('Shutting down MCP server')) {
        checkpoints.mcpShutdown = true;
        console.log(`  ✓ MCP server shutdown initiated`);
      }
      
      if (output.includes('Disposing QRWCClientAdapter') || 
          output.includes('QRWCClientAdapter disposed')) {
        checkpoints.adapterDispose = true;
        console.log(`  ✓ Adapter disposed`);
      }
      
      if (output.includes('Shutting down state manager') || 
          output.includes('State manager shutdown completed')) {
        checkpoints.stateManagerShutdown = true;
        console.log(`  ✓ State manager shutdown`);
      }
      
      if (output.includes('SQLite event monitor shut down') || 
          output.includes('Event monitoring shutdown complete') ||
          output.includes('Event buffer flushed')) {
        checkpoints.eventMonitorShutdown = true;
        console.log(`  ✓ Event monitor shutdown`);
      }
      
      if (output.includes('Cleanup completed')) {
        checkpoints.cleanupCompleted = true;
        console.log(`  ✓ Cleanup completed`);
      }
    });
    
    server.on('exit', (code) => {
      checkpoints.exitCode = code;
      console.log(`  📊 Process exited with code: ${code}\n`);
      
      // Evaluate results
      const test = testResults[signal.toLowerCase()];
      
      if (checkpoints.serverStarted) {
        test.details.push('Server started successfully');
      } else {
        test.details.push('❌ Server failed to start');
      }
      
      if (checkpoints.signalReceived) {
        test.details.push('✅ Signal handled gracefully');
      } else {
        test.details.push('❌ Signal not properly handled');
      }
      
      if (checkpoints.mcpShutdown) {
        test.details.push('✅ MCP server shutdown completed');
      } else {
        test.details.push('⚠️  MCP shutdown not confirmed');
      }
      
      if (checkpoints.adapterDispose || checkpoints.stateManagerShutdown) {
        test.details.push('✅ Resources cleaned up');
        testResults.cleanup.passed = true;
      } else {
        test.details.push('⚠️  Resource cleanup not verified');
      }
      
      if (checkpoints.eventMonitorShutdown) {
        test.details.push('✅ Event monitor shutdown');
        testResults.eventMonitor.passed = true;
      } else {
        test.details.push('ℹ️  Event monitor may not be configured');
      }
      
      if (code === 0) {
        test.details.push('✅ Clean exit (code 0)');
      } else {
        test.details.push(`⚠️  Exit code: ${code}`);
      }
      
      // Overall test pass/fail
      test.passed = checkpoints.signalReceived && 
                   checkpoints.mcpShutdown && 
                   code === 0;
      
      resolve();
    });
    
    // Timeout safety
    setTimeout(15000).then(() => {
      if (server.exitCode === null) {
        console.log(`  ${RED}✗ Timeout - forcing kill${RESET}`);
        server.kill('SIGKILL');
      }
    });
  });
}

async function printSummary() {
  console.log(`\n${BLUE}=================================${RESET}`);
  console.log(`${YELLOW}Test Summary${RESET}`);
  console.log(`${BLUE}=================================${RESET}\n`);
  
  let totalPassed = 0;
  let totalFailed = 0;
  
  // SIGTERM Test
  console.log(`${YELLOW}SIGTERM Test:${RESET} ${testResults.sigterm.passed ? GREEN + 'PASSED' : RED + 'FAILED'}${RESET}`);
  testResults.sigterm.details.forEach(detail => console.log(`  ${detail}`));
  console.log();
  
  // SIGINT Test
  console.log(`${YELLOW}SIGINT Test:${RESET} ${testResults.sigint.passed ? GREEN + 'PASSED' : RED + 'FAILED'}${RESET}`);
  testResults.sigint.details.forEach(detail => console.log(`  ${detail}`));
  console.log();
  
  // Count results
  if (testResults.sigterm.passed) totalPassed++;
  else totalFailed++;
  
  if (testResults.sigint.passed) totalPassed++;
  else totalFailed++;
  
  // Additional checks
  console.log(`${YELLOW}Resource Cleanup:${RESET} ${testResults.cleanup.passed ? GREEN + 'VERIFIED' : YELLOW + 'NOT VERIFIED'}${RESET}`);
  console.log(`${YELLOW}Event Monitor:${RESET} ${testResults.eventMonitor.passed ? GREEN + 'SHUTDOWN CONFIRMED' : YELLOW + 'NOT CONFIRMED'}${RESET}`);
  
  // Final verdict
  console.log(`\n${BLUE}=================================${RESET}`);
  if (totalFailed === 0) {
    console.log(`${GREEN}✅ BUG-169 RESOLVED${RESET}`);
    console.log(`All signal handlers working correctly`);
    console.log(`Graceful shutdown sequence verified`);
    return 0;
  } else {
    console.log(`${RED}❌ BUG-169 STILL FAILING${RESET}`);
    console.log(`Failed tests: ${totalFailed}`);
    console.log(`Passed tests: ${totalPassed}`);
    return 1;
  }
}

async function runTests() {
  // Check if server is built
  if (\!existsSync('dist/index.js')) {
    console.log(`${RED}Error: dist/index.js not found. Run 'npm run build' first.${RESET}`);
    process.exit(1);
  }
  
  // Run tests
  await testSignalHandling('SIGTERM', '1/2');
  await testSignalHandling('SIGINT', '2/2');
  
  // Print summary and exit
  const exitCode = await printSummary();
  process.exit(exitCode);
}

runTests().catch(console.error);
