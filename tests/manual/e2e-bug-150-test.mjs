#!/usr/bin/env node

/**
 * End-to-End Test for BUG-150
 * 
 * This script runs a complete E2E test:
 * 1. Sets up environment
 * 2. Starts MCP server with event monitoring
 * 3. Creates change groups with 33Hz polling
 * 4. Generates events
 * 5. Verifies database records
 * 6. Validates 30-day retention config
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..', '..');

console.log('=== BUG-150 End-to-End Test ===\n');

// Test configuration
const TEST_DURATION_MS = 3000; // 3 seconds
const EXPECTED_RATE_HZ = 33;
const TOLERANCE = 0.15; // 15% tolerance

let serverProcess = null;
let testPassed = true;

function setupEnvironment() {
  console.log('1. Setting up environment...');
  
  // Set environment variables for the test
  process.env.EVENT_MONITORING_ENABLED = 'true';
  process.env.EVENT_MONITORING_RETENTION_DAYS = '30';
  process.env.EVENT_MONITORING_DB_PATH = './data/test-events';
  process.env.LOG_LEVEL = 'warn'; // Reduce noise
  
  // Create test database directory
  const dbDir = path.join(projectRoot, 'data', 'test-events');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  // Clean up old test databases
  if (fs.existsSync(dbDir)) {
    const files = fs.readdirSync(dbDir);
    files.forEach(file => {
      if (file.endsWith('.db')) {
        fs.unlinkSync(path.join(dbDir, file));
      }
    });
  }
  
  console.log('   ✓ Environment configured');
  console.log('   ✓ EVENT_MONITORING_ENABLED=true');
  console.log('   ✓ EVENT_MONITORING_RETENTION_DAYS=30');
  console.log('   ✓ Test database directory prepared');
}

async function startServer() {
  console.log('\n2. Starting MCP server...');
  
  return new Promise((resolve, reject) => {
    serverProcess = spawn('node', ['dist/index.js'], {
      cwd: projectRoot,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let serverReady = false;
    
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (!serverReady && (output.includes('MCP server started') || output.includes('ready'))) {
        serverReady = true;
        console.log('   ✓ MCP server started');
        setTimeout(resolve, 1000); // Give it a moment to fully initialize
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      // Ignore non-critical stderr output
    });
    
    serverProcess.on('error', (error) => {
      console.error('   ❌ Failed to start server:', error);
      reject(error);
    });
    
    // Timeout if server doesn't start
    setTimeout(() => {
      if (!serverReady) {
        console.log('   ✓ Server process started (assuming ready)');
        resolve();
      }
    }, 3000);
  });
}

async function runPollingTest() {
  console.log('\n3. Running 33Hz polling test...');
  
  // Import and run the adapter test
  const { QRWCClientAdapter } = await import(path.join(projectRoot, 'dist/mcp/qrwc/adapter.js'));
  
  // Create mock client that records to database
  class TestClient {
    constructor() {
      this.pollCount = 0;
      this.startTime = Date.now();
    }
    
    on() { return this; }
    once() { return this; }
    off() { return this; }
    emit() { return this; }
    isConnected() { return true; }
    async connect() { return true; }
    async disconnect() { }
    async sendCommand() { return { Changes: [] }; }
    async getAllComponents() { return []; }
    async getAllControls() { return []; }
    getComponent() { return null; }
  }
  
  const client = new TestClient();
  const adapter = new QRWCClientAdapter(client);
  
  // Create test change group
  const groupId = 'e2e-test-33hz';
  await adapter.sendCommand('ChangeGroup.Create', { Id: groupId });
  console.log('   ✓ Change group created');
  
  // Add control
  await adapter.sendCommand('ChangeGroup.AddControl', {
    Id: groupId,
    Controls: ['TestComponent.TestControl']
  });
  console.log('   ✓ Control added');
  
  // Start 33Hz polling
  await adapter.sendCommand('ChangeGroup.AutoPoll', {
    Id: groupId,
    Rate: 0.03 // 33Hz
  });
  console.log('   ✓ 33Hz auto-polling started');
  
  // Let it run for the test duration
  console.log(`   ⏱️  Running for ${TEST_DURATION_MS/1000} seconds...`);
  await new Promise(resolve => setTimeout(resolve, TEST_DURATION_MS));
  
  // Stop polling
  await adapter.sendCommand('ChangeGroup.Destroy', { Id: groupId });
  console.log('   ✓ Auto-polling stopped');
  
  return {
    groupId,
    duration: TEST_DURATION_MS,
    expectedEvents: Math.floor((TEST_DURATION_MS / 1000) * EXPECTED_RATE_HZ)
  };
}

function verifyDatabase(testInfo) {
  console.log('\n4. Verifying database records...');
  
  const dbDir = path.join(projectRoot, 'data', 'test-events');
  const dbFiles = fs.readdirSync(dbDir).filter(f => f.endsWith('.db'));
  
  if (dbFiles.length === 0) {
    console.log('   ❌ No database files created');
    return false;
  }
  
  console.log(`   ✓ Found database: ${dbFiles[0]}`);
  
  const dbPath = path.join(dbDir, dbFiles[0]);
  const db = new Database(dbPath, { readonly: true });
  
  try {
    // Count events
    const result = db.prepare('SELECT COUNT(*) as count FROM events').get();
    const eventCount = result.count;
    
    console.log(`   📊 Events recorded: ${eventCount}`);
    console.log(`   📊 Expected events: ~${testInfo.expectedEvents} (±${TOLERANCE*100}%)`);
    
    const minExpected = Math.floor(testInfo.expectedEvents * (1 - TOLERANCE));
    const maxExpected = Math.ceil(testInfo.expectedEvents * (1 + TOLERANCE));
    
    const withinRange = eventCount >= minExpected && eventCount <= maxExpected;
    
    if (withinRange) {
      console.log(`   ✅ Event count within acceptable range (${minExpected}-${maxExpected})`);
    } else {
      console.log(`   ❌ Event count outside acceptable range`);
      testPassed = false;
    }
    
    // Analyze event intervals if we have events
    if (eventCount > 10) {
      const events = db.prepare(`
        SELECT timestamp 
        FROM events 
        WHERE change_group_id = ? 
        ORDER BY timestamp 
        LIMIT 100
      `).all(testInfo.groupId);
      
      if (events.length > 1) {
        const intervals = [];
        for (let i = 1; i < events.length; i++) {
          intervals.push(events[i].timestamp - events[i-1].timestamp);
        }
        
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const actualHz = 1000 / avgInterval;
        
        console.log(`   📊 Average interval: ${avgInterval.toFixed(2)}ms`);
        console.log(`   📊 Actual frequency: ${actualHz.toFixed(1)} Hz`);
        
        if (avgInterval >= 25 && avgInterval <= 35) {
          console.log('   ✅ Timing intervals consistent with 33Hz');
        } else {
          console.log('   ⚠️  Timing intervals outside 33Hz range');
        }
      }
    }
    
    return withinRange;
    
  } finally {
    db.close();
  }
}

function verifyRetention() {
  console.log('\n5. Verifying retention configuration...');
  
  const configPath = path.join(projectRoot, 'dist/mcp/state/event-monitor/sqlite-event-monitor.js');
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf8');
    const has30Day = content.includes("'30'");
    
    if (has30Day) {
      console.log('   ✅ 30-day retention configured in code');
    } else {
      console.log('   ❌ 30-day retention not found in code');
      testPassed = false;
    }
  }
  
  if (process.env.EVENT_MONITORING_RETENTION_DAYS === '30') {
    console.log('   ✅ Environment variable set to 30 days');
  } else {
    console.log('   ⚠️  Environment variable not set to 30');
  }
}

async function cleanup() {
  console.log('\n6. Cleaning up...');
  
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('   ✓ Server stopped');
  }
  
  // Optional: Clean up test databases
  // const dbDir = path.join(projectRoot, 'data', 'test-events');
  // if (fs.existsSync(dbDir)) {
  //   fs.rmSync(dbDir, { recursive: true });
  // }
  
  console.log('   ✓ Cleanup complete');
}

// Main test execution
async function runTest() {
  try {
    setupEnvironment();
    await startServer();
    const testInfo = await runPollingTest();
    const dbValid = verifyDatabase(testInfo);
    verifyRetention();
    
    if (!dbValid) {
      testPassed = false;
    }
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    testPassed = false;
  } finally {
    await cleanup();
  }
  
  // Final result
  console.log('\n' + '='.repeat(50));
  console.log('=== E2E TEST RESULT ===');
  console.log('='.repeat(50));
  
  if (testPassed) {
    console.log('\n✅ BUG-150 E2E Test PASSED');
    console.log('   - 33Hz polling works correctly');
    console.log('   - Events are recorded to SQLite');
    console.log('   - 30-day retention is configured');
    process.exit(0);
  } else {
    console.log('\n❌ BUG-150 E2E Test FAILED');
    console.log('   See details above for failures');
    process.exit(1);
  }
}

// Handle cleanup on interrupt
process.on('SIGINT', async () => {
  console.log('\n\nInterrupted, cleaning up...');
  await cleanup();
  process.exit(1);
});

// Run the test
runTest();