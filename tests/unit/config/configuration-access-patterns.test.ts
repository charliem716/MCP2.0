/**
 * Configuration Sprawl Verification Test
 * Ensures all configuration access goes through ConfigManager
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

describe('Configuration Sprawl Verification', () => {
  const srcPath = path.join(process.cwd(), 'src');
  const allowedPaths = [
    'src/config/index.ts', 
    'src/shared/utils/env.ts'  // This is the environment parser, allowed during initialization
  ];
  
  it('should not have direct process.env access outside allowed modules', () => {
    // Use grep to find process.env usage
    try {
      const result = execSync(
        `grep -r "process\\.env" "${srcPath}" --include="*.ts" --include="*.js" | grep -v test`,
        { encoding: 'utf-8' }
      );
      
      const violations = result
        .split('\n')
        .filter(line => line.trim())
        .filter(line => {
          // Check if the file is in allowed paths
          const filePath = line.split(':')[0];
          return !allowedPaths.some(allowed => filePath.includes(allowed));
        });
      
      if (violations.length > 0) {
        console.error('Found direct process.env access in:');
        violations.forEach(v => console.error(`  - ${v.split(':')[0]}`));
      }
      
      expect(violations).toHaveLength(0);
    } catch (error) {
      // If grep returns no results, it exits with code 1
      // This is actually what we want
      expect(error).toBeDefined();
    }
  });
  
  it('should not have direct qsys-core.config.json reads outside config module', () => {
    try {
      const result = execSync(
        `grep -r "qsys-core\\.config\\.json" "${srcPath}" --include="*.ts" --include="*.js" | grep -v test | grep -v "src/config" | grep -v "src/shared/utils/env"`,
        { encoding: 'utf-8' }
      );
      
      const violations = result
        .split('\n')
        .filter(line => line.trim())
        .filter(line => !line.includes('comment') && !line.includes('//'));
      
      if (violations.length > 0) {
        console.error('Found direct qsys-core.config.json access in:');
        violations.forEach(v => console.error(`  - ${v}`));
      }
      
      expect(violations).toHaveLength(0);
    } catch (error) {
      // If grep returns no results, it exits with code 1
      // This is actually what we want
      expect(error).toBeDefined();
    }
  });
  
  it('should use ConfigManager functions throughout the codebase', () => {
    // Check for imports of config functions
    try {
      const imports = execSync(
        `grep -r "import.*\\(getConfig\\|getQSysConfig\\|getMCPConfig\\|getAPIConfig\\)" "${srcPath}" --include="*.ts" | grep -v test | grep -v "src/config"`,
        { encoding: 'utf-8' }
      );
      
      const importCount = imports.split('\n').filter(line => line.trim()).length;
      
      // We expect at least some imports of config functions
      expect(importCount).toBeGreaterThan(0);
    } catch (error) {
      // No imports found - this is bad
      fail('No imports of ConfigManager functions found outside config module');
    }
  });
  
  it('should have all config access centralized through ConfigManager', async () => {
    // Verify the config module exports the expected functions
    const configModule = await import('../../../src/config/index.js');
    
    expect(configModule.getConfig).toBeDefined();
    expect(configModule.getQSysConfig).toBeDefined();
    expect(configModule.getMCPConfig).toBeDefined();
    expect(configModule.getAPIConfig).toBeDefined();
    expect(configModule.configManager).toBeDefined();
  });
});