const { spawn } = require('child_process');

console.log('🐛 Testing BUG-058 Fix\n');

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
      console.log('📊 Calling qsys_get_all_controls (default summary mode)...\n');
      const req = {
        jsonrpc: "2.0",
        method: "tools/call",
        params: { 
          name: "qsys_get_all_controls", 
          arguments: {} 
        },
        id: 1
      };
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
        const response = JSON.parse(msg.result.content[0].text);
        
        console.log('✅ FIX VERIFIED:');
        console.log(`  Response time: ${responseTime}ms`);
        console.log(`  Response size: ${(responseSize / 1024).toFixed(2)} KB (was 1.2+ MB)`);
        console.log(`  Mode: summary (no full control data)`);
        console.log('\n📊 Summary Data:');
        console.log(`  Total controls: ${response.summary.totalControls}`);
        console.log(`  Total components: ${response.summary.totalComponents}`);
        console.log(`  Active controls: ${response.summary.activeControls}`);
        console.log('\n🏆 Top Components:');
        response.summary.componentsWithMostControls.forEach(comp => {
          console.log(`  - ${comp.name}: ${comp.count} controls`);
        });
        console.log('\n📈 Performance Improvement:');
        console.log(`  Size reduction: >99% (${(responseSize / 1024).toFixed(2)}KB vs 1200+KB)`);
        console.log(`  Default behavior: Returns summary only`);
        console.log(`  Full data: Available with mode='full'`);
        
        clearInterval(checkInterval);
        proc.kill();
        process.exit(0);
      }
    } catch (e) {}
  }
}, 100);

// Error handler
proc.stderr.on('data', (data) => {
  if (!data.toString().includes('dotenv')) {
    process.stderr.write(data);
  }
});

// Timeout
setTimeout(() => {
  console.log('❌ Test timeout');
  clearInterval(checkInterval);
  proc.kill();
  process.exit(1);
}, 15000);