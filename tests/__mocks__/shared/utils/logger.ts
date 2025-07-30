import { jest } from '@jest/globals';

// Create a simple mock that always returns valid loggers
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(),
};

// Make child return a new logger with the same structure
mockLogger.child.mockImplementation(() => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(),
}));

// Export everything the real module exports
export const globalLogger = mockLogger;

export const createLogger = jest.fn().mockImplementation(() => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  child: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  })),
}));

export type Logger = typeof mockLogger;

export const resetLoggerMocks = () => {
  globalLogger.info.mockClear();
  globalLogger.error.mockClear();
  globalLogger.warn.mockClear();
  globalLogger.debug.mockClear();
  globalLogger.child.mockClear();
  createLogger.mockClear();
};