#!/usr/bin/env node
import { execSync } from 'child_process';

console.log('Verifying BUG-103: ESLint errors...\n');

try {
  const output = execSync('npm run lint', { encoding: 'utf8' });
  console.log('✅ Lint passed successfully!');
  console.log('BUG-103 is RESOLVED');
  process.exit(0);
} catch (error) {
  const output = error.stdout || error.message;
  const errorMatch = output.match(
    /✖ (\d+) problems \((\d+) errors, (\d+) warnings\)/
  );

  if (errorMatch) {
    const [, total, errors, warnings] = errorMatch;
    console.log(
      `❌ Lint failed with ${errors} errors and ${warnings} warnings`
    );
    console.log(`Total problems: ${total}`);
    console.log('\nBUG-103 is STILL FAILING');
    console.log(`Expected: 0 errors`);
    console.log(`Actual: ${errors} errors`);
  } else {
    console.log('❌ Failed to run lint');
    console.log(output);
  }
  process.exit(1);
}
