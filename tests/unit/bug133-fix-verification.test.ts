
import { describe, it, expect } from '@jest/globals';
import { configManager } from '../../src/config/index';
import * as fs from 'fs';
import * as path from 'path';

describe('BUG-133 Fix Verification', () => {
  it('should load the configuration without errors', () => {
    expect(configManager).toBeDefined();
  });

  it('should have the correct module type in package.json', async () => {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    expect(packageJson.type).toBe('module');
  });

  it('should have the correct module setting in tsconfig.json', async () => {
    const tsconfigPath = path.join(process.cwd(), 'tsconfig.json');
    const tsconfigJson = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
    expect(tsconfigJson.compilerOptions.module).toBe('ESNext');
  });

  it('should have the correct preset in jest.config.ts', async () => {
    // Import the jest config dynamically
    const jestConfig = await import('../../jest.config');
    expect(jestConfig.default.preset).toBe('ts-jest/presets/default-esm');
  });
});
