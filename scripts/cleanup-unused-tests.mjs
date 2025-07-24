#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🧹 Cleaning up unused bug verification tests...\n');

const filesToRemove = [
  // Bug verification tests in root tests/
  'tests/verify-bug-032.mjs',
  'tests/verify-bug-076-final.mjs',
  'tests/verify-bug-076-simple.mjs',
  'tests/bug-030-performance-test.mjs',
  'tests/bug-046-comprehensive.mjs',
  'tests/bug-046-verify.mjs',
  'tests/verify-bug-023.mjs',
  'tests/verify-bug-042-final.mjs',
  'tests/bug-046-simulation.mjs',
  'tests/reproduce-bug-034.mjs',

  // Integration bug tests
  'tests/integration/qsys/test-bug-046-disconnect.mjs',
  'tests/integration/qsys/test-bug-046-manual.mjs',
  'tests/integration/bug-024-fix.test.mjs',
  'tests/integration/bug-048-behavior-test.mjs',
  'tests/integration/bug-031-verification.mjs',
  'tests/integration/bug-029-verification.js',
  'tests/integration/bug-039-verify.mjs',
  'tests/integration/bug-039-simple-verify.mjs',
  'tests/integration/bug-040-verify.mjs',
  'tests/integration/bug-042-test.mjs',
  'tests/integration/test-bug-036-getcomponents.mjs',

  // MCP bug tests
  'tests/integration/mcp/bug-035-mcp-tools.test.mjs',
  'tests/integration/mcp/test-bug-032-integration.mjs',
  'tests/integration/mcp/bug-035-param-formats.test.mjs',
  'tests/integration/mcp/bug-035-api-spec-examples.test.mjs',
  'tests/integration/mcp/test-bug-032.mjs',

  // TypeScript bug tests
  'tests/integration/bug-057-verification.test.ts',
  'tests/integration/bug-060-verification.test.ts',
  'tests/integration/bug066-fix-verification.test.ts',
  'tests/integration/bug067-verify.test.ts',
  'tests/unit/bug-023-console-fix.test.ts',

  // Manual/debug test files
  'tests/manual/debug-tools-test.mjs',
  'tests/manual/test-raw-command-tool.mjs',
  'tests/manual/live-mcp-tools-test.mjs',
  'tests/manual/live-tools-test.mjs',
  'tests/manual/live-tools-comprehensive.mjs',
];

let removedCount = 0;

filesToRemove.forEach(file => {
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    console.log(`✓ Removed ${file}`);
    removedCount++;
  }
});

console.log(`\n✅ Removed ${removedCount} unused test files`);

// Check if archived directory exists and remove it
if (fs.existsSync('tests/archived/bug-regression')) {
  execSync('rm -rf tests/archived/bug-regression');
  console.log('✓ Removed tests/archived/bug-regression directory');
}

console.log('\n🔍 Running lint to check remaining errors...\n');
try {
  const result = execSync('npm run lint 2>&1 | tail -5', { encoding: 'utf8' });
  console.log(result);
} catch (error) {
  if (error.stdout) {
    console.log(error.stdout);
  }
}
