import * as fs from 'fs';
import * as path from 'path';
import { validateEventCacheConfig, sanitizeEventCacheConfig, getConfigSummary } from '../config-validator';
import type { EventCacheConfig } from '../manager';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('EventCacheConfig Validator', () => {
  beforeEach(() => {
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

      it('should pass without warnings for adequate memory', () => {
        const config: EventCacheConfig = {
          globalMemoryLimitMB: 100,
          maxEvents: 10000,
          maxAgeMs: 300000
        };

        const result = validateEventCacheConfig(config);
        
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);
      });
    });

    describe('Event limit validation', () => {
      it('should warn if maxEvents is less than 1000', () => {
        const config: EventCacheConfig = {
          globalMemoryLimitMB: 100,
          maxEvents: 500,
          maxAgeMs: 300000
        };

        const result = validateEventCacheConfig(config);
        
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain('maxEvents < 1000: May be too low for production use');
      });

      it('should warn if maxEvents is greater than 1 million', () => {
        const config: EventCacheConfig = {
          globalMemoryLimitMB: 1000,
          maxEvents: 2000000,
          maxAgeMs: 300000
        };

        const result = validateEventCacheConfig(config);
        
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain('maxEvents > 1,000,000: May cause memory issues');
      });

      it('should pass without warnings for reasonable event limits', () => {
        const config: EventCacheConfig = {
          globalMemoryLimitMB: 100,
          maxEvents: 50000,
          maxAgeMs: 300000
        };

        const result = validateEventCacheConfig(config);
        
        expect(result.valid).toBe(true);
        expect(result.warnings).toHaveLength(0);
      });
    });

    describe('Retention validation', () => {
      it('should warn if retention is less than 1 minute', () => {
        const config: EventCacheConfig = {
          globalMemoryLimitMB: 100,
          maxEvents: 10000,
          maxAgeMs: 30000 // 30 seconds
        };

        const result = validateEventCacheConfig(config);
        
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain('maxAgeMs < 1 minute: Retention period may be too short');
      });

      it('should warn if retention is greater than 24 hours', () => {
        const config: EventCacheConfig = {
          globalMemoryLimitMB: 100,
          maxEvents: 10000,
          maxAgeMs: 90000000 // 25 hours
        };

        const result = validateEventCacheConfig(config);
        
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain('maxAgeMs > 24 hours: May use excessive memory');
      });

      it('should pass without warnings for reasonable retention', () => {
        const config: EventCacheConfig = {
          globalMemoryLimitMB: 100,
          maxEvents: 10000,
          maxAgeMs: 3600000 // 1 hour
        };

        const result = validateEventCacheConfig(config);
        
        expect(result.valid).toBe(true);
        expect(result.warnings).toHaveLength(0);
      });
    });

    describe('Disk spillover validation', () => {
      it('should error if disk spillover is enabled without directory', () => {
        const config: EventCacheConfig = {
          globalMemoryLimitMB: 100,
          maxEvents: 10000,
          maxAgeMs: 300000,
          diskSpilloverConfig: {
            enabled: true,
            directory: ''
          }
        };

        const result = validateEventCacheConfig(config);
        
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Disk spillover enabled but no directory specified');
      });

      it('should error if parent directory does not exist', () => {
        mockFs.existsSync.mockReturnValue(false);

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
        mockFs.existsSync.mockReturnValue(true);
        mockFs.accessSync.mockImplementation(() => {
          throw new Error('Permission denied');
        });

        const config: EventCacheConfig = {
          globalMemoryLimitMB: 100,
          maxEvents: 10000,
          maxAgeMs: 300000,
          diskSpilloverConfig: {
            enabled: true,
            directory: '/readonly/spillover'
          }
        };

        const result = validateEventCacheConfig(config);
        
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Spillover directory not writable: /readonly');
      });

      it('should warn if spillover directory will be created', () => {
        mockFs.existsSync.mockImplementation((p) => {
          // Parent exists, but not the actual directory
          return p === path.dirname('./spillover');
        });
        mockFs.accessSync.mockImplementation(() => {
          // No error - writable
        });

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
        expect(result.warnings).toContain('Spillover directory will be created: ./spillover');
      });

      it('should validate threshold MB', () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.accessSync.mockImplementation(() => {});

        // Test invalid range
        let config: EventCacheConfig = {
          globalMemoryLimitMB: 100,
          maxEvents: 10000,
          maxAgeMs: 300000,
          diskSpilloverConfig: {
            enabled: true,
            directory: './spillover',
            thresholdMB: 5
          }
        };

        let result = validateEventCacheConfig(config);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Spillover thresholdMB must be at least 10MB');

        // Test low threshold warning
        config.diskSpilloverConfig!.thresholdMB = 50;
        result = validateEventCacheConfig(config);
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain('Spillover thresholdMB < 100MB: May cause frequent disk writes');

        // Test high threshold warning
        config.diskSpilloverConfig!.thresholdMB = 91;
        result = validateEventCacheConfig(config);
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain('Spillover thresholdMB > 90% of memory limit: May not leave enough headroom');
      });

      it('should validate file size limits', () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.accessSync.mockImplementation(() => {});

        // Test too small
        let config: EventCacheConfig = {
          globalMemoryLimitMB: 100,
          maxEvents: 10000,
          maxAgeMs: 300000,
          diskSpilloverConfig: {
            enabled: true,
            directory: './spillover',
            maxFileSizeMB: 0.5
          }
        };

        let result = validateEventCacheConfig(config);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Spillover maxFileSizeMB must be at least 1MB');

        // Test small warning
        config.diskSpilloverConfig!.maxFileSizeMB = 5;
        result = validateEventCacheConfig(config);
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain('Spillover maxFileSizeMB < 10MB: May create many small files');

        // Test large warning
        config.diskSpilloverConfig!.maxFileSizeMB = 2000;
        result = validateEventCacheConfig(config);
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain('Spillover maxFileSizeMB > 1GB: Large files may impact performance');
      });
    });

    describe('Compression validation', () => {
      it('should validate compression window settings', () => {
        // Test negative window
        let config: EventCacheConfig = {
          globalMemoryLimitMB: 100,
          maxEvents: 10000,
          maxAgeMs: 300000,
          compressionConfig: {
            enabled: true,
            recentWindowMs: 500
          }
        };

        let result = validateEventCacheConfig(config);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Compression recentWindowMs must be at least 1 second');

        // Test low medium window warning
        config.compressionConfig!.recentWindowMs = 5000;
        config.compressionConfig!.mediumWindowMs = 30000; // 30 seconds
        result = validateEventCacheConfig(config);
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain('Compression mediumWindowMs < 1 minute: May compress events too quickly');
      });

      it('should validate compression significant change percent', () => {
        // Test invalid percent
        let config: EventCacheConfig = {
          globalMemoryLimitMB: 100,
          maxEvents: 10000,
          maxAgeMs: 300000,
          compressionConfig: {
            enabled: true,
            significantChangePercent: 150
          }
        };

        let result = validateEventCacheConfig(config);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Compression significantChangePercent must be between 0 and 100');

        // Valid percent should pass
        config.compressionConfig!.significantChangePercent = 10;
        result = validateEventCacheConfig(config);
        expect(result.valid).toBe(true);
        expect(result.warnings).toHaveLength(0);
      });
    });

    describe('Memory check interval validation', () => {
      it('should error if interval is less than 1 second', () => {
        const config: EventCacheConfig = {
          globalMemoryLimitMB: 100,
          maxEvents: 10000,
          maxAgeMs: 300000,
          memoryCheckIntervalMs: 500
        };

        const result = validateEventCacheConfig(config);
        
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('memoryCheckIntervalMs must be at least 1000ms (1 second)');
      });

      it('should warn about performance impact', () => {
        let config: EventCacheConfig = {
          globalMemoryLimitMB: 100,
          maxEvents: 10000,
          maxAgeMs: 300000,
          memoryCheckIntervalMs: 2000
        };

        let result = validateEventCacheConfig(config);
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain('memoryCheckIntervalMs < 5s: Frequent checks may impact performance');

        config.memoryCheckIntervalMs = 120000; // 2 minutes
        result = validateEventCacheConfig(config);
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain('memoryCheckIntervalMs > 1min: Infrequent checks may delay memory management');
      });
    });

    describe('Cross-validation checks', () => {
      it('should warn when compression window exceeds half retention', () => {
        const config: EventCacheConfig = {
          globalMemoryLimitMB: 100,
          maxEvents: 10000,
          maxAgeMs: 120000, // 2 minutes
          compressionConfig: {
            enabled: true,
            recentWindowMs: 90000 // 1.5 minutes
          },
          diskSpilloverConfig: {
            enabled: true,
            directory: './spillover'
          }
        };

        mockFs.existsSync.mockReturnValue(true);
        mockFs.accessSync.mockImplementation(() => {});

        const result = validateEventCacheConfig(config);
        
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain('Compression recentWindowMs > half of maxAgeMs: Events may be evicted before compression');
      });

      it('should warn when estimated memory usage approaches limit', () => {
        const config: EventCacheConfig = {
          globalMemoryLimitMB: 50,
          maxEvents: 50000, // ~50MB estimated
          maxAgeMs: 300000
        };

        const result = validateEventCacheConfig(config);
        
        expect(result.valid).toBe(true);
        expect(result.warnings.some(w => w.includes('Estimated memory usage'))).toBe(true);
      });
    });
  });

  describe('sanitizeEventCacheConfig', () => {
    it('should apply default values', () => {
      const config = sanitizeEventCacheConfig({});
      
      expect(config.maxEvents).toBe(100000);
      expect(config.maxAgeMs).toBe(3600000);
      expect(config.globalMemoryLimitMB).toBe(500);
      expect(config.memoryCheckIntervalMs).toBe(5000);
      expect(config.compressionConfig).toBeUndefined();
      expect(config.diskSpilloverConfig).toBeUndefined();
    });

    it('should merge partial config with defaults', () => {
      const config = sanitizeEventCacheConfig({
        maxEvents: 50000,
        compressionConfig: {
          enabled: true
        }
      });
      
      expect(config.maxEvents).toBe(50000);
      expect(config.maxAgeMs).toBe(3600000); // default
      expect(config.compressionConfig?.enabled).toBe(true);
      expect(config.compressionConfig?.recentWindowMs).toBe(300000); // default
    });

    it('should preserve provided values and merge with defaults', () => {
      const input: Partial<EventCacheConfig> = {
        maxEvents: 25000,
        maxAgeMs: 180000,
        globalMemoryLimitMB: 200,
        memoryCheckIntervalMs: 10000,
        compressionConfig: {
          enabled: true,
          recentWindowMs: 30000,
          significantChangePercent: 25
        },
        diskSpilloverConfig: {
          enabled: true,
          directory: '/custom/path',
          thresholdMB: 70,
          maxFileSizeMB: 50
        }
      };

      const config = sanitizeEventCacheConfig(input);
      
      // Check provided values are preserved
      expect(config.maxEvents).toBe(25000);
      expect(config.maxAgeMs).toBe(180000);
      expect(config.globalMemoryLimitMB).toBe(200);
      expect(config.memoryCheckIntervalMs).toBe(10000);
      expect(config.compressionConfig?.enabled).toBe(true);
      expect(config.compressionConfig?.recentWindowMs).toBe(30000);
      expect(config.diskSpilloverConfig?.enabled).toBe(true);
      expect(config.diskSpilloverConfig?.directory).toBe('/custom/path');
      expect(config.diskSpilloverConfig?.thresholdMB).toBe(70);
    });
  });

  describe('getConfigSummary', () => {
    it('should format basic configuration', () => {
      const config: EventCacheConfig = {
        globalMemoryLimitMB: 100,
        maxEvents: 50000,
        maxAgeMs: 3600000,
        memoryCheckIntervalMs: 5000
      };

      const summary = getConfigSummary(config);
      
      expect(summary).toContain('Memory Limit: 100MB');
      expect(summary).toContain('Max Events: 50,000');
      expect(summary).toContain('Retention: 1h');
      expect(summary).toContain('Memory Check Interval: 5s');
      expect(summary).toContain('Compression: Disabled');
      expect(summary).toContain('Disk Spillover: Disabled');
    });

    it('should include compression details when enabled', () => {
      const config: EventCacheConfig = {
        globalMemoryLimitMB: 100,
        maxEvents: 50000,
        maxAgeMs: 3600000,
        compressionConfig: {
          enabled: true,
          recentWindowMs: 120000,
          checkIntervalMs: 60000
        }
      };

      const summary = getConfigSummary(config);
      
      expect(summary).toContain('Compression: Enabled');
      expect(summary).toContain('Recent Window: 2min');
      expect(summary).toContain('Check Interval: 1min');
    });

    it('should include spillover details when enabled', () => {
      const config: EventCacheConfig = {
        globalMemoryLimitMB: 100,
        maxEvents: 50000,
        maxAgeMs: 3600000,
        diskSpilloverConfig: {
          enabled: true,
          directory: '/var/cache/events',
          thresholdMB: 75,
          maxFileSizeMB: 200
        }
      };

      const summary = getConfigSummary(config);
      
      expect(summary).toContain('Disk Spillover: Enabled');
      expect(summary).toContain('Directory: /var/cache/events');
      expect(summary).toContain('Threshold: 75MB');
      expect(summary).toContain('Max File Size: 200MB');
    });

    it('should format durations correctly', () => {
      const config: EventCacheConfig = {
        globalMemoryLimitMB: 100,
        maxEvents: 50000,
        maxAgeMs: 45000, // 45 seconds
        memoryCheckIntervalMs: 500 // 500ms
      };

      const summary = getConfigSummary(config);
      
      expect(summary).toContain('Retention: 45s');
      expect(summary).toContain('Memory Check Interval: 500ms');
    });
  });
});