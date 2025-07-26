#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname } from 'path';

console.log('🔧 Fixing unsafe any usage...\n');

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
    const original = content;
    let fixes = 0;

    // Add import for type guards if needed
    const needsTypeImport = 
      content.includes('.Name') || 
      content.includes('.Value') || 
      content.includes('.result') || 
      content.includes('.error') ||
      content.includes('.Type') ||
      content.includes('.String');

    if (needsTypeImport && !content.includes('qsys-responses')) {
      // Calculate relative path to types
      const relativePath = relative(dirname(filePath), 'src/types/qsys-responses.js');
      const importPath = relativePath.startsWith('.') ? relativePath : './' + relativePath;
      
      // Find the right place to insert (after other imports)
      const lines = content.split('\n');
      let insertIndex = 0;
      let hasImports = false;
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('import ')) {
          insertIndex = i + 1;
          hasImports = true;
        } else if (hasImports && !lines[i].startsWith('import ') && lines[i].trim() !== '') {
          break;
        }
      }
      
      // Add import
      const importStatement = `import type { QSysComponent, QSysControl, QSysResponse, isQSysComponent, isQSysControl, hasProperty } from '${importPath}';`;
      lines.splice(insertIndex, 0, importStatement);
      if (insertIndex === 0) {
        lines.splice(1, 0, ''); // Add blank line after import
      }
      
      content = lines.join('\n');
      fixes++;
    }

    // Fix patterns like: const result = JSON.parse(response) as any;
    content = content.replace(/JSON\.parse\(([^)]+)\)\s+as\s+any/g, (match, arg) => {
      fixes++;
      return `JSON.parse(${arg}) as unknown`;
    });

    // Fix patterns like: const result = JSON.parse(response);
    content = content.replace(/const\s+(\w+)\s*=\s*JSON\.parse\(/g, (match, varName) => {
      if (!match.includes(': unknown') && !match.includes('<')) {
        fixes++;
        return `const ${varName}: unknown = JSON.parse(`;
      }
      return match;
    });

    // Fix catch blocks
    content = content.replace(/catch\s*\(\s*(\w+)\s*\)/g, (match, errorVar) => {
      if (!match.includes(':')) {
        fixes++;
        return `catch (${errorVar}: unknown)`;
      }
      return match;
    });

    // Fix .then callbacks
    content = content.replace(/\.then\s*\(\s*\((\w+)\)\s*=>/g, (match, param) => {
      if (!match.includes(':')) {
        fixes++;
        return `.then((${param}: unknown) =>`;
      }
      return match;
    });

    // Replace common unsafe member access patterns with type guards
    const unsafePatterns = [
      { pattern: /(\w+)\.Name\b/g, replacement: 'hasProperty($1, "Name") ? ($1 as QSysComponent).Name : ""' },
      { pattern: /(\w+)\.Value\b/g, replacement: 'hasProperty($1, "Value") ? ($1 as QSysControl).Value : null' },
      { pattern: /(\w+)\.String\b/g, replacement: 'hasProperty($1, "String") ? ($1 as QSysControl).String : ""' },
      { pattern: /(\w+)\.Type\b/g, replacement: 'hasProperty($1, "Type") ? ($1 as QSysComponent).Type : ""' },
      { pattern: /(\w+)\.result\b/g, replacement: 'hasProperty($1, "result") ? ($1 as QSysResponse).result : undefined' },
      { pattern: /(\w+)\.error\b/g, replacement: 'hasProperty($1, "error") ? ($1 as QSysResponse).error : undefined' },
    ];

    // Apply unsafe pattern fixes selectively
    for (const { pattern, replacement } of unsafePatterns) {
      const lines = content.split('\n');
      let lineModified = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Skip if already has type assertion or type guard
        if (line.includes('hasProperty') || line.includes(' as ') || line.includes('?.')) {
          continue;
        }
        
        // Skip if in a type definition
        if (line.includes('interface') || line.includes('type ') || line.includes(':')) {
          continue;
        }
        
        const newLine = line.replace(pattern, replacement);
        if (newLine !== line) {
          lines[i] = newLine;
          lineModified = true;
          fixes++;
        }
      }
      
      if (lineModified) {
        content = lines.join('\n');
      }
    }

    if (content !== original) {
      writeFileSync(filePath, content);
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

// Process all TypeScript files
const srcFiles = getAllFiles('src', '.ts');

console.log(`Found ${srcFiles.length} TypeScript files to process\n`);

for (const file of srcFiles) {
  if (fixFile(file)) {
    totalFiles++;
  }
}

console.log(`\n📊 Summary:`);
console.log(`   Files modified: ${totalFiles}`);
console.log(`   Total fixes applied: ${totalFixes}`);
console.log('\n✨ Next steps:');
console.log('1. Run: npm run lint');
console.log('2. Run: npm test');
console.log('3. Review changes: git diff');
console.log('4. Commit if tests pass');