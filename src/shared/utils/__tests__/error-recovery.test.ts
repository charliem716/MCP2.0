/**
 * Error recovery utilities tests
 */

import {
  withErrorRecovery,
  withRetry,
  transformError,
  withErrorTransform,
} from '../error-recovery.js';
import { QSysError, QSysErrorCode } from '../../types/errors.js';

// Mock the logger
jest.mock('../logger.js', () => ({
  globalLogger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Error Recovery Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('withErrorRecovery', () => {
    it('should return operation result on success', async () => {
      const result = await withErrorRecovery(
        async () => 'success',
        {
          context: 'Test operation',
          fallback: 'fallback',
        }
      );
      
      expect(result).toBe('success');
    });

    it('should return fallback value on error', async () => {
      const result = await withErrorRecovery(
        async () => {
          throw new Error('Test error');
        },
        {
          context: 'Test operation',
          fallback: 'fallback',
        }
      );
      
      expect(result).toBe('fallback');
    });

    it('should not log error when logError is false', async () => {
      const logSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      await withErrorRecovery(
        async () => {
          throw new Error('Test error');
        },
        {
          context: 'Test operation',
          fallback: 'fallback',
          logError: false,
        }
      );
      
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await withRetry(operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');
      
      const result = await withRetry(operation, { maxRetries: 3, initialDelay: 10 });
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Always fail'));
      
      await expect(
        withRetry(operation, { maxRetries: 2, initialDelay: 10 })
      ).rejects.toThrow('Always fail');
      
      expect(operation).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('should not retry non-retryable errors', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Non-retryable'));
      const isRetryable = jest.fn().mockReturnValue(false);
      
      await expect(
        withRetry(operation, { isRetryable })
      ).rejects.toThrow('Non-retryable');
      
      expect(operation).toHaveBeenCalledTimes(1);
      expect(isRetryable).toHaveBeenCalledTimes(1);
    });

    it('should apply exponential backoff', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');
      
      const start = Date.now();
      await withRetry(operation, {
        maxRetries: 2,
        initialDelay: 100,
        backoffMultiplier: 2,
      });
      const duration = Date.now() - start;
      
      // Should have delays of ~100ms and ~200ms
      expect(duration).toBeGreaterThanOrEqual(250);
      expect(duration).toBeLessThan(400);
    });
  });

  describe('transformError', () => {
    it('should transform Error to custom error', () => {
      const error = new Error('Test error');
      const transformed = transformError(
        error,
        e => new QSysError(e.message, QSysErrorCode.COMMAND_FAILED)
      );
      
      expect(transformed).toBeInstanceOf(QSysError);
      expect(transformed.message).toBe('Test error');
      expect(transformed.code).toBe(QSysErrorCode.COMMAND_FAILED);
    });

    it('should handle non-Error values', () => {
      const transformed = transformError(
        'String error',
        e => new QSysError(e.message, QSysErrorCode.COMMAND_FAILED)
      );
      
      expect(transformed).toBeInstanceOf(QSysError);
      expect(transformed.message).toBe('String error');
    });
  });

  describe('withErrorTransform', () => {
    it('should return result on success', async () => {
      const result = await withErrorTransform(
        async () => 'success',
        e => new QSysError(e.message, QSysErrorCode.COMMAND_FAILED)
      );
      
      expect(result).toBe('success');
    });

    it('should transform error on failure', async () => {
      await expect(
        withErrorTransform(
          async () => {
            throw new Error('Test error');
          },
          e => new QSysError(e.message, QSysErrorCode.COMMAND_FAILED)
        )
      ).rejects.toThrow(QSysError);
    });
  });
});