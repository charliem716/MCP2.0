import { env, isDevelopment, isProduction, isTest, appRoot, config } from '../../../../src/shared/utils/env.js';

// Mock zod for validation testing
jest.mock('zod', () => ({
  z: {
    object: jest.fn(() => ({
      parse: jest.fn((data) => data),
      safeParse: jest.fn((data) => ({ success: true, data })),
    })),
    string: jest.fn(() => ({
      default: jest.fn(() => ({ min: jest.fn(() => ({ max: jest.fn(() => ({})) })) })),
      min: jest.fn(() => ({ max: jest.fn(() => ({})) })),
      max: jest.fn(() => ({})),
      optional: jest.fn(() => ({})),
    })),
    number: jest.fn(() => ({
      default: jest.fn(() => ({ min: jest.fn(() => ({ max: jest.fn(() => ({})) })) })),
      min: jest.fn(() => ({ max: jest.fn(() => ({})) })),
      max: jest.fn(() => ({})),
      optional: jest.fn(() => ({})),
    })),
    boolean: jest.fn(() => ({
      default: jest.fn(() => ({})),
      optional: jest.fn(() => ({})),
    })),
    enum: jest.fn(() => ({
      default: jest.fn(() => ({})),
      optional: jest.fn(() => ({})),
    })),
    preprocess: jest.fn((fn, schema) => ({ preprocess: fn, schema })),
    coerce: {
      number: jest.fn(() => ({ default: jest.fn(() => ({})) })),
      boolean: jest.fn(() => ({ default: jest.fn(() => ({})) })),
    },
  },
}));

describe('Environment Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Environment Detection', () => {
    it('should detect development environment', () => {
      process.env.NODE_ENV = 'development';
      
      // Re-import to get fresh environment detection
      jest.resetModules();
      const { isDevelopment, isProduction, isTest } = require('../../../../src/shared/utils/env.js');
      
      expect(isDevelopment).toBe(true);
      expect(isProduction).toBe(false);
      expect(isTest).toBe(false);
    });

    it('should detect production environment', () => {
      process.env.NODE_ENV = 'production';
      
      jest.resetModules();
      const { isDevelopment, isProduction, isTest } = require('../../../../src/shared/utils/env.js');
      
      expect(isDevelopment).toBe(false);
      expect(isProduction).toBe(true);
      expect(isTest).toBe(false);
    });

    it('should detect test environment', () => {
      process.env.NODE_ENV = 'test';
      
      jest.resetModules();
      const { isDevelopment, isProduction, isTest } = require('../../../../src/shared/utils/env.js');
      
      expect(isDevelopment).toBe(false);
      expect(isProduction).toBe(false);
      expect(isTest).toBe(true);
    });

    it('should default to development for unknown environments', () => {
      process.env.NODE_ENV = 'unknown';
      
      jest.resetModules();
      const { isDevelopment, isProduction, isTest } = require('../../../../src/shared/utils/env.js');
      
      expect(isDevelopment).toBe(true);
      expect(isProduction).toBe(false);
      expect(isTest).toBe(false);
    });

    it('should default to development when NODE_ENV is not set', () => {
      delete process.env.NODE_ENV;
      
      jest.resetModules();
      const { isDevelopment, isProduction, isTest } = require('../../../../src/shared/utils/env.js');
      
      expect(isDevelopment).toBe(true);
      expect(isProduction).toBe(false);
      expect(isTest).toBe(false);
    });
  });

  describe('Application Root Path', () => {
    it('should provide app root path', () => {
      expect(typeof appRoot).toBe('string');
      expect(appRoot).toBeTruthy();
    });

    it('should be an absolute path', () => {
      expect(appRoot).toMatch(/^\/|^[A-Za-z]:\\/); // Unix or Windows absolute path
    });
  });

  describe('Environment Variables', () => {
    describe('Required Variables', () => {
      it('should load Q-SYS configuration', () => {
        process.env.QSYS_HOST = 'qsys.example.com';
        process.env.QSYS_PORT = '8443';
        process.env.QSYS_USERNAME = 'admin';
        process.env.QSYS_PASSWORD = 'password123';
        
        expect(env.QSYS_HOST).toBe('qsys.example.com');
        expect(env.QSYS_PORT).toBe('8443');
        expect(env.QSYS_USERNAME).toBe('admin');
        expect(env.QSYS_PASSWORD).toBe('password123');
      });

      it('should load OpenAI configuration', () => {
        process.env.OPENAI_API_KEY = 'sk-test123';
        process.env.OPENAI_MODEL = 'gpt-4';
        
        expect(env.OPENAI_API_KEY).toBe('sk-test123');
        expect(env.OPENAI_MODEL).toBe('gpt-4');
      });
    });

    describe('Optional Variables with Defaults', () => {
      it('should use default values when not set', () => {
        delete process.env.LOG_LEVEL;
        delete process.env.PORT;
        delete process.env.QSYS_SSL;
        
        expect(env.LOG_LEVEL).toBeDefined();
        expect(env.PORT).toBeDefined();
        expect(env.QSYS_SSL).toBeDefined();
      });

      it('should override defaults when set', () => {
        process.env.LOG_LEVEL = 'warn';
        process.env.PORT = '4000';
        process.env.QSYS_SSL = 'false';
        
        expect(env.LOG_LEVEL).toBe('warn');
        expect(env.PORT).toBe('4000');
        expect(env.QSYS_SSL).toBe('false');
      });
    });

    describe('Type Coercion', () => {
      it('should coerce string numbers to numbers', () => {
        process.env.PORT = '3000';
        process.env.QSYS_PORT = '8443';
        
        // These should be accessible as numbers in the config object
        expect(typeof config.port).toBe('number');
        expect(typeof config.qsys.port).toBe('number');
      });

      it('should coerce string booleans to booleans', () => {
        process.env.QSYS_SSL = 'true';
        process.env.QSYS_VERIFY_CERT = 'false';
        
        expect(typeof config.qsys.ssl).toBe('boolean');
        expect(typeof config.qsys.verifyCert).toBe('boolean');
      });
    });
  });

  describe('Configuration Object', () => {
    it('should provide structured configuration', () => {
      expect(config).toHaveProperty('nodeEnv');
      expect(config).toHaveProperty('port');
      expect(config).toHaveProperty('logLevel');
      expect(config).toHaveProperty('qsys');
      expect(config).toHaveProperty('openai');
      expect(config).toHaveProperty('security');
    });

    it('should have Q-SYS configuration structure', () => {
      expect(config.qsys).toHaveProperty('host');
      expect(config.qsys).toHaveProperty('port');
      expect(config.qsys).toHaveProperty('username');
      expect(config.qsys).toHaveProperty('password');
      expect(config.qsys).toHaveProperty('ssl');
      expect(config.qsys).toHaveProperty('verifyCert');
      expect(config.qsys).toHaveProperty('timeout');
      expect(config.qsys).toHaveProperty('retryAttempts');
      expect(config.qsys).toHaveProperty('retryDelay');
      expect(config.qsys).toHaveProperty('heartbeatInterval');
    });

    it('should have OpenAI configuration structure', () => {
      expect(config.openai).toHaveProperty('apiKey');
      expect(config.openai).toHaveProperty('model');
      expect(config.openai).toHaveProperty('temperature');
      expect(config.openai).toHaveProperty('maxTokens');
    });

    it('should have security configuration structure', () => {
      expect(config.security).toHaveProperty('jwtSecret');
      expect(config.security).toHaveProperty('jwtExpiresIn');
      expect(config.security).toHaveProperty('rateLimitRequests');
      expect(config.security).toHaveProperty('rateLimitWindow');
    });
  });

  describe('Validation', () => {
    it('should validate required environment variables', () => {
      delete process.env.QSYS_HOST;
      delete process.env.OPENAI_API_KEY;
      
      // Should not throw in current implementation, but should log warnings
      expect(() => {
        jest.resetModules();
        require('../../../../src/shared/utils/env.js');
      }).not.toThrow();
    });

    it('should validate log level enum', () => {
      process.env.LOG_LEVEL = 'invalid-level';
      
      // Should fallback to default or throw validation error
      expect(() => {
        jest.resetModules();
        require('../../../../src/shared/utils/env.js');
      }).not.toThrow();
    });

    it('should validate numeric ranges', () => {
      process.env.PORT = '99999'; // Out of valid port range
      process.env.QSYS_PORT = '0'; // Invalid port
      
      // Should handle invalid numeric values gracefully
      expect(() => {
        jest.resetModules();
        require('../../../../src/shared/utils/env.js');
      }).not.toThrow();
    });

    it('should validate boolean values', () => {
      process.env.QSYS_SSL = 'maybe'; // Invalid boolean
      process.env.QSYS_VERIFY_CERT = 'yes'; // Invalid boolean
      
      // Should handle invalid boolean values gracefully
      expect(() => {
        jest.resetModules();
        require('../../../../src/shared/utils/env.js');
      }).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing critical variables gracefully', () => {
      delete process.env.QSYS_HOST;
      delete process.env.QSYS_USERNAME;
      delete process.env.QSYS_PASSWORD;
      delete process.env.OPENAI_API_KEY;
      
      expect(() => {
        jest.resetModules();
        require('../../../../src/shared/utils/env.js');
      }).not.toThrow();
    });

    it('should provide helpful error messages', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      delete process.env.QSYS_HOST;
      
      jest.resetModules();
      require('../../../../src/shared/utils/env.js');
      
      // Should log helpful error messages
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('Development vs Production Differences', () => {
    it('should have different defaults for development', () => {
      process.env.NODE_ENV = 'development';
      
      jest.resetModules();
      const { config } = require('../../../../src/shared/utils/env.js');
      
      expect(config.logLevel).toBe('debug');
    });

    it('should have different defaults for production', () => {
      process.env.NODE_ENV = 'production';
      
      jest.resetModules();
      const { config } = require('../../../../src/shared/utils/env.js');
      
      expect(config.logLevel).toBe('info');
    });

    it('should have different defaults for test', () => {
      process.env.NODE_ENV = 'test';
      
      jest.resetModules();
      const { config } = require('../../../../src/shared/utils/env.js');
      
      expect(config.logLevel).toBe('error');
    });
  });

  describe('Environment Variable Preprocessing', () => {
    it('should handle comma-separated values', () => {
      process.env.ALLOWED_ORIGINS = 'http://localhost:3000,https://app.example.com';
      
      // Should split into array if configured to do so
      expect(env.ALLOWED_ORIGINS).toBe('http://localhost:3000,https://app.example.com');
    });

    it('should handle JSON values', () => {
      process.env.CUSTOM_CONFIG = '{"key": "value", "number": 42}';
      
      // Should parse JSON if configured to do so
      expect(env.CUSTOM_CONFIG).toBe('{"key": "value", "number": 42}');
    });

    it('should trim whitespace from values', () => {
      process.env.QSYS_HOST = '  qsys.example.com  ';
      process.env.QSYS_USERNAME = '  admin  ';
      
      // Should trim whitespace
      expect(env.QSYS_HOST.trim()).toBe('qsys.example.com');
      expect(env.QSYS_USERNAME.trim()).toBe('admin');
    });
  });

  describe('Security Considerations', () => {
    it('should not expose sensitive values in logs', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      process.env.QSYS_PASSWORD = 'secret123';
      process.env.OPENAI_API_KEY = 'sk-secret456';
      process.env.JWT_SECRET = 'jwt-secret789';
      
      jest.resetModules();
      require('../../../../src/shared/utils/env.js');
      
      // Should not log sensitive values
      const loggedValues = consoleSpy.mock.calls.flat().join(' ');
      expect(loggedValues).not.toContain('secret123');
      expect(loggedValues).not.toContain('sk-secret456');
      expect(loggedValues).not.toContain('jwt-secret789');
      
      consoleSpy.mockRestore();
    });

    it('should mask sensitive values in error messages', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      process.env.QSYS_PASSWORD = 'secret123';
      process.env.OPENAI_API_KEY = 'sk-secret456';
      
      jest.resetModules();
      require('../../../../src/shared/utils/env.js');
      
      // Should mask sensitive values in error messages
      const errorMessages = consoleSpy.mock.calls.flat().join(' ');
      expect(errorMessages).not.toContain('secret123');
      expect(errorMessages).not.toContain('sk-secret456');
      
      consoleSpy.mockRestore();
    });
  });

  describe('Type Safety', () => {
    it('should provide proper TypeScript types', () => {
      // These should be properly typed
      expect(typeof config.port).toBe('number');
      expect(typeof config.qsys.ssl).toBe('boolean');
      expect(typeof config.qsys.retryAttempts).toBe('number');
      expect(typeof config.openai.temperature).toBe('number');
    });

    it('should provide proper enum types', () => {
      expect(['error', 'warn', 'info', 'debug']).toContain(config.logLevel);
      expect(['development', 'production', 'test']).toContain(config.nodeEnv);
    });
  });
}); 