#!/usr/bin/env node

/**
 * Test list_controls through MCP server
 */

import { spawn } from 'child_process';

console.log('🧪 Testing list_controls through MCP server\n');

// Start the MCP server
const server = spawn('npm', ['run', 'dev'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let serverReady = false;
let output = '';

// Monitor stderr for server ready message
server.stderr.on('data', (data) => {
  const msg = data.toString();
  process.stderr.write(msg); // Echo server logs
  if (msg.includes('AI agents can now control') || msg.includes('MCP server started')) {
    if (!serverReady) {
      serverReady = true;
      console.log('✅ MCP server ready\n');
      setTimeout(runTests, 1000); // Give it a moment to stabilize
    }
  }
});

// Capture stdout for responses
server.stdout.on('data', (data) => {
  output += data.toString();
  processOutput();
});

function processOutput() {
  const lines = output.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    try {
      const json = JSON.parse(line);
      if (json.id && json.result) {
        handleResponse(json);
      }
    } catch (e) {
      // Not JSON, ignore
    }
  }
}

function handleResponse(response) {
  console.log(`📥 Response for request ${response.id}:\n`);
  
  if (response.error) {
    console.log('❌ Error:', response.error.message);
    return;
  }
  
  try {
    const content = response.result.content[0].text;
    const controls = JSON.parse(content);
    
    console.log(`✅ Success! Found ${controls.length} controls`);
    
    if (controls.length > 0) {
      console.log('\nFirst 5 controls:');
      controls.slice(0, 5).forEach(ctrl => {
        console.log(`  - ${ctrl.name} (${ctrl.type}): ${ctrl.value}`);
      });
      
      // Count by component
      const componentCounts = {};
      controls.forEach(ctrl => {
        componentCounts[ctrl.component] = (componentCounts[ctrl.component] || 0) + 1;
      });
      
      console.log('\nControls per component:');
      Object.entries(componentCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([comp, count]) => {
          console.log(`  - ${comp}: ${count} controls`);
        });
    }
  } catch (e) {
    console.log('❌ Failed to parse response:', e.message);
    console.log('Raw response:', JSON.stringify(response.result, null, 2));
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
}

function runTests() {
  // Test 1: List all controls
  console.log('📋 Test 1: List all controls');
  const request1 = {
    jsonrpc: "2.0",
    method: "tools/call",
    params: { 
      name: "list_controls", 
      arguments: {} 
    },
    id: 1
  };
  server.stdin.write(JSON.stringify(request1) + '\n');
  
  // Test 2: List controls for specific component
  setTimeout(() => {
    console.log('📋 Test 2: List controls for "Soundbar" component');
    const request2 = {
      jsonrpc: "2.0",
      method: "tools/call",
      params: { 
        name: "list_controls", 
        arguments: { component: "Soundbar" }
      },
      id: 2
    };
    server.stdin.write(JSON.stringify(request2) + '\n');
  }, 2000);
  
  // Test 3: List controls with metadata
  setTimeout(() => {
    console.log('📋 Test 3: List controls with metadata for "Main Mixer"');
    const request3 = {
      jsonrpc: "2.0",
      method: "tools/call",
      params: { 
        name: "list_controls", 
        arguments: { 
          component: "Main Mixer",
          includeMetadata: true
        }
      },
      id: 3
    };
    server.stdin.write(JSON.stringify(request3) + '\n');
  }, 4000);
  
  // Shutdown after tests
  setTimeout(() => {
    console.log('🏁 Tests completed, shutting down...');
    server.kill('SIGTERM');
  }, 8000);
}

// Error handling
server.on('error', (error) => {
  console.error('❌ Server error:', error);
  process.exit(1);
});

server.on('exit', (code) => {
  console.log(`\n✅ Server exited with code ${code}`);
  process.exit(code || 0);
});

// Timeout
setTimeout(() => {
  if (!serverReady) {
    console.error('❌ Server failed to start within 15 seconds');
    server.kill('SIGTERM');
    process.exit(1);
  }
}, 15000);