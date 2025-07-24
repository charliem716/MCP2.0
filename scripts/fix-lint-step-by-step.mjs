#!/usr/bin/env node
import { execSync } from 'child_process';

console.log('🔧 Starting step-by-step lint fix process...\n');

const steps = [
  {
    name: 'Auto-fix safe issues',
    command: 'npm run lint:fix',
    description: 'Fixes formatting, spacing, quotes, etc.',
  },
  {
    name: 'Replace console.log with logger',
    command: `find src -name "*.ts" -type f -exec sed -i '' 's/console\\.log(/logger.info(/g' {} \\;`,
    description: 'Replace console.log with logger.info',
  },
  {
    name: 'Replace console.error with logger',
    command: `find src -name "*.ts" -type f -exec sed -i '' 's/console\\.error(/logger.error(/g' {} \\;`,
    description: 'Replace console.error with logger.error',
  },
  {
    name: 'Check current status',
    command: 'npm run lint 2>&1 | tail -5',
    description: 'Show remaining issues',
  },
];

for (const step of steps) {
  console.log(`\n📌 ${step.name}`);
  console.log(`   ${step.description}`);

  try {
    const output = execSync(step.command, { encoding: 'utf8', stdio: 'pipe' });
    console.log('✅ Success');
    if (step.name === 'Check current status') {
      console.log(output);
    }
  } catch (error) {
    console.log('⚠️  Some issues remain');
    if (step.name === 'Check current status' && error.stdout) {
      console.log(error.stdout);
    }
  }
}

console.log('\n🎯 Next steps:');
console.log('1. Run "npm run lint" to see remaining issues');
console.log('2. Fix TypeScript unsafe operations manually');
console.log('3. Add proper types to replace "any"');
console.log('4. Refactor complex functions exceeding max-statements');
