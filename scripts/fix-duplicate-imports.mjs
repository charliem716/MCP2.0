#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

console.log('🔧 Fixing duplicate imports...\n');

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
    
    // Track imports by module path
    const importMap = new Map();
    const importLines = [];
    
    // First pass: collect all imports
    lines.forEach((line, index) => {
      const importMatch = line.match(/^import\s+(?:type\s+)?{([^}]+)}\s+from\s+['"]([^'"]+)['"]/);
      if (importMatch) {
        const [, itemsStr, modulePath] = importMatch;
        const items = itemsStr.split(',').map(s => s.trim()).filter(Boolean);
        const isType = line.includes('import type');
        
        if (!importMap.has(modulePath)) {
          importMap.set(modulePath, {
            firstIndex: index,
            items: new Set(),
            isType,
            lines: []
          });
        }
        
        const entry = importMap.get(modulePath);
        items.forEach(item => entry.items.add(item));
        entry.lines.push(index);
        
        // If this is a duplicate line (not the first), mark for removal
        if (entry.lines.length > 1) {
          importLines.push(index);
        }
      }
    });
    
    // Second pass: rebuild file with consolidated imports
    if (importLines.length > 0) {
      const newLines = [];
      const processedPaths = new Set();
      
      lines.forEach((line, index) => {
        // Skip duplicate import lines
        if (importLines.includes(index)) {
          fixes++;
          modified = true;
          return;
        }
        
        // Check if this is the first import for a module
        const importMatch = line.match(/^import\s+(?:type\s+)?{([^}]+)}\s+from\s+['"]([^'"]+)['"]/);
        if (importMatch) {
          const [, , modulePath] = importMatch;
          
          if (!processedPaths.has(modulePath)) {
            processedPaths.add(modulePath);
            const entry = importMap.get(modulePath);
            
            if (entry && entry.lines.length > 1) {
              // This module has duplicates, consolidate all imports
              const allItems = Array.from(entry.items).sort();
              const typePrefix = entry.isType ? 'type ' : '';
              newLines.push(`import ${typePrefix}{ ${allItems.join(', ')} } from '${modulePath}';`);
              modified = true;
            } else {
              // No duplicates, keep original
              newLines.push(line);
            }
          }
        } else {
          // Not an import line, keep as is
          newLines.push(line);
        }
      });
      
      if (modified) {
        content = newLines.join('\n');
      }
    }
    
    if (modified) {
      writeFileSync(filePath, content);
      totalFixes += fixes;
      console.log(`✅ Fixed ${relative(process.cwd(), filePath)} (${fixes} duplicate imports removed)`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
    return false;
  }
}

// Process all TypeScript files
const srcFiles = getAllFiles('src', '.ts');
const testFiles = getAllFiles('tests', '.ts');
const allFiles = [...srcFiles, ...testFiles];

console.log(`Found ${allFiles.length} TypeScript files to process\n`);

for (const file of allFiles) {
  if (fixFile(file)) {
    totalFiles++;
  }
}

console.log(`\n📊 Summary:`);
console.log(`   Files modified: ${totalFiles}`);
console.log(`   Duplicate imports removed: ${totalFixes}`);
console.log('\n✨ Next steps:');
console.log('1. Run: npm run lint');
console.log('2. Run: npm test');
console.log('3. Review changes: git diff');