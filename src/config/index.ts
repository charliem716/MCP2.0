/**
 * Centralized Configuration Manager
 * Resolves BUG-133: Configuration fragmentation
 */

import * as fs from 'fs';
import * as path from 'path';
import { config as existingEnvConfig } from '../shared/utils/env.js';

interface QSysConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  secure: boolean;
  rejectUnauthorized: boolean;
}

interface MCPConfig {
  logLevel: string;
  cacheSize: number;
  eventCacheEnabled: boolean;
  maxEventsPerGroup: number;
  groupExpirationMinutes: number;
}

interface APIConfig {
  port: number;
  cors: boolean;
  corsOrigin: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

export interface AppConfig {
  qsys: QSysConfig;
  mcp: MCPConfig;
  api: APIConfig;
  environment: string;
  isDevelopment: boolean;
  isProduction: boolean;
  isTest: boolean;
}

class ConfigManager {
  private static instance: ConfigManager;
  private config: AppConfig;

  private constructor() {
    this.config = this.loadConfig();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfig(): AppConfig {
    const environment = process.env['NODE_ENV'] || 'development';
    
    return {
      qsys: this.loadQSysConfig(),
      mcp: this.loadMCPConfig(),
      api: this.loadAPIConfig(),
      environment,
      isDevelopment: environment === 'development',
      isProduction: environment === 'production',
      isTest: environment === 'test'
    };
  }

  private loadQSysConfig(): QSysConfig {
    // First try to load from qsys-core.config.json
    let fileConfig: any = {};
    try {
      const configPath = path.join(process.cwd(), 'qsys-core.config.json');
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        fileConfig = JSON.parse(configContent);
      }
    } catch (error) {
      // Fallback to env config
    }

    // Merge with environment variables (env takes precedence)
    return {
      host: process.env['QSYS_HOST'] || fileConfig.host || existingEnvConfig.qsys.host || 'localhost',
      port: parseInt(process.env['QSYS_PORT'] || fileConfig.port || existingEnvConfig.qsys.port || '443', 10),
      username: process.env['QSYS_USERNAME'] || fileConfig.username || existingEnvConfig.qsys.username,
      password: process.env['QSYS_PASSWORD'] || fileConfig.password || existingEnvConfig.qsys.password,
      secure: process.env['QSYS_SECURE'] !== 'false' && fileConfig.secure !== false,
      rejectUnauthorized: process.env['QSYS_REJECT_UNAUTHORIZED'] !== 'false' && fileConfig.rejectUnauthorized !== false
    };
  }

  private loadMCPConfig(): MCPConfig {
    return {
      logLevel: process.env['LOG_LEVEL'] || 'info',
      cacheSize: parseInt(process.env['MCP_CACHE_SIZE'] || '1000', 10),
      eventCacheEnabled: process.env['EVENT_CACHE_ENABLED'] !== 'false',
      maxEventsPerGroup: parseInt(process.env['EVENT_CACHE_MAX_EVENTS'] || '10000', 10),
      groupExpirationMinutes: parseInt(process.env['EVENT_CACHE_EXPIRATION_MINUTES'] || '60', 10)
    };
  }

  private loadAPIConfig(): APIConfig {
    return {
      port: parseInt(process.env['PORT'] || process.env['API_PORT'] || '3000', 10),
      cors: process.env['CORS_ENABLED'] !== 'false',
      corsOrigin: process.env['CORS_ORIGIN'] || '*',
      rateLimitWindowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '900000', 10), // 15 minutes
      rateLimitMaxRequests: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] || '100', 10)
    };
  }

  getConfig(): AppConfig {
    return this.config;
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key];
  }

  /**
   * Get a nested configuration value using dot notation
   * Example: getPath('qsys.host') returns the Q-SYS host
   */
  getPath(path: string): any {
    const keys = path.split('.');
    let result: any = this.config;
    
    for (const key of keys) {
      if (result && typeof result === 'object' && key in result) {
        result = result[key];
      } else {
        return undefined;
      }
    }
    
    return result;
  }

  /**
   * Reload configuration from all sources
   * Useful for testing or when config files change
   */
  reload(): void {
    this.config = this.loadConfig();
  }

  /**
   * Get a summary of the current configuration
   * Useful for logging at startup
   */
  getSummary(): string {
    return `Configuration Summary:
  Environment: ${this.config.environment}
  Q-SYS: ${this.config.qsys.host}:${this.config.qsys.port} (secure: ${this.config.qsys.secure})
  MCP: Log Level: ${this.config.mcp.logLevel}, Cache Size: ${this.config.mcp.cacheSize}
  API: Port ${this.config.api.port}, CORS: ${this.config.api.cors}`;
  }
}

// Export singleton instance
export const configManager = ConfigManager.getInstance();

// Export convenience function
export function getConfig(): AppConfig {
  return configManager.getConfig();
}

// Export typed config sections
export function getQSysConfig(): QSysConfig {
  return configManager.get('qsys');
}

export function getMCPConfig(): MCPConfig {
  return configManager.get('mcp');
}

export function getAPIConfig(): APIConfig {
  return configManager.get('api');
}