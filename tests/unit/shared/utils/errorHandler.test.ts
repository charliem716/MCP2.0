/* eslint-disable @typescript-eslint/unbound-method */
import { GlobalErrorHandler, globalErrorHandler, ErrorUtils } from '../../../../src/shared/utils/errorHandler.js';
import { QSysError, OpenAIError, MCPError, QSysErrorCode, OpenAIErrorCode, MCPErrorCode } from '../../../../src/shared/types/errors.js';

const mockLogger = {
  info: jest.fn<void, []>(),
  error: jest.fn<void, []>(), 
  warn: jest.fn<void, []>(),
  debug: jest.fn<void, []>(),
};

const mockGlobalLogger = {
  info: jest.fn<void, []>(),
  error: jest.fn<void, []>(),
  warn: jest.fn<void, []>(),
  debug: jest.fn<void, []>(),
};

// Mock logger
jest.mock('../../../../src/shared/utils/logger.js', () => ({
  createLogger: jest.fn(() => mockLogger),
  globalLogger: mockGlobalLogger,
}));

describe('GlobalErrorHandler', () => {
  let errorHandler: GlobalErrorHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    errorHandler = new GlobalErrorHandler({
      logErrors: true,
      enableRecovery: true,
      enableReporting: false,
    });
  });

  describe('handleError', () => {
    it('should handle generic errors', () => {
      const error = new Error('Test error');
      
      await errorHandler.handleError(error);
      
      const { createLogger } = await import('../../../../src/shared/utils/logger.js');
      const logger = createLogger('test-service');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle QSysError', () => {
      const error = new QSysError('Connection failed', QSysErrorCode.CONNECTION_FAILED);
      
      await errorHandler.handleError(error);
      
      const { createLogger } = await import('../../../../src/shared/utils/logger.js');
      const logger = createLogger('test-service');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle OpenAIError', () => {
      const error = new OpenAIError('API rate limit exceeded', OpenAIErrorCode.RATE_LIMIT_EXCEEDED);
      
      await errorHandler.handleError(error);
      
      const { createLogger } = await import('../../../../src/shared/utils/logger.js');
      const logger = createLogger('test-service');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle MCPError', () => {
      const error = new MCPError('Method not found', MCPErrorCode.METHOD_NOT_FOUND);
      
      await errorHandler.handleError(error);
      
      const { createLogger } = await import('../../../../src/shared/utils/logger.js');
      const logger = createLogger('test-service');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('handleWithRecovery', () => {
    it('should retry operation on failure', () => {
      let attempts = 0;
      const operation = jest.fn(() => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });

      const result = await errorHandler.handleWithRecovery(
        operation,
        'test-error'
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attemptsUsed).toBe(2);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should fail after max attempts', () => {
      const operation = jest.fn(() => {
        throw new Error('Persistent failure');
      });

      const result = await errorHandler.handleWithRecovery(
        operation,
        'test-error'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.attemptsUsed).toBe(3); // Default max attempts
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should not retry if recovery is disabled', () => {
      const noRecoveryHandler = new GlobalErrorHandler({
        enableRecovery: false,
      });

      const operation = jest.fn(() => {
        throw new Error('Test error');
      });

      const result = await noRecoveryHandler.handleWithRecovery(
        operation,
        'test-error'
      );

      expect(result.success).toBe(false);
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error transformation', () => {
    it('should transform errors to structured format', () => {
      const error = new Error('Test error');
      const context = { userId: '123', action: 'test' };

      await errorHandler.handleError(error, context);

      const { createLogger } = await import('../../../../src/shared/utils/logger.js');
      const logger = createLogger('test-service');
      expect(logger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          context: expect.objectContaining(context)
        })
      );
    });
  });

  describe('ErrorUtils', () => {
    describe('safeExecute', () => {
      it('should execute operation successfully', async () => {
        const operation = jest.fn(async () => Promise.resolve('success'));
        
        const result = await ErrorUtils.safeExecute(operation);
        
        expect(result).toBe('success');
        expect(operation).toHaveBeenCalled();
      });

      it('should handle errors and return null', () => {
        const operation = jest.fn(() => {
          throw new Error('Test error');
        });
        
        const result = await ErrorUtils.safeExecute(operation);
        
        expect(result).toBeNull();
        expect(operation).toHaveBeenCalled();
      });
    });

    describe('wrapWithErrorHandling', () => {
      it('should wrap function and execute successfully', async () => {
        const fn = jest.fn(async (arg: string) => Promise.resolve(`result: ${arg}`));
        const wrapped = ErrorUtils.wrapWithErrorHandling(fn);
        
        const result = await wrapped('test');
        
        expect(result).toBe('result: test');
        expect(fn).toHaveBeenCalledWith('test');
      });

      it('should wrap function and handle errors', () => {
        const fn = jest.fn(() => {
          throw new Error('Test error');
        });
        const wrapped = ErrorUtils.wrapWithErrorHandling(fn);
        
        await expect(wrapped()).rejects.toThrow('Test error');
        expect(fn).toHaveBeenCalled();
      });
    });

    describe('createHttpError', () => {
      it('should create validation error for 400', () => {
        const error = ErrorUtils.createHttpError(400, 'Bad request');
        
        expect(error.constructor.name).toBe('ValidationError');
        expect(error.message).toBe('Bad request');
      });

      it('should create unauthorized error for 401', () => {
        const error = ErrorUtils.createHttpError(401, 'Unauthorized');
        
        expect(error.constructor.name).toBe('UnauthorizedError');
        expect(error.message).toBe('Unauthorized');
      });

      it('should create forbidden error for 403', () => {
        const error = ErrorUtils.createHttpError(403, 'Forbidden');
        
        expect(error.constructor.name).toBe('ForbiddenError');
        expect(error.message).toBe('Forbidden');
      });

      it('should create not found error for 404', () => {
        const error = ErrorUtils.createHttpError(404, 'Not found');
        
        expect(error.constructor.name).toBe('NotFoundError');
        expect(error.message).toBe('Not found');
      });

      it('should create external API error for other codes', () => {
        const error = ErrorUtils.createHttpError(502, 'Bad gateway');
        
        expect(error.constructor.name).toBe('ExternalAPIError');
        expect(error.message).toBe('Bad gateway');
      });
    });

    describe('validate', () => {
      it('should not throw when condition is true', () => {
        expect(() => {
          ErrorUtils.validate(true, 'Should not throw');
        }).not.toThrow();
      });

      it('should throw validation error when condition is false', () => {
        expect(() => {
          ErrorUtils.validate(false, 'Validation failed', 'testField');
        }).toThrow('Validation failed');
      });
    });

    describe('assertExists', () => {
      it('should return value when not null', () => {
        const value = { test: 'data' };
        const result = ErrorUtils.assertExists(value, 'TestResource');
        
        expect(result).toBe(value);
      });

      it('should throw not found error when null', () => {
        expect(() => {
          ErrorUtils.assertExists(null, 'TestResource', '123');
        }).toThrow('TestResource with ID 123 not found');
      });

      it('should throw not found error when undefined', () => {
        expect(() => {
          ErrorUtils.assertExists(undefined, 'TestResource');
        }).toThrow('TestResource not found');
      });
    });
  });

  describe('Global error handler instance', () => {
    it('should export a global instance', () => {
      expect(globalErrorHandler).toBeInstanceOf(GlobalErrorHandler);
    });

    it('should handle errors through global instance', () => {
      const error = new Error('Test error');
      
      await globalErrorHandler.handleError(error);
      
      const { createLogger } = await import('../../../../src/shared/utils/logger.js');
      const logger = createLogger('test-service');
      expect(logger.error).toHaveBeenCalled();
    });
  });
}); 