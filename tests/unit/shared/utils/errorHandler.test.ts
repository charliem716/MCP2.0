/* eslint-disable @typescript-eslint/unbound-method */
// Mock logger before imports
jest.mock('../../../../src/shared/utils/logger.js');

import {
  GlobalErrorHandler,
  ErrorUtils,
} from '../../../../src/shared/utils/errorHandler.js';
import {
  QSysError,
  OpenAIError,
  MCPError,
  QSysErrorCode,
  OpenAIErrorCode,
  MCPErrorCode,
} from '../../../../src/shared/types/errors.js';
import { createLogger } from '../../../../src/shared/utils/logger.js';

// Setup mocks
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

(createLogger as jest.Mock).mockReturnValue(mockLogger);

describe('GlobalErrorHandler', () => {
  let errorHandler: GlobalErrorHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure mock is set up
    (createLogger as jest.Mock).mockReturnValue(mockLogger);

    errorHandler = new GlobalErrorHandler({
      logErrors: true,
      enableRecovery: true,
    });
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

  describe('ErrorUtils', () => {
    describe('retry', () => {
      it('should retry operation on failure', async () => {
        let attempts = 0;
        const operation = jest.fn(async () => {
          attempts++;
          if (attempts < 2) {
            throw new Error('Network error');
          }
          return 'success';
        });

        const result = await ErrorUtils.retry(operation, 3, 100);

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(2);
      });

      it('should fail after max attempts', async () => {
        const operation = jest.fn(async () => {
          throw new Error('Network error');
        });

        await expect(ErrorUtils.retry(operation, 2, 100)).rejects.toThrow(
          'Network error'
        );

        expect(operation).toHaveBeenCalledTimes(2);
      });

      it('should not retry non-retryable errors', async () => {
        const operation = jest.fn(async () => {
          throw new Error('Validation failed');
        });

        await expect(ErrorUtils.retry(operation, 3, 100)).rejects.toThrow(
          'Validation failed'
        );

        expect(operation).toHaveBeenCalledTimes(1);
      });
    });

    describe('isRetryable', () => {
      it('should identify retryable errors', () => {
        expect(ErrorUtils.isRetryable(new Error('Network timeout'))).toBe(true);
        expect(ErrorUtils.isRetryable(new Error('ECONNREFUSED'))).toBe(true);
        expect(ErrorUtils.isRetryable(new Error('Request timeout'))).toBe(true);
      });

      it('should identify non-retryable errors', () => {
        expect(ErrorUtils.isRetryable(new Error('Validation failed'))).toBe(
          false
        );
        expect(ErrorUtils.isRetryable(new Error('Unauthorized'))).toBe(false);
      });
    });
  });
});

// Commented out tests for unimplemented features:
// - handleWithRecovery
// - safeExecute
// - wrapWithErrorHandling
// - createError
// - validate
// - assertExists
