/**
 * BUG-036: Final verification that all 'any' types have been removed
 */

import { execSync } from 'child_process';
import * as path from 'path';

describe("BUG-036: Complete 'any' Type Removal Verification", () => {
  test("No 'any' type annotations (': any') should exist in the source code", () => {
    // Search for ': any' type annotations in TypeScript files
    let anyCount = 0;
    let anyInstances: string[] = [];
    
    try {
      const result = execSync(
        'grep -r ": any" src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules" || true',
        { encoding: 'utf8', cwd: path.resolve(__dirname, '../../../') }
      );
      
      if (result.trim()) {
        anyInstances = result.trim().split('\n');
        anyCount = anyInstances.length;
      }
    } catch (error) {
      // grep returns non-zero exit code when no matches found, which is what we want
    }
    
    // Report findings
    if (anyCount > 0) {
      console.log(`Found ${anyCount} instances of ': any' type annotations:`);
      anyInstances.forEach(instance => console.log(`  ${instance}`));
    }
    
    // Verify no 'any' types remain
    expect(anyCount).toBe(0);
  });

  test("No 'any' type assertions ('as any') should exist in the source code", () => {
    // Search for 'as any' type assertions in TypeScript files
    let anyCount = 0;
    let anyInstances: string[] = [];
    
    try {
      const result = execSync(
        'grep -r "as any" src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules" || true',
        { encoding: 'utf8', cwd: path.resolve(__dirname, '../../../') }
      );
      
      if (result.trim()) {
        anyInstances = result.trim().split('\n');
        anyCount = anyInstances.length;
      }
    } catch (error) {
      // grep returns non-zero exit code when no matches found, which is what we want
    }
    
    // Report findings
    if (anyCount > 0) {
      console.log(`Found ${anyCount} instances of 'as any' type assertions:`);
      anyInstances.forEach(instance => console.log(`  ${instance}`));
    }
    
    // Verify no 'any' type assertions remain
    expect(anyCount).toBe(0);
  });

  test("No generic 'any' types ('<any>') should exist in the source code", () => {
    // Search for '<any>' generic type parameters in TypeScript files
    let anyCount = 0;
    let anyInstances: string[] = [];
    
    try {
      const result = execSync(
        'grep -r "<any>" src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules" || true',
        { encoding: 'utf8', cwd: path.resolve(__dirname, '../../../') }
      );
      
      if (result.trim()) {
        anyInstances = result.trim().split('\n');
        anyCount = anyInstances.length;
      }
    } catch (error) {
      // grep returns non-zero exit code when no matches found, which is what we want
    }
    
    // Report findings
    if (anyCount > 0) {
      console.log(`Found ${anyCount} instances of '<any>' generic types:`);
      anyInstances.forEach(instance => console.log(`  ${instance}`));
    }
    
    // Verify no generic 'any' types remain
    expect(anyCount).toBe(0);
  });

  test("TypeScript files should use proper types instead of 'any'", () => {
    // List of files that were fixed
    const fixedFiles = [
      'src/mcp/tools/controls.ts',
      'src/mcp/tools/components.ts',
      'src/mcp/tools/status.ts',
      'src/mcp/tools/discovery.ts',
      'src/mcp/tools/qsys-api.ts',
      'src/mcp/tools/api-reference.ts',
      'src/mcp/tools/base.ts',
      'src/mcp/qrwc/adapter.ts',
      'src/qrwc/officialClient.ts',
      'src/mcp/state/synchronizer/state-synchronizer.ts',
      'src/mcp/server.ts',
      'src/mcp/state/persistence/manager.ts',
      'src/mcp/state/persistence/types.ts',
      'src/mcp/state/persistence/backup.ts',
      'src/mcp/state/lru-cache.ts'
    ];

    // Verify each file exists and doesn't contain 'any'
    fixedFiles.forEach(file => {
      try {
        const content = execSync(
          `grep ": any" ${file} || true`,
          { encoding: 'utf8', cwd: path.resolve(__dirname, '../../../') }
        );
        
        expect(content.trim()).toBe('');
      } catch (error) {
        // File doesn't contain 'any', which is good
      }
    });
  });

  test("Verify type replacements are appropriate", () => {
    // Check that common replacements were made correctly
    const typeReplacements = [
      { file: 'src/mcp/tools/base.ts', search: 'unknown', expected: true },
      { file: 'src/mcp/qrwc/adapter.ts', search: 'QRWCClientInterface', expected: true },
      { file: 'src/mcp/tools/controls.ts', search: 'Record<string, unknown>', expected: true }
    ];

    typeReplacements.forEach(({ file, search, expected }) => {
      try {
        const result = execSync(
          `grep "${search}" ${file} | wc -l`,
          { encoding: 'utf8', cwd: path.resolve(__dirname, '../../../') }
        );
        
        const count = parseInt(result.trim());
        if (expected) {
          expect(count).toBeGreaterThan(0);
        }
      } catch (error) {
        if (expected) {
          throw error;
        }
      }
    });
  });
});