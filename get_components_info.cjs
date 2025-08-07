const { spawn } = require('child_process');

console.log('🔍 Finding Q-SYS Components and Table_Mic_Meter Controls\n');

const proc = spawn('npm', ['run', 'dev'], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

let requestsSent = 0;
let responses = {};

proc.stdout.on('data', data => {
  const text = data.toString();

  // Send first request when ready - list all components
  if (requestsSent === 0 && text.includes('AI agents can now control')) {
    requestsSent = 1;
    setTimeout(() => {
      const req = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'list_components', arguments: {} },
        id: 1,
      };
      console.log('📤 Sending list_components request...\n');
      proc.stdin.write(`${JSON.stringify(req)}\n`);
    }, 1000);
  }

  // Look for responses
  try {
    const lines = text.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line);

      // Handle list_components response
      if (msg.id === 1 && msg.result) {
        responses.components = JSON.parse(msg.result.content[0].text);
        console.log(`✅ Got ${responses.components.length} components\n`);

        // Show all components, highlighting meter ones
        console.log('=== ALL COMPONENTS ===');
        const meterComponents = [];
        
        responses.components.forEach((comp, index) => {
          const isMeter = comp.name.toLowerCase().includes('meter') || 
                         comp.type?.toLowerCase().includes('meter');
          const indicator = isMeter ? '🔊 [METER]' : '  ';
          console.log(`${indicator} ${index + 1}. ${comp.name} (${comp.type || 'unknown type'})`);
          
          if (isMeter) {
            meterComponents.push(comp.name);
          }
        });

        console.log(`\n📊 Found ${meterComponents.length} meter components:`);
        meterComponents.forEach(name => console.log(`  - ${name}`));

        // Now request controls for Table_Mic_Meter specifically
        if (responses.components.some(comp => comp.name === 'Table_Mic_Meter')) {
          console.log('\n📤 Sending list_controls request for Table_Mic_Meter...\n');
          const req2 = {
            jsonrpc: '2.0',
            method: 'tools/call',
            params: { 
              name: 'list_controls', 
              arguments: { component_name: 'Table_Mic_Meter' } 
            },
            id: 2,
          };
          proc.stdin.write(`${JSON.stringify(req2)}\n`);
          requestsSent = 2;
        } else {
          console.log('\n❌ Table_Mic_Meter component not found!');
          console.log('Available components that might be similar:');
          responses.components
            .filter(comp => comp.name.toLowerCase().includes('mic') || comp.name.toLowerCase().includes('table'))
            .forEach(comp => console.log(`  - ${comp.name}`));
          proc.kill();
          process.exit(0);
        }
      }

      // Handle list_controls response for Table_Mic_Meter
      if (msg.id === 2 && msg.result) {
        const controls = JSON.parse(msg.result.content[0].text);
        console.log(`✅ Got ${controls.length} controls for Table_Mic_Meter\n`);

        console.log('=== TABLE_MIC_METER CONTROLS ===');
        controls.forEach((ctrl, index) => {
          console.log(`${index + 1}. ${ctrl.name}`);
          console.log(`   Type: ${ctrl.type || 'unknown'}`);
          console.log(`   Value: ${ctrl.value !== undefined ? ctrl.value : 'N/A'}`);
          if (ctrl.min !== undefined || ctrl.max !== undefined) {
            console.log(`   Range: ${ctrl.min || 'N/A'} to ${ctrl.max || 'N/A'}`);
          }
          console.log('');
        });

        console.log('✅ COMPLETE - All component and control information retrieved!');
        proc.kill();
        process.exit(0);
      }
    }
  } catch (e) {
    // Ignore JSON parse errors from log lines
  }
});

setTimeout(() => {
  console.log('⏰ Timeout after 20 seconds');
  proc.kill();
  process.exit(1);
}, 20000);