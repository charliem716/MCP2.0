/**
 * Mock logger for testing
 */

import type { ILogger } from '../../src/mcp/interfaces/logger.js';

/**
 * Create a mock logger for testing
 */
export function createMockLogger(): ILogger {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  } as unknown as ILogger;

  // Make child return the same mock instance
  (mockLogger.child as jest.Mock).mockReturnValue(mockLogger);

  return mockLogger;
}

/**
 * Create a silent logger for testing (no jest mocks)
 */
export function createSilentLogger(): ILogger {
  const silentLogger: ILogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => silentLogger,
  };

  return silentLogger;
}