#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

console.log('🔧 Fixing nullish coalescing issues...\n');

let totalFiles = 0;
let totalFixes = 0;

/**
 * Fix nullish coalescing in a file
 */
async function fixFile(filePath) {
  try {
    let content = readFileSync(filePath, 'utf8');
    let modified = false;
    let fixes = 0;

    // Pattern to match || operators that should be ??
    // We need to be careful not to replace || in boolean contexts
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip if in if/while/for conditions
      if (/\b(if|while|for)\s*\(/.test(line)) {
        continue;
      }
      
      // Pattern: variable || defaultValue in assignments or returns
      const fixedLine = line.replace(
        /(\w+(?:\.\w+)*)\s+\|\|\s+([^|&\n;,)}\]]+)/g,
        (match, left, right) => {
          // Additional checks to ensure it's not a boolean context
          const trimmedLine = line.trim();
          if (
            trimmedLine.startsWith('if') ||
            trimmedLine.startsWith('while') ||
            trimmedLine.startsWith('for') ||
            trimmedLine.includes('&&') ||
            match.includes('===') ||
            match.includes('!==') ||
            match.includes('==') ||
            match.includes('!=')
          ) {
            return match;
          }
          
          fixes++;
          return `${left} ?? ${right}`;
        }
      );
      
      if (fixedLine !== line) {
        lines[i] = fixedLine;
        modified = true;
      }
    }

    if (modified) {
      writeFileSync(filePath, lines.join('\n'));
      totalFixes += fixes;
      console.log(`✅ Fixed ${relative(process.cwd(), filePath)} (${fixes} fixes)`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
    return false;
  }
}

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

async function main() {
  // Get all TypeScript files
  const srcFiles = getAllFiles('src', '.ts');
  const testFiles = getAllFiles('tests', '.ts');
  const allFiles = [...srcFiles, ...testFiles];
  
  console.log(`Found ${allFiles.length} TypeScript files to process\n`);
  
  for (const file of allFiles) {
    if (await fixFile(file)) {
      totalFiles++;
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Files modified: ${totalFiles}`);
  console.log(`   Total fixes applied: ${totalFixes}`);
  console.log('\n✨ Next steps:');
  console.log('1. Run: npm run lint');
  console.log('2. Review changes: git diff');
  console.log('3. Run tests: npm test');
}

main().catch(console.error);