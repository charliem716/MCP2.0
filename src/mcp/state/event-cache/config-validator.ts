import * as fs from 'fs';
import * as path from 'path';
import { EventCacheConfig } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateEventCacheConfig(config: EventCacheConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate memory limits
  if (config.globalMemoryLimitMB < 10) {
    errors.push('globalMemoryLimitMB must be at least 10MB');
  } else if (config.globalMemoryLimitMB < 50) {
    warnings.push('globalMemoryLimitMB < 50MB: Low memory limit may cause frequent evictions');
  }

  // Validate event limits
  if (config.maxEvents < 1000) {
    warnings.push('maxEvents < 1000: May be too low for production use');
  } else if (config.maxEvents > 1000000) {
    warnings.push('maxEvents > 1,000,000: May cause memory issues');
  }

  // Validate retention settings
  if (config.maxAgeMs < 60000) { // 1 minute
    warnings.push('maxAgeMs < 1 minute: Retention period may be too short');
  } else if (config.maxAgeMs > 86400000) { // 24 hours
    warnings.push('maxAgeMs > 24 hours: May use excessive memory');
  }

  // Validate disk spillover configuration
  if (config.diskSpilloverConfig?.enabled) {
    const spilloverConfig = config.diskSpilloverConfig;
    
    if (!spilloverConfig.directory) {
      errors.push('Disk spillover enabled but no directory specified');
    } else {
      // Check if parent directory exists and is writable
      try {
        const parentDir = path.dirname(spilloverConfig.directory);
        
        // Check if parent directory exists
        if (!fs.existsSync(parentDir)) {
          errors.push(`Spillover parent directory does not exist: ${parentDir}`);
        } else {
          // Check write permissions
          try {
            fs.accessSync(parentDir, fs.constants.W_OK);
          } catch {
            errors.push(`Spillover directory not writable: ${parentDir}`);
          }
        }
        
        // Check disk space (simplified check)
        // In production, you might want to use a library like 'diskusage'
        // For now, we'll just warn if the directory doesn't exist yet
        if (!fs.existsSync(spilloverConfig.directory)) {
          // This is not an error - directory will be created on first use
          warnings.push(`Spillover directory will be created: ${spilloverConfig.directory}`);
        }
      } catch (error) {
        errors.push(`Failed to validate spillover directory: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Validate threshold settings
    if (spilloverConfig.thresholdPercent !== undefined) {
      if (spilloverConfig.thresholdPercent < 0 || spilloverConfig.thresholdPercent > 100) {
        errors.push('Spillover thresholdPercent must be between 0 and 100');
      } else if (spilloverConfig.thresholdPercent < 50) {
        warnings.push('Spillover thresholdPercent < 50%: May cause premature disk writes');
      } else if (spilloverConfig.thresholdPercent > 90) {
        warnings.push('Spillover thresholdPercent > 90%: May not leave enough memory headroom');
      }
    }

    // Validate file size limits
    if (spilloverConfig.maxFileSizeMB !== undefined) {
      if (spilloverConfig.maxFileSizeMB < 1) {
        errors.push('Spillover maxFileSizeMB must be at least 1MB');
      } else if (spilloverConfig.maxFileSizeMB < 10) {
        warnings.push('Spillover maxFileSizeMB < 10MB: May create many small files');
      } else if (spilloverConfig.maxFileSizeMB > 1000) {
        warnings.push('Spillover maxFileSizeMB > 1GB: Large files may impact performance');
      }
    }
  }

  // Validate compression configuration
  if (config.compressionConfig?.enabled) {
    const compressionConfig = config.compressionConfig;
    
    if (compressionConfig.minAgeMs !== undefined) {
      if (compressionConfig.minAgeMs < 0) {
        errors.push('Compression minAgeMs cannot be negative');
      } else if (compressionConfig.minAgeMs < 30000) { // 30 seconds
        warnings.push('Compression minAgeMs < 30s: May impact performance with frequent compressions');
      }
    }

    if (compressionConfig.compressionRatio !== undefined) {
      if (compressionConfig.compressionRatio <= 0 || compressionConfig.compressionRatio >= 1) {
        errors.push('Compression ratio must be between 0 and 1');
      } else if (compressionConfig.compressionRatio < 0.2) {
        warnings.push('Compression ratio < 0.2: Aggressive compression may impact query performance');
      } else if (compressionConfig.compressionRatio > 0.8) {
        warnings.push('Compression ratio > 0.8: May not provide significant space savings');
      }
    }
  }

  // Validate memory check interval
  if (config.memoryCheckIntervalMs !== undefined) {
    if (config.memoryCheckIntervalMs < 1000) { // 1 second
      errors.push('memoryCheckIntervalMs must be at least 1000ms (1 second)');
    } else if (config.memoryCheckIntervalMs < 5000) {
      warnings.push('memoryCheckIntervalMs < 5s: Frequent checks may impact performance');
    } else if (config.memoryCheckIntervalMs > 60000) { // 1 minute
      warnings.push('memoryCheckIntervalMs > 1min: Infrequent checks may delay memory management');
    }
  }

  // Cross-validation checks
  if (config.compressionConfig?.enabled && config.diskSpilloverConfig?.enabled) {
    // Both compression and spillover enabled - this is fine but worth noting
    if (config.compressionConfig.minAgeMs && config.maxAgeMs) {
      if (config.compressionConfig.minAgeMs > config.maxAgeMs / 2) {
        warnings.push('Compression minAgeMs > half of maxAgeMs: Events may be evicted before compression');
      }
    }
  }

  // Performance impact warnings
  const totalPossibleEvents = config.maxEvents || 100000;
  const memoryPerEvent = 1024; // Rough estimate: 1KB per event
  const estimatedMemoryMB = (totalPossibleEvents * memoryPerEvent) / (1024 * 1024);
  
  if (estimatedMemoryMB > config.globalMemoryLimitMB * 0.8) {
    warnings.push(
      `Estimated memory usage (${Math.round(estimatedMemoryMB)}MB) approaches the global limit (${config.globalMemoryLimitMB}MB). ` +
      'Consider reducing maxEvents or increasing globalMemoryLimitMB'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validates and sanitizes the configuration, applying defaults where necessary
 */
export function sanitizeEventCacheConfig(config: Partial<EventCacheConfig>): EventCacheConfig {
  const defaults: EventCacheConfig = {
    maxEvents: 100000,
    maxAgeMs: 3600000, // 1 hour
    globalMemoryLimitMB: 500,
    memoryCheckIntervalMs: 5000,
    compressionConfig: {
      enabled: false,
      minAgeMs: 60000, // 1 minute
      compressionRatio: 0.5
    },
    diskSpilloverConfig: {
      enabled: false,
      directory: './event-cache-spillover',
      thresholdPercent: 80,
      maxFileSizeMB: 100
    }
  };

  // Merge with defaults
  const sanitized: EventCacheConfig = {
    ...defaults,
    ...config,
    compressionConfig: config.compressionConfig ? {
      ...defaults.compressionConfig,
      ...config.compressionConfig
    } : defaults.compressionConfig,
    diskSpilloverConfig: config.diskSpilloverConfig ? {
      ...defaults.diskSpilloverConfig,
      ...config.diskSpilloverConfig
    } : defaults.diskSpilloverConfig
  };

  return sanitized;
}

/**
 * Get a human-readable summary of the configuration
 */
export function getConfigSummary(config: EventCacheConfig): string {
  const lines: string[] = [
    'Event Cache Configuration:',
    `  Memory Limit: ${config.globalMemoryLimitMB}MB`,
    `  Max Events: ${config.maxEvents.toLocaleString()}`,
    `  Retention: ${formatDuration(config.maxAgeMs)}`,
    `  Memory Check Interval: ${formatDuration(config.memoryCheckIntervalMs || 5000)}`
  ];

  if (config.compressionConfig?.enabled) {
    lines.push('  Compression: Enabled');
    lines.push(`    Min Age: ${formatDuration(config.compressionConfig.minAgeMs || 60000)}`);
    lines.push(`    Target Ratio: ${Math.round((config.compressionConfig.compressionRatio || 0.5) * 100)}%`);
  } else {
    lines.push('  Compression: Disabled');
  }

  if (config.diskSpilloverConfig?.enabled) {
    lines.push('  Disk Spillover: Enabled');
    lines.push(`    Directory: ${config.diskSpilloverConfig.directory}`);
    lines.push(`    Threshold: ${config.diskSpilloverConfig.thresholdPercent || 80}%`);
    lines.push(`    Max File Size: ${config.diskSpilloverConfig.maxFileSizeMB || 100}MB`);
  } else {
    lines.push('  Disk Spillover: Disabled');
  }

  return lines.join('\n');
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}min`;
  return `${Math.round(ms / 3600000)}h`;
}