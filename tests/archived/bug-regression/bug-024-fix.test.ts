import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

describe('BUG-024: No duplicate JS files in src directory', () => {
  it('should not have any .js files in the src directory', () => {
    const srcDir = path.join(process.cwd(), 'src');
    const jsFiles: string[] = [];
    
    function findJsFiles(dir: string) {
      const files = fs.readdirSync(dir);
      
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          findJsFiles(fullPath);
        } else if (file.endsWith('.js') && !file.endsWith('.mjs') && !file.endsWith('.cjs')) {
          jsFiles.push(path.relative(srcDir, fullPath));
        }
      }
    }
    
    if (fs.existsSync(srcDir)) {
      findJsFiles(srcDir);
    }
    
    expect(jsFiles).toEqual([]);
  });
  
  it('should have proper .gitignore rules to exclude .js files from src', () => {
    const gitignorePath = path.join(process.cwd(), '.gitignore');
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
    
    // Check for the rule that excludes .js files from src
    expect(gitignoreContent).toContain('src/**/*.js');
    
    // Check for exceptions for .mjs and .cjs files
    expect(gitignoreContent).toContain('!src/**/*.mjs');
    expect(gitignoreContent).toContain('!src/**/*.cjs');
  });
  
  it('should compile TypeScript to dist directory only', () => {
    const tsconfigPath = path.join(process.cwd(), 'tsconfig.json');
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
    
    expect(tsconfig.compilerOptions.outDir).toBe('./dist');
  });
  
  it('should verify git ignores .js files in src directory', () => {
    // Create a temporary .js file in src to test gitignore
    const testFile = path.join(process.cwd(), 'src', 'test-gitignore.js');
    fs.writeFileSync(testFile, '// test file');
    
    try {
      // Check if git would ignore this file
      const result = execSync('git check-ignore src/test-gitignore.js 2>&1', { 
        encoding: 'utf-8',
        cwd: process.cwd()
      }).trim();
      
      // If git check-ignore returns the filename, it means it's ignored
      expect(result).toBe('src/test-gitignore.js');
    } catch (error) {
      // git check-ignore exits with 1 if file is not ignored
      expect(error).toBeNull();
    } finally {
      // Clean up test file
      fs.unlinkSync(testFile);
    }
  });
});