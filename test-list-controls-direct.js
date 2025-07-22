#!/usr/bin/env node

const request = {
  jsonrpc: "2.0",
  method: "tools/call",
  params: { 
    name: "list_controls", 
    arguments: {} 
  },
  id: 1
};

console.log('Testing list_controls tool directly...\n');
console.log('Request:', JSON.stringify(request, null, 2));
console.log('\nSending to stdin...');

// Send to stdin
process.stdout.write(JSON.stringify(request) + '\n');

// Wait for response
process.stdin.on('data', (data) => {
  try {
    const response = JSON.parse(data.toString());
    console.log('\nResponse received:');
    console.log(JSON.stringify(response, null, 2));
    
    if (response.result && response.result.content) {
      const controls = JSON.parse(response.result.content[0].text);
      console.log(`\nParsed ${controls.length} controls`);
      if (controls.length > 0) {
        console.log('\nFirst 3 controls:');
        controls.slice(0, 3).forEach(ctrl => {
          console.log(`  - ${ctrl.name} (${ctrl.type}): ${ctrl.value}`);
        });
      }
    }
    
    process.exit(0);
  } catch (e) {
    console.error('Failed to parse response:', e.message);
  }
});

setTimeout(() => {
  console.error('\nTimeout - no response received');
  process.exit(1);
}, 5000);