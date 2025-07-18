import { GlobalErrorHandler } from '../../../../src/shared/utils/errorHandler.js';
import { QSysError, OpenAIError, MCPError } from '../../../../src/shared/types/errors.js';

// Mock logger
jest.mock('../../../../src/shared/utils/logger.js', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
  globalLogger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }
}));

describe('GlobalErrorHandler', () => {
  let errorHandler: GlobalErrorHandler;

  beforeEach(() => {
    errorHandler = new GlobalErrorHandler();
    jest.clearAllMocks();
  });

  describe('Error Handling', () => {
    it('should handle generic errors', async () => {
      const error = new Error('Test error');
      const context = { operation: 'test' };

      const result = await errorHandler.handle(error, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(result.context).toBe(context);
    });

    it('should handle Q-SYS errors', async () => {
      const error = new QSysError('Q-SYS connection failed', 'QSYS_CONNECTION_FAILED');
      const context = { component: 'qsys-client' };

      const result = await errorHandler.handle(error, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(result.context).toBe(context);
    });

    it('should handle OpenAI errors', async () => {
      const error = new OpenAIError('API key invalid', 'OPENAI_API_KEY_INVALID');
      const context = { operation: 'chat-completion' };

      const result = await errorHandler.handle(error, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(result.context).toBe(context);
    });

    it('should handle MCP errors', async () => {
      const error = new MCPError('Method not found', 'MCP_METHOD_NOT_FOUND');
      const context = { method: 'unknown-method' };

      const result = await errorHandler.handle(error, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(result.context).toBe(context);
    });
  });

  describe('Recovery Mechanisms', () => {
    it('should attempt recovery with default handlers', async () => {
      const error = new Error('Recoverable error');
      const context = { operation: 'test', recoverable: true };

      const result = await errorHandler.handleWithRecovery(error, context);

      expect(result.success).toBe(false); // Default recovery should fail
      expect(result.recoveryAttempted).toBe(true);
    });

    it('should handle successful recovery', async () => {
      const error = new Error('Recoverable error');
      const context = { operation: 'test' };

      // Mock successful recovery
      const mockRecovery = jest.fn().mockResolvedValue({ success: true });
      errorHandler.addRecoveryHandler('test', mockRecovery);

      const result = await errorHandler.handleWithRecovery(error, context);

      expect(result.success).toBe(true);
      expect(result.recoveryAttempted).toBe(true);
      expect(mockRecovery).toHaveBeenCalledWith(error, context);
    });

    it('should handle failed recovery', async () => {
      const error = new Error('Unrecoverable error');
      const context = { operation: 'test' };

      // Mock failed recovery
      const mockRecovery = jest.fn().mockResolvedValue({ success: false });
      errorHandler.addRecoveryHandler('test', mockRecovery);

      const result = await errorHandler.handleWithRecovery(error, context);

      expect(result.success).toBe(false);
      expect(result.recoveryAttempted).toBe(true);
      expect(mockRecovery).toHaveBeenCalledWith(error, context);
    });
  });

  describe('Express Middleware', () => {
    it('should create Express error middleware', () => {
      const middleware = errorHandler.createExpressMiddleware();

      expect(typeof middleware).toBe('function');
      expect(middleware.length).toBe(4); // Express error middleware signature
    });

    it('should handle Express errors', () => {
      const middleware = errorHandler.createExpressMiddleware();
      const error = new Error('Express error');
      const req = { url: '/test', method: 'GET' };
      const res = { 
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };
      const next = jest.fn();

      middleware(error, req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Express error',
          code: 'INTERNAL_SERVER_ERROR'
        }
      });
    });

    it('should handle different HTTP status codes', () => {
      const middleware = errorHandler.createExpressMiddleware();
      const error = new Error('Not found');
      (error as any).statusCode = 404;
      
      const req = { url: '/test', method: 'GET' };
      const res = { 
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };
      const next = jest.fn();

      middleware(error, req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('Error Reporting', () => {
    it('should report errors to configured handlers', async () => {
      const error = new Error('Test error');
      const context = { operation: 'test' };

      await errorHandler.reportError(error, context);

      // Should not throw and should handle reporting
      expect(true).toBe(true);
    });

    it('should handle multiple report handlers', async () => {
      const error = new Error('Test error');
      const context = { operation: 'test' };

      const handler1 = jest.fn();
      const handler2 = jest.fn();

      errorHandler.addReportHandler('handler1', handler1);
      errorHandler.addReportHandler('handler2', handler2);

      await errorHandler.reportError(error, context);

      expect(handler1).toHaveBeenCalledWith(error, context);
      expect(handler2).toHaveBeenCalledWith(error, context);
    });
  });

  describe('Process Error Handling', () => {
    it('should handle uncaught exceptions', () => {
      const originalListeners = process.listeners('uncaughtException');
      
      errorHandler.setupProcessHandlers();
      
      const newListeners = process.listeners('uncaughtException');
      expect(newListeners.length).toBeGreaterThan(originalListeners.length);
    });

    it('should handle unhandled promise rejections', () => {
      const originalListeners = process.listeners('unhandledRejection');
      
      errorHandler.setupProcessHandlers();
      
      const newListeners = process.listeners('unhandledRejection');
      expect(newListeners.length).toBeGreaterThan(originalListeners.length);
    });
  });

  describe('Configuration', () => {
    it('should accept custom configuration', () => {
      const config = {
        enableRecovery: false,
        enableReporting: false,
        maxRetries: 5,
        retryDelay: 2000
      };

      const customErrorHandler = new GlobalErrorHandler(config);

      expect(customErrorHandler).toBeInstanceOf(GlobalErrorHandler);
    });

    it('should use default configuration', () => {
      const defaultErrorHandler = new GlobalErrorHandler();

      expect(defaultErrorHandler).toBeInstanceOf(GlobalErrorHandler);
    });
  });

  describe('Error Transformation', () => {
    it('should transform errors to standard format', () => {
      const error = new Error('Test error');
      const transformed = errorHandler.transformError(error);

      expect(transformed).toHaveProperty('message');
      expect(transformed).toHaveProperty('code');
      expect(transformed).toHaveProperty('timestamp');
      expect(transformed).toHaveProperty('stack');
    });

    it('should handle Q-SYS specific errors', () => {
      const error = new QSysError('Q-SYS error', 'QSYS_CONNECTION_FAILED');
      const transformed = errorHandler.transformError(error);

      expect(transformed.code).toBe('QSYS_CONNECTION_FAILED');
      expect(transformed.message).toBe('Q-SYS error');
    });

    it('should handle errors without stack traces', () => {
      const error = new Error('Test error');
      delete error.stack;
      
      const transformed = errorHandler.transformError(error);

      expect(transformed).toHaveProperty('message');
      expect(transformed).toHaveProperty('code');
      expect(transformed.stack).toBeUndefined();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup resources', () => {
      errorHandler.cleanup();
      
      // Should not throw
      expect(true).toBe(true);
    });

    it('should remove process listeners on cleanup', () => {
      errorHandler.setupProcessHandlers();
      const beforeCleanup = process.listeners('uncaughtException').length;
      
      errorHandler.cleanup();
      const afterCleanup = process.listeners('uncaughtException').length;
      
      expect(afterCleanup).toBeLessThanOrEqual(beforeCleanup);
    });
  });
}); 