import { createLogger, createLoggerConfig } from '../../../../src/shared/utils/logger.js';

// Mock winston
jest.mock('winston', () => ({
  format: {
    combine: jest.fn((...formats) => ({ formats })),
    timestamp: jest.fn(() => ({ type: 'timestamp' })),
    errors: jest.fn(() => ({ type: 'errors' })),
    json: jest.fn(() => ({ type: 'json' })),
    colorize: jest.fn(() => ({ type: 'colorize' })),
    simple: jest.fn(() => ({ type: 'simple' })),
    printf: jest.fn((fn) => ({ type: 'printf', fn })),
  },
  transports: {
    Console: jest.fn().mockImplementation((opts) => ({ type: 'Console', ...opts })),
    File: jest.fn().mockImplementation((opts) => ({ type: 'File', ...opts })),
  },
  createLogger: jest.fn((config) => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    config,
  })),
  Logger: {
    prototype: {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }
  }
}));

// Mock environment utilities
jest.mock('../../../../src/shared/utils/env.js', () => ({
  isDevelopment: false,
  isProduction: false,
  isTest: true,
  appRoot: '/test/app',
}));

describe('Logger Utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createLoggerConfig', () => {
    it('should create development configuration', () => {
      jest.doMock('../../../../src/shared/utils/env.js', () => ({
        isDevelopment: true,
        isProduction: false,
        isTest: false,
        appRoot: '/test/app',
      }));

      const config = createLoggerConfig('test-service');
      
      expect(config.level).toBe('debug');
    });

    it('should create production configuration', () => {
      jest.doMock('../../../../src/shared/utils/env.js', () => ({
        isDevelopment: false,
        isProduction: true,
        isTest: false,
        appRoot: '/test/app',
      }));

      const config = createLoggerConfig('test-service');
      
      expect(config.level).toBe('info');
    });

    it('should create test configuration', () => {
      const config = createLoggerConfig('test-service');
      
      expect(config.level).toBe('error');
    });

    it('should use custom log level from environment', () => {
      process.env['LOG_LEVEL'] = 'warn';

      const config = createLoggerConfig('test-service');
      
      expect(config.level).toBe('warn');
      
      delete process.env['LOG_LEVEL'];
    });

    it('should handle invalid log level gracefully', () => {
      process.env['LOG_LEVEL'] = 'invalid';

      const config = createLoggerConfig('test-service');
      
      expect(config.level).toBe('error'); // Should fall back to test default
      
      delete process.env['LOG_LEVEL'];
    });

    it('should include console transport', () => {
      const config = createLoggerConfig('test-service');
      
      expect(config.transports).toHaveLength(1);
      expect(config.transports[0].type).toBe('Console');
    });

    it('should include file transport in production', () => {
      jest.doMock('../../../../src/shared/utils/env.js', () => ({
        isDevelopment: false,
        isProduction: true,
        isTest: false,
        appRoot: '/test/app',
      }));

      const config = createLoggerConfig('test-service');
      
      expect(config.transports).toHaveLength(2);
      expect(config.transports.some(t => t.type === 'File')).toBe(true);
    });
  });

  describe('createLogger', () => {
    it('should create logger with service name', () => {
      const winston = require('winston');
      
      const logger = createLogger('test-service');
      
      expect(winston.createLogger).toHaveBeenCalledWith(expect.objectContaining({
        level: 'error',
        format: expect.any(Object),
        transports: expect.any(Array),
        defaultMeta: { service: 'test-service' }
      }));
    });

    it('should create logger with proper interface', () => {
      const logger = createLogger('test-service');
      
      expect(logger).toHaveProperty('info');
      expect(logger).toHaveProperty('error');
      expect(logger).toHaveProperty('warn');
      expect(logger).toHaveProperty('debug');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should handle logging calls', () => {
      const logger = createLogger('test-service');
      
      logger.info('Test message');
      logger.error('Error message');
      logger.warn('Warning message');
      logger.debug('Debug message');
      
      expect(logger.info).toHaveBeenCalledWith('Test message');
      expect(logger.error).toHaveBeenCalledWith('Error message');
      expect(logger.warn).toHaveBeenCalledWith('Warning message');
      expect(logger.debug).toHaveBeenCalledWith('Debug message');
    });

    it('should handle logging with metadata', () => {
      const logger = createLogger('test-service');
      const metadata = { requestId: '123', userId: 'user1' };
      
      logger.info('Test message', metadata);
      
      expect(logger.info).toHaveBeenCalledWith('Test message', metadata);
    });

    it('should handle logging with undefined metadata', () => {
      const logger = createLogger('test-service');
      
      logger.info('Test message', undefined);
      
      expect(logger.info).toHaveBeenCalledWith('Test message', undefined);
    });

    it('should handle logging with empty metadata', () => {
      const logger = createLogger('test-service');
      
      logger.info('Test message', {});
      
      expect(logger.info).toHaveBeenCalledWith('Test message', {});
    });
  });

  describe('Log Formatting', () => {
    it('should format development logs with colors', () => {
      jest.doMock('../../../../src/shared/utils/env.js', () => ({
        isDevelopment: true,
        isProduction: false,
        isTest: false,
        appRoot: '/test/app',
      }));

      const winston = require('winston');
      const config = createLoggerConfig('test-service');
      
      expect(winston.format.combine).toHaveBeenCalled();
      expect(winston.format.colorize).toHaveBeenCalled();
    });

    it('should format production logs as JSON', () => {
      jest.doMock('../../../../src/shared/utils/env.js', () => ({
        isDevelopment: false,
        isProduction: true,
        isTest: false,
        appRoot: '/test/app',
      }));

      const winston = require('winston');
      const config = createLoggerConfig('test-service');
      
      expect(winston.format.combine).toHaveBeenCalled();
      expect(winston.format.json).toHaveBeenCalled();
    });

    it('should format test logs minimally', () => {
      const winston = require('winston');
      const config = createLoggerConfig('test-service');
      
      expect(winston.format.printf).toHaveBeenCalled();
    });
  });

  describe('Transport Configuration', () => {
    it('should configure console transport for all environments', () => {
      const winston = require('winston');
      const config = createLoggerConfig('test-service');
      
      expect(winston.transports.Console).toHaveBeenCalledWith({
        format: expect.any(Object)
      });
    });

    it('should configure file transports in production', () => {
      jest.doMock('../../../../src/shared/utils/env.js', () => ({
        isDevelopment: false,
        isProduction: true,
        isTest: false,
        appRoot: '/test/app',
      }));

      const winston = require('winston');
      const config = createLoggerConfig('test-service');
      
      expect(winston.transports.File).toHaveBeenCalledTimes(2);
      expect(winston.transports.File).toHaveBeenCalledWith({
        filename: expect.stringContaining('error.log'),
        level: 'error',
        format: expect.any(Object)
      });
      expect(winston.transports.File).toHaveBeenCalledWith({
        filename: expect.stringContaining('combined.log'),
        format: expect.any(Object)
      });
    });

    it('should create log directory path correctly', () => {
      jest.doMock('../../../../src/shared/utils/env.js', () => ({
        isDevelopment: false,
        isProduction: true,
        isTest: false,
        appRoot: '/test/app',
      }));

      const winston = require('winston');
      const config = createLoggerConfig('test-service');
      
      expect(winston.transports.File).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: expect.stringContaining('/test/app/logs/')
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle logger creation errors', () => {
      const winston = require('winston');
      winston.createLogger.mockImplementation(() => {
        throw new Error('Logger creation failed');
      });

      expect(() => createLogger('test-service')).toThrow('Logger creation failed');
    });

    it('should handle transport creation errors gracefully', () => {
      const winston = require('winston');
      winston.transports.Console.mockImplementation(() => {
        throw new Error('Transport creation failed');
      });

      expect(() => createLoggerConfig('test-service')).toThrow('Transport creation failed');
    });
  });

  describe('Global Logger', () => {
    it('should export global logger instance', async () => {
      // Re-import to get the global logger
      const { globalLogger } = await import('../../../../src/shared/utils/logger.js');
      
      expect(globalLogger).toBeDefined();
      expect(globalLogger).toHaveProperty('info');
      expect(globalLogger).toHaveProperty('error');
      expect(globalLogger).toHaveProperty('warn');
      expect(globalLogger).toHaveProperty('debug');
    });
  });

  describe('Log Level Validation', () => {
    const validLevels = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'];

    validLevels.forEach(level => {
      it(`should accept valid log level: ${level}`, () => {
        process.env['LOG_LEVEL'] = level;

        const config = createLoggerConfig('test-service');
        
        expect(config.level).toBe(level);
        
        delete process.env['LOG_LEVEL'];
      });
    });

    it('should reject invalid log levels', () => {
      process.env['LOG_LEVEL'] = 'invalid-level';

      const config = createLoggerConfig('test-service');
      
      expect(config.level).toBe('error'); // Should fall back to test default
      
      delete process.env['LOG_LEVEL'];
    });

    it('should handle undefined log level environment variable', () => {
      delete process.env['LOG_LEVEL'];

      const config = createLoggerConfig('test-service');
      
      expect(config.level).toBe('error'); // Test environment default
    });
  });
}); 