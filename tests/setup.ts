/**
 * Jest Setup File
 * Global test configuration and setup
 */

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
process.env['OPENAI_API_KEY'] = 'test-key';

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
}

// Make this an external module to allow global augmentation
export {};
