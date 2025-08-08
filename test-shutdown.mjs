#!/usr/bin/env node

/**
 * Test script for BUG-169: Graceful Shutdown
 * 
 * This script starts the MCP server and tests various shutdown scenarios
 */

import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

const TEST_SCENARIOS = [
  { name: 'SIGTERM', signal: 'SIGTERM', delay: 3000 },
  { name: 'SIGINT (Ctrl+C)', signal: 'SIGINT', delay: 3000 },
];

async function testShutdown(scenario) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing ${scenario.name} shutdown...`);
  console.log('='.repeat(60));

  return new Promise(async (resolve) => {
    const env = {
      ...process.env,
      EVENT_MONITORING_ENABLED: 'true',
      EVENT_MONITORING_DB_PATH: './data/test-shutdown',
      LOG_LEVEL: 'debug'
    };

    const child = spawn('npm', ['start'], {
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';
    let shutdownStarted = false;
    let shutdownCompleted = false;
    let bufferFlushed = false;
    let resourcesCleaned = false;

    child.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      
      if (text.includes('MCP Voice/Text-Controlled Q-SYS Demo is ready')) {
        console.log('✅ Server started successfully');
      }
      
      if (text.includes(`${scenario.signal} received, shutting down gracefully`)) {
        shutdownStarted = true;
        console.log(`✅ ${scenario.signal} handler triggered`);
      }
      
      if (text.includes('Event buffer flushed') || text.includes('SQLite event monitor closed')) {
        bufferFlushed = true;
        console.log('✅ Event buffer flushed');
      }
      
      if (text.includes('Cleaning up resources')) {
        resourcesCleaned = true;
        console.log('✅ Resource cleanup initiated');
      }
      
      if (text.includes('Cleanup completed')) {
        shutdownCompleted = true;
        console.log('✅ Graceful shutdown completed');
      }
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('exit', (code, signal) => {
      console.log(`\nProcess exited with code: ${code}, signal: ${signal}`);
      
      const result = {
        scenario: scenario.name,
        exitCode: code,
        exitSignal: signal,
        shutdownStarted,
        bufferFlushed,
        resourcesCleaned,
        shutdownCompleted,
        success: shutdownStarted && shutdownCompleted && code === 0
      };
      
      console.log('\nTest Results:');
      console.log(`  Shutdown initiated: ${shutdownStarted ? '✅' : '❌'}`);
      console.log(`  Buffer flushed: ${bufferFlushed ? '✅' : '⚠️  (may not have buffer)'}`);
      console.log(`  Resources cleaned: ${resourcesCleaned ? '✅' : '❌'}`);
      console.log(`  Shutdown completed: ${shutdownCompleted ? '✅' : '❌'}`);
      console.log(`  Exit code: ${code === 0 ? '✅' : '❌'} (${code})`);
      console.log(`  Overall: ${result.success ? '✅ PASSED' : '❌ FAILED'}`);
      
      resolve(result);
    });

    // Wait for server to start
    await setTimeout(scenario.delay);
    
    // Send the shutdown signal
    console.log(`\nSending ${scenario.signal} to process...`);
    child.kill(scenario.signal);
    
    // Wait for shutdown to complete (max 15 seconds)
    await setTimeout(15000);
    
    // Force kill if still running
    if (!child.killed) {
      console.log('⚠️  Process did not exit cleanly, forcing termination');
      child.kill('SIGKILL');
    }
  });
}

async function main() {
  console.log('Testing Graceful Shutdown (BUG-169)');
  console.log('====================================\n');
  
  const results = [];
  
  for (const scenario of TEST_SCENARIOS) {
    const result = await testShutdown(scenario);
    results.push(result);
    
    // Wait between tests
    await setTimeout(2000);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('FINAL RESULTS');
  console.log('='.repeat(60));
  
  let allPassed = true;
  for (const result of results) {
    console.log(`${result.scenario}: ${result.success ? '✅ PASSED' : '❌ FAILED'}`);
    if (!result.success) allPassed = false;
  }
  
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ All shutdown tests PASSED');
  } else {
    console.log('❌ Some shutdown tests FAILED');
  }
  console.log('='.repeat(60));
  
  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);