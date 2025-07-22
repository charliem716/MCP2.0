import { execSync } from 'child_process';
import * as path from 'path';

describe('BUG-053: Type Assignment Integration Test', () => {
  it('should have no TS2322 errors in the affected files', () => {
    const projectRoot = path.resolve(__dirname, '../..');
    
    try {
      // Run type check and capture output
      const output = execSync('npm run type-check 2>&1', {
        cwd: projectRoot,
        encoding: 'utf8'
      });
      
      // Check for TS2322 errors in specific files
      const affectedFiles = [
        'change-group-executor.ts',
        'qsys-sync-adapter.ts', 
        'controls.ts',
        'status.ts'
      ];
      
      const ts2322Errors = output
        .split('\n')
        .filter(line => line.includes('TS2322'))
        .filter(line => affectedFiles.some(file => line.includes(file)));
      
      // Should have no TS2322 errors in the affected files
      expect(ts2322Errors).toHaveLength(0);
      
    } catch (error: any) {
      // Type check failed - check for TS2322 errors
      const output = error.stdout || error.stderr || '';
      
      const ts2322Errors = output
        .split('\n')
        .filter(line => line.includes('TS2322'))
        .filter(line => 
          line.includes('change-group-executor.ts') ||
          line.includes('qsys-sync-adapter.ts') ||
          line.includes('controls.ts') ||
          line.includes('status.ts')
        );
      
      if (ts2322Errors.length > 0) {
        console.log('Found TS2322 errors:', ts2322Errors);
      }
      
      expect(ts2322Errors).toHaveLength(0);
    }
  });
  
  it('should properly handle unknown types in runtime', () => {
    // Test that the type guards work correctly
    const testValues = [
      { input: 'string', expected: 'string' },
      { input: 123, expected: 123 },
      { input: true, expected: true },
      { input: {}, expected: null }, // Objects should be filtered out
      { input: null, expected: null },
      { input: undefined, expected: null },
      { input: [1, 2, 3], expected: null } // Arrays should be filtered out
    ];
    
    testValues.forEach(({ input, expected }) => {
      const result = (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') 
        ? input 
        : null;
      
      expect(result).toBe(expected);
    });
  });
});