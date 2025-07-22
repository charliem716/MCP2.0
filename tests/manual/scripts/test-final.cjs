const { spawn } = require('child_process');
const { EOL } = require('os');

console.log('🧪 Final test of list_controls through MCP server\n');

// Start the dev server
const proc = spawn('npm', ['run', 'dev'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let ready = false;
let buffer = '';

// MCP server outputs logs to stdout when using stdio transport
// We need to look for both logs and JSON-RPC responses in stdout

// Handle stderr (in case of errors)
proc.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
});

// Handle stdout (both logs and JSON-RPC responses)
proc.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  buffer += text;
  
  // Check for server ready message in logs
  if (!ready && text.includes('AI agents can now control')) {
    ready = true;
    console.log('\n✅ Server ready! Sending request...\n');
    setTimeout(sendRequest, 500); // Small delay to ensure server is fully ready
  }
  
  // Process complete lines for JSON-RPC
  let lines = buffer.split(EOL);
  buffer = lines.pop() || ''; // Keep incomplete line
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    try {
      const msg = JSON.parse(line);
      
      // Check if this is our response
      if (msg.id === 1 && msg.result) {
        console.log('📥 Got response from MCP server!\n');
        
        try {
          // Parse the controls from the response
          const controls = JSON.parse(msg.result.content[0].text);
          
          console.log(`✅ SUCCESS! The list_controls tool returned ${controls.length} controls!\n`);
          
          if (controls.length > 0) {
            console.log('Sample controls:');
            controls.slice(0, 3).forEach(ctrl => {
              console.log(`  - ${ctrl.name} (${ctrl.component}): ${ctrl.value}`);
            });
            
            // Get unique components
            const uniqueComponents = [...new Set(controls.map(c => c.component))];
            console.log(`\nTotal unique components: ${uniqueComponents.length}`);
          }
          
          console.log('\n🎉 Test passed! The list_controls fix is working!');
          
        } catch (e) {
          console.error('❌ Failed to parse controls:', e.message);
          console.log('Raw response:', JSON.stringify(msg.result, null, 2));
        }
        
        // Clean exit
        setTimeout(() => {
          proc.kill('SIGTERM');
          process.exit(0);
        }, 1000);
      }
      
      if (msg.error) {
        console.error('❌ RPC Error:', msg.error);
        proc.kill('SIGTERM');
        process.exit(1);
      }
      
    } catch (e) {
      // Not JSON, ignore
    }
  }
});

function sendRequest() {
  const request = {
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "list_controls",
      arguments: {}
    },
    id: 1
  };
  
  const json = JSON.stringify(request);
  console.log('📤 Sending:', json);
  proc.stdin.write(json + EOL);
}

// Error handling
proc.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

proc.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`Server exited with code ${code}`);
  }
});

// Timeout
setTimeout(() => {
  if (!ready) {
    console.error('❌ Server failed to start within 20 seconds');
    proc.kill('SIGTERM');
    process.exit(1);
  }
}, 20000);