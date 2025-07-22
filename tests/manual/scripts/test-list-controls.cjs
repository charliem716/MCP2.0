const { spawn } = require('child_process');

console.log('🧪 Testing list_controls Tool\n');

const server = spawn('npm', ['run', 'dev'], {
  stdio: ['pipe', 'pipe', 'inherit']
});

let testNum = 0;

setTimeout(() => {
  // Test 1: List all controls
  testNum++;
  console.log(`\n📋 Test ${testNum}: List all controls`);
  const request1 = {
    jsonrpc: "2.0",
    method: "tools/call",
    params: { 
      name: "list_controls", 
      arguments: {} 
    },
    id: testNum
  };
  server.stdin.write(JSON.stringify(request1) + '\n');
  
  // Test 2: List controls for specific component
  setTimeout(() => {
    testNum++;
    console.log(`\n📋 Test ${testNum}: List controls for "Soundbar" component`);
    const request2 = {
      jsonrpc: "2.0",
      method: "tools/call",
      params: { 
        name: "list_controls", 
        arguments: { component: "Soundbar" }
      },
      id: testNum
    };
    server.stdin.write(JSON.stringify(request2) + '\n');
  }, 2000);
  
}, 3000);

server.stdout.on('data', (data) => {
  try {
    const response = JSON.parse(data.toString());
    if (response.id && response.result) {
      const controls = JSON.parse(response.result.content[0].text);
      console.log(`\n✅ Response for Test ${response.id}:`);
      console.log(`Total controls: ${controls.length}`);
      
      if (controls.length > 0) {
        console.log('\nFirst 5 controls:');
        controls.slice(0, 5).forEach(ctrl => {
          console.log(`  - ${ctrl.name} (${ctrl.type}): ${ctrl.value}`);
        });
      } else {
        console.log('❌ No controls returned!');
      }
    }
  } catch (e) {}
});

setTimeout(() => {
  console.log('\n🧹 Test completed');
  server.kill('SIGTERM');
}, 10000);