const { spawn } = require('child_process');

console.log('🔍 Comprehensive test of list_controls and get_control_values\n');

const proc = spawn('npm', ['run', 'dev'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let sent = false;
let stage = 0;
let buffer = '';

proc.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  buffer += text;
  
  if (!sent && text.includes('AI agents can now control')) {
    sent = true;
    setTimeout(runTests, 1000);
  }
});

function runTests() {
  stage++;
  
  if (stage === 1) {
    console.log('📋 Test 1: list_controls (all)\n');
    sendRequest({
      name: "list_controls",
      arguments: {}
    });
  } else if (stage === 2) {
    console.log('\n📊 Test 2: get_control_values\n');
    sendRequest({
      name: "get_control_values",
      arguments: {
        controls: [
          "40_Display.cec.custom.input.1",
          "Soundbar.hdmi.audio.return.enable",
          "Main Mixer.input.1.gain"
        ]
      }
    });
  }
}

function sendRequest(params) {
  const req = {
    jsonrpc: "2.0",
    method: "tools/call",
    params: params,
    id: stage
  };
  proc.stdin.write(JSON.stringify(req) + '\n');
}

// Process responses
const checkInterval = setInterval(() => {
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    try {
      const msg = JSON.parse(line);
      
      if (msg.id === 1 && msg.result) {
        // Test 1: list_controls
        const controls = JSON.parse(msg.result.content[0].text);
        console.log(`✅ Found ${controls.length} controls`);
        
        // Check for proper component names
        const components = new Set(controls.map(c => c.component));
        console.log(`✅ ${components.size} unique components`);
        
        // Check for object values
        const objectValues = controls.filter(c => c.value && typeof c.value === 'object');
        console.log(`${objectValues.length === 0 ? '✅' : '❌'} No object values (${objectValues.length} found)`);
        
        // Show sample
        console.log('\nSample control:');
        const sample = controls[10];
        console.log(`  Name: ${sample.name}`);
        console.log(`  Component: ${sample.component}`);
        console.log(`  Type: ${sample.type}`);
        console.log(`  Value: ${JSON.stringify(sample.value)} (${typeof sample.value})`);
        
        setTimeout(runTests, 500);
        
      } else if (msg.id === 2 && msg.result) {
        // Test 2: get_control_values
        const values = JSON.parse(msg.result.content[0].text);
        console.log(`✅ Got ${values.length} control values`);
        
        values.forEach(v => {
          const isObject = v.value && typeof v.value === 'object';
          console.log(`\n${v.name}:`);
          console.log(`  Value: ${JSON.stringify(v.value)} (${typeof v.value}) ${isObject ? '❌ OBJECT!' : '✅'}`);
          if (v.error) console.log(`  Error: ${v.error}`);
        });
        
        const hasObjects = values.some(v => v.value && typeof v.value === 'object');
        console.log(`\n${hasObjects ? '❌ FAIL' : '✅ SUCCESS'}: ${hasObjects ? 'Still has' : 'No'} object values!`);
        
        clearInterval(checkInterval);
        proc.kill();
        process.exit(hasObjects ? 1 : 0);
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
  console.log('\n❌ Test timeout');
  clearInterval(checkInterval);
  proc.kill();
  process.exit(1);
}, 15000);