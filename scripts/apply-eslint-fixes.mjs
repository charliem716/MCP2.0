#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

console.log('🔧 Applying ESLint fixes...\n');

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
  let content = readFileSync(filePath, 'utf8');
  const original = content;
  let fixes = 0;
  
  // Fix 1: Replace || with ?? (nullish coalescing)
  // Only in assignment contexts, not in if conditions
  content = content.replace(/([^|&\n]+)\s+\|\|\s+([^|&\n]+)(?=[,;)\]}])/g, (match, left, right) => {
    // Skip if in if/while/for statement
    const line = match.split('\n')[0];
    if (/\b(if|while|for)\s*\(/.test(line)) {
      return match;
    }
    fixes++;
    return `${left} ?? ${right}`;
  });
  
  // Fix 2: Remove unnecessary optional chains
  content = content.replace(/(\w+)\?\./g, (match, varName) => {
    // Check if this variable might actually be optional
    const context = content.substring(Math.max(0, content.indexOf(match) - 100), content.indexOf(match));
    if (context.includes(`${varName}?:`) || context.includes(`${varName} |`) || context.includes(`if (${varName}`)) {
      return match; // Keep optional chain
    }
    fixes++;
    return `${varName}.`;
  });
  
  // Fix 3: Fix non-null assertions
  content = content.replace(/(\w+)!([.;,)\]}])/g, (match, varName, after) => {
    if (after === '.') {
      fixes++;
      return `${varName}?${after}`;
    }
    fixes++;
    return `${varName}${after}`;
  });
  
  // Fix 4: Add type annotations for JSON.parse
  content = content.replace(/const\s+(\w+)\s*=\s*JSON\.parse\(/g, (match, varName) => {
    if (!match.includes(': unknown')) {
      fixes++;
      return `const ${varName}: unknown = JSON.parse(`;
    }
    return match;
  });
  
  // Fix 5: Type error in catch blocks
  content = content.replace(/catch\s*\(\s*(\w+)\s*\)/g, (match, errorVar) => {
    if (!match.includes(':')) {
      fixes++;
      return `catch (${errorVar}: unknown)`;
    }
    return match;
  });
  
  // Fix 6: Remove duplicate imports
  const importRegex = /^import\s+(?:type\s+)?{([^}]+)}\s+from\s+['"]([^'"]+)['"]/gm;
  const imports = new Map();
  let importMatch;
  
  while ((importMatch = importRegex.exec(content)) !== null) {
    const [fullMatch, importItems, fromPath] = importMatch;
    const items = importItems.split(',').map(s => s.trim()).filter(Boolean);
    
    if (!imports.has(fromPath)) {
      imports.set(fromPath, { items: new Set(), isType: fullMatch.includes('type {') });
    }
    
    items.forEach(item => imports.get(fromPath).items.add(item));
  }
  
  // Rebuild imports if there were duplicates
  if (imports.size > 0) {
    const importStatements = [];
    imports.forEach(({ items, isType }, fromPath) => {
      if (items.size > 0) {
        const typePrefix = isType ? 'type ' : '';
        importStatements.push(`import ${typePrefix}{ ${[...items].join(', ')} } from '${fromPath}'`);
      }
    });
    
    // Replace all imports with consolidated ones
    content = content.replace(importRegex, '');
    const lines = content.split('\n');
    
    // Find where to insert imports (after first comment block)
    let insertIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith('//') && !lines[i].startsWith('/*') && lines[i].trim() !== '') {
        insertIndex = i;
        break;
      }
    }
    
    lines.splice(insertIndex, 0, ...importStatements);
    content = lines.join('\n');
    fixes += importStatements.length;
  }
  
  if (content !== original) {
    writeFileSync(filePath, content);
    totalFixes += fixes;
    return true;
  }
  
  return false;
}

// Process all TypeScript files
const srcFiles = getAllFiles('src', '.ts');
const testFiles = getAllFiles('tests', '.ts');
const allFiles = [...srcFiles, ...testFiles];

console.log(`Found ${allFiles.length} TypeScript files to process\n`);

for (const file of allFiles) {
  if (fixFile(file)) {
    totalFiles++;
    console.log(`✅ Fixed ${relative(process.cwd(), file)}`);
  }
}

console.log(`\n📊 Summary:`);
console.log(`   Files modified: ${totalFiles}`);
console.log(`   Total fixes applied: ${totalFixes}`);
console.log('\n✨ Next steps:');
console.log('1. Run: npm run lint');
console.log('2. Run: npm test');
console.log('3. Commit if tests pass');