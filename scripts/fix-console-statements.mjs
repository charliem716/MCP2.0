#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

console.log('🔧 Removing console statements...\n');

let totalFiles = 0;
let totalFixes = 0;

function getAllFiles(dir, ext = '.ts') {
  const files = [];
  
  function traverse(currentPath) {
    const items = readdirSync(currentPath);
    
    for (const item of items) {
      const fullPath = join(currentPath, item);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory() && !item.includes('node_modules') && !item.startsWith('.')) {
        traverse(fullPath);
      } else if (stat.isFile() && item.endsWith(ext)) {
        files.push(fullPath);
      }
    }
  }
  
  traverse(dir);
  return files;
}

function fixFile(filePath) {
  try {
    let content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    let modified = false;
    let fixes = 0;
    
    const newLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Skip if it's a comment
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
        newLines.push(line);
        continue;
      }
      
      // Check for console statements
      const consoleMatch = line.match(/^\s*console\.(log|error|warn|info|debug|trace|dir)\s*\(/);
      
      if (consoleMatch) {
        // Check if this is inside a test file
        if (filePath.includes('/tests/') || filePath.includes('.test.') || filePath.includes('.spec.')) {
          // Keep console statements in test files
          newLines.push(line);
          continue;
        }
        
        // Skip if it's already commented out
        if (line.trim().startsWith('// console.')) {
          newLines.push(line);
          continue;
        }
        
        // Comment out the console statement
        const indent = line.match(/^\s*/)[0];
        newLines.push(`${indent}// ${line.trim()} // TODO: Replace with logger`);
        
        // Handle multi-line console statements
        let openParens = 1;
        let j = i;
        
        // Count parens on the current line
        const restOfLine = line.substring(line.indexOf('(') + 1);
        for (const char of restOfLine) {
          if (char === '(') openParens++;
          else if (char === ')') openParens--;
        }
        
        // Continue to next lines if parens not closed
        while (openParens > 0 && j < lines.length - 1) {
          j++;
          const nextLine = lines[j];
          newLines.push(`${indent}// ${nextLine.trim()}`);
          
          for (const char of nextLine) {
            if (char === '(') openParens++;
            else if (char === ')') openParens--;
          }
          
          i = j; // Skip these lines in the main loop
        }
        
        fixes++;
        modified = true;
      } else {
        newLines.push(line);
      }
    }
    
    if (modified) {
      content = newLines.join('\n');
      writeFileSync(filePath, content);
      totalFixes += fixes;
      console.log(`✅ Fixed ${relative(process.cwd(), filePath)} (${fixes} console statements commented out)`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
    return false;
  }
}

// Process all TypeScript files excluding test files
const srcFiles = getAllFiles('src', '.ts');
const filteredFiles = srcFiles.filter(file => !file.includes('.test.') && !file.includes('.spec.'));

console.log(`Found ${filteredFiles.length} TypeScript source files to process\n`);

for (const file of filteredFiles) {
  if (fixFile(file)) {
    totalFiles++;
  }
}

console.log(`\n📊 Summary:`);
console.log(`   Files modified: ${totalFiles}`);
console.log(`   Console statements commented: ${totalFixes}`);
console.log('\n✨ Next steps:');
console.log('1. Review changes: git diff');
console.log('2. Replace commented console statements with proper logger calls');
console.log('3. Run: npm run lint');
console.log('4. Run: npm test');