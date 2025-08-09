import type { Config } from 'jest';
import baseConfig from './jest.config';

// E2E test configuration that extends the base config
const e2eConfig: Config = {
  ...baseConfig,
  
  // Override test locations to only run e2e tests
  testMatch: [
    '<rootDir>/tests/e2e/**/*.(test|spec).+(ts|tsx|js)',
  ],
  
  // Don't ignore e2e directory
  testPathIgnorePatterns: [
    '/node_modules/', 
    '/dist/', 
    '/coverage/',
  ],
  
  // Longer timeout for e2e tests
  testTimeout: 60000,
  
  // Run e2e tests sequentially
  maxWorkers: 1,
  
  // Different coverage directory
  coverageDirectory: 'coverage-e2e',
};

export default e2eConfig;