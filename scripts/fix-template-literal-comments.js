#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find all test files with syntax errors
const testFiles = [
  'tests/integration/qsys/test-component-control.test.ts',
  'tests/integration/test-raw-command-tool.test.ts',
  'tests/functional/test-control-validation.test.ts',
  'tests/integration/qsys/test-retry-logic.test.ts',
  'tests/integration/qsys/test-status-get.test.ts',
  'tests/integration/debug-tools-test.test.ts',
  'tests/integration/live-tools-test.test.ts',
  'tests/integration/live-tools-comprehensive.test.ts',
];

function fixTemplateLiterals(content) {
  const lines = content.split('\n');
  let fixed = [];
  let inBrokenComment = false;
  let indentLevel = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Check if this line starts a broken console.log comment
    if (trimmed.match(/^\/\/ console\.log\($/)) {
      inBrokenComment = true;
      indentLevel = line.match(/^(\s*)/)[1];
      fixed.push(line);
      continue;
    }
    
    // If we're in a broken comment and find a template literal
    if (inBrokenComment && trimmed.startsWith('`')) {
      // Comment out the template literal line
      fixed.push(indentLevel + '// ' + trimmed);
      
      // Check if this line ends the console.log
      if (trimmed.endsWith(');')) {
        inBrokenComment = false;
        // Also comment out the closing parenthesis
        const lastLine = fixed.pop();
        fixed.push(lastLine.replace(');', '// );'));
      }
      continue;
    }
    
    // If we're in a broken comment and find the closing );
    if (inBrokenComment && trimmed === ');') {
      fixed.push(indentLevel + '// );');
      inBrokenComment = false;
      continue;
    }
    
    // Check for single-line broken patterns like:
    // components.slice(0, 3).forEach(name => // console.log(`  - ${name}`));
    if (line.includes('=> // console.log(')) {
      const fixedLine = line.replace(
        /=> \/\/ console\.log\(`[^`]*`\)\);?/g,
        (match) => {
          // Extract the arrow function part
          const arrowPart = '=>';
          // Comment out the entire console.log part
          const commentPart = match.substring(2).replace(/\);?$/, '');
          return `${arrowPart} { /* ${commentPart} */ }`;
        }
      );
      fixed.push(fixedLine);
      continue;
    }
    
    fixed.push(line);
  }
  
  return fixed.join('\n');
}

// Process each file
testFiles.forEach(filePath => {
  const fullPath = path.resolve(filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`Skipping ${filePath} - file not found`);
    return;
  }
  
  console.log(`Processing ${filePath}...`);
  
  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    const fixed = fixTemplateLiterals(content);
    
    if (content !== fixed) {
      fs.writeFileSync(fullPath, fixed);
      console.log(`✓ Fixed ${filePath}`);
    } else {
      console.log(`  No changes needed for ${filePath}`);
    }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
  }
});

console.log('Done!');