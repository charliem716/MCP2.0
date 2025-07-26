const { spawn } = require('child_process');

console.log('🔍 Investigating control value types\n');

const proc = spawn('npm', ['run', 'dev'], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

let sent = false;

proc.stdout.on('data', data => {
  const text = data.toString();

  if (!sent && text.includes('AI agents can now control')) {
    sent = true;
    setTimeout(() => {
      const req = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'list_controls',
          arguments: { component: '40_Display' },
        },
        id: 1,
      };
      console.log('📤 Requesting controls for "40_Display" component...\n');
      proc.stdin.write(`${JSON.stringify(req)}\n`);
    }, 1000);
  }

  try {
    const lines = text.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line);

      if (msg.id === 1 && msg.result) {
        const controls = JSON.parse(msg.result.content[0].text);

        console.log(`Found ${controls.length} controls for 40_Display\n`);

        // Analyze value types
        const valueTypes = {};
        controls.forEach(c => {
          const valueType = typeof c.value;
          const isObject = c.value && typeof c.value === 'object';
          const key = isObject ? 'object' : valueType;
          valueTypes[key] = (valueTypes[key] || 0) + 1;

          if (isObject) {
            console.log(
              `Object value found in ${c.name}:`,
              JSON.stringify(c.value)
            );
          }
        });

        console.log('\nValue type distribution:');
        Object.entries(valueTypes).forEach(([type, count]) => {
          console.log(`  ${type}: ${count}`);
        });

        // Show examples of each type
        console.log('\nExamples:');
        const examples = {};
        controls.forEach(c => {
          const type =
            c.value && typeof c.value === 'object' ? 'object' : typeof c.value;
          if (!examples[type]) {
            examples[type] = {
              name: c.name,
              value: c.value,
              controlType: c.type,
            };
          }
        });

        Object.entries(examples).forEach(([type, ex]) => {
          console.log(
            `  ${type}: ${ex.name} = ${JSON.stringify(ex.value)} (${ex.controlType})`
          );
        });

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
