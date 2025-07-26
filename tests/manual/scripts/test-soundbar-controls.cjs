const { spawn } = require('child_process');

console.log('🔊 Testing Soundbar controls\n');

const proc = spawn('npm', ['run', 'dev'], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

let sent = false;
let stage = 0;
let buffer = '';

proc.stdout.on('data', chunk => {
  const text = chunk.toString();
  buffer += text;

  if (!sent && text.includes('AI agents can now control')) {
    sent = true;
    nextTest();
  }
});

function nextTest() {
  stage++;

  if (stage === 1) {
    // First list Soundbar controls
    const req = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'list_controls',
        arguments: { component: 'Soundbar' },
      },
      id: stage,
    };
    console.log('📋 Stage 1: Listing Soundbar controls...\n');
    proc.stdin.write(`${JSON.stringify(req)}\n`);
  } else if (stage === 2) {
    // Then get values for some specific controls
    const req = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'get_control_values',
        arguments: {
          controls: [
            'Soundbar.hdmi.audio.return.enable',
            'Soundbar.audio.output.soundbar.mode.select',
            'Soundbar.audio.output.soundbar.volume',
            'Soundbar.audio.output.soundbar.mute',
          ],
        },
      },
      id: stage,
    };
    console.log('\n📊 Stage 2: Getting specific control values...\n');
    proc.stdin.write(`${JSON.stringify(req)}\n`);
  }
}

// Process responses
setInterval(() => {
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const msg = JSON.parse(line);

      if (msg.id === 1 && msg.result) {
        // Stage 1: List controls response
        const controls = JSON.parse(msg.result.content[0].text);
        console.log(`Found ${controls.length} Soundbar controls`);

        // Show some interesting controls
        const interesting = controls
          .filter(
            c =>
              c.name.includes('volume') ||
              c.name.includes('mute') ||
              c.name.includes('mode')
          )
          .slice(0, 5);

        console.log('\nInteresting controls:');
        interesting.forEach(c => {
          console.log(`- ${c.name}: ${JSON.stringify(c.value)} (${c.type})`);
        });

        // Continue to stage 2
        setTimeout(nextTest, 500);
      } else if (msg.id === 2 && msg.result) {
        // Stage 2: Get values response
        const values = JSON.parse(msg.result.content[0].text);

        console.log('Control values:');
        values.forEach(v => {
          console.log(`- ${v.name}`);
          console.log(
            `  Value: ${JSON.stringify(v.value)} (${typeof v.value})`
          );
          if (v.error) {
            console.log(`  Error: ${v.error}`);
          }
        });

        const hasObjects = values.some(
          v => v.value && typeof v.value === 'object'
        );
        if (!hasObjects) {
          console.log('\n✅ Perfect! All values are properly extracted.');
        } else {
          console.log('\n❌ Some values are still objects.');
        }

        proc.kill();
        process.exit(0);
      }
    } catch (e) {}
  }
}, 100);

// Timeout
setTimeout(() => {
  console.log('Timeout');
  proc.kill();
  process.exit(1);
}, 15000);
