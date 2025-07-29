import type { Config } from 'jest';

const config: Config = {
  // Use default-esm preset for ESM support
  preset: 'ts-jest/presets/default-esm',
  
  // Node test environment
  testEnvironment: 'node',
  
  // Treat .ts files as ESM
  extensionsToTreatAsEsm: ['.ts'],
  
  // Test file locations
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/*.(test|spec).+(ts|tsx|js)',
  ],
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.config.ts',
    '!src/**/index.ts',
    '!src/**/*.types.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  
  // Module name mapping for imports
  moduleNameMapper: {
    // Mock the logger module globally
    '^.*/shared/utils/logger$': '<rootDir>/tests/__mocks__/shared/utils/logger.ts',
    
    // Handle path aliases first (before .js stripping)
    '^@/shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@/mcp/(.*)$': '<rootDir>/src/mcp/$1',
    '^@/agent/(.*)$': '<rootDir>/src/agent/$1',
    '^@/api/(.*)$': '<rootDir>/src/api/$1',
    '^@/web/(.*)$': '<rootDir>/src/web/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    
    // Strip .js extensions from relative imports (more comprehensive regex)
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^(\\.{3,}/.*)\\.js$': '$1', // Handle ../../../ etc
    
    // Mock static assets and styles
    '\\.(css|less|scss|sass)$': '<rootDir>/tests/__mocks__/styleMock.js',
    '\\.(jpg|jpeg|png|gif|svg)$': '<rootDir>/tests/__mocks__/fileMock.js',
  },
  
  // Module resolver for ESM
  resolver: undefined,
  
  // Transform configuration for TypeScript
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ES2022',
          target: 'ES2022',
          moduleResolution: 'node',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          resolveJsonModule: true,
          allowJs: false,
          strict: true,
          noImplicitAny: false,
          strictPropertyInitialization: false,
        },
      },
    ],
  },
  
  // Don't transform node_modules except for ESM packages
  transformIgnorePatterns: [
    'node_modules/(?!(@q-sys/qrwc|ws|uuid|isomorphic-ws)/)',
  ],
  
  // File extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  
  // Test configuration
  verbose: true,
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
  maxWorkers: '50%',
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/', 
    '/dist/', 
    '/coverage/',
    '/tests/manual/',  // Exclude manual integration tests
  ],
  watchPathIgnorePatterns: ['/node_modules/', '/dist/', '/coverage/'],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  
  // Inject Jest globals (describe, it, expect, etc.)
  injectGlobals: true,
  
  // ESM Support
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons'],
  },
};

export default config;