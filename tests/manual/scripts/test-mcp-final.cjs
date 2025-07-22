const { spawn } = require('child_process');

console.log('🧪 Final MCP component name test\n');

const proc = spawn('npm', ['run', 'dev'], {
  stdio: ['pipe', 'pipe', 'inherit']
});

let sent = false;

proc.stdout.on('data', (data) => {
  const text = data.toString();
  
  // Send request when ready
  if (!sent && text.includes('AI agents can now control')) {
    sent = true;
    setTimeout(() => {
      const req = {
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: "list_controls", arguments: {} },
        id: 1
      };
      console.log('📤 Sending request...\n');
      proc.stdin.write(JSON.stringify(req) + '\n');
    }, 1000);
  }
  
  // Look for response
  try {
    const lines = text.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      
      if (msg.id === 1 && msg.result) {
        const controls = JSON.parse(msg.result.content[0].text);
        
        console.log(`✅ Got ${controls.length} controls\n`);
        
        // Show first 3 with component info
        console.log('First 3 controls:');
        controls.slice(0, 3).forEach(c => {
          console.log(`- ${c.name}`);
          console.log(`  Component: ${c.component}`);
          console.log(`  Value: ${c.value}\n`);
        });
        
        // Count unique components
        const uniqueComps = new Set(controls.map(c => c.component));
        console.log(`Unique components: ${uniqueComps.size}`);
        
        if (uniqueComps.size > 1) {
          console.log('✅ SUCCESS: Controls have individual component names!');
          console.log('Examples:', Array.from(uniqueComps).slice(0, 5).join(', '));
        } else {
          console.log('❌ FAIL: All controls have same component:', Array.from(uniqueComps)[0]);
        }
        
        proc.kill();
        process.exit(0);
      }
    }
  } catch (e) {}
});

setTimeout(() => {
  console.log('Timeout');
  proc.kill();
  process.exit(1);
}, 15000);