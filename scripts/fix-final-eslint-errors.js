#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

/**
 * Fix final ESLint errors
 */

const fixes = [
  {
    file: 'tests/bug-036-mock-verification.test.ts',
    lineNumber: 176,
    issue: 'parsing error'
  },
  {
    file: 'tests/bug-036-verification.test.ts', 
    lineNumber: 209,
    issue: 'parsing error'
  },
  {
    file: 'tests/bug-046-demo.test.ts',
    lineNumbers: [60, 70],
    issue: 'no-unused-expressions'
  },
  {
    file: 'tests/bug-046-direct-test.test.ts',
    lineNumber: 57,
    issue: 'no-unused-expressions'
  },
  {
    file: 'tests/bug-046-final-verify.test.ts',
    lineNumbers: [106, 114],
    issue: 'no-unused-expressions'
  },
  {
    file: 'tests/integration/test-raw-command-tool.test.ts',
    lineNumbers: [65, 80],
    issue: 'no-unused-expressions'
  },
  {
    file: 'tests/test-raw-command-simple.test.ts',
    lineNumbers: [52, 67],
    issue: 'no-unused-expressions'
  }
];

function fixFile(filePath, issues) {
  console.log(`Fixing ${filePath}...`);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    let modified = false;
    
    if (issues.lineNumber) {
      // Single line fix
      const lineIndex = issues.lineNumber - 1;
      if (lineIndex >= 0 && lineIndex < lines.length) {
        const line = lines[lineIndex];
        
        if (issues.issue === 'parsing error' && line.trim() === ');') {
          // This is likely an orphaned closing paren that should be commented
          lines[lineIndex] = line.replace(');', '// );');
          console.log(`  Fixed line ${issues.lineNumber}: commented out orphaned );`);
          modified = true;
        }
      }
    } else if (issues.lineNumbers) {
      // Multiple lines to fix
      for (const lineNum of issues.lineNumbers) {
        const lineIndex = lineNum - 1;
        if (lineIndex >= 0 && lineIndex < lines.length) {
          const line = lines[lineIndex];
          
          if (issues.issue === 'no-unused-expressions') {
            // Check if it's a standalone string
            if (line.trim().match(/^`[^`]*`[;]?$/) || line.trim().match(/^'[^']*'[;]?$/)) {
              lines[lineIndex] = line.replace(/^(\s*)(.*)$/, '$1// $2');
              console.log(`  Fixed line ${lineNum}: commented out unused expression`);
              modified = true;
            }
          }
        }
      }
    }
    
    if (modified) {
      fs.writeFileSync(filePath, lines.join('\n'));
      console.log(`✓ Fixed ${filePath}\n`);
    } else {
      console.log(`  No changes needed for ${filePath}\n`);
    }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
  }
}

// Process each file
fixes.forEach(({ file, ...issues }) => {
  const fullPath = path.resolve(file);
  if (fs.existsSync(fullPath)) {
    fixFile(fullPath, issues);
  } else {
    console.log(`File not found: ${file}`);
  }
});

console.log('Done!');