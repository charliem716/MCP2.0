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
  reconnectInterval: number;
  heartbeatInterval: number;
}

export interface EventMonitoringConfig {
  enabled: boolean;
  dbPath: string;
  retentionDays: number;
  bufferSize: number;
  flushInterval: number;
}

interface MCPConfig {
  logLevel: string;
  cacheSize: number;
  eventCacheEnabled: boolean;
  maxEventsPerGroup: number;
  groupExpirationMinutes: number;
  mcpMode: boolean;
  debugTests: boolean;
  eventMonitoring?: EventMonitoringConfig;
}

interface APIConfig {
  port: number;
  cors: boolean;
  corsOrigin: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

interface FileConfig {
  host?: string;
  port?: string | number;
  username?: string;
  password?: string;
  secure?: boolean;
  rejectUnauthorized?: boolean;
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
  private static instance: ConfigManager | undefined;
  private config: AppConfig;

  private constructor() {
    this.config = this.loadConfig();
  }

  static getInstance(): ConfigManager {
    ConfigManager.instance ??= new ConfigManager();
    return ConfigManager.instance;
  }

  private loadConfig(): AppConfig {
    const environment = process.env['NODE_ENV'] ?? 'development';
    
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
    let fileConfig: FileConfig = {};
    try {
      // Look for config file relative to the module location, not cwd
      // This ensures it works when launched from any directory (like Claude Desktop)
      const projectRoot = process.cwd();
      const configPath = path.join(projectRoot, 'qsys-core.config.json');
      
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(configContent);
        // Extract the qsysCore property from the JSON
        if (parsed && typeof parsed === 'object' && 'qsysCore' in parsed) {
          fileConfig = (parsed).qsysCore as FileConfig;
        }
      }
    } catch (error) {
      // Fallback to env config
    }

    // BUG-138 FIX: ConfigManager is now the sole source of Q-SYS configuration
    // Merge with environment variables (env takes precedence)
    const host = process.env['QSYS_HOST'] ?? fileConfig.host ?? 'localhost';
    const port = parseInt(process.env['QSYS_PORT'] ?? String(fileConfig.port ?? 443), 10);
    const username = process.env['QSYS_USERNAME'] ?? fileConfig.username ?? '';
    const password = process.env['QSYS_PASSWORD'] ?? fileConfig.password ?? '';
    
    const config = {
      host,
      port,
      username,
      password,
      secure: process.env['QSYS_SECURE'] !== 'false' && (fileConfig.secure ?? true),
      rejectUnauthorized: process.env['QSYS_REJECT_UNAUTHORIZED'] !== 'false' && (fileConfig.rejectUnauthorized ?? false),
      reconnectInterval: parseInt(process.env['QSYS_RECONNECT_INTERVAL'] ?? '5000', 10),
      heartbeatInterval: parseInt(process.env['QSYS_HEARTBEAT_INTERVAL'] ?? '30000', 10)
    };
    
    return config;
  }

  private loadMCPConfig(): MCPConfig {
    const config: MCPConfig = {
      logLevel: process.env['LOG_LEVEL'] ?? 'info',
      cacheSize: parseInt(process.env['MCP_CACHE_SIZE'] ?? '1000', 10),
      eventCacheEnabled: process.env['EVENT_CACHE_ENABLED'] !== 'false',
      maxEventsPerGroup: parseInt(process.env['EVENT_CACHE_MAX_EVENTS'] ?? '10000', 10),
      groupExpirationMinutes: parseInt(process.env['EVENT_CACHE_EXPIRATION_MINUTES'] ?? '60', 10),
      mcpMode: process.env['MCP_MODE'] === 'true',
      debugTests: process.env['DEBUG_TESTS'] === 'true'
    };

    // Add event monitoring config if enabled
    const eventMonitoringEnabled = process.env['EVENT_MONITORING_ENABLED'] === 'true';
    if (eventMonitoringEnabled) {
      config.eventMonitoring = {
        enabled: true,
        dbPath: process.env['EVENT_MONITORING_DB_PATH'] ?? './data/events',
        retentionDays: parseInt(process.env['EVENT_MONITORING_RETENTION_DAYS'] ?? '7', 10),
        bufferSize: parseInt(process.env['EVENT_MONITORING_BUFFER_SIZE'] ?? '1000', 10),
        flushInterval: parseInt(process.env['EVENT_MONITORING_FLUSH_INTERVAL'] ?? '100', 10)
      };
    }

    return config;
  }

  private loadAPIConfig(): APIConfig {
    return {
      port: parseInt(process.env['PORT'] ?? process.env['API_PORT'] ?? '3000', 10),
      cors: process.env['CORS_ENABLED'] !== 'false',
      corsOrigin: process.env['CORS_ORIGIN'] ?? '*',
      rateLimitWindowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] ?? '900000', 10), // 15 minutes
      rateLimitMaxRequests: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] ?? '100', 10)
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
  getPath(path: string): unknown {
    const keys = path.split('.');
    let result: unknown = this.config;
    
    for (const key of keys) {
      if (result && typeof result === 'object' && key in result) {
        result = (result as Record<string, unknown>)[key];
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