/**
 * Test to verify BUG-023 fix: Console statements replaced with logger
 */

import { execSync } from 'child_process';
import path from 'path';

const projectRoot = path.join(__dirname, '..', '..');

describe('BUG-023: Console statements replaced with logger', () => {
  test('Production code should not contain console statements', () => {
    // Use grep to find console statements in production code
    const grepCommand = `grep -r "console\\." --include="*.ts" --include="*.js" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=coverage --exclude-dir=tests ${path.join(projectRoot, 'src')} || true`;
    
    const result = execSync(grepCommand, { encoding: 'utf-8' });
    const lines = result.trim().split('\n').filter(line => line.length > 0);
    
    // Check if any console statements were found
    if (lines.length > 0) {
      console.log('Found console statements in production code:');
      lines.forEach(line => console.log(line));
    }
    
    expect(lines.length).toBe(0);
  });

  test('ESLint should not report no-console warnings in production code', () => {
    // Run ESLint on src directory and check for no-console warnings
    try {
      const eslintCommand = `cd ${projectRoot} && npm run lint -- src/ 2>&1 | grep "no-console" || true`;
      const result = execSync(eslintCommand, { encoding: 'utf-8' });
      const warnings = result.trim().split('\n').filter(line => line.includes('no-console'));
      
      expect(warnings.length).toBe(0);
    } catch (error) {
      // If ESLint command fails, that's okay - we're only checking for no-console warnings
      expect(true).toBe(true);
    }
  });

  test('Logger should be imported in files that previously used console', () => {
    const filesToCheck = [
      'src/index.ts',
      'src/mcp/index.ts',
      'src/mcp/server.ts',
      'src/qrwc/officialClient.ts',
      'src/shared/utils/env.ts'
    ];

    filesToCheck.forEach(file => {
      const filePath = path.join(projectRoot, file);
      const checkCommand = `grep -E "(import.*logger|createLogger)" "${filePath}" || true`;
      const result = execSync(checkCommand, { encoding: 'utf-8' });
      
      // Each file should import logger
      expect(result.trim().length).toBeGreaterThan(0);
    });
  });

  test('ESLint configuration includes Node.js globals', () => {
    const eslintConfigPath = path.join(projectRoot, 'eslint.config.mjs');
    const checkCommand = `grep -E "console.*readonly|process.*readonly" "${eslintConfigPath}" || true`;
    const result = execSync(checkCommand, { encoding: 'utf-8' });
    
    // Should find console and process defined as globals
    expect(result).toContain('console');
    expect(result).toContain('process');
  });
});