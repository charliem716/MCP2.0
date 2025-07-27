import * as fs from 'fs';
import * as path from 'path';
import type { EventCacheConfig } from './manager';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateEventCacheConfig(config: EventCacheConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate memory limits
  if (config.globalMemoryLimitMB !== undefined) {
    if (config.globalMemoryLimitMB < 10) {
      errors.push('globalMemoryLimitMB must be at least 10MB');
    } else if (config.globalMemoryLimitMB < 50) {
      warnings.push('globalMemoryLimitMB < 50MB: Low memory limit may cause frequent evictions');
    }
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
    if (spilloverConfig.thresholdMB !== undefined) {
      if (spilloverConfig.thresholdMB < 10) {
        errors.push('Spillover thresholdMB must be at least 10MB');
      } else if (spilloverConfig.thresholdMB < 100) {
        warnings.push('Spillover thresholdMB < 100MB: May cause frequent disk writes');
      }
      
      // Check percentage independently
      if (config.globalMemoryLimitMB !== undefined && spilloverConfig.thresholdMB > config.globalMemoryLimitMB * 0.9) {
        warnings.push('Spillover thresholdMB > 90% of memory limit: May not leave enough headroom');
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
    
    // Validate compression window settings
    if (compressionConfig.recentWindowMs !== undefined && compressionConfig.recentWindowMs < 1000) {
      errors.push('Compression recentWindowMs must be at least 1 second');
    }
    
    if (compressionConfig.mediumWindowMs !== undefined && compressionConfig.mediumWindowMs < 60000) {
      warnings.push('Compression mediumWindowMs < 1 minute: May compress events too quickly');
    }
    
    if (compressionConfig.significantChangePercent !== undefined) {
      if (compressionConfig.significantChangePercent < 0 || compressionConfig.significantChangePercent > 100) {
        errors.push('Compression significantChangePercent must be between 0 and 100');
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
    if (config.compressionConfig.recentWindowMs !== undefined && config.maxAgeMs) {
      if (config.compressionConfig.recentWindowMs > config.maxAgeMs / 2) {
        warnings.push('Compression recentWindowMs > half of maxAgeMs: Events may be evicted before compression');
      }
    }
  }

  // Performance impact warnings
  const totalPossibleEvents = config.maxEvents || 100000;
  const memoryPerEvent = 1024; // Rough estimate: 1KB per event
  const estimatedMemoryMB = (totalPossibleEvents * memoryPerEvent) / (1024 * 1024);
  
  if (config.globalMemoryLimitMB !== undefined && estimatedMemoryMB > config.globalMemoryLimitMB * 0.8) {
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
  const defaultCompressionConfig = {
    enabled: false,
    checkIntervalMs: 60000,
    recentWindowMs: 300000,
    mediumWindowMs: 3600000,
    ancientWindowMs: 86400000,
    significantChangePercent: 10,
    minTimeBetweenEventsMs: 100
  };
  
  const defaultDiskSpilloverConfig = {
    enabled: false,
    directory: './event-cache-spillover',
    thresholdMB: 400,
    maxFileSizeMB: 100
  };

  // Build the sanitized config with defaults for all common properties
  const sanitized: EventCacheConfig = {
    maxEvents: config.maxEvents ?? 100000,
    maxAgeMs: config.maxAgeMs ?? 3600000, // 1 hour
    globalMemoryLimitMB: config.globalMemoryLimitMB ?? 500,
    memoryCheckIntervalMs: config.memoryCheckIntervalMs ?? 5000,
  };
  
  // Add truly optional properties only if defined
  if (config.compressOldEvents !== undefined) {
    sanitized.compressOldEvents = config.compressOldEvents;
  }
  if (config.persistToDisk !== undefined) {
    sanitized.persistToDisk = config.persistToDisk;
  }
  if (config.cleanupIntervalMs !== undefined) {
    sanitized.cleanupIntervalMs = config.cleanupIntervalMs;
  }
  
  // Add optional configs only if they exist
  if (config.compressionConfig !== undefined || config.compressOldEvents) {
    sanitized.compressionConfig = {
      ...defaultCompressionConfig,
      ...(config.compressionConfig || {})
    };
  }
  
  if (config.diskSpilloverConfig !== undefined || config.persistToDisk) {
    sanitized.diskSpilloverConfig = {
      ...defaultDiskSpilloverConfig,
      ...(config.diskSpilloverConfig || {})
    };
  }

  return sanitized;
}

/**
 * Get a human-readable summary of the configuration
 */
export function getConfigSummary(config: EventCacheConfig): string {
  const lines: string[] = [
    'Event Cache Configuration:',
    `  Memory Limit: ${config.globalMemoryLimitMB || 500}MB`,
    `  Max Events: ${config.maxEvents.toLocaleString()}`,
    `  Retention: ${formatDuration(config.maxAgeMs)}`,
    `  Memory Check Interval: ${formatDuration(config.memoryCheckIntervalMs || 5000)}`
  ];

  if (config.compressionConfig?.enabled) {
    lines.push('  Compression: Enabled');
    lines.push(`    Recent Window: ${formatDuration(config.compressionConfig.recentWindowMs || 300000)}`);
    lines.push(`    Check Interval: ${formatDuration(config.compressionConfig.checkIntervalMs || 60000)}`);
  } else {
    lines.push('  Compression: Disabled');
  }

  if (config.diskSpilloverConfig?.enabled) {
    lines.push('  Disk Spillover: Enabled');
    lines.push(`    Directory: ${config.diskSpilloverConfig.directory}`);
    lines.push(`    Threshold: ${config.diskSpilloverConfig.thresholdMB || 400}MB`);
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