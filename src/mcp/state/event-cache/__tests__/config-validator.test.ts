import * as fs from 'fs';
import * as path from 'path';
import { validateEventCacheConfig, sanitizeEventCacheConfig, getConfigSummary } from '../config-validator';
import { EventCacheConfig } from '../types';

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

      it('should validate threshold percent', () => {
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
            thresholdPercent: 150
          }
        };

        let result = validateEventCacheConfig(config);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Spillover thresholdPercent must be between 0 and 100');

        // Test low threshold warning
        config.diskSpilloverConfig!.thresholdPercent = 30;
        result = validateEventCacheConfig(config);
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain('Spillover thresholdPercent < 50%: May cause premature disk writes');

        // Test high threshold warning
        config.diskSpilloverConfig!.thresholdPercent = 95;
        result = validateEventCacheConfig(config);
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain('Spillover thresholdPercent > 90%: May not leave enough memory headroom');
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
      it('should validate compression age settings', () => {
        // Test negative age
        let config: EventCacheConfig = {
          globalMemoryLimitMB: 100,
          maxEvents: 10000,
          maxAgeMs: 300000,
          compressionConfig: {
            enabled: true,
            minAgeMs: -1000
          }
        };

        let result = validateEventCacheConfig(config);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Compression minAgeMs cannot be negative');

        // Test low age warning
        config.compressionConfig!.minAgeMs = 15000; // 15 seconds
        result = validateEventCacheConfig(config);
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain('Compression minAgeMs < 30s: May impact performance with frequent compressions');
      });

      it('should validate compression ratio', () => {
        // Test invalid ratio
        let config: EventCacheConfig = {
          globalMemoryLimitMB: 100,
          maxEvents: 10000,
          maxAgeMs: 300000,
          compressionConfig: {
            enabled: true,
            compressionRatio: 1.5
          }
        };

        let result = validateEventCacheConfig(config);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Compression ratio must be between 0 and 1');

        // Test aggressive compression warning
        config.compressionConfig!.compressionRatio = 0.1;
        result = validateEventCacheConfig(config);
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain('Compression ratio < 0.2: Aggressive compression may impact query performance');

        // Test ineffective compression warning
        config.compressionConfig!.compressionRatio = 0.9;
        result = validateEventCacheConfig(config);
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain('Compression ratio > 0.8: May not provide significant space savings');
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
      it('should warn when compression age exceeds half retention', () => {
        const config: EventCacheConfig = {
          globalMemoryLimitMB: 100,
          maxEvents: 10000,
          maxAgeMs: 120000, // 2 minutes
          compressionConfig: {
            enabled: true,
            minAgeMs: 90000 // 1.5 minutes
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
        expect(result.warnings).toContain('Compression minAgeMs > half of maxAgeMs: Events may be evicted before compression');
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
      expect(config.compressionConfig?.enabled).toBe(false);
      expect(config.diskSpilloverConfig?.enabled).toBe(false);
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
      expect(config.compressionConfig?.minAgeMs).toBe(60000); // default
    });

    it('should preserve all provided values', () => {
      const input: Partial<EventCacheConfig> = {
        maxEvents: 25000,
        maxAgeMs: 180000,
        globalMemoryLimitMB: 200,
        memoryCheckIntervalMs: 10000,
        compressionConfig: {
          enabled: true,
          minAgeMs: 30000,
          compressionRatio: 0.3
        },
        diskSpilloverConfig: {
          enabled: true,
          directory: '/custom/path',
          thresholdPercent: 70,
          maxFileSizeMB: 50
        }
      };

      const config = sanitizeEventCacheConfig(input);
      
      expect(config).toEqual(input);
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
          minAgeMs: 120000,
          compressionRatio: 0.4
        }
      };

      const summary = getConfigSummary(config);
      
      expect(summary).toContain('Compression: Enabled');
      expect(summary).toContain('Min Age: 2min');
      expect(summary).toContain('Target Ratio: 40%');
    });

    it('should include spillover details when enabled', () => {
      const config: EventCacheConfig = {
        globalMemoryLimitMB: 100,
        maxEvents: 50000,
        maxAgeMs: 3600000,
        diskSpilloverConfig: {
          enabled: true,
          directory: '/var/cache/events',
          thresholdPercent: 75,
          maxFileSizeMB: 200
        }
      };

      const summary = getConfigSummary(config);
      
      expect(summary).toContain('Disk Spillover: Enabled');
      expect(summary).toContain('Directory: /var/cache/events');
      expect(summary).toContain('Threshold: 75%');
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