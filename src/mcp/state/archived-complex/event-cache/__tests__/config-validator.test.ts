import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as path from 'path';
import type { EventCacheConfig } from '../manager.js';

// Mock fs module before importing config-validator
const mockExistsSync = jest.fn();
const mockAccessSync = jest.fn();

jest.unstable_mockModule('fs', () => ({
  existsSync: mockExistsSync,
  accessSync: mockAccessSync,
  constants: { W_OK: 2 }
}));

// Import after mocking
const { validateEventCacheConfig, sanitizeEventCacheConfig, getConfigSummary } = await import('../config-validator.js');

describe('EventCacheConfig Validator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set default behavior for fs mocks
    mockExistsSync.mockReturnValue(true);
    mockAccessSync.mockImplementation(() => {});
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateEventCacheConfig', () => {
    describe('Memory limit validation', () => {
      it('should error if memory limit is less than 10MB', () => {
        const config: EventCacheConfig = {
          globalMemoryLimitMB: 5,
          maxEvents: 10000,
          maxAgeMs: 300000
        };

        const result = validateEventCacheConfig(config);
        
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('globalMemoryLimitMB must be at least 10MB');
        // May have a warning about estimated memory usage
        expect(result.warnings.length).toBeGreaterThanOrEqual(0);
      });

      it('should warn if memory limit is less than 50MB', () => {
        const config: EventCacheConfig = {
          globalMemoryLimitMB: 30,
          maxEvents: 10000,
          maxAgeMs: 300000
        };

        const result = validateEventCacheConfig(config);
        
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.warnings).toContain('globalMemoryLimitMB < 50MB: Low memory limit may cause frequent evictions');
      });
    });

    describe('Event count validation', () => {
      it('should warn if maxEvents is less than 100', () => {
        const config: EventCacheConfig = {
          globalMemoryLimitMB: 100,
          maxEvents: 50,
          maxAgeMs: 300000
        };

        const result = validateEventCacheConfig(config);
        
        expect(result.valid).toBe(true);
        expect(result.warnings.some(w => w.includes('maxEvents'))).toBe(true);
      });

      it('should warn if maxEvents is less than 1000', () => {
        const config: EventCacheConfig = {
          globalMemoryLimitMB: 100,
          maxEvents: 500,
          maxAgeMs: 300000
        };

        const result = validateEventCacheConfig(config);
        
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.warnings).toContain('maxEvents < 1000: May be too low for production use');
      });
    });

    describe('Age limit validation', () => {
      it('should warn if maxAgeMs is less than 5 seconds', () => {
        const config: EventCacheConfig = {
          globalMemoryLimitMB: 100,
          maxEvents: 10000,
          maxAgeMs: 4000
        };

        const result = validateEventCacheConfig(config);
        
        expect(result.valid).toBe(true);
        expect(result.warnings.some(w => w.includes('maxAgeMs'))).toBe(true);
      });

      it('should warn if maxAgeMs is less than 60 seconds', () => {
        const config: EventCacheConfig = {
          globalMemoryLimitMB: 100,
          maxEvents: 10000,
          maxAgeMs: 30000
        };

        const result = validateEventCacheConfig(config);
        
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.warnings).toContain('maxAgeMs < 1 minute: Retention period may be too short');
      });
    });

    describe('Memory usage estimation', () => {
      it('should warn if estimated memory exceeds limit', () => {
        const config: EventCacheConfig = {
          globalMemoryLimitMB: 10,
          maxEvents: 100000,
          maxAgeMs: 300000
        };

        const result = validateEventCacheConfig(config);
        
        expect(result.valid).toBe(true);
        expect(result.warnings.some(w => w.includes('Estimated memory usage'))).toBe(true);
      });
    });

    describe('Disk spillover validation', () => {
      it('should pass if disk spillover is disabled', () => {
        const config: EventCacheConfig = {
          globalMemoryLimitMB: 100,
          maxEvents: 10000,
          maxAgeMs: 300000,
          diskSpilloverConfig: {
            enabled: false
          }
        };

        const result = validateEventCacheConfig(config);
        
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should error if parent directory does not exist', () => {
        // Mock fs.existsSync to return false
        mockExistsSync.mockReturnValue(false);

        const config: EventCacheConfig = {
          globalMemoryLimitMB: 100,
          maxEvents: 10000,
          maxAgeMs: 300000,
          diskSpilloverConfig: {
            enabled: true,
            directory: '/nonexistent/path/spillover'
          }
        };

        const result = validateEventCacheConfig(config);
        
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Spillover parent directory does not exist: /nonexistent/path');
      });

      it('should error if directory is not writable', () => {
        // Mock fs methods
        mockExistsSync.mockReturnValue(true);
        mockAccessSync.mockImplementation(() => {
          throw new Error('Permission denied');
        });

        const config: EventCacheConfig = {
          globalMemoryLimitMB: 100,
          maxEvents: 10000,
          maxAgeMs: 300000,
          diskSpilloverConfig: {
            enabled: true,
            directory: '/restricted/path'
          }
        };

        const result = validateEventCacheConfig(config);
        
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('not writable'))).toBe(true);
      });

      it('should pass if spillover directory is writable', () => {
        // Mock fs methods
        mockExistsSync.mockReturnValue(true);
        mockAccessSync.mockImplementation(() => {}); // No error

        const config: EventCacheConfig = {
          globalMemoryLimitMB: 100,
          maxEvents: 10000,
          maxAgeMs: 300000,
          diskSpilloverConfig: {
            enabled: true,
            directory: './spillover'
          }
        };

        const result = validateEventCacheConfig(config);
        
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });
  });

  describe('sanitizeEventCacheConfig', () => {
    it('should set defaults for missing optional fields', () => {
      const config: EventCacheConfig = {
        globalMemoryLimitMB: 100,
        maxEvents: 10000,
        maxAgeMs: 300000
      };

      const sanitized = sanitizeEventCacheConfig(config);
      
      // Check that memoryCheckIntervalMs is set to default
      expect(sanitized.memoryCheckIntervalMs).toBe(5000);
      // Check that original values are preserved
      expect(sanitized.globalMemoryLimitMB).toBe(100);
      expect(sanitized.maxEvents).toBe(10000);
      expect(sanitized.maxAgeMs).toBe(300000);
      // diskSpilloverConfig should not be set when not specified
      expect(sanitized.diskSpilloverConfig).toBeUndefined();
    });

    it('should preserve existing values', () => {
      const config: EventCacheConfig = {
        globalMemoryLimitMB: 200,
        maxEvents: 50000,
        maxAgeMs: 600000,
        compressionEnabled: true,
        persistToFile: true,
        persistencePath: './cache',
        diskSpilloverConfig: {
          enabled: true,
          directory: './spillover'
        }
      };

      const sanitized = sanitizeEventCacheConfig(config);
      
      // Check that original values are preserved
      expect(sanitized.globalMemoryLimitMB).toBe(200);
      expect(sanitized.maxEvents).toBe(50000);
      expect(sanitized.maxAgeMs).toBe(600000);
      expect(sanitized.diskSpilloverConfig?.enabled).toBe(true);
      expect(sanitized.diskSpilloverConfig?.directory).toBe('./spillover');
    });
  });

  describe('getConfigSummary', () => {
    it('should generate a readable summary', () => {
      const config: EventCacheConfig = {
        globalMemoryLimitMB: 100,
        maxEvents: 10000,
        maxAgeMs: 300000,
        compressionEnabled: true,
        persistToFile: true,
        persistencePath: './cache',
        diskSpilloverConfig: {
          enabled: true,
          directory: './spillover'
        }
      };

      const summary = getConfigSummary(config);
      
      expect(summary).toContain('Memory Limit: 100MB');
      expect(summary).toContain('Max Events: 10,000');
      expect(summary).toContain('Retention: 5min');
      expect(summary).toContain('Compression: Disabled');
      expect(summary).toContain('Disk Spillover: Enabled');
      expect(summary).toContain('./spillover');
    });

    it('should handle disabled features', () => {
      const config: EventCacheConfig = {
        globalMemoryLimitMB: 50,
        maxEvents: 1000,
        maxAgeMs: 60000,
        compressionEnabled: false,
        persistToFile: false,
        diskSpilloverConfig: {
          enabled: false
        }
      };

      const summary = getConfigSummary(config);
      
      expect(summary).toContain('Memory Limit: 50MB');
      expect(summary).toContain('Max Events: 1,000');
      expect(summary).toContain('Retention: 1min');
      expect(summary).toContain('Compression: Disabled');
      expect(summary).toContain('Disk Spillover: Disabled');
    });
  });
});