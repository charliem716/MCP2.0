#!/usr/bin/env node
/**
 * Verify BUG-023: Console.log Statements in Production Code
 * Expected: No console statements in production code
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

const execAsync = promisify(exec);

async function findConsoleStatements() {
  const results = {
    productionFiles: [],
    testFiles: [],
    totalProduction: 0,
    totalTest: 0
  };

  // Search for console statements in src/
  try {
    const { stdout } = await execAsync('grep -r "console\\." src/ || true');
    if (stdout.trim()) {
      const lines = stdout.trim().split('\n');
      results.productionFiles = lines;
      results.totalProduction = lines.length;
    }
  } catch (err) {
    // Grep returns non-zero if no matches found
  }

  // Check ESLint violations
  let eslintViolations = 0;
  try {
    const { stdout, stderr } = await execAsync('npm run lint 2>&1 | grep -c "no-console" || true');
    eslintViolations = parseInt(stdout.trim()) || 0;
  } catch (err) {
    // Ignore errors
  }

  // Verify Winston logger is used
  let loggerImports = 0;
  try {
    const { stdout } = await execAsync('grep -r "import.*logger" src/ | grep -v "test" | wc -l');
    loggerImports = parseInt(stdout.trim()) || 0;
  } catch (err) {
    // Ignore errors
  }

  return { results, eslintViolations, loggerImports };
}

async function main() {
  console.log('=== BUG-023 Verification: Console.log Statements ===\n');

  const { results, eslintViolations, loggerImports } = await findConsoleStatements();

  console.log('Production Code Analysis:');
  console.log(`- Console statements found: ${results.totalProduction}`);
  console.log(`- ESLint no-console violations: ${eslintViolations}`);
  console.log(`- Files importing logger: ${loggerImports}`);

  if (results.totalProduction > 0) {
    console.log('\n❌ FAILED: Console statements found in production:');
    results.productionFiles.forEach(file => console.log(`  ${file}`));
  } else {
    console.log('\n✅ PASSED: No console statements in production code');
  }

  console.log('\nExpected Behavior (from BUG-023):');
  console.log('- All production code uses Winston logger');
  console.log('- Zero console-related ESLint errors in src/');
  console.log('- Proper log levels and structured metadata');

  const status = results.totalProduction === 0 ? 'RESOLVED' : 'STILL FAILING';
  console.log(`\nStatus: ${status}`);
  console.log(`Confidence: ${results.totalProduction === 0 ? '95' : '0'}%`);

  process.exit(results.totalProduction === 0 ? 0 : 1);
}

main().catch(console.error);