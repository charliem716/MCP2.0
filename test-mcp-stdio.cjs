const { spawn } = require('child_process');

console.log('🧪 Testing list_controls through MCP stdio interface\n');

// Start MCP server
const server = spawn('npm', ['run', 'dev'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'development' }
});

let responseBuffer = '';
let testStarted = false;

// Monitor server stderr for logs
server.stderr.on('data', (data) => {
  const msg = data.toString();
  // Look for the ready message
  if (!testStarted && msg.includes('AI agents can now control')) {
    testStarted = true;
    console.log('✅ MCP server ready!\n');
    
    // Wait a bit for server to stabilize
    setTimeout(() => {
      console.log('📤 Sending list_controls request...');
      const request = {
        jsonrpc: "2.0",
        method: "tools/call",
        params: { 
          name: "list_controls", 
          arguments: {} 
        },
        id: 1
      };
      
      server.stdin.write(JSON.stringify(request) + '\n');
    }, 500);
  }
});

// Process stdout responses
server.stdout.on('data', (data) => {
  responseBuffer += data.toString();
  
  // Try to parse complete JSON objects
  const lines = responseBuffer.split('\n');
  
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    try {
      const json = JSON.parse(line);
      
      if (json.id === 1 && json.result) {
        console.log('\n📥 Response received!');
        
        if (json.error) {
          console.log('❌ Error:', json.error);
        } else {
          try {
            const controls = JSON.parse(json.result.content[0].text);
            console.log(`✅ Success! Found ${controls.length} controls\n`);
            
            if (controls.length > 0) {
              console.log('First 5 controls:');
              controls.slice(0, 5).forEach(ctrl => {
                console.log(`  - ${ctrl.name} (${ctrl.type}): ${ctrl.value}`);
              });
              
              // Show component breakdown
              const components = {};
              controls.forEach(ctrl => {
                components[ctrl.component] = (components[ctrl.component] || 0) + 1;
              });
              
              console.log(`\nTotal components: ${Object.keys(components).length}`);
              console.log('\nTop 5 components by control count:');
              Object.entries(components)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .forEach(([name, count]) => {
                  console.log(`  - ${name}: ${count} controls`);
                });
            }
          } catch (e) {
            console.log('Failed to parse control data:', e.message);
            console.log('Raw result:', json.result);
          }
        }
        
        // Clean shutdown
        setTimeout(() => {
          console.log('\n✅ Test completed successfully!');
          server.kill('SIGTERM');
        }, 1000);
      }
    } catch (e) {
      // Not complete JSON yet, continue buffering
    }
  }
  
  // Keep the last incomplete line in buffer
  responseBuffer = lines[lines.length - 1];
});

// Handle errors
server.on('error', (error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

server.on('exit', (code) => {
  console.log(`\nServer exited with code: ${code}`);
  process.exit(code || 0);
});

// Timeout after 30 seconds
setTimeout(() => {
  console.error('❌ Test timeout after 30 seconds');
  server.kill('SIGTERM');
  process.exit(1);
}, 30000);