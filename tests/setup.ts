/**
 * Jest Setup File
 * Global test configuration and setup
 */

// Import jest globals and make them available globally
import { jest, beforeEach, afterEach, beforeAll, afterAll, describe, it, expect } from '@jest/globals';

// Make jest available globally for all tests
(globalThis as any).jest = jest;
(globalThis as any).describe = describe;
(globalThis as any).it = it;
(globalThis as any).expect = expect;
(globalThis as any).beforeEach = beforeEach;
(globalThis as any).afterEach = afterEach;
(globalThis as any).beforeAll = beforeAll;
(globalThis as any).afterAll = afterAll;
(globalThis as any).test = it;

// Increase timeout for integration tests
jest.setTimeout(30000);

// Mock console methods in tests to reduce noise
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeEach(() => {
  // Reset mocks before each test
  jest.clearAllMocks();

  // Mock console methods
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterEach(() => {
  // Restore original console methods
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Global test utilities
(globalThis as any).testUtils = {
  // Add common test utilities here
  delay: async (ms: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, ms)),
  mockLogger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
};

// Mock environment variables for tests
process.env['NODE_ENV'] = 'test';
process.env['LOG_LEVEL'] = 'error';
process.env['QSYS_HOST'] = 'localhost';
process.env['QSYS_PORT'] = '8443';
process.env['OPENAI_API_KEY'] = 'sk-test-key-for-testing-only';
process.env['PORT'] = '3000';
process.env['JWT_SECRET'] = 'test-jwt-secret-for-testing-purposes-only';
process.env['SESSION_SECRET'] = 'test-session-secret-for-testing-purposes-only';
process.env['CORS_ORIGIN'] = 'http://localhost:3000';
process.env['RATE_LIMIT_WINDOW_MS'] = '900000';
process.env['RATE_LIMIT_MAX_REQUESTS'] = '100';

// Type declarations for global test utilities
declare global {
  var testUtils: {
    delay: (ms: number) => Promise<void>;
    mockLogger: {
      info: jest.Mock;
      error: jest.Mock;
      warn: jest.Mock;
      debug: jest.Mock;
    };
  };
  // Ensure jest types are available globally
  const jest: typeof import('@jest/globals')['jest'];
  const describe: typeof import('@jest/globals')['describe'];
  const it: typeof import('@jest/globals')['it'];
  const expect: typeof import('@jest/globals')['expect'];
  const beforeEach: typeof import('@jest/globals')['beforeEach'];
  const afterEach: typeof import('@jest/globals')['afterEach'];
  const beforeAll: typeof import('@jest/globals')['beforeAll'];
  const afterAll: typeof import('@jest/globals')['afterAll'];
  const test: typeof import('@jest/globals')['test'];
}

// Make this an external module to allow global augmentation
export {};