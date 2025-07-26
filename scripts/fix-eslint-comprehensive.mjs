#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';

console.log('🔧 Starting comprehensive ESLint fixes...\n');

// Get all warnings from ESLint
const eslintOutput = execSync('npm run lint -- --format json', { 
  encoding: 'utf8',
  stdio: ['pipe', 'pipe', 'ignore'] // Ignore stderr
});

const results = JSON.parse(eslintOutput);
const fileMap = new Map();

// Group warnings by file
results.forEach(result => {
  if (result.messages.length > 0) {
    fileMap.set(result.filePath, result.messages);
  }
});

console.log(`Found ${fileMap.size} files with warnings\n`);

// Process each file
let totalFixed = 0;
let fileCount = 0;

for (const [filePath, messages] of fileMap) {
  if (!existsSync(filePath)) continue;
  
  let content = readFileSync(filePath, 'utf8');
  let lines = content.split('\n');
  let modified = false;
  
  // Sort messages by line number in reverse order to avoid offset issues
  messages.sort((a, b) => b.line - a.line);
  
  messages.forEach(msg => {
    const lineIndex = msg.line - 1;
    if (lineIndex < 0 || lineIndex >= lines.length) return;
    
    let line = lines[lineIndex];
    let fixed = false;
    
    switch (msg.ruleId) {
      case '@typescript-eslint/prefer-nullish-coalescing':
        // Replace || with ??
        if (line.includes(' || ')) {
          lines[lineIndex] = line.replace(/ \|\| /g, ' ?? ');
          fixed = true;
        }
        break;
        
      case 'no-duplicate-imports':
        // This needs to be handled at file level, skip for now
        break;
        
      case '@typescript-eslint/no-non-null-assertion':
        // Replace ! with proper checks
        if (line.includes('!.')) {
          lines[lineIndex] = line.replace(/(\w+)!\.(\w+)/g, '$1?.$2');
          fixed = true;
        } else if (line.includes('!;')) {
          lines[lineIndex] = line.replace(/(\w+)!;/g, '$1;');
          fixed = true;
        }
        break;
        
      case '@typescript-eslint/no-unnecessary-condition':
        // Remove unnecessary optional chains
        if (msg.message.includes('optional chain')) {
          lines[lineIndex] = line.replace(/(\w+)\?\./g, '$1.');
          fixed = true;
        }
        break;
        
      case 'no-case-declarations':
        // Wrap case blocks in braces
        if (line.trim().startsWith('case ') && !lines[lineIndex + 1].trim().startsWith('{')) {
          // Find the next case or default
          let endIndex = lineIndex + 1;
          while (endIndex < lines.length && 
                 !lines[endIndex].trim().startsWith('case ') && 
                 !lines[endIndex].trim().startsWith('default:') &&
                 !lines[endIndex].trim() === '}') {
            endIndex++;
          }
          
          // Wrap in block
          lines[lineIndex] = line + ' {';
          lines[endIndex - 1] = lines[endIndex - 1] + '\n    }';
          fixed = true;
        }
        break;
        
      case '@typescript-eslint/no-unsafe-assignment':
      case '@typescript-eslint/no-unsafe-member-access':
      case '@typescript-eslint/no-unsafe-call':
        // Add type annotations for common patterns
        if (line.includes('JSON.parse(') && !line.includes(': unknown')) {
          lines[lineIndex] = line.replace(
            /const\s+(\w+)\s*=\s*JSON\.parse\(/,
            'const $1: unknown = JSON.parse('
          );
          fixed = true;
        } else if (line.includes('catch (error)')) {
          lines[lineIndex] = line.replace('catch (error)', 'catch (error: unknown)');
          fixed = true;
        }
        break;
        
      case '@typescript-eslint/require-await':
        // Remove unnecessary async
        if (line.includes('async ') && !content.includes('await ')) {
          lines[lineIndex] = line.replace(/async\s+/g, '');
          fixed = true;
        }
        break;
    }
    
    if (fixed) {
      modified = true;
      totalFixed++;
    }
  });
  
  // Handle file-level fixes
  if (messages.some(m => m.ruleId === 'no-duplicate-imports')) {
    const importMap = new Map();
    const importLines = [];
    
    lines.forEach((line, index) => {
      const match = line.match(/^import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]/);
      if (match) {
        const [, items, from] = match;
        if (!importMap.has(from)) {
          importMap.set(from, { index, items: new Set() });
        }
        items.split(',').forEach(item => {
          importMap.get(from).items.add(item.trim());
        });
        if (importMap.get(from).index !== index) {
          importLines.push(index);
        }
      }
    });
    
    // Remove duplicate import lines
    importLines.reverse().forEach(index => {
      lines.splice(index, 1);
      modified = true;
    });
    
    // Update consolidated imports
    importMap.forEach(({ index, items }, from) => {
      if (index < lines.length) {
        lines[index] = `import { ${[...items].join(', ')} } from '${from}'`;
      }
    });
  }
  
  if (modified) {
    content = lines.join('\n');
    writeFileSync(filePath, content);
    fileCount++;
    console.log(`✅ Fixed ${path.relative(process.cwd(), filePath)}`);
  }
}

console.log(`\n📊 Summary:`);
console.log(`   Files modified: ${fileCount}`);
console.log(`   Fixes applied: ${totalFixed}`);

// Add type definitions import where needed
console.log('\n🔍 Adding type imports where needed...');

const filesToAddImports = execSync(
  'grep -l "\\.Name\\|\\.Value\\|\\.result\\|\\.error" src/**/*.ts || true',
  { encoding: 'utf8', shell: true }
).trim().split('\n').filter(Boolean);

filesToAddImports.forEach(file => {
  if (!existsSync(file)) return;
  
  let content = readFileSync(file, 'utf8');
  
  // Skip if already has the import
  if (content.includes('qsys-responses')) return;
  
  // Calculate relative path to types
  const relativePath = path.relative(path.dirname(file), 'src/types/qsys-responses.js');
  const importPath = relativePath.startsWith('.') ? relativePath : './' + relativePath;
  
  // Add import at the top
  const importStatement = `import type { QSysComponent, QSysControl, QSysResponse } from '${importPath}';\n`;
  
  // Find the right place to insert (after other imports)
  const lines = content.split('\n');
  let insertIndex = 0;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('import ')) {
      insertIndex = i + 1;
    } else if (insertIndex > 0 && !lines[i].startsWith('import ') && lines[i].trim() !== '') {
      break;
    }
  }
  
  lines.splice(insertIndex, 0, importStatement);
  content = lines.join('\n');
  
  writeFileSync(file, content);
  console.log(`   Added type imports to ${path.basename(file)}`);
});

console.log('\n✨ Done! Next steps:');
console.log('1. Run: npm run lint');
console.log('2. Run: npm test');
console.log('3. Review: git diff');
console.log('4. Commit if all tests pass');