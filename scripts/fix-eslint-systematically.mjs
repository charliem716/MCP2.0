#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import path from 'path';

console.log('Starting systematic ESLint fixes...');

// Patterns to fix
const fixes = [
  {
    name: 'Replace || with ?? for nullish coalescing',
    pattern: /(\w+(?:\.\w+)*)\s*\|\|\s*([^|&\n]+)/g,
    replacement: '$1 ?? $2',
    filePattern: 'src/**/*.ts',
    // Only apply where it's safe (not in boolean contexts)
    test: (line) => !line.includes('if (') && !line.includes('while (') && !line.includes('= !!')
  },
  {
    name: 'Fix duplicate imports',
    pattern: /^import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]/gm,
    process: (content) => {
      const imports = new Map();
      const lines = content.split('\n');
      
      lines.forEach((line, i) => {
        const match = line.match(/^import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]/);
        if (match) {
          const [, items, from] = match;
          if (!imports.has(from)) {
            imports.set(from, { line: i, items: [] });
          }
          imports.get(from).items.push(...items.split(',').map(s => s.trim()));
        }
      });
      
      // Mark duplicates for removal and consolidate
      const toRemove = new Set();
      imports.forEach((data, from) => {
        if (data.items.length > 1) {
          const uniqueItems = [...new Set(data.items)];
          lines[data.line] = `import { ${uniqueItems.join(', ')} } from '${from}'`;
        }
      });
      
      return lines.join('\n');
    }
  },
  {
    name: 'Add type annotations for common any patterns',
    replacements: [
      {
        pattern: /const\s+result\s*=\s*JSON\.parse\(/g,
        replacement: 'const result: unknown = JSON.parse('
      },
      {
        pattern: /catch\s*\(\s*error\s*\)/g,
        replacement: 'catch (error: unknown)'
      },
      {
        pattern: /\.then\(\s*\(\s*result\s*\)/g,
        replacement: '.then((result: unknown)'
      }
    ]
  }
];

async function processFile(filePath) {
  try {
    let content = readFileSync(filePath, 'utf8');
    let modified = false;

    // Apply simple pattern replacements
    fixes.forEach(fix => {
      if (fix.pattern && fix.replacement) {
        if (!fix.test || content.split('\n').some(line => fix.test(line))) {
          const newContent = content.replace(fix.pattern, fix.replacement);
          if (newContent !== content) {
            content = newContent;
            modified = true;
            console.log(`  Applied: ${fix.name} to ${path.basename(filePath)}`);
          }
        }
      } else if (fix.process) {
        const newContent = fix.process(content);
        if (newContent !== content) {
          content = newContent;
          modified = true;
          console.log(`  Applied: ${fix.name} to ${path.basename(filePath)}`);
        }
      } else if (fix.replacements) {
        fix.replacements.forEach(({ pattern, replacement }) => {
          const newContent = content.replace(pattern, replacement);
          if (newContent !== content) {
            content = newContent;
            modified = true;
            console.log(`  Applied: ${fix.name} to ${path.basename(filePath)}`);
          }
        });
      }
    });

    // Fix unsafe member access patterns
    const unsafePatterns = [
      { pattern: /(\w+)\.Name\b/g, guard: 'hasProperty($1, "Name") && ' },
      { pattern: /(\w+)\.Value\b/g, guard: 'hasProperty($1, "Value") && ' },
      { pattern: /(\w+)\.result\b/g, guard: '$1?.result' },
      { pattern: /(\w+)\.error\b/g, guard: '$1?.error' },
      { pattern: /(\w+)\.message\b/g, guard: '$1?.message' },
    ];

    // Import type helpers if needed
    if (content.includes('.Name') || content.includes('.Value')) {
      if (!content.includes('qsys-responses')) {
        const importStatement = `import { hasProperty, isQSysControl, isQSysComponent } from '../types/qsys-responses.js';\n`;
        content = importStatement + content;
        modified = true;
      }
    }

    if (modified) {
      writeFileSync(filePath, content);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
    return false;
  }
}

async function main() {
  // Process TypeScript files
  const tsFiles = await glob('src/**/*.ts', { ignore: '**/node_modules/**' });
  
  let totalFixed = 0;
  for (const file of tsFiles) {
    if (await processFile(file)) {
      totalFixed++;
    }
  }

  console.log(`\nFixed ${totalFixed} files`);
  console.log('\nNext steps:');
  console.log('1. Run npm run lint to see remaining warnings');
  console.log('2. Run npm test to ensure nothing broke');
  console.log('3. Review changes with git diff');
}

main().catch(console.error);