const { spawn } = require('child_process');

console.log('🧪 Testing get_control_values tool\n');

const proc = spawn('npm', ['run', 'dev'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let sent = false;
let buffer = '';

proc.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  buffer += text;
  
  if (!sent && text.includes('AI agents can now control')) {
    sent = true;
    setTimeout(() => {
      // Test getting specific control values
      const req = {
        jsonrpc: "2.0",
        method: "tools/call",
        params: { 
          name: "get_control_values", 
          arguments: {
            controls: [
              "40_Display.cec.custom.input.1",
              "40_Display.cec.input.1",
              "Soundbar.gain",
              "Main Mixer.mute"
            ]
          }
        },
        id: 1
      };
      console.log('📤 Requesting control values...\n');
      proc.stdin.write(JSON.stringify(req) + '\n');
    }, 1000);
  }
});

// Process buffered output
setInterval(() => {
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    try {
      const msg = JSON.parse(line);
      if (msg.id === 1 && msg.result) {
        const values = JSON.parse(msg.result.content[0].text);
        
        console.log(`✅ Got ${values.length} control values:\n`);
        
        values.forEach(v => {
          console.log(`Control: ${v.name}`);
          console.log(`  Value: ${JSON.stringify(v.value)}`);
          console.log(`  Type: ${typeof v.value}`);
          if (v.string) {
            console.log(`  String: ${v.string}`);
          }
          if (v.error) {
            console.log(`  Error: ${v.error}`);
          }
          console.log('');
        });
        
        // Check for object values
        const objectValues = values.filter(v => v.value && typeof v.value === 'object');
        if (objectValues.length > 0) {
          console.log(`❌ Found ${objectValues.length} controls with object values!`);
        } else {
          console.log('✅ All values are properly extracted (no object values)!');
        }
        
        proc.kill();
        process.exit(0);
      }
    } catch (e) {}
  }
}, 100);

// Timeout
setTimeout(() => {
  console.log('Timeout');
  proc.kill();
  process.exit(1);
}, 10000);