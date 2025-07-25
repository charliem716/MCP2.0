#!/usr/bin/env node
/**
 * Script to automatically fix common ESLint warnings
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const FIX_RULES = [
  '@typescript-eslint/prefer-optional-chain',
  '@typescript-eslint/prefer-nullish-coalescing',
  '@typescript-eslint/no-non-null-assertion',
  'no-console',
  '@typescript-eslint/ban-ts-comment'
];

async function fixEslintWarnings() {
  console.log('🔧 Fixing common ESLint warnings...\n');

  // Run ESLint with auto-fix for specific rules
  for (const rule of FIX_RULES) {
    console.log(`Fixing ${rule}...`);
    try {
      execSync(
        `npx eslint . --ext .ts,.tsx,.mjs --fix --rule '${rule}: error' --no-eslintrc`,
        { stdio: 'inherit' }
      );
    } catch (error) {
      // ESLint exits with non-zero when there are unfixable issues
      console.log(`Some ${rule} issues could not be auto-fixed`);
    }
  }

  // Run full ESLint to see remaining issues
  console.log('\n📊 Running full ESLint check...');
  try {
    execSync('npm run lint', { stdio: 'inherit' });
  } catch (error) {
    // Expected to have some remaining warnings
  }

  // Count remaining warnings
  try {
    const output = execSync('npm run lint 2>&1 || true', { encoding: 'utf-8' });
    const matches = output.match(/(\d+) problems \((\d+) errors?, (\d+) warnings?\)/);
    if (matches) {
      console.log(`\n✅ Remaining: ${matches[2]} errors, ${matches[3]} warnings`);
    }
  } catch (error) {
    console.error('Could not count remaining issues');
  }
}

fixEslintWarnings().catch(console.error);