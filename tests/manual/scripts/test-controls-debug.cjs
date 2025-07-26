const { spawn } = require('child_process');

console.log('🧪 Debug test for list_controls\n');

const server = spawn('npm', ['run', 'dev'], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

let output = '';
let ready = false;

// Capture stderr for debugging
server.stderr.on('data', data => {
  const str = data.toString();
  if (str.includes('AI agents can now control')) {
    ready = true;
    console.log('✅ Server ready, sending request...\n');
    sendRequest();
  }
  if (str.includes('list_controls') || str.includes('Controls')) {
    console.log('Debug:', str.trim());
  }
});

server.stdout.on('data', data => {
  output += data.toString();
  const lines = data.toString().split('\n');
  lines.forEach(line => {
    if (line.trim()) {
      try {
        const json = JSON.parse(line);
        if (json.id === 1) {
          console.log('\n📊 Raw response:', JSON.stringify(json, null, 2));
          if (json.error) {
            console.log('❌ Error:', json.error.message);
          } else if (json.result) {
            console.log('✅ Success! Parsing controls...');
            try {
              const controls = JSON.parse(json.result.content[0].text);
              console.log(`Found ${controls.length} controls`);
            } catch (e) {
              console.log('Failed to parse controls:', e.message);
            }
          }
        }
      } catch (e) {
        // Not JSON
      }
    }
  });
});

function sendRequest() {
  const request = {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'list_controls',
      arguments: {},
    },
    id: 1,
  };
  console.log('📤 Sending:', JSON.stringify(request));
  server.stdin.write(`${JSON.stringify(request)}\n`);
}

setTimeout(() => {
  if (!ready) {
    console.log('❌ Server not ready after 10 seconds');
  }
  server.kill('SIGTERM');
  process.exit(0);
}, 10000);
