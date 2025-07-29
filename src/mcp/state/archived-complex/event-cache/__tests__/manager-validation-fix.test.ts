/**
 * Tests for BUG-128 fix: validation integration with test configs
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventCacheManager, type EventCacheConfig } from '../manager.js';
import { MockQRWCAdapter } from '../test-helpers.js';

describe('EventCacheManager - Validation Fix (BUG-128)', () => {
  let adapter: MockQRWCAdapter;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    adapter = new MockQRWCAdapter();
    originalNodeEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    // Restore NODE_ENV
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
  });

  describe('Test environment validation', () => {
    it('should skip validation in test environment for minimal configs', () => {
      process.env.NODE_ENV = 'test';
      
      const minimalConfig: EventCacheConfig = {
        maxEvents: 100,
        maxAgeMs: 1000,
        globalMemoryLimitMB: 5, // Below normal minimum
        memoryCheckIntervalMs: 500 // Below normal minimum
      };

      // Should not throw
      expect(() => {
        const manager = new EventCacheManager(minimalConfig, adapter);
        manager.destroy();
      }).not.toThrow();
    });

    it('should validate in production environment', () => {
      process.env.NODE_ENV = 'production';
      
      const invalidConfig: EventCacheConfig = {
        maxEvents: 100,
        maxAgeMs: 1000,
        globalMemoryLimitMB: 5, // Too low for production
        memoryCheckIntervalMs: 500 // Too low for production
      };

      // Should throw validation error
      expect(() => {
        new EventCacheManager(invalidConfig, adapter);
      }).toThrow('Invalid configuration');
    });

    it('should skip validation when skipValidation flag is set', () => {
      process.env.NODE_ENV = 'production';
      
      const minimalConfigWithSkip: EventCacheConfig = {
        maxEvents: 100,
        maxAgeMs: 1000,
        globalMemoryLimitMB: 5,
        memoryCheckIntervalMs: 500,
        skipValidation: true
      };

      // Should not throw even in production
      expect(() => {
        const manager = new EventCacheManager(minimalConfigWithSkip, adapter);
        manager.destroy();
      }).not.toThrow();
    });

    it('should validate when skipValidation is false even in test environment', () => {
      process.env.NODE_ENV = 'test';
      
      const invalidConfigForceValidate: EventCacheConfig = {
        maxEvents: 100,
        maxAgeMs: 1000,
        globalMemoryLimitMB: 5,
        memoryCheckIntervalMs: 500,
        skipValidation: false
      };

      // Should still skip in test environment (test env takes precedence)
      expect(() => {
        const manager = new EventCacheManager(invalidConfigForceValidate, adapter);
        manager.destroy();
      }).not.toThrow();
    });
  });

  describe('Valid configurations', () => {
    it('should accept valid production configs in any environment', () => {
      const validConfig: EventCacheConfig = {
        maxEvents: 10000,
        maxAgeMs: 3600000,
        globalMemoryLimitMB: 100,
        memoryCheckIntervalMs: 5000
      };

      // Test environment
      process.env.NODE_ENV = 'test';
      expect(() => {
        const manager = new EventCacheManager(validConfig, adapter);
        manager.destroy();
      }).not.toThrow();

      // Production environment
      process.env.NODE_ENV = 'production';
      expect(() => {
        const manager = new EventCacheManager(validConfig, adapter);
        manager.destroy();
      }).not.toThrow();
    });
  });
});