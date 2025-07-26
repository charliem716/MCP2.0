#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🚀 Comprehensive lint fix process starting...\n');

// Step 1: Run auto-fix
console.log('Step 1: Running ESLint auto-fix...');
try {
  execSync('npm run lint:fix', { stdio: 'inherit' });
} catch (_e) {
  console.log('Auto-fix completed with some remaining issues.\n');
}

// Step 2: Fix console statements by adding logger imports
console.log('\nStep 2: Fixing console statements...');
const srcFiles = execSync('find src -name "*.ts" -type f', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

for (const file of srcFiles) {
  let content = fs.readFileSync(file, 'utf8');
  let modified = false;

  // Check if file uses console
  if (content.includes('console.')) {
    // Add logger import if not present
    if (
      !content.includes('import logger') &&
      !content.includes("from 'winston'")
    ) {
      const importStatement = `import logger from '../shared/logger';\n`;
      content = importStatement + content;
      modified = true;
    }

    // Replace console statements
    content = content
      .replace(/console\.log\(/g, 'logger.info(')
      .replace(/console\.error\(/g, 'logger.error(')
      .replace(/console\.warn\(/g, 'logger.warn(')
      .replace(/console\.debug\(/g, 'logger.debug(');

    modified = true;
  }

  if (modified) {
    fs.writeFileSync(file, content);
    console.log(`  ✓ Fixed ${path.basename(file)}`);
  }
}

// Step 3: Add type annotations for common patterns
console.log('\nStep 3: Adding type safety...');
console.log('  - Run "npm run type-check" to identify type issues');
console.log('  - Manually add types to replace "any" usage');

// Step 4: Final check
console.log('\nStep 4: Checking final status...');
try {
  const result = execSync('npm run lint 2>&1 | tail -10', { encoding: 'utf8' });
  console.log(result);
} catch (error) {
  if (error.stdout) {
    console.log(error.stdout);
  }
}

console.log('\n📋 Manual fixes needed:');
console.log('1. Fix TypeScript unsafe operations by adding proper types');
console.log('2. Refactor functions exceeding max-statements (20)');
console.log('3. Fix unused variables or prefix with underscore');
console.log('4. Run "npm run lint" to see specific issues');
