/**
 * Comprehensive tests for error-recovery.ts to achieve 80%+ coverage
 * Addresses BUG-142: Critical Low Coverage Files Risk Production Stability
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { BaseError } from '../../../../src/shared/types/errors.js';

describe('Error Recovery Utilities - Comprehensive Coverage', () => {
  let mockLogger: any;
  let errorRecoveryModule: any;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

    // Create mock logger
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    };

    // Mock the logger module
    jest.unstable_mockModule('../../../../src/shared/utils/logger', () => ({
      globalLogger: mockLogger,
      createLogger: jest.fn().mockReturnValue(mockLogger),
    }));

    // Import error-recovery module after mocking
    errorRecoveryModule = await import('../../../../src/shared/utils/error-recovery.js');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('withErrorRecovery', () => {
    it('should execute operation successfully and return result', async () => {
      const { withErrorRecovery } = errorRecoveryModule;
      const result = await withErrorRecovery(
        async () => 'success',
        {
          context: 'test operation',
          fallback: 'fallback value',
        }
      );

      expect(result).toBe('success');
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should return fallback value on error', async () => {
      const { withErrorRecovery } = errorRecoveryModule;
      const result = await withErrorRecovery(
        async () => {
          throw new Error('Operation failed');
        },
        {
          context: 'test operation',
          fallback: 'fallback value',
        }
      );

      expect(result).toBe('fallback value');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'test operation failed',
        expect.objectContaining({
          error: expect.any(Error),
        })
      );
    });

    it('should handle non-Error objects', async () => {
      const { withErrorRecovery } = errorRecoveryModule;
      const result = await withErrorRecovery(
        async () => {
          throw 'string error';
        },
        {
          context: 'test operation',
          fallback: 'fallback',
        }
      );

      expect(result).toBe('fallback');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'test operation failed',
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'string error',
          }),
        })
      );
    });

    it('should not log error when logError is false', async () => {
      const { withErrorRecovery } = errorRecoveryModule;
      const result = await withErrorRecovery(
        async () => {
          throw new Error('Operation failed');
        },
        {
          context: 'test operation',
          fallback: 'fallback',
          logError: false,
        }
      );

      expect(result).toBe('fallback');
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should include context data in error log', async () => {
      const { withErrorRecovery } = errorRecoveryModule;
      const contextData = { userId: '123', action: 'test' };
      
      await withErrorRecovery(
        async () => {
          throw new Error('Failed');
        },
        {
          context: 'test operation',
          fallback: null,
          contextData,
        }
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'test operation failed',
        expect.objectContaining({
          context: contextData,
        })
      );
    });

    it('should handle complex fallback values', async () => {
      const { withErrorRecovery } = errorRecoveryModule;
      const complexFallback = { data: [], status: 'error' };
      
      const result = await withErrorRecovery(
        async () => {
          throw new Error('Failed');
        },
        {
          context: 'complex operation',
          fallback: complexFallback,
        }
      );

      expect(result).toEqual(complexFallback);
    });
  });

  describe('withRetry', () => {
    it('should execute operation successfully on first try', async () => {
      const { withRetry } = errorRecoveryModule;
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await withRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should retry on failure and succeed', async () => {
      const { withRetry } = errorRecoveryModule;
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce('success');
      
      const result = await withRetry(operation, {
        maxRetries: 3,
        initialDelay: 10,
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Operation failed, retrying'),
        expect.objectContaining({
          attempt: 1,
          maxRetries: 3,
          error: 'Temporary failure',
        })
      );
    });

    it('should throw after all retries fail', async () => {
      const { withRetry } = errorRecoveryModule;
      const operation = jest.fn().mockRejectedValue(new Error('Persistent failure'));
      
      await expect(
        withRetry(operation, {
          maxRetries: 2,
          initialDelay: 10,
        })
      ).rejects.toThrow('Persistent failure');

      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should handle non-Error objects in retry', async () => {
      const { withRetry } = errorRecoveryModule;
      const operation = jest.fn()
        .mockRejectedValueOnce('string error')
        .mockResolvedValueOnce('success');
      
      const result = await withRetry(operation, {
        initialDelay: 10,
      });

      expect(result).toBe('success');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          error: 'string error',
        })
      );
    });

    it('should respect isRetryable function', async () => {
      const { withRetry } = errorRecoveryModule;
      const nonRetryableError = new Error('Non-retryable');
      const operation = jest.fn().mockRejectedValue(nonRetryableError);
      
      await expect(
        withRetry(operation, {
          maxRetries: 3,
          isRetryable: (error) => false,
        })
      ).rejects.toThrow('Non-retryable');

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should use exponential backoff', async () => {
      const { withRetry } = errorRecoveryModule;
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      
      try {
        await withRetry(operation, {
          maxRetries: 3,
          initialDelay: 100,
          backoffMultiplier: 2,
        });
      } catch (e) {
        // Expected to fail
      }

      // Check delays: 100ms, 200ms, 400ms
      const delays = setTimeoutSpy.mock.calls.map(call => call[1]);
      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(200);
      expect(delays[2]).toBe(400);

      setTimeoutSpy.mockRestore();
    });

    it('should respect maxDelay', async () => {
      const { withRetry } = errorRecoveryModule;
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      
      try {
        await withRetry(operation, {
          maxRetries: 5,
          initialDelay: 100,
          backoffMultiplier: 10,
          maxDelay: 500,
        });
      } catch (e) {
        // Expected to fail
      }

      // Check that delays are capped at maxDelay
      const delays = setTimeoutSpy.mock.calls.map(call => call[1]);
      expect(Math.max(...delays)).toBe(500);

      setTimeoutSpy.mockRestore();
    });

    it('should use custom context in log messages', async () => {
      const { withRetry } = errorRecoveryModule;
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce('success');
      
      await withRetry(operation, {
        context: 'Database connection',
        initialDelay: 10,
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Database connection failed'),
        expect.any(Object)
      );
    });

    it('should handle zero retries', async () => {
      const { withRetry } = errorRecoveryModule;
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));
      
      await expect(
        withRetry(operation, {
          maxRetries: 0,
        })
      ).rejects.toThrow('Fail');

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle successful retry after multiple failures', async () => {
      const { withRetry } = errorRecoveryModule;
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockRejectedValueOnce(new Error('Fail 3'))
        .mockResolvedValueOnce('finally success');
      
      const result = await withRetry(operation, {
        maxRetries: 3,
        initialDelay: 10,
      });

      expect(result).toBe('finally success');
      expect(operation).toHaveBeenCalledTimes(4);
    });
  });

  describe('transformError', () => {
    it('should transform Error objects', () => {
      const { transformError } = errorRecoveryModule;
      
      class CustomError extends BaseError {
        constructor(message: string) {
          super(message, 'CUSTOM_ERROR');
        }
      }

      const originalError = new Error('Original message');
      const transformed = transformError(
        originalError,
        (error) => new CustomError(error.message)
      );

      expect(transformed).toBeInstanceOf(CustomError);
      expect(transformed.message).toBe('Original message');
      expect(transformed.code).toBe('CUSTOM_ERROR');
    });

    it('should handle non-Error objects', () => {
      const { transformError } = errorRecoveryModule;
      
      class CustomError extends BaseError {
        constructor(message: string) {
          super(message, 'CUSTOM_ERROR');
        }
      }

      const transformed = transformError(
        'string error',
        (error) => new CustomError(error.message)
      );

      expect(transformed).toBeInstanceOf(CustomError);
      expect(transformed.message).toBe('string error');
    });

    it('should handle null and undefined', () => {
      const { transformError } = errorRecoveryModule;
      
      class CustomError extends BaseError {
        constructor(message: string) {
          super(message, 'CUSTOM_ERROR');
        }
      }

      const nullTransformed = transformError(
        null,
        (error) => new CustomError(error.message)
      );
      expect(nullTransformed.message).toBe('null');

      const undefinedTransformed = transformError(
        undefined,
        (error) => new CustomError(error.message)
      );
      expect(undefinedTransformed.message).toBe('undefined');
    });

    it('should handle complex objects', () => {
      const { transformError } = errorRecoveryModule;
      
      class CustomError extends BaseError {
        constructor(message: string) {
          super(message, 'CUSTOM_ERROR');
        }
      }

      const complexError = { code: 'ERR_001', details: { reason: 'test' } };
      const transformed = transformError(
        complexError,
        (error) => new CustomError(error.message)
      );

      expect(transformed.message).toContain('ERR_001');
    });
  });

  describe('withErrorTransform', () => {
    it('should execute operation successfully without transformation', async () => {
      const { withErrorTransform } = errorRecoveryModule;
      
      class CustomError extends BaseError {
        constructor(message: string) {
          super(message, 'CUSTOM_ERROR');
        }
      }

      const result = await withErrorTransform(
        async () => 'success',
        (error) => new CustomError(error.message)
      );

      expect(result).toBe('success');
    });

    it('should transform errors from async operations', async () => {
      const { withErrorTransform } = errorRecoveryModule;
      
      class ValidationError extends BaseError {
        constructor(message: string) {
          super(message, 'VALIDATION_ERROR');
        }
      }

      await expect(
        withErrorTransform(
          async () => {
            throw new Error('Invalid input');
          },
          (error) => new ValidationError(`Validation failed: ${error.message}`)
        )
      ).rejects.toThrow(ValidationError);

      try {
        await withErrorTransform(
          async () => {
            throw new Error('Invalid input');
          },
          (error) => new ValidationError(`Validation failed: ${error.message}`)
        );
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toBe('Validation failed: Invalid input');
        expect((error as ValidationError).code).toBe('VALIDATION_ERROR');
      }
    });

    it('should handle non-Error objects in async operations', async () => {
      const { withErrorTransform } = errorRecoveryModule;
      
      class CustomError extends BaseError {
        constructor(message: string) {
          super(message, 'CUSTOM_ERROR');
        }
      }

      await expect(
        withErrorTransform(
          async () => {
            throw 'string error';
          },
          (error) => new CustomError(error.message)
        )
      ).rejects.toThrow(CustomError);
    });

    it('should preserve stack traces when possible', async () => {
      const { withErrorTransform } = errorRecoveryModule;
      
      class NetworkError extends BaseError {
        constructor(message: string, public originalError?: Error) {
          super(message, 'NETWORK_ERROR');
        }
      }

      try {
        await withErrorTransform(
          async () => {
            throw new Error('Connection failed');
          },
          (error) => {
            const netError = new NetworkError('Network request failed', error);
            return netError;
          }
        );
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError);
        expect((error as NetworkError).originalError).toBeInstanceOf(Error);
      }
    });

    it('should handle complex async operations', async () => {
      const { withErrorTransform } = errorRecoveryModule;
      
      class DataError extends BaseError {
        constructor(message: string) {
          super(message, 'DATA_ERROR');
        }
      }

      const complexOperation = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        const data = await Promise.resolve({ value: 42 });
        if (data.value === 42) {
          throw new Error('Invalid data value');
        }
        return data;
      };

      await expect(
        withErrorTransform(
          complexOperation,
          (error) => new DataError(`Data processing failed: ${error.message}`)
        )
      ).rejects.toThrow(DataError);
    });
  });

  describe('Edge Cases and Integration', () => {
    it('should handle nested error recovery', async () => {
      const { withErrorRecovery, withRetry } = errorRecoveryModule;
      
      let attempts = 0;
      const result = await withErrorRecovery(
        async () => {
          return await withRetry(
            async () => {
              attempts++;
              if (attempts < 2) {
                throw new Error('Retry needed');
              }
              return 'nested success';
            },
            { maxRetries: 2, initialDelay: 10 }
          );
        },
        {
          context: 'nested operation',
          fallback: 'outer fallback',
        }
      );

      expect(result).toBe('nested success');
      expect(attempts).toBe(2);
    });

    it('should handle error transformation with retry', async () => {
      const { withRetry, withErrorTransform } = errorRecoveryModule;
      
      class ServiceError extends BaseError {
        constructor(message: string) {
          super(message, 'SERVICE_ERROR');
        }
      }

      let attempts = 0;
      const result = await withErrorTransform(
        async () => {
          return await withRetry(
            async () => {
              attempts++;
              if (attempts < 2) {
                throw new Error('Service unavailable');
              }
              return 'service response';
            },
            { maxRetries: 2, initialDelay: 10 }
          );
        },
        (error) => new ServiceError(`Service call failed: ${error.message}`)
      );

      expect(result).toBe('service response');
    });

    it('should handle Promise.reject in operations', async () => {
      const { withErrorRecovery } = errorRecoveryModule;
      
      const result = await withErrorRecovery(
        async () => Promise.reject(new Error('Rejected')),
        {
          context: 'promise rejection',
          fallback: 'handled',
        }
      );

      expect(result).toBe('handled');
    });

    it('should handle synchronous throws in async operations', async () => {
      const { withErrorRecovery } = errorRecoveryModule;
      
      const result = await withErrorRecovery(
        async () => {
          throw new Error('Sync throw in async');
        },
        {
          context: 'sync throw',
          fallback: 'caught',
        }
      );

      expect(result).toBe('caught');
    });
  });
});