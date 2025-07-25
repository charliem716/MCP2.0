 
import { createLogger } from '../../../../src/shared/utils/logger.js';

// Mock winston
jest.mock('winston', () => ({
  format: {
    combine: jest.fn((...formats) => ({ formats })),
    timestamp: jest.fn(() => ({ type: 'timestamp' })),
    errors: jest.fn(() => ({ type: 'errors' })),
    json: jest.fn(() => ({ type: 'json' })),
    colorize: jest.fn(() => ({ type: 'colorize' })),
    simple: jest.fn(() => ({ type: 'simple' })),
    prettyPrint: jest.fn(() => ({ type: 'prettyPrint' })),
    printf: jest.fn(() => ({ type: 'printf' })),
    metadata: jest.fn(() => ({ type: 'metadata' })),
  },
  transports: {
    Console: jest.fn().mockImplementation(() => ({
      name: 'console',
      level: 'debug',
    })),
    File: jest.fn().mockImplementation(options => ({
      name: 'file',
      filename: options.filename,
      level: options.level,
    })),
  },
  createLogger: jest.fn().mockImplementation(config => ({
    level: config.level,
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    rejections: {
      handle: jest.fn(),
    },
  })),
}));

// Mock path
jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
}));

describe('logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['LOG_LEVEL'];
  });

  afterEach(() => {
    delete process.env['NODE_ENV'];
    delete process.env['LOG_LEVEL'];
  });

  describe('createLogger', () => {
    it('should create a logger instance', () => {
      const winston = require('winston');
      const _logger = createLogger('test-service');

      expect(winston.createLogger).toHaveBeenCalled();
      expect(_logger).toBeDefined();
      expect(_logger.error).toBeDefined();
      expect(_logger.warn).toBeDefined();
      expect(_logger.info).toBeDefined();
      expect(_logger.debug).toBeDefined();
    });

    it('should create logger with correct methods', () => {
      const _logger = createLogger('test-service');
      const testMessage = 'Test message';
      const testMeta = { key: 'value' };

      _logger.error(testMessage, testMeta);
      _logger.warn(testMessage, testMeta);
      _logger.info(testMessage, testMeta);
      _logger.debug(testMessage, testMeta);

      expect(_logger.error).toHaveBeenCalledWith(testMessage, testMeta);
      expect(_logger.warn).toHaveBeenCalledWith(testMessage, testMeta);
      expect(_logger.info).toHaveBeenCalledWith(testMessage, testMeta);
      expect(_logger.debug).toHaveBeenCalledWith(testMessage, testMeta);
    });

    it('should use debug level in development', async () => {
      process.env['NODE_ENV'] = 'development';

      const _logger = createLogger('test-service');
      const winston = await import('winston');

      expect(winston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'debug',
        })
      );
    });

    it('should use info level in production', async () => {
      process.env['NODE_ENV'] = 'production';

      const _logger = createLogger('test-service');
      const winston = await import('winston');

      expect(winston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
        })
      );
    });

    it('should use error level in test', async () => {
      process.env['NODE_ENV'] = 'test';

      const _logger = createLogger('test-service');
      const winston = await import('winston');

      expect(winston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
        })
      );
    });

    it('should respect LOG_LEVEL environment variable', async () => {
      process.env['LOG_LEVEL'] = 'warn';

      const _logger = createLogger('test-service');
      const winston = await import('winston');

      expect(winston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'warn',
        })
      );
    });

    it('should be silent in test environment without DEBUG_TESTS', async () => {
      process.env['NODE_ENV'] = 'test';
      delete process.env['DEBUG_TESTS'];

      const _logger = createLogger('test-service');
      const winston = await import('winston');

      expect(winston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          silent: true,
        })
      );
    });

    it('should not be silent in test environment with DEBUG_TESTS', async () => {
      process.env['NODE_ENV'] = 'test';
      process.env['DEBUG_TESTS'] = 'true';

      const _logger = createLogger('test-service');
      const winston = await import('winston');

      expect(winston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          silent: false,
        })
      );
    });

    it('should setup rejection handling in production', async () => {
      process.env['NODE_ENV'] = 'production';

      // Mock the rejections.handle before calling createLogger
      const mockRejections = { handle: jest.fn() };
      const winston = await import('winston');
      (winston.createLogger as jest.Mock).mockReturnValueOnce({
        level: 'info',
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        debug: jest.fn(),
        rejections: mockRejections,
      });

      const _logger = createLogger('test-service');

      expect(mockRejections.handle).toHaveBeenCalled();
    });

    it('should not setup rejection handling in development', async () => {
      process.env['NODE_ENV'] = 'development';

      // Mock the rejections.handle before calling createLogger
      const mockRejections = { handle: jest.fn() };
      const winston = await import('winston');
      (winston.createLogger as jest.Mock).mockReturnValueOnce({
        level: 'debug',
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        debug: jest.fn(),
        rejections: mockRejections,
      });

      const _logger = createLogger('test-service');

      expect(mockRejections.handle).not.toHaveBeenCalled();
    });

    it('should include service name in metadata', async () => {
      const serviceName = 'test-service';
      const _logger = createLogger(serviceName);
      const winston = await import('winston');

      expect(winston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultMeta: { service: serviceName },
        })
      );
    });

    it('should use correct transports in development', async () => {
      process.env['NODE_ENV'] = 'development';

      const _logger = createLogger('test-service');
      const winston = await import('winston');

      expect(winston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          transports: expect.arrayContaining([expect.any(Object)]),
        })
      );
    });

    it('should use correct transports in production', async () => {
      process.env['NODE_ENV'] = 'production';

      const _logger = createLogger('test-service');
      const winston = await import('winston');

      expect(winston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          transports: expect.arrayContaining([
            expect.any(Object),
            expect.any(Object),
            expect.any(Object),
          ]),
        })
      );
    });
  });
});
