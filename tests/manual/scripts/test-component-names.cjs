const { spawn } = require('child_process');

console.log('🧪 Testing component names in list_controls\n');

// Start the dev server
const proc = spawn('npm', ['run', 'dev'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let ready = false;
let buffer = '';

// Handle stdout
proc.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  buffer += text;
  
  if (!ready && text.includes('AI agents can now control')) {
    ready = true;
    console.log('✅ Server ready! Sending request...\n');
    setTimeout(sendRequest, 500);
  }
  
  // Process complete lines
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  
  for (const line of lines) {
    if (!line.trim() || line.includes('level')) continue;
    
    try {
      const msg = JSON.parse(line);
      
      if (msg.id === 1 && msg.result) {
        console.log('📥 Got response!\n');
        
        const controls = JSON.parse(msg.result.content[0].text);
        console.log(`Total controls: ${controls.length}\n`);
        
        // Check component names
        const componentMap = {};
        controls.forEach(ctrl => {
          if (!componentMap[ctrl.component]) {
            componentMap[ctrl.component] = [];
          }
          componentMap[ctrl.component].push(ctrl.name);
        });
        
        const components = Object.keys(componentMap);
        console.log(`Unique components: ${components.length}\n`);
        
        if (components.length === 1 && components[0] === 'All Components') {
          console.log('❌ ISSUE: All controls show "All Components" as component name');
          console.log('This means we cannot identify which component each control belongs to!\n');
        } else {
          console.log('✅ SUCCESS: Controls have proper component names!\n');
          console.log('Sample components and their controls:');
          
          // Show first 5 components
          components.slice(0, 5).forEach(comp => {
            const controls = componentMap[comp];
            console.log(`\n${comp}: ${controls.length} controls`);
            console.log(`  Examples: ${controls.slice(0, 3).join(', ')}`);
          });
        }
        
        // Test a specific component
        const soundbarControls = controls.filter(c => c.component === 'Soundbar');
        if (soundbarControls.length > 0) {
          console.log(`\n📊 Soundbar component has ${soundbarControls.length} controls`);
          console.log('First 3 Soundbar controls:');
          soundbarControls.slice(0, 3).forEach(ctrl => {
            console.log(`  - ${ctrl.name}: ${ctrl.value}`);
          });
        }
        
        setTimeout(() => {
          proc.kill('SIGTERM');
          process.exit(0);
        }, 1000);
      }
    } catch (e) {
      // Not JSON
    }
  }
});

// Handle stderr
proc.stderr.on('data', (chunk) => {
  // Ignore dotenv debug messages
  const text = chunk.toString();
  if (!text.includes('dotenv@')) {
    process.stderr.write(text);
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
  
  proc.stdin.write(JSON.stringify(request) + '\n');
}

// Timeout
setTimeout(() => {
  if (!ready) {
    console.error('❌ Server failed to start');
    proc.kill('SIGTERM');
    process.exit(1);
  }
}, 20000);