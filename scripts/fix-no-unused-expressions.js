#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

/**
 * Fix no-unused-expressions errors in test files
 */

const filesToFix = [
  {
    file: 'tests/functional/test-control-validation.test.ts',
    lines: [181, 219, 233, 266, 395, 399]
  },
  {
    file: 'tests/integration/test-raw-command-tool.test.ts',
    lines: [64, 79]
  }
];

function fixNoUnusedExpressions(filePath, errorLines) {
  console.log(`Fixing ${filePath}...`);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    // Sort error lines in descending order to avoid index shifting
    errorLines.sort((a, b) => b - a);
    
    for (const lineNum of errorLines) {
      const lineIndex = lineNum - 1; // Convert to 0-based index
      if (lineIndex >= 0 && lineIndex < lines.length) {
        const line = lines[lineIndex];
        
        // Check if this is a standalone string expression
        if (line.trim().match(/^'[^']*'[;]?$/) || line.trim().match(/^`[^`]*`[;]?$/)) {
          // Comment out the line
          lines[lineIndex] = line.replace(/^(\s*)(.*)$/, '$1// $2');
          console.log(`  Fixed line ${lineNum}: ${line.trim()}`);
        } else if (line.trim().startsWith("'") || line.trim().startsWith("`")) {
          // This might be a multi-line template literal or string
          // Comment it out
          lines[lineIndex] = line.replace(/^(\s*)(.*)$/, '$1// $2');
          console.log(`  Fixed line ${lineNum}: ${line.trim()}`);
        }
      }
    }
    
    const fixedContent = lines.join('\n');
    fs.writeFileSync(filePath, fixedContent);
    console.log(`✓ Fixed ${filePath}\n`);
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
  }
}

// Process each file
filesToFix.forEach(({ file, lines }) => {
  const fullPath = path.resolve(file);
  if (fs.existsSync(fullPath)) {
    fixNoUnusedExpressions(fullPath, lines);
  } else {
    console.log(`File not found: ${file}`);
  }
});

console.log('Done!');