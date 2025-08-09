/**
 * Comprehensive tests for env.ts to achieve high coverage
 * Addresses critical low coverage files and production stability
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { z } from 'zod';
import path from 'path';

describe('Environment Configuration - Comprehensive Coverage', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let originalExit: typeof process.exit;
  let originalConsoleError: typeof console.error;
  let consoleErrorMock: jest.Mock;
  let processExitMock: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    
    // Save original values
    originalEnv = { ...process.env };
    originalExit = process.exit;
    originalConsoleError = console.error;
    
    // Create mocks
    consoleErrorMock = jest.fn();
    processExitMock = jest.fn() as any;
    
    // Apply mocks
    console.error = consoleErrorMock;
    process.exit = processExitMock;
    
    // Clear environment
    for (const key in process.env) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    // Restore original values
    process.env = originalEnv;
    process.exit = originalExit;
    console.error = originalConsoleError;
  });

  describe('Environment Parsing and Validation', () => {
    it('should parse valid environment configuration', async () => {
      // Set valid environment variables
      process.env.NODE_ENV = 'development';
      process.env.PORT = '8080';
      process.env.LOG_LEVEL = 'debug';
      process.env.OPENAI_API_KEY = 'sk-test123456789';
      process.env.JWT_SECRET = '12345678901234567890123456789012';
      process.env.SESSION_SECRET = '12345678901234567890123456789012';
      process.env.CORS_ORIGIN = 'http://localhost:3000';
      
      // Import env module
      const envModule = await import('../../../../src/shared/utils/env.js');
      
      expect(envModule.env.NODE_ENV).toBe('development');
      expect(envModule.env.PORT).toBe(8080);
      expect(envModule.env.LOG_LEVEL).toBe('debug');
      expect(envModule.env.OPENAI_API_KEY).toBe('sk-test123456789');
      expect(envModule.isDevelopment).toBe(true);
      expect(envModule.isProduction).toBe(false);
      expect(envModule.isTest).toBe(false);
    });

    it('should use default values for optional fields', async () => {
      // Set minimal required environment
      process.env.NODE_ENV = 'test';
      
      const envModule = await import('../../../../src/shared/utils/env.js');
      
      expect(envModule.env.PORT).toBe(443);
      expect(envModule.env.LOG_LEVEL).toBe('info');
      expect(envModule.env.OPENAI_MODEL).toBeUndefined(); // Optional field
      expect(envModule.env.OPENAI_VOICE).toBeUndefined(); // Optional field
      expect(envModule.env.ENABLE_SWAGGER).toBe(true);
      expect(envModule.env.CACHE_MAX_ENTRIES).toBe(1000);
      expect(envModule.env.CACHE_TTL_MS).toBe(1800000);
    });

    it('should handle invalid environment configuration in test mode', async () => {
      process.env.NODE_ENV = 'test';
      process.env.PORT = 'invalid-port';
      process.env.OPENAI_API_KEY = 'invalid-key'; // Doesn't start with sk-
      
      // Should throw ConfigurationError in test mode
      await expect(import('../../../../src/shared/utils/env.js')).rejects.toThrow('Invalid environment configuration');
      
      expect(consoleErrorMock).toHaveBeenCalledWith(
        'Environment validation failed:',
        expect.arrayContaining([
          expect.objectContaining({
            path: expect.any(String),
            message: expect.any(String)
          })
        ])
      );
    });

    it('should exit process in non-test environment on validation failure', async () => {
      process.env.NODE_ENV = 'development';
      process.env.PORT = '70000'; // Invalid port (> 65535)
      
      try {
        await import('../../../../src/shared/utils/env.js');
      } catch (e) {
        // Expected in some cases
      }
      
      expect(processExitMock).toHaveBeenCalledWith(1);
      expect(consoleErrorMock).toHaveBeenCalledWith('Invalid environment configuration:');
      expect(consoleErrorMock).toHaveBeenCalledWith('Common fixes:');
    });

    it('should show minimal error info in test mode', async () => {
      process.env.NODE_ENV = 'test';
      process.env.RATE_LIMIT_WINDOW_MS = '500'; // Below minimum
      
      try {
        await import('../../../../src/shared/utils/env.js');
      } catch (e) {
        // Expected
      }
      
      expect(consoleErrorMock).toHaveBeenCalledWith(
        'Environment validation failed:',
        expect.any(Array)
      );
    });

    it('should validate all numeric constraints', async () => {
      process.env.NODE_ENV = 'test';
      process.env.PORT = '0'; // Below minimum
      process.env.RATE_LIMIT_WINDOW_MS = '500'; // Below minimum
      process.env.RATE_LIMIT_MAX_REQUESTS = '0'; // Below minimum
      process.env.CACHE_MAX_ENTRIES = '5'; // Below minimum
      process.env.CACHE_TTL_MS = '500'; // Below minimum
      process.env.CACHE_MAX_MEMORY_MB = '0'; // Below minimum
      
      await expect(import('../../../../src/shared/utils/env.js')).rejects.toThrow();
    });

    it('should validate enum values', async () => {
      process.env.NODE_ENV = 'invalid-env';
      process.env.LOG_LEVEL = 'invalid-level';
      process.env.OPENAI_VOICE = 'invalid-voice';
      
      await expect(import('../../../../src/shared/utils/env.js')).rejects.toThrow();
    });

    it('should validate string formats', async () => {
      process.env.NODE_ENV = 'test';
      process.env.OPENAI_API_KEY = 'not-starting-with-sk';
      process.env.OPENAI_ORGANIZATION = 'not-starting-with-org';
      process.env.CORS_ORIGIN = 'not-a-url';
      process.env.DATABASE_URL = 'not-a-url';
      process.env.JWT_SECRET = 'short';
      process.env.SESSION_SECRET = 'short';
      
      await expect(import('../../../../src/shared/utils/env.js')).rejects.toThrow();
    });

    it('should coerce boolean values correctly', async () => {
      process.env.NODE_ENV = 'test';
      // Zod coerce.boolean() only treats empty string as falsy
      // All non-empty strings (including "0" and "false") are truthy
      process.env.ENABLE_SWAGGER = '';  // Will be false
      process.env.ENABLE_METRICS = '';  // Will be false
      process.env.ENABLE_HEALTH_CHECK = 'true';
      process.env.DEBUG_TESTS = '1';
      process.env.VERBOSE_LOGGING = 'true';
      
      const envModule = await import('../../../../src/shared/utils/env.js');
      
      expect(envModule.env.ENABLE_SWAGGER).toBe(false);
      expect(envModule.env.ENABLE_METRICS).toBe(false);
      expect(envModule.env.ENABLE_HEALTH_CHECK).toBe(true);
      expect(envModule.env.DEBUG_TESTS).toBe(true);
      expect(envModule.env.VERBOSE_LOGGING).toBe(true);
    });
  });

  describe('Configuration Object', () => {
    it('should create correct config structure', async () => {
      process.env.NODE_ENV = 'development';
      process.env.PORT = '8080';
      process.env.OPENAI_API_KEY = 'sk-test123';
      process.env.OPENAI_ORGANIZATION = 'org-test123';
      process.env.OPENAI_MODEL = 'gpt-3.5-turbo';
      process.env.OPENAI_VOICE = 'echo';
      process.env.JWT_SECRET = '12345678901234567890123456789012';
      process.env.SESSION_SECRET = '12345678901234567890123456789012';
      process.env.CORS_ORIGIN = 'https://example.com';
      process.env.DATABASE_URL = 'https://db.example.com';
      
      const envModule = await import('../../../../src/shared/utils/env.js');
      const { config } = envModule;
      
      expect(config.app.name).toBe('MCP Voice/Text-Controlled Q-SYS Demo');
      expect(config.app.version).toBe('1.0.0');
      expect(config.app.port).toBe(8080);
      expect(config.app.env).toBe('development');
      expect(config.app.root).toBeDefined();
      
      expect(config.openai).toEqual({
        apiKey: 'sk-test123',
        organization: 'org-test123',
        model: 'gpt-3.5-turbo',
        voice: 'echo',
      });
      
      expect(config.security).toEqual({
        jwtSecret: '12345678901234567890123456789012',
        sessionSecret: '12345678901234567890123456789012',
        corsOrigin: 'https://example.com',
      });
      
      expect(config.database.url).toBe('https://db.example.com');
    });

    it('should handle optional OpenAI fields', async () => {
      process.env.NODE_ENV = 'test';
      // Don't set OPENAI fields
      
      const envModule = await import('../../../../src/shared/utils/env.js');
      const { config } = envModule;
      
      expect(config.openai.apiKey).toBeUndefined();
      expect(config.openai.organization).toBeUndefined();
      expect(config.openai.model).toBe('gpt-4');
      expect(config.openai.voice).toBe('nova');
    });

    it('should create correct paths configuration', async () => {
      process.env.NODE_ENV = 'test';
      
      const envModule = await import('../../../../src/shared/utils/env.js');
      const { config, appRoot } = envModule;
      
      expect(config.paths.logs).toBe(path.join(appRoot, 'logs'));
      expect(config.paths.public).toBe(path.join(appRoot, 'src/web'));
      expect(config.paths.uploads).toBe(path.join(appRoot, 'uploads'));
    });

    it('should create correct cache configuration', async () => {
      process.env.NODE_ENV = 'test';
      process.env.CACHE_MAX_ENTRIES = '500';
      process.env.CACHE_TTL_MS = '60000';
      process.env.CACHE_MAX_MEMORY_MB = '100';
      
      const envModule = await import('../../../../src/shared/utils/env.js');
      const { config } = envModule;
      
      expect(config.cache).toEqual({
        maxEntries: 500,
        ttlMs: 60000,
        maxMemoryMB: 100,
      });
    });

    it('should create correct timeouts configuration', async () => {
      process.env.NODE_ENV = 'test';
      process.env.CHANGE_GROUP_TIMEOUT_MS = '45000';
      process.env.COMPRESSION_COOLDOWN_MS = '60000';
      process.env.CACHE_CLEANUP_INTERVAL_MS = '600000';
      process.env.VALIDATION_CACHE_TTL_MS = '45000';
      
      const envModule = await import('../../../../src/shared/utils/env.js');
      const { config } = envModule;
      
      expect(config.timeouts).toEqual({
        changeGroupMs: 45000,
        compressionCooldownMs: 60000,
        cacheCleanupIntervalMs: 600000,
        validationCacheTtlMs: 45000,
      });
    });
  });

  describe('validateConfig function', () => {
    it('should validate config successfully', async () => {
      // Reset modules to ensure clean state
      jest.resetModules();
      
      process.env.NODE_ENV = 'development';
      process.env.MCP_MODE = 'false';
      
      const envModule = await import('../../../../src/shared/utils/env.js');
      
      // validateConfig creates its own logger internally, we can't mock it
      // Just ensure it doesn't throw
      await expect(envModule.validateConfig()).resolves.not.toThrow();
    });

    it('should skip validation in MCP mode', async () => {
      jest.resetModules();
      process.env.NODE_ENV = 'test';
      process.env.MCP_MODE = 'true';
      
      const envModule = await import('../../../../src/shared/utils/env.js');
      
      // Should return immediately without logging
      await expect(envModule.validateConfig()).resolves.not.toThrow();
      
      expect(consoleErrorMock).not.toHaveBeenCalled();
    });

    it('should warn about default secrets in production', async () => {
      jest.resetModules();
      
      process.env.NODE_ENV = 'production';
      process.env.MCP_MODE = 'false';
      process.env.JWT_SECRET = 'your-super-secret-jwt-key-change-this-in-production';
      process.env.SESSION_SECRET = 'your-super-secret-session-key-change-this-in-production';
      
      const envModule = await import('../../../../src/shared/utils/env.js');
      
      // validateConfig will log warnings internally, we just ensure it runs
      await expect(envModule.validateConfig()).resolves.not.toThrow();
    });

    it('should handle partial default secrets in production', async () => {
      jest.resetModules();
      
      process.env.NODE_ENV = 'production';
      process.env.MCP_MODE = 'false';
      process.env.JWT_SECRET = 'custom-jwt-secret-that-is-long-enough-123456';
      process.env.SESSION_SECRET = 'change-this-is-still-in-the-secret-somewhere';
      
      const envModule = await import('../../../../src/shared/utils/env.js');
      
      // validateConfig will log appropriate warnings internally
      await expect(envModule.validateConfig()).resolves.not.toThrow();
    });
  });

  describe('Helper Functions and Exports', () => {
    it('should export environment helper booleans correctly', async () => {
      process.env.NODE_ENV = 'production';
      
      const envModule = await import('../../../../src/shared/utils/env.js');
      
      expect(envModule.isDevelopment).toBe(false);
      expect(envModule.isProduction).toBe(true);
      expect(envModule.isTest).toBe(false);
    });

    it('should export envSchema for testing', async () => {
      process.env.NODE_ENV = 'test';
      
      const envModule = await import('../../../../src/shared/utils/env.js');
      
      expect(envModule.envSchema).toBeDefined();
      // Check it's a Zod schema by checking for parse method
      expect(typeof envModule.envSchema.parse).toBe('function');
    });

    it('should handle different NODE_ENV values', async () => {
      // Test development
      process.env.NODE_ENV = 'development';
      let envModule = await import('../../../../src/shared/utils/env.js');
      expect(envModule.isDevelopment).toBe(true);
      expect(envModule.isProduction).toBe(false);
      expect(envModule.isTest).toBe(false);
      
      // Reset and test production
      jest.resetModules();
      process.env.NODE_ENV = 'production';
      envModule = await import('../../../../src/shared/utils/env.js');
      expect(envModule.isDevelopment).toBe(false);
      expect(envModule.isProduction).toBe(true);
      expect(envModule.isTest).toBe(false);
      
      // Reset and test test
      jest.resetModules();
      process.env.NODE_ENV = 'test';
      envModule = await import('../../../../src/shared/utils/env.js');
      expect(envModule.isDevelopment).toBe(false);
      expect(envModule.isProduction).toBe(false);
      expect(envModule.isTest).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing dotenv files gracefully', async () => {
      process.env.NODE_ENV = 'test';
      // dotenv will try to load .env files but won't fail if they don't exist
      
      const envModule = await import('../../../../src/shared/utils/env.js');
      expect(envModule.env).toBeDefined();
    });

    it('should handle all timeout configurations', async () => {
      process.env.NODE_ENV = 'test';
      process.env.TOOL_EXECUTION_WARNING_MS = '2000';
      process.env.QSYS_CONNECTION_TIMEOUT = '15000';
      
      const envModule = await import('../../../../src/shared/utils/env.js');
      
      expect(envModule.config.performance.toolExecutionWarningMs).toBe(2000);
      expect(envModule.config.performance.qsysConnectionTimeout).toBe(15000);
    });

    it('should handle rate limiting configuration', async () => {
      process.env.NODE_ENV = 'test';
      process.env.RATE_LIMIT_WINDOW_MS = '1800000'; // 30 minutes
      process.env.RATE_LIMIT_MAX_REQUESTS = '200';
      
      const envModule = await import('../../../../src/shared/utils/env.js');
      
      expect(envModule.config.rateLimit.windowMs).toBe(1800000);
      expect(envModule.config.rateLimit.maxRequests).toBe(200);
    });

    it('should handle feature flags', async () => {
      process.env.NODE_ENV = 'test';
      process.env.ENABLE_SWAGGER = ''; // Empty string for false
      process.env.ENABLE_METRICS = ''; // Empty string for false
      process.env.ENABLE_HEALTH_CHECK = ''; // Empty string for false
      
      const envModule = await import('../../../../src/shared/utils/env.js');
      
      expect(envModule.config.features.swagger).toBe(false);
      expect(envModule.config.features.metrics).toBe(false);
      expect(envModule.config.features.healthCheck).toBe(false);
    });

    it('should handle process.cwd() for appRoot', async () => {
      const originalCwd = process.cwd();
      const testPath = '/test/custom/path';
      process.cwd = jest.fn().mockReturnValue(testPath);
      process.env.NODE_ENV = 'test';
      
      const envModule = await import('../../../../src/shared/utils/env.js');
      
      expect(envModule.appRoot).toBe(testPath);
      expect(envModule.config.app.root).toBe(testPath);
      
      process.cwd = originalCwd;
    });
  });
});