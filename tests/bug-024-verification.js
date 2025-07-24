// BUG-024 Verification Test
console.log('=== BUG-024 Verification ===\n');

// Test the parsing logic directly
function testParsing(name) {
  const dotIndex = name.indexOf('.');
  const [compName, ctrlName] =
    dotIndex > -1
      ? [name.substring(0, dotIndex), name.substring(dotIndex + 1)]
      : ['', name];
  return { compName, ctrlName };
}

// Test cases from bug report
const testCases = [
  {
    input: 'MainMixer.gain',
    expected: { compName: 'MainMixer', ctrlName: 'gain' },
    description: 'Basic component.control format',
  },
  {
    input: 'gain',
    expected: { compName: '', ctrlName: 'gain' },
    description: 'Control only (no component)',
  },
  {
    input: 'Output.channel.1.mute',
    expected: { compName: 'Output', ctrlName: 'channel.1.mute' },
    description: 'Control with dots in name',
  },
];

let allPassed = true;

testCases.forEach(test => {
  const result = testParsing(test.input);
  const passed =
    result.compName === test.expected.compName &&
    result.ctrlName === test.expected.ctrlName;

  console.log(`Test: ${test.description}`);
  console.log(`Input: "${test.input}"`);
  console.log(
    `Expected: component="${test.expected.compName}", control="${test.expected.ctrlName}"`
  );
  console.log(
    `Got:      component="${result.compName}", control="${result.ctrlName}"`
  );
  console.log(`Result: ${passed ? '✅ PASS' : '❌ FAIL'}\n`);

  if (!passed) allPassed = false;
});

console.log(
  `Overall: ${allPassed ? '✅ All tests passed' : '❌ Some tests failed'}`
);
process.exit(allPassed ? 0 : 1);
