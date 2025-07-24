const { spawn } = require('child_process');

console.log('🔍 Testing error handling for filtered mode without filter\n');

const proc = spawn('npm', ['run', 'dev'], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

let sent = false;
let buffer = '';

proc.stdout.on('data', chunk => {
  const text = chunk.toString();
  buffer += text;

  if (!sent && text.includes('AI agents can now control')) {
    sent = true;
    setTimeout(() => {
      console.log(
        '📤 Calling qsys_get_all_controls with mode=filtered (no filter)...\n'
      );
      const req = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'qsys_get_all_controls',
          arguments: { mode: 'filtered' },
        },
        id: 1,
      };
      proc.stdin.write(`${JSON.stringify(req)}\n`);
    }, 1000);
  }
});

// Process response
const checkInterval = setInterval(() => {
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const msg = JSON.parse(line);
      console.log('📥 Received:', JSON.stringify(msg, null, 2));

      if (msg.id === 1) {
        if (msg.error) {
          console.log('\n✅ Error received as expected');
          console.log(`  Message: ${msg.error.message}`);
        } else if (msg.result?.isError) {
          console.log('\n✅ Error response received');
          const errorText = msg.result.content[0].text;
          console.log(`  Error: ${errorText}`);
          const hasCorrectError = errorText.includes('Filter required');
          console.log(
            `  Correct error: ${hasCorrectError ? 'Yes ✅' : 'No ❌'}`
          );
        } else {
          console.log('\n❌ Expected error but got success response');
        }

        clearInterval(checkInterval);
        proc.kill();
        process.exit(0);
      }
    } catch (e) {
      console.log('Parse error:', e);
    }
  }
}, 100);

// Timeout
setTimeout(() => {
  console.log('\n❌ Test timeout');
  clearInterval(checkInterval);
  proc.kill();
  process.exit(1);
}, 15000);
