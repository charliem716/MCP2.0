#!/usr/bin/env node

/**
 * Live Q-SYS Core Test for 33Hz Change Detection
 * 
 * This test connects to a real Q-SYS Core and monitors actual control changes
 * at 33Hz, particularly audio meters which naturally change at high frequency.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..', '..');

console.log('=== BUG-150 Live Q-SYS Core 33Hz Test ===\n');

// Check for Q-SYS configuration
function checkConfiguration() {
  const configPath = path.join(projectRoot, 'qsys-core.config.json');
  if (!fs.existsSync(configPath)) {
    console.error('❌ Q-SYS configuration not found!');
    console.error('   Run: ./setup-env.sh to configure Q-SYS connection');
    process.exit(1);
  }
  
  const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const config = configData.qsysCore || configData; // Handle nested structure
  console.log('Q-SYS Core Configuration:');
  console.log(`  Host: ${config.host}`);
  console.log(`  Port: ${config.port}`);
  console.log(`  User: ${config.username || 'N/A'}`);
  return config;
}

async function setupEnvironment() {
  console.log('\n1. Setting up environment...');
  
  // Clean up old databases
  const dbDir = path.join(projectRoot, 'data', 'live-core-test');
  if (fs.existsSync(dbDir)) {
    fs.rmSync(dbDir, { recursive: true });
  }
  fs.mkdirSync(dbDir, { recursive: true });
  
  console.log('   ✓ Database directory prepared');
  console.log('   ✓ Event monitoring will be enabled');
}

async function startServer() {
  console.log('\n2. Starting MCP server (connecting to live Q-SYS Core)...');
  
  return new Promise((resolve, reject) => {
    const serverProcess = spawn('npm', ['start'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        EVENT_MONITORING_ENABLED: 'true',
        EVENT_MONITORING_DB_PATH: './data/live-core-test',
        EVENT_MONITORING_RETENTION_DAYS: '30',
        LOG_LEVEL: 'info'
      },
      stdio: 'pipe'
    });
    
    let serverReady = false;
    
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      process.stdout.write(output); // Show server output
      
      if (!serverReady && (output.includes('MCP server started') || 
                           output.includes('Connected to Q-SYS'))) {
        serverReady = true;
        console.log('\n   ✓ MCP server started and connected to Q-SYS Core');
        setTimeout(() => resolve(serverProcess), 2000);
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      const error = data.toString();
      if (error.includes('ECONNREFUSED') || error.includes('Connection failed')) {
        console.error('\n❌ Cannot connect to Q-SYS Core!');
        console.error('   Check that the Core is online and accessible');
        reject(new Error('Q-SYS connection failed'));
      }
    });
    
    serverProcess.on('error', reject);
    
    // Timeout if server doesn't start
    setTimeout(() => {
      if (!serverReady) {
        console.log('\n   ⚠️  Server startup timeout - proceeding anyway');
        resolve(serverProcess);
      }
    }, 10000);
  });
}

async function discoverAudioMeters() {
  console.log('\n3. Discovering available controls on Q-SYS Core...');
  
  // Use MCP tools to discover components
  const { QRWCClientAdapter } = await import(path.join(projectRoot, 'dist/mcp/qrwc/adapter.js'));
  const { OfficialQRWCClient } = await import(path.join(projectRoot, 'dist/qrwc/officialClient.js'));
  
  const config = checkConfiguration();
  const client = new OfficialQRWCClient({
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password
  });
  
  await client.connect();
  console.log('   ✓ Connected to Q-SYS Core');
  
  const adapter = new QRWCClientAdapter(client);
  
  // Get all components
  const components = await adapter.sendCommand('Component.GetComponents');
  console.log(`   ✓ Found ${components.length} components`);
  
  // Look for audio meters or gain controls
  const audioControls = [];
  const meterControls = [];
  const gainControls = [];
  
  for (const component of components.slice(0, 20)) { // Check first 20 components
    try {
      const controls = await adapter.sendCommand('Component.GetControls', {
        Name: component.Name
      });
      
      if (controls && Array.isArray(controls)) {
        for (const control of controls) {
          const fullName = `${component.Name}.${control.Name}`;
          
          // Look for meter-like controls
          if (control.Name.toLowerCase().includes('meter') ||
              control.Name.toLowerCase().includes('level') ||
              control.Name.toLowerCase().includes('peak')) {
            meterControls.push(fullName);
          }
          // Look for gain controls
          else if (control.Name.toLowerCase().includes('gain') ||
                   control.Name.toLowerCase().includes('volume')) {
            gainControls.push(fullName);
          }
          // Any audio-related control
          if (component.Type?.toLowerCase().includes('audio') ||
              component.Name.toLowerCase().includes('audio')) {
            audioControls.push(fullName);
          }
        }
      }
    } catch (e) {
      // Skip components that can't be queried
    }
  }
  
  console.log(`\n   Found ${meterControls.length} meter controls`);
  console.log(`   Found ${gainControls.length} gain controls`);
  console.log(`   Found ${audioControls.length} audio-related controls`);
  
  // Select controls for testing
  const testControls = [
    ...meterControls.slice(0, 2),  // First 2 meters
    ...gainControls.slice(0, 1),   // First gain
    ...audioControls.slice(0, 2)   // First 2 audio controls
  ].filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates
  
  if (testControls.length === 0) {
    console.log('\n   ⚠️  No suitable controls found, using default test controls');
    testControls.push('Gain.gain', 'Level.level'); // Common default names
  }
  
  console.log('\n   Controls selected for 33Hz test:');
  testControls.forEach(c => console.log(`     - ${c}`));
  
  await client.disconnect();
  
  return testControls;
}

async function test33HzPolling(controls) {
  console.log('\n4. Testing 33Hz polling with live Q-SYS Core...');
  
  const { QRWCClientAdapter } = await import(path.join(projectRoot, 'dist/mcp/qrwc/adapter.js'));
  const { OfficialQRWCClient } = await import(path.join(projectRoot, 'dist/qrwc/officialClient.js'));
  
  const config = checkConfiguration();
  const client = new OfficialQRWCClient({
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password
  });
  
  await client.connect();
  const adapter = new QRWCClientAdapter(client);
  
  // Create change group
  const groupId = 'live-core-33hz-test';
  await adapter.sendCommand('ChangeGroup.Create', { Id: groupId });
  console.log('   ✓ Change group created');
  
  // Add controls to group
  await adapter.sendCommand('ChangeGroup.AddControl', {
    Id: groupId,
    Controls: controls
  });
  console.log(`   ✓ Added ${controls.length} controls to change group`);
  
  // Start 33Hz polling
  await adapter.sendCommand('ChangeGroup.AutoPoll', {
    Id: groupId,
    Rate: 0.03  // 33Hz
  });
  console.log('   ✓ Started 33Hz auto-polling');
  
  const testDuration = 5000; // 5 seconds
  console.log(`\n   ⏱️  Recording changes for ${testDuration/1000} seconds...`);
  console.log('   (Audio meters should show continuous changes)');
  
  const startTime = Date.now();
  await new Promise(resolve => setTimeout(resolve, testDuration));
  const actualDuration = (Date.now() - startTime) / 1000;
  
  // Stop polling
  await adapter.sendCommand('ChangeGroup.Destroy', { Id: groupId });
  console.log('   ✓ Stopped polling');
  
  await client.disconnect();
  
  return {
    groupId,
    duration: actualDuration,
    expectedEvents: Math.floor(actualDuration * 33),
    controls
  };
}

function analyzeResults(testInfo) {
  console.log('\n5. Analyzing recorded changes...');
  
  const dbDir = path.join(projectRoot, 'data', 'live-core-test');
  const dbFiles = fs.readdirSync(dbDir).filter(f => f.endsWith('.db'));
  
  if (dbFiles.length === 0) {
    console.log('   ❌ No database created - event monitoring may not be working');
    return false;
  }
  
  const dbPath = path.join(dbDir, dbFiles[0]);
  const db = new Database(dbPath, { readonly: true });
  
  try {
    // Get all events for this test
    const events = db.prepare(`
      SELECT control_id, value, timestamp 
      FROM events 
      WHERE change_group_id = ?
      ORDER BY timestamp
    `).all(testInfo.groupId);
    
    console.log(`\n   📊 Total events recorded: ${events.length}`);
    console.log(`   📊 Expected events (at 33Hz): ~${testInfo.expectedEvents}`);
    
    if (events.length === 0) {
      console.log('   ❌ No events recorded!');
      console.log('      Possible issues:');
      console.log('      - Controls may not be changing');
      console.log('      - Event monitoring not working');
      return false;
    }
    
    // Analyze by control
    const controlStats = {};
    events.forEach(event => {
      if (!controlStats[event.control_id]) {
        controlStats[event.control_id] = {
          count: 0,
          values: new Set(),
          firstValue: null,
          lastValue: null
        };
      }
      const stats = controlStats[event.control_id];
      stats.count++;
      stats.values.add(event.value.toFixed(2));
      if (stats.firstValue === null) stats.firstValue = event.value;
      stats.lastValue = event.value;
    });
    
    console.log('\n   === Changes by Control ===');
    let hasChangingControls = false;
    
    Object.entries(controlStats).forEach(([control, stats]) => {
      const rate = (stats.count / testInfo.duration).toFixed(1);
      const uniqueValues = stats.values.size;
      const valueChanged = stats.firstValue !== stats.lastValue;
      
      console.log(`\n   ${control}:`);
      console.log(`     Events: ${stats.count} (${rate} Hz)`);
      console.log(`     Unique values: ${uniqueValues}`);
      console.log(`     Value changed: ${valueChanged ? '✅ YES' : '❌ NO'}`);
      
      if (uniqueValues > 5) {
        console.log(`     Status: ✅ Actively changing`);
        hasChangingControls = true;
      } else if (uniqueValues > 1) {
        console.log(`     Status: ⚠️  Some changes detected`);
      } else {
        console.log(`     Status: ❌ Static (no changes)`);
      }
    });
    
    // Calculate overall rate
    const overallRate = events.length / testInfo.duration;
    console.log(`\n   📊 Overall event rate: ${overallRate.toFixed(1)} events/second`);
    
    // Check timing intervals
    if (events.length > 10) {
      const intervals = [];
      for (let i = 1; i < Math.min(100, events.length); i++) {
        intervals.push(events[i].timestamp - events[i-1].timestamp);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      console.log(`   📊 Average interval: ${avgInterval.toFixed(1)}ms`);
      
      const expectedInterval = 1000 / 33; // ~30ms
      if (Math.abs(avgInterval - expectedInterval) < 10) {
        console.log('   ✅ Timing matches 33Hz polling rate');
      }
    }
    
    return hasChangingControls || events.length > testInfo.expectedEvents * 0.5;
    
  } finally {
    db.close();
  }
}

// Main execution
async function runLiveCoreTest() {
  let serverProcess = null;
  
  try {
    checkConfiguration();
    setupEnvironment();
    
    // Start server
    serverProcess = await startServer();
    
    // Discover controls
    const controls = await discoverAudioMeters();
    
    if (controls.length === 0) {
      console.log('\n⚠️  No controls found to test');
      console.log('   Make sure your Q-SYS design has audio meters or gain controls');
      return false;
    }
    
    // Run 33Hz test
    const testInfo = await test33HzPolling(controls);
    
    // Wait a bit for database flush
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Analyze results
    const success = analyzeResults(testInfo);
    
    console.log('\n' + '='.repeat(60));
    console.log('=== LIVE Q-SYS CORE TEST RESULT ===');
    console.log('='.repeat(60));
    
    if (success) {
      console.log('\n✅ Live Q-SYS Core 33Hz Test PASSED');
      console.log('   - Successfully connected to Q-SYS Core');
      console.log('   - Created change group with real controls');
      console.log('   - Polled at 33Hz and detected changes');
      console.log('   - Changes recorded to SQLite database');
      console.log('\n🎉 The system successfully receives and records');
      console.log('   real Q-SYS control changes at 33Hz!');
      return true;
    } else {
      console.log('\n⚠️  Live Q-SYS Core Test PARTIAL');
      console.log('   - Connected to Q-SYS Core successfully');
      console.log('   - Polling executed but few/no changes detected');
      console.log('   - Try using controls that change more frequently');
      console.log('     (audio meters, RMS levels, peak indicators)');
      return false;
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    return false;
  } finally {
    if (serverProcess) {
      console.log('\n6. Cleaning up...');
      serverProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('   ✓ Server stopped');
    }
  }
}

// Interactive prompt
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('This test will connect to your live Q-SYS Core and test 33Hz polling.');
console.log('Make sure your Q-SYS Core is online and accessible.\n');

rl.question('Ready to start? (y/n): ', (answer) => {
  rl.close();
  
  if (answer.toLowerCase() === 'y') {
    runLiveCoreTest().then(success => {
      process.exit(success ? 0 : 1);
    });
  } else {
    console.log('Test cancelled.');
    process.exit(0);
  }
});