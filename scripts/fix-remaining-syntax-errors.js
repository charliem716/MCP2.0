#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

/**
 * Fix remaining syntax errors in test files
 */

const testFiles = [
  'tests/bug-024-direct-test.test.ts',
  'tests/bug-036-mock-verification.test.ts',
  'tests/bug-036-verification.test.ts',
  'tests/bug-046-demo.test.ts',
  'tests/bug-046-direct-test.test.ts',
  'tests/bug-046-final-verify.test.ts',
  'tests/test-raw-command-simple.test.ts',
];

function fixSyntaxErrors(filePath) {
  console.log(`Fixing ${filePath}...`);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    let fixed = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Check if this line has an orphaned template literal (missing comment on closing paren)
      if (trimmed.startsWith('`') && trimmed.endsWith(');') && i > 0) {
        const prevLine = lines[i - 1].trim();
        if (prevLine === '// console.log(') {
          // This is an orphaned template literal, comment out the closing paren
          fixed.push(line.replace(');', '// );'));
          continue;
        }
      }
      
      // Check for lines that end with just ); and should be commented
      if (trimmed === ');' && i > 0) {
        // Look back to see if this is part of a commented console.log
        let isCommentedLog = false;
        for (let j = i - 1; j >= 0 && j > i - 5; j--) {
          if (lines[j].includes('// console.log(')) {
            isCommentedLog = true;
            break;
          }
        }
        if (isCommentedLog) {
          fixed.push(line.replace(');', '// );'));
          continue;
        }
      }
      
      fixed.push(line);
    }
    
    const fixedContent = fixed.join('\n');
    if (content !== fixedContent) {
      fs.writeFileSync(filePath, fixedContent);
      console.log(`✓ Fixed ${filePath}`);
    } else {
      console.log(`  No changes needed for ${filePath}`);
    }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
  }
}

// Process each file
testFiles.forEach(filePath => {
  const fullPath = path.resolve(filePath);
  if (fs.existsSync(fullPath)) {
    fixSyntaxErrors(fullPath);
  } else {
    console.log(`File not found: ${filePath}`);
  }
});

console.log('Done!');