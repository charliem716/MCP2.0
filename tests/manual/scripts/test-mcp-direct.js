const net = require('net');
const { spawn } = require('child_process');

console.log('🧪 Testing list_controls with running MCP server\n');

// Create a client process that connects to the MCP server's stdio
const mcpClient = spawn('node', ['-e', `
  const readline = require('readline');
  
  // Handle input from test script
  const rl = readline.createInterface({
    input: process.stdin,
    output: null
  });
  
  rl.on('line', (line) => {
    // Forward to MCP server
    process.stdout.write(line + '\\n');
  });
  
  // Read responses from MCP server
  process.stdin.on('data', (data) => {
    process.stderr.write(data);
  });
`], {
  stdio: ['pipe', 'pipe', 'pipe']
});

// Connect to the MCP server
const mcpServer = spawn('node', ['dist/src/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

// Pipe MCP server output to client input
mcpServer.stdout.pipe(mcpClient.stdin);
mcpClient.stdout.pipe(mcpServer.stdin);

// Monitor server output
mcpServer.stderr.on('data', (data) => {
  const msg = data.toString();
  if (msg.includes('AI agents can now control')) {
    console.log('✅ MCP server ready, sending request...\n');
    sendRequest();
  }
});

// Monitor client output (responses)
mcpClient.stderr.on('data', (data) => {
  try {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        const response = JSON.parse(line);
        if (response.result) {
          console.log('📥 Response received!');
          const controls = JSON.parse(response.result.content[0].text);
          console.log(`✅ Found ${controls.length} controls\n`);
          
          if (controls.length > 0) {
            console.log('First 3 controls:');
            controls.slice(0, 3).forEach(ctrl => {
              console.log(`  - ${ctrl.name}: ${ctrl.value}`);
            });
          }
          
          // Clean shutdown
          setTimeout(() => {
            mcpServer.kill('SIGTERM');
            mcpClient.kill('SIGTERM');
            process.exit(0);
          }, 1000);
        }
      }
    });
  } catch (e) {
    // Not JSON or parsing error
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
  
  mcpClient.stdin.write(`${JSON.stringify(request)  }\n`);
}

// Timeout
setTimeout(() => {
  console.error('❌ Test timeout');
  mcpServer.kill('SIGTERM');
  mcpClient.kill('SIGTERM');
  process.exit(1);
}, 20000);