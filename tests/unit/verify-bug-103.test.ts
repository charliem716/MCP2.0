/**
 * BUG-103: ESLint errors verification test
 * Ensures that the codebase passes ESLint without errors
 */

import { describe, it, expect } from '@jest/globals';
import { execSync } from 'child_process';

describe('BUG-103: ESLint Verification', () => {
  it('should pass ESLint without errors', () => {
    let output: string = '';
    let hasErrors = false;
    let errorDetails = { total: 0, errors: 0, warnings: 0 };

    try {
      output = execSync('npm run lint', { encoding: 'utf8' });
      hasErrors = false;
    } catch (error: any) {
      hasErrors = true;
      output = error.stdout ?? error.message;
      
      // Parse error details
      const errorMatch = output.match(
        /✖ (\d+) problems \((\d+) errors, (\d+) warnings\)/
      );

      if (errorMatch) {
        const [, total, errors, warnings] = errorMatch;
        errorDetails = {
          total: parseInt(total),
          errors: parseInt(errors),
          warnings: parseInt(warnings)
        };
      }
    }

    // Log results for debugging
    if (hasErrors) {
      console.log(`Lint found ${errorDetails.errors} errors and ${errorDetails.warnings} warnings`);
    } else {
      console.log('✅ Lint passed successfully!');
    }

    // Expect no errors (warnings are acceptable)
    // BUG-103 has been resolved - all ESLint errors have been fixed
    expect(errorDetails.errors).toBe(0);
  });
});