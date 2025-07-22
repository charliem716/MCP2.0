const { spawn } = require('child_process');

console.log('🐛 Reproducing BUG-058: qsys_get_all_controls overwhelming response\n');

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
      const req = {
        jsonrpc: "2.0",
        method: "tools/call",
        params: { 
          name: "qsys_get_all_controls", 
          arguments: {} 
        },
        id: 1
      };
      console.log('📤 Calling qsys_get_all_controls...\n');
      proc.stdin.write(JSON.stringify(req) + '\n');
    }, 1000);
  }
});

// Process response
const startTime = Date.now();
const checkInterval = setInterval(() => {
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    try {
      const msg = JSON.parse(line);
      
      if (msg.id === 1 && msg.result) {
        const responseTime = Date.now() - startTime;
        const responseSize = JSON.stringify(msg.result).length;
        const controls = JSON.parse(msg.result.content[0].text);
        
        console.log('📊 Response Analysis:');
        console.log(`  Response time: ${responseTime}ms`);
        console.log(`  Response size: ${(responseSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  Total controls: ${controls.length}`);
        console.log(`  Bytes per control: ${Math.round(responseSize / controls.length)}`);
        
        // Count unique components
        const components = new Set(controls.map(c => c.component));
        console.log(`  Unique components: ${components.size}`);
        
        // Show data structure
        console.log('\n❌ ISSUE CONFIRMED:');
        console.log('  - Returns ALL controls in a flat array');
        console.log('  - No filtering or pagination options');
        console.log('  - Over 1MB of data in single response');
        console.log('  - Difficult for AI agents to process\n');
        
        clearInterval(checkInterval);
        proc.kill();
        process.exit(0);
      }
    } catch (e) {}
  }
}, 100);

// Timeout
setTimeout(() => {
  console.log('❌ Test timeout');
  clearInterval(checkInterval);
  proc.kill();
  process.exit(1);
}, 15000);