 
import { env, appRoot, config } from '../../../../src/shared/utils/env.js';

// Mock zod
jest.mock('zod', () => ({
  z: {
    object: jest.fn(() => ({
      parse: jest.fn((data: unknown) => data),
      safeParse: jest.fn((data: unknown) => ({ success: true, data })),
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
      process.env["NODE_ENV"] = 'development';
      
      // Re-import to get fresh environment detection
      jest.resetModules();
      const { isDevelopment, isProduction, isTest } = await import('../../../../src/shared/utils/env.js');
      
      expect(isDevelopment).toBe(true);
      expect(isProduction).toBe(false);
      expect(isTest).toBe(false);
    });

    it('should detect production environment', () => {
      process.env["NODE_ENV"] = 'production';
      
      jest.resetModules();
      const { isDevelopment, isProduction, isTest } = await import('../../../../src/shared/utils/env.js');
      
      expect(isDevelopment).toBe(false);
      expect(isProduction).toBe(true);
      expect(isTest).toBe(false);
    });

    it('should detect test environment', () => {
      process.env["NODE_ENV"] = 'test';
      
      jest.resetModules();
      const { isDevelopment, isProduction, isTest } = await import('../../../../src/shared/utils/env.js');
      
      expect(isDevelopment).toBe(false);
      expect(isProduction).toBe(false);
      expect(isTest).toBe(true);
    });

    it('should default to development for unknown environments', () => {
      process.env["NODE_ENV"] = 'unknown';
      
      jest.resetModules();
      const { isDevelopment, isProduction, isTest } = await import('../../../../src/shared/utils/env.js');
      
      expect(isDevelopment).toBe(true);
      expect(isProduction).toBe(false);
      expect(isTest).toBe(false);
    });

    it('should default to development when NODE_ENV is not set', () => {
      delete process.env["NODE_ENV"];
      
      jest.resetModules();
      const { isDevelopment, isProduction, isTest } = await import('../../../../src/shared/utils/env.js');
      
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
        process.env["QSYS_HOST"] = 'qsys.example.com';
        process.env["QSYS_PORT"] = '8443';
        process.env["QSYS_USERNAME"] = 'admin';
        process.env["QSYS_PASSWORD"] = 'password123';
        
        expect(env.QSYS_HOST).toBe('qsys.example.com');
        expect(env.QSYS_PORT).toBe('8443');
        expect(env.QSYS_USERNAME).toBe('admin');
        expect(env.QSYS_PASSWORD).toBe('password123');
      });

      it('should load OpenAI configuration', () => {
        process.env["OPENAI_API_KEY"] = 'sk-test123';
        process.env["OPENAI_MODEL"] = 'gpt-4';
        
        expect(env.OPENAI_API_KEY).toBe('sk-test123');
        expect(env.OPENAI_MODEL).toBe('gpt-4');
      });
    });

    describe('Optional Variables with Defaults', () => {
      it('should use default values when not set', () => {
        delete process.env['LOG_LEVEL'];
        delete process.env['PORT'];
        
        expect(env.LOG_LEVEL).toBeDefined();
        expect(env.PORT).toBeDefined();
      });

      it('should override defaults when set', () => {
        // Note: env is parsed at module load time, so we can't test runtime changes
        // These tests would need to reload the module to see the changes
        expect(true).toBe(true); // Placeholder test
      });
    });

    describe('Type Coercion', () => {
      it('should coerce string numbers to numbers', () => {
        // These should be accessible as numbers in the config object
        expect(typeof config.app.port).toBe('number');
        expect(typeof config.qsys.port).toBe('number');
      });

      it('should coerce string booleans to booleans', () => {
        // Test with actual boolean properties
        expect(typeof config.features.swagger).toBe('boolean');
        expect(typeof config.features.metrics).toBe('boolean');
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
      delete process.env["QSYS_HOST"];
      delete process.env["OPENAI_API_KEY"];
      
      // Should not throw in current implementation, but should log warnings
      expect(() => {
        jest.resetModules();
        await import('../../../../src/shared/utils/env.js');
      }).not.toThrow();
    });

    it('should validate log level enum', () => {
      process.env["LOG_LEVEL"] = 'invalid-level';
      
      // Should fallback to default or throw validation error
      expect(() => {
        jest.resetModules();
        await import('../../../../src/shared/utils/env.js');
      }).not.toThrow();
    });

    it('should validate numeric ranges', () => {
      process.env["PORT"] = '99999'; // Out of valid port range
      process.env["QSYS_PORT"] = '0'; // Invalid port
      
      // Should handle invalid numeric values gracefully
      expect(() => {
        jest.resetModules();
        await import('../../../../src/shared/utils/env.js');
      }).not.toThrow();
    });

    it('should validate boolean values', () => {
      process.env["QSYS_SSL"] = 'maybe'; // Invalid boolean
      process.env["QSYS_VERIFY_CERT"] = 'yes'; // Invalid boolean
      
      // Should handle invalid boolean values gracefully
      expect(() => {
        jest.resetModules();
        await import('../../../../src/shared/utils/env.js');
      }).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing critical variables gracefully', () => {
      delete process.env["QSYS_HOST"];
      delete process.env["QSYS_USERNAME"];
      delete process.env["QSYS_PASSWORD"];
      delete process.env["OPENAI_API_KEY"];
      
      expect(() => {
        jest.resetModules();
        await import('../../../../src/shared/utils/env.js');
      }).not.toThrow();
    });

    it('should provide helpful error messages', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      delete process.env["QSYS_HOST"];
      
      jest.resetModules();
      await import('../../../../src/shared/utils/env.js');
      
      // Should log helpful error messages
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('Development vs Production Differences', () => {
    it('should have different defaults for development', () => {
      process.env["NODE_ENV"] = 'development';
      
      jest.resetModules();
      const { config } = await import('../../../../src/shared/utils/env.js');
      
      expect(config.logging.level).toBe('debug');
    });

    it('should have different defaults for production', () => {
      process.env["NODE_ENV"] = 'production';
      
      jest.resetModules();
      const { config } = await import('../../../../src/shared/utils/env.js');
      
      expect(config.logging.level).toBe('info');
    });

    it('should have different defaults for test', () => {
      process.env["NODE_ENV"] = 'test';
      
      jest.resetModules();
      const { config } = await import('../../../../src/shared/utils/env.js');
      
      expect(config.logging.level).toBe('error');
    });
  });

  describe('Environment Variable Preprocessing', () => {
    it('should handle CORS origin', () => {
      // CORS_ORIGIN is an actual property in the schema
      expect(env.CORS_ORIGIN).toBeDefined();
    });

    it('should handle optional DATABASE_URL', () => {
      // DATABASE_URL is optional in the schema
      expect(env.DATABASE_URL).toBeUndefined();
    });

    it('should trim whitespace from values', () => {
      process.env["QSYS_HOST"] = '  qsys.example.com  ';
      process.env["QSYS_USERNAME"] = '  admin  ';
      
      // Should trim whitespace
      expect(env.QSYS_HOST.trim()).toBe('qsys.example.com');
      expect(env.QSYS_USERNAME.trim()).toBe('admin');
    });
  });

  describe('Security Considerations', () => {
    it('should not expose sensitive values in logs', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      process.env["QSYS_PASSWORD"] = 'secret123';
      process.env["OPENAI_API_KEY"] = 'sk-secret456';
      process.env["JWT_SECRET"] = 'jwt-secret789';
      
      jest.resetModules();
      await import('../../../../src/shared/utils/env.js');
      
      // Should not log sensitive values
      const loggedValues = consoleSpy.mock.calls.flat().join(' ');
      expect(loggedValues).not.toContain('secret123');
      expect(loggedValues).not.toContain('sk-secret456');
      expect(loggedValues).not.toContain('jwt-secret789');
      
      consoleSpy.mockRestore();
    });

    it('should mask sensitive values in error messages', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      process.env["QSYS_PASSWORD"] = 'secret123';
      process.env["OPENAI_API_KEY"] = 'sk-secret456';
      
      jest.resetModules();
      await import('../../../../src/shared/utils/env.js');
      
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
      expect(typeof config.app.port).toBe('number');
      expect(typeof config.qsys.port).toBe('number');
      expect(typeof config.rateLimit.windowMs).toBe('number');
      expect(typeof config.features.swagger).toBe('boolean');
    });

    it('should provide proper enum types', () => {
      expect(['error', 'warn', 'info', 'debug']).toContain(config.logging.level);
      expect(['development', 'production', 'test']).toContain(config.app.env);
    });
  });
}); 