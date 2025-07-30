#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

/**
 * Fix incomplete console.log comments that are causing ESLint errors
 */

const testFiles = [
  'tests/bug-036-mock-verification.test.ts',
  'tests/bug-036-verification.test.ts',
  'tests/bug-046-direct-test.test.ts',
  'tests/integration/test-raw-command-tool.test.ts',
  'tests/test-raw-command-simple.test.ts',
];

function fixIncompleteComments(filePath) {
  console.log(`Fixing ${filePath}...`);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    let fixed = [];
    let changesMade = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Check if this line is a standalone template literal or string that's not commented
      if ((trimmed.startsWith('`') || trimmed.startsWith("'")) && 
          !trimmed.startsWith('//') && 
          !line.includes('return') && 
          !line.includes('=') &&
          !line.includes('(')) {
        // This is likely an orphaned template literal from a broken console.log
        const indent = line.match(/^(\s*)/)[1];
        fixed.push(indent + '// ' + trimmed);
        changesMade = true;
        console.log(`  Fixed line ${i + 1}: ${trimmed.substring(0, 50)}...`);
      } else {
        fixed.push(line);
      }
    }
    
    if (changesMade) {
      fs.writeFileSync(filePath, fixed.join('\n'));
      console.log(`✓ Fixed ${filePath}\n`);
    } else {
      console.log(`  No changes needed for ${filePath}\n`);
    }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
  }
}

// Process each file
testFiles.forEach(filePath => {
  const fullPath = path.resolve(filePath);
  if (fs.existsSync(fullPath)) {
    fixIncompleteComments(fullPath);
  } else {
    console.log(`File not found: ${filePath}`);
  }
});

console.log('Done!');