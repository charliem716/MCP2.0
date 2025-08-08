import baseConfig from './jest.config';
import type { Config } from 'jest';

// Integration test config that uses real better-sqlite3
const config: Config = {
  ...baseConfig,
  
  // Override module name mapper to remove better-sqlite3 mock
  moduleNameMapper: {
    // Remove better-sqlite3 mock for integration tests
    // '^better-sqlite3$': '<rootDir>/__mocks__/better-sqlite3.ts', // REMOVED
    
    // Keep other mappings
    '^.*/shared/utils/logger(\\.js)?$': '<rootDir>/tests/__mocks__/shared/utils/logger.ts',
    '^@/shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@/mcp/(.*)$': '<rootDir>/src/mcp/$1',
    '^@/agent/(.*)$': '<rootDir>/src/agent/$1',
    '^@/api/(.*)$': '<rootDir>/src/api/$1',
    '^@/web/(.*)$': '<rootDir>/src/web/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^(\\.{3,}/.*)\\.js$': '$1',
    '\\.(css|less|scss|sass)$': '<rootDir>/tests/__mocks__/styleMock.js',
    '\\.(jpg|jpeg|png|gif|svg)$': '<rootDir>/tests/__mocks__/fileMock.js',
  },
  
  // Only run tests that need real database
  testMatch: [
    '**/tests/unit/mcp/state/event-monitor/backup-manager.test.ts',
    '**/tests/integration/event-monitor-backup.test.ts',
  ],
  
  // Longer timeout for integration tests
  testTimeout: 60000,
};

export default config;