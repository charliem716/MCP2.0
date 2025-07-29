import { describe, it, expect } from '@jest/globals';
import { execSync } from 'child_process';

describe('BUG-103: ESLint Verification', () => {
  it('should pass ESLint without errors', () => {
    console.log('Verifying BUG-103: ESLint errors...\n');
    
    let output: string = '';
    let hasErrors = false;
    let errorDetails = { total: 0, errors: 0, warnings: 0 };
    
    try {
      output = execSync('npm run lint', { encoding: 'utf8' });
      console.log('✅ Lint passed successfully!');
      console.log('BUG-103 is RESOLVED');
      hasErrors = false;
    } catch (error: any) {
      hasErrors = true;
      output = error.stdout ?? error.message;
      
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
        console.log(
          `❌ Lint failed with ${errors} errors and ${warnings} warnings`
        );
        console.log(`Total problems: ${total}`);
        console.log('\nBUG-103 is STILL FAILING');
        console.log(`Expected: 0 errors`);
        console.log(`Actual: ${errors} errors`);
      } else {
        console.log('❌ Failed to run lint');
        console.log(output);
      }
    }
    
    // Assert that there are no errors
    expect(errorDetails.errors).toBe(0);
    expect(hasErrors).toBe(false);
  });
});
