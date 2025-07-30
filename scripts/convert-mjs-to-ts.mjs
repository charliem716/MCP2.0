#!/usr/bin/env node

/**
 * Script to convert .mjs test files to .test.ts
 * Fixes BUG-133: Module configuration fragmentation
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = path.join(__dirname, '..');

async function findMjsFiles(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.includes('node_modules')) {
      files.push(...await findMjsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.mjs')) {
      files.push(fullPath);
    }
  }

  return files;
}

function convertImports(content) {
  // Convert dist imports to src imports
  content = content.replace(/from\s+['"]\.\.\/\.\.\/\.\.\/dist\//g, 'from \'../../../src/');
  content = content.replace(/from\s+['"]\.\.\/\.\.\/dist\//g, 'from \'../../src/');
  content = content.replace(/from\s+['"]\.\.\/dist\//g, 'from \'../src/');
  
  // Add .js extensions to relative imports if missing
  content = content.replace(/from\s+['"](\.\.[^'"]+)(?<!\.js)(?<!\.json)['"]/g, 'from \'$1.js\'');
  
  return content;
}

function wrapInJestTest(content, fileName) {
  const testName = fileName.replace(/[-_]/g, ' ').replace('.mjs', '');
  
  // Check if it already has describe/it blocks
  if (content.includes('describe(') || content.includes('it(')) {
    // Just add imports
    return `import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';\n${content}`;
  }
  
  // Check if it's a simple script that logs output
  if (content.includes('console.log') && !content.includes('test')) {
    // Convert to a proper test
    const wrappedContent = `import { describe, it, expect } from '@jest/globals';

describe('${testName}', () => {
  it('should run without errors', async () => {
    // Original code wrapped in test
    const runTest = async () => {
${content.split('\n').map(line => '      ' + line).join('\n')}
    };

    // Run test and expect no errors
    await expect(runTest()).resolves.not.toThrow();
  });
});`;
    return wrappedContent;
  }
  
  // For other cases, preserve the structure
  return `import { describe, it, expect } from '@jest/globals';\n${content}`;
}

async function convertFile(filePath) {
  try {
    console.log(`Converting: ${filePath}`);
    
    // Read the file
    let content = await fs.readFile(filePath, 'utf-8');
    
    // Convert imports
    content = convertImports(content);
    
    // Wrap in Jest test structure if needed
    const fileName = path.basename(filePath);
    content = wrapInJestTest(content, fileName);
    
    // Determine new filename
    let newFileName;
    if (filePath.includes('.test.mjs')) {
      newFileName = filePath.replace('.test.mjs', '.test.ts');
    } else if (filePath.includes('.spec.mjs')) {
      newFileName = filePath.replace('.spec.mjs', '.spec.ts');
    } else {
      // Convert other .mjs files to .test.ts
      newFileName = filePath.replace('.mjs', '.test.ts');
    }
    
    // Write the new file
    await fs.writeFile(newFileName, content);
    
    // Delete the old file
    await fs.unlink(filePath);
    
    console.log(`✓ Converted to: ${newFileName}`);
    return { success: true, oldPath: filePath, newPath: newFileName };
  } catch (error) {
    console.error(`✗ Failed to convert ${filePath}: ${error.message}`);
    return { success: false, oldPath: filePath, error: error.message };
  }
}

async function main() {
  console.log('Converting .mjs test files to .test.ts...\n');
  
  const testsDir = path.join(rootDir, 'tests');
  const mjsFiles = await findMjsFiles(testsDir);
  
  console.log(`Found ${mjsFiles.length} .mjs files to convert\n`);
  
  const results = await Promise.all(mjsFiles.map(convertFile));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`\n✓ Successfully converted ${successful.length} files`);
  if (failed.length > 0) {
    console.log(`✗ Failed to convert ${failed.length} files:`);
    failed.forEach(f => console.log(`  - ${f.oldPath}: ${f.error}`));
  }
  
  // Update package.json scripts to remove .mjs references
  const packageJsonPath = path.join(rootDir, 'package.json');
  let packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
  
  for (const key in packageJson.scripts) {
    if (packageJson.scripts[key].includes('.mjs')) {
      packageJson.scripts[key] = packageJson.scripts[key].replace(/\.mjs/g, '.test.ts');
    }
  }
  
  await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log('\n✓ Updated package.json scripts');
  
  console.log('\n✅ Conversion complete!');
}

main().catch(console.error);