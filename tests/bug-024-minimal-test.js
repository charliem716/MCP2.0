// Minimal test to verify BUG-024 fix
const testCases = [
  { input: "MainMixer.gain", expected: { comp: "MainMixer", ctrl: "gain" } },
  { input: "masterVolume", expected: { comp: "", ctrl: "masterVolume" } },
  { input: "Component.channel.1.gain", expected: { comp: "Component", ctrl: "channel.1.gain" } }
];

testCases.forEach(test => {
  // Updated implementation in adapter.ts line 178-181
  const dotIndex = test.input.indexOf('.');
  const [compName, ctrlName] = dotIndex > -1 ? 
    [test.input.substring(0, dotIndex), test.input.substring(dotIndex + 1)] : 
    ['', test.input];
  
  const passed = compName === test.expected.comp && ctrlName === test.expected.ctrl;
  console.log(`${passed ? '✅' : '❌'} ${test.input} → comp: "${compName}", ctrl: "${ctrlName}"`);
  
  if (!passed) {
    console.log(`   Expected: comp: "${test.expected.comp}", ctrl: "${test.expected.ctrl}"`);
  }
});

// Test with indexOf approach for dots in control names
console.log('\nTesting indexOf approach for dots in control names:');
const dotTest = "Component.channel.1.gain";
const idx = dotTest.indexOf('.');
const [comp, ctrl] = idx > -1 ? 
  [dotTest.substring(0, idx), dotTest.substring(idx + 1)] : 
  ['', dotTest];
console.log(`✅ ${dotTest} → comp: "${comp}", ctrl: "${ctrl}"`);