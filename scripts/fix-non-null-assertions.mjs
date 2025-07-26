#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

console.log('🔧 Fixing non-null assertions...\n');

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
      let line = lines[i];
      const originalLine = line;
      
      // Skip if it's a comment or type definition
      if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.includes('interface ') || line.includes('type ')) {
        newLines.push(line);
        continue;
      }
      
      // Pattern 1: someVar!.property -> someVar?.property || defaultValue
      // Pattern 2: array.get(key)! -> array.get(key) with proper check
      // Pattern 3: someFunc()! -> someFunc() with proper check
      
      // Count non-null assertions
      const assertionMatches = line.match(/!(?:\.|;|,|\s|\)|$)/g);
      if (!assertionMatches) {
        newLines.push(line);
        continue;
      }
      
      // Handle Map.get() assertions specially
      if (line.includes('.get(') && line.includes('!')) {
        const getMatch = line.match(/(\w+)\.get\(([^)]+)\)!/);
        if (getMatch) {
          const [fullMatch, mapVar, key] = getMatch;
          // Extract variable name if assignment
          const assignMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*/);
          if (assignMatch) {
            const varName = assignMatch[1];
            // Split into guard and usage
            const indent = line.match(/^\s*/)[0];
            newLines.push(`${indent}const ${varName} = ${mapVar}.get(${key});`);
            newLines.push(`${indent}if (!${varName}) {`);
            newLines.push(`${indent}  throw new Error(\`Expected ${key} to exist in ${mapVar}\`);`);
            newLines.push(`${indent}}`);
            fixes++;
            modified = true;
            continue;
          }
        }
      }
      
      // Handle array access assertions
      if (line.match(/\[[^\]]+\]!/)) {
        const arrayMatch = line.match(/(\w+)\[([^\]]+)\]!/);
        if (arrayMatch) {
          const [fullMatch, arrayVar, index] = arrayMatch;
          const assignMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*/);
          if (assignMatch) {
            const varName = assignMatch[1];
            const indent = line.match(/^\s*/)[0];
            newLines.push(`${indent}const ${varName} = ${arrayVar}[${index}];`);
            newLines.push(`${indent}if (${varName} === undefined) {`);
            newLines.push(`${indent}  throw new Error(\`Index ${index} out of bounds for ${arrayVar}\`);`);
            newLines.push(`${indent}}`);
            fixes++;
            modified = true;
            continue;
          }
        }
      }
      
      // Handle property access assertions (someVar!.property)
      let fixedLine = line;
      const propMatch = line.match(/(\w+)!\.(\w+)/);
      if (propMatch) {
        const [fullMatch, varName, property] = propMatch;
        // Check if we're in a simple assignment or usage
        if (line.includes('=')) {
          // Add optional chaining
          fixedLine = fixedLine.replace(`${varName}!.${property}`, `${varName}?.${property}`);
          fixes++;
          modified = true;
        } else {
          // For non-assignment usage, we need to add a guard
          const indent = line.match(/^\s*/)[0];
          newLines.push(`${indent}if (!${varName}) {`);
          newLines.push(`${indent}  throw new Error('Expected ${varName} to be defined');`);
          newLines.push(`${indent}}`);
          fixedLine = fixedLine.replace(`${varName}!`, varName);
          fixes++;
          modified = true;
        }
      }
      
      // Handle simple non-null assertions at end of expressions
      if (fixedLine.match(/\w+!\s*[;,)]/)) {
        fixedLine = fixedLine.replace(/(\w+)!\s*([;,)])/g, '$1$2');
        fixes++;
        modified = true;
      }
      
      newLines.push(fixedLine);
    }
    
    if (modified) {
      content = newLines.join('\n');
      writeFileSync(filePath, content);
      totalFixes += fixes;
      console.log(`✅ Fixed ${relative(process.cwd(), filePath)} (${fixes} non-null assertions replaced)`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
    return false;
  }
}

// Target specific files identified with non-null assertions
const targetFiles = [
  'src/mcp/state/change-group/concurrency-utils.ts',
  'src/mcp/state/event-cache/compression.ts',
  'src/mcp/state/event-cache/disk-spillover.ts',
  'src/mcp/state/invalidation.ts',
  'src/mcp/tools/api-reference.ts'
];

console.log(`Processing ${targetFiles.length} files with non-null assertions\n`);

for (const file of targetFiles) {
  if (fixFile(file)) {
    totalFiles++;
  }
}

console.log(`\n📊 Summary:`);
console.log(`   Files modified: ${totalFiles}`);
console.log(`   Non-null assertions fixed: ${totalFixes}`);
console.log('\n⚠️  Manual Review Required:');
console.log('   The automated fixes may need adjustment for:');
console.log('   - Complex expressions with multiple assertions');
console.log('   - Assertions in conditional statements');
console.log('   - Type-specific error messages');
console.log('\n✨ Next steps:');
console.log('1. Review changes: git diff');
console.log('2. Run: npm run lint');
console.log('3. Run: npm test');
console.log('4. Manually adjust any incorrect fixes');