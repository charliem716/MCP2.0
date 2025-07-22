const { spawn } = require('child_process');

console.log('🎯 Simple final test of list_controls\n');

const proc = spawn('npm', ['run', 'dev'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let sent = false;
let buffer = '';

// Capture all output
proc.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  buffer += text;
  
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
      console.log('Sending request...');
      proc.stdin.write(JSON.stringify(req) + '\n');
    }, 1000);
  }
});

// Process buffered output periodically
setInterval(() => {
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    try {
      const msg = JSON.parse(line);
      if (msg.id === 1 && msg.result) {
        const controls = JSON.parse(msg.result.content[0].text);
        
        console.log(`\n✅ SUCCESS! Got ${controls.length} controls\n`);
        
        // Show first 5 controls
        console.log('First 5 controls:');
        controls.slice(0, 5).forEach(c => {
          console.log(`- ${c.name}`);
          console.log(`  Component: ${c.component}`);
          console.log(`  Type: ${c.type}`);
          console.log(`  Value: ${JSON.stringify(c.value)}\n`);
        });
        
        // Check for unique components
        const comps = new Set(controls.map(c => c.component));
        console.log(`Unique components: ${comps.size}`);
        
        // Check for object values
        const objectValues = controls.filter(c => c.value && typeof c.value === 'object');
        console.log(`Controls with object values: ${objectValues.length}`);
        
        if (comps.size > 1 && objectValues.length === 0) {
          console.log('\n🎉 PERFECT! Component names are correct and no object values!');
        } else if (comps.size > 1) {
          console.log('\n✅ Component names are correct, but some values are still objects');
        }
        
        proc.kill();
        process.exit(0);
      }
    } catch (e) {}
  }
}, 100);

// Kill after 10 seconds
setTimeout(() => {
  console.log('Timeout');
  proc.kill();
  process.exit(1);
}, 10000);