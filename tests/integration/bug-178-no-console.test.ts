/**
 * BUG-178: Verify no console statements in production code
 * 
 * This test ensures that all console statements have been properly
 * replaced with structured logging or CLI output utilities.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('BUG-178: Console Statement Removal', () => {
  it('should have no console warnings from ESLint', () => {
    // Run ESLint and capture output
    let eslintOutput: string;
    try {
      eslintOutput = execSync('npm run lint 2>&1', { encoding: 'utf8' });
    } catch (error: any) {
      // ESLint exits with non-zero on warnings, capture output anyway
      eslintOutput = error.stdout || '';
    }

    // Check for no-console warnings
    const consoleWarnings = eslintOutput
      .split('\n')
      .filter(line => line.includes('no-console'));

    expect(consoleWarnings).toHaveLength(0);
  });

  it('should have CLI output utility for user-facing output', () => {
    const outputPath = path.join(process.cwd(), 'src/cli/output.ts');
    expect(fs.existsSync(outputPath)).toBe(true);
    
    // Verify the utility has the expected methods
    const outputContent = fs.readFileSync(outputPath, 'utf8');
    expect(outputContent).toContain('class CLIOutput');
    expect(outputContent).toContain('print(message: string)');
    expect(outputContent).toContain('printError(message: string)');
    expect(outputContent).toContain('printSuccess(message: string)');
    expect(outputContent).toContain('printWarning(message: string)');
    expect(outputContent).toContain('printFailure(message: string)');
  });

  it('should use CLI output utility in backup.ts', () => {
    const backupPath = path.join(process.cwd(), 'src/cli/backup.ts');
    const backupContent = fs.readFileSync(backupPath, 'utf8');
    
    // Should import the CLI output utility
    expect(backupContent).toContain("import { cliOutput } from './output.js'");
    
    // Should use cliOutput methods instead of console
    expect(backupContent).toContain('cliOutput.printSuccess');
    expect(backupContent).toContain('cliOutput.printFailure');
    expect(backupContent).toContain('cliOutput.printWarning');
    expect(backupContent).toContain('cliOutput.printItem');
    
    // Should not have console statements (except in eslint-disable blocks)
    const lines = backupContent.split('\n');
    const consoleLines = lines.filter((line, index) => {
      if (line.includes('console.')) {
        // Check if it's within an eslint-disable block
        const prevLines = lines.slice(Math.max(0, index - 5), index);
        return !prevLines.some(l => l.includes('eslint-disable'));
      }
      return false;
    });
    
    expect(consoleLines).toHaveLength(0);
  });

  it('should use logger in monitored-state-manager.ts', () => {
    const managerPath = path.join(process.cwd(), 'src/mcp/state/monitored-state-manager.ts');
    const managerContent = fs.readFileSync(managerPath, 'utf8');
    
    // Should import logger
    expect(managerContent).toContain("import { globalLogger as logger }");
    
    // Should use logger.warn instead of console.warn
    expect(managerContent).toContain('logger.warn');
    expect(managerContent).not.toMatch(/console\.warn(?!.*eslint-disable)/);
  });

  it('should have proper ESLint overrides for legitimate console usage', () => {
    const eslintConfigPath = path.join(process.cwd(), 'eslint.config.mjs');
    const eslintContent = fs.readFileSync(eslintConfigPath, 'utf8');
    
    // Should have override for CLI output utility
    expect(eslintContent).toContain("files: ['src/cli/output.ts']");
    expect(eslintContent).toMatch(/files:\s*\['src\/cli\/output\.ts'\][^}]*'no-console':\s*'off'/s);
    
    // Should have override for test files
    expect(eslintContent).toContain("'test-*.mjs'");
    expect(eslintContent).toContain("'tests/manual/**/*.mjs'");
  });

  it('should have eslint-disable comments for legitimate console usage in index.ts', () => {
    const indexPath = path.join(process.cwd(), 'src/index.ts');
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    
    // Find console.warn override section
    const lines = indexContent.split('\n');
    const consoleWarnIndex = lines.findIndex(line => line.includes('console.warn ='));
    
    if (consoleWarnIndex !== -1) {
      // Should have eslint-disable comment before console usage
      const contextLines = lines.slice(Math.max(0, consoleWarnIndex - 5), consoleWarnIndex + 10);
      const hasDisableComment = contextLines.some(line => line.includes('eslint-disable no-console'));
      const hasEnableComment = contextLines.some(line => line.includes('eslint-enable no-console'));
      
      expect(hasDisableComment).toBe(true);
      expect(hasEnableComment).toBe(true);
    }
  });

  it('should log operations in addition to user output', () => {
    const backupPath = path.join(process.cwd(), 'src/cli/backup.ts');
    const backupContent = fs.readFileSync(backupPath, 'utf8');
    
    // Should have both user output and logging
    expect(backupContent).toMatch(/cliOutput\.printSuccess.*[\s\S]*?logger\.info.*Backup completed/);
    expect(backupContent).toMatch(/cliOutput\.printFailure.*[\s\S]*?logger\.error.*Backup failed/);
    
    // Verify structured logging with metadata
    expect(backupContent).toContain('logger.info(');
    expect(backupContent).toContain('logger.error(');
    expect(backupContent).toMatch(/logger\.info\([^)]*{[\s\S]*?filename:/);
    expect(backupContent).toMatch(/logger\.error\([^)]*{[\s\S]*?error[\s\S]*?}/);
  });
});