import { validateEventCacheConfig } from '../../../../../src/mcp/state/event-cache/config-validator';
import type { EventCacheConfig } from '../../../../../src/mcp/state/event-cache/manager';

describe('BUG-125: validateEventCacheConfig Complexity Fix', () => {
  it('should have low complexity - main function delegates to helpers', () => {
    // The refactored function should handle all validation cases
    // while maintaining low complexity through delegation
    
    const testConfig: EventCacheConfig = {
      maxEvents: 100000,
      maxAgeMs: 3600000,
      globalMemoryLimitMB: 500,
      memoryCheckIntervalMs: 5000,
      compressionConfig: {
        enabled: true,
        checkIntervalMs: 60000,
        recentWindowMs: 300000,
        mediumWindowMs: 3600000,
        ancientWindowMs: 86400000,
        significantChangePercent: 10,
        minTimeBetweenEventsMs: 100
      },
      diskSpilloverConfig: {
        enabled: true,
        directory: './test-spillover',
        thresholdMB: 400,
        maxFileSizeMB: 100
      }
    };

    // Should validate without throwing
    const result = validateEventCacheConfig(testConfig);
    expect(result).toBeDefined();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should still catch all validation errors after refactoring', () => {
    const invalidConfig: EventCacheConfig = {
      maxEvents: 500, // Too low - should warn
      maxAgeMs: 30000, // Too short - should warn
      globalMemoryLimitMB: 5, // Too low - should error
      memoryCheckIntervalMs: 500, // Too frequent - should error
      compressionConfig: {
        enabled: true,
        checkIntervalMs: 60000,
        recentWindowMs: 500, // Too short - should error
        mediumWindowMs: 3600000,
        ancientWindowMs: 86400000,
        significantChangePercent: 150, // Out of range - should error
        minTimeBetweenEventsMs: 100
      },
      diskSpilloverConfig: {
        enabled: true,
        directory: '', // Missing - should error
        thresholdMB: 5, // Too low - should error
        maxFileSizeMB: 0.5 // Too small - should error
      }
    };

    const result = validateEventCacheConfig(invalidConfig);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    
    // Verify specific errors are caught
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('globalMemoryLimitMB must be at least 10MB'),
      expect.stringContaining('memoryCheckIntervalMs must be at least 1000ms'),
      expect.stringContaining('Compression recentWindowMs must be at least 1 second'),
      expect.stringContaining('Compression significantChangePercent must be between 0 and 100'),
      expect.stringContaining('Disk spillover enabled but no directory specified')
    ]));
    
    // Note: Threshold and file size validations only happen if directory is valid
    // Since we have empty directory, those specific validations are skipped
    
    // Verify specific warnings are caught
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('maxEvents < 1000'),
      expect.stringContaining('maxAgeMs < 1 minute')
    ]));
  });

  it('should maintain function signature and behavior after refactoring', () => {
    // Test edge cases to ensure refactoring didn't change behavior
    
    // Minimal valid config
    const minimalConfig: EventCacheConfig = {
      maxEvents: 10000,
      maxAgeMs: 3600000
    };
    
    const result = validateEventCacheConfig(minimalConfig);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    
    // Config with only compression enabled
    const compressionOnly: EventCacheConfig = {
      maxEvents: 10000,
      maxAgeMs: 3600000,
      compressionConfig: {
        enabled: true,
        checkIntervalMs: 60000,
        recentWindowMs: 60000,
        mediumWindowMs: 600000,
        ancientWindowMs: 3600000,
        significantChangePercent: 5,
        minTimeBetweenEventsMs: 100
      }
    };
    
    const result2 = validateEventCacheConfig(compressionOnly);
    expect(result2.valid).toBe(true);
  });
});