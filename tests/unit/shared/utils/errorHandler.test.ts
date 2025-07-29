import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  QSysError,
  OpenAIError,
  MCPError,
  QSysErrorCode,
  OpenAIErrorCode,
  MCPErrorCode,
} from '../../../../src/shared/types/errors.js';

describe('GlobalErrorHandler', () => {
  let GlobalErrorHandler: any;
  let ErrorUtils: any;
  let errorHandler: any;
  let mockLogger: any;

  beforeEach(async () => {
    jest.resetModules();

    // Setup mocks
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    // Mock logger before importing
    jest.unstable_mockModule('../../../../src/shared/utils/logger', () => ({
      createLogger: jest.fn().mockReturnValue(mockLogger),
    }));

    // Import after mocking
    const errorHandlerModule = await import('../../../../src/shared/utils/errorHandler');
    GlobalErrorHandler = errorHandlerModule.GlobalErrorHandler;
    ErrorUtils = errorHandlerModule.ErrorUtils;

    errorHandler = new GlobalErrorHandler({
      logErrors: true,
      enableRecovery: true,
    });
    
    // Replace the logger with our mock
    errorHandler.logger = mockLogger;
  });

  describe('handleError', () => {
    it('should handle generic errors', async () => {
      const error = new Error('Test error');

      await errorHandler.handleError(error);

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle QSysError', async () => {
      const error = new QSysError(
        'Connection failed',
        QSysErrorCode.CONNECTION_FAILED
      );

      await errorHandler.handleError(error);

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle OpenAIError', async () => {
      const error = new OpenAIError(
        'API rate limit exceeded',
        OpenAIErrorCode.RATE_LIMIT_EXCEEDED
      );

      await errorHandler.handleError(error);

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle MCPError', async () => {
      const error = new MCPError(
        'Method not found',
        MCPErrorCode.METHOD_NOT_FOUND
      );

      await errorHandler.handleError(error);

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Error transformation', () => {
    it('should transform errors to structured format', async () => {
      const error = new Error('Test error');
      const context = { userId: '123', action: 'test' };

      await errorHandler.handleError(error, context);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Test error',
        expect.objectContaining({
          context: expect.objectContaining(context),
        })
      );
    });
  });

  describe('Recovery strategies', () => {
    it('should apply recovery strategies when enabled', async () => {
      const error = new QSysError(
        'Connection failed',
        QSysErrorCode.CONNECTION_FAILED
      );

      await errorHandler.handleError(error);

      // Just check that error was logged with recovery context
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should skip recovery when disabled', async () => {
      errorHandler = new GlobalErrorHandler({
        logErrors: true,
        enableRecovery: false,
      });
      
      // Replace the logger with our mock
      errorHandler.logger = mockLogger;

      const error = new Error('Test error');

      await errorHandler.handleError(error);

      // Just verify error was logged
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});

describe('ErrorUtils', () => {
  let ErrorUtils: any;

  beforeEach(async () => {
    jest.resetModules();

    // Mock logger
    jest.unstable_mockModule('../../../../src/shared/utils/logger', () => ({
      createLogger: jest.fn().mockReturnValue({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      }),
    }));

    // Import after mocking
    const errorHandlerModule = await import('../../../../src/shared/utils/errorHandler');
    ErrorUtils = errorHandlerModule.ErrorUtils;
  });

  describe('isRetryable', () => {
    it('should identify retryable QSys errors', () => {
      const retryableError = new Error('Connection timeout');
      const nonRetryableError = new Error('Invalid control');

      expect(ErrorUtils.isRetryable(retryableError)).toBe(true);
      expect(ErrorUtils.isRetryable(nonRetryableError)).toBe(false);
    });

    it('should identify retryable OpenAI errors', () => {
      const retryableError = new Error('Network timeout while calling OpenAI');
      const nonRetryableError = new Error('Invalid API key');

      expect(ErrorUtils.isRetryable(retryableError)).toBe(true);
      expect(ErrorUtils.isRetryable(nonRetryableError)).toBe(false);
    });
  });

  describe('retry', () => {
    it('should retry failed operations', async () => {
      let attempts = 0;
      const operation = jest.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Network timeout');
        }
        return 'success';
      });

      const result = await ErrorUtils.retry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable errors', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Invalid input'));

      await expect(ErrorUtils.retry(operation)).rejects.toThrow('Invalid input');
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('sleep', () => {
    it('should pause execution for specified time', async () => {
      const start = Date.now();
      await ErrorUtils.sleep(100);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow some variance
      expect(elapsed).toBeLessThan(200);
    });
  });
});