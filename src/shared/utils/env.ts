/**
 * Environment Configuration System
 * Uses Zod for validation and dotenv for loading environment variables
 */

import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import { ConfigurationError } from '../types/errors.js';
// Import logger only for validateConfig function
// Avoid circular dependency during environment parsing
import type { Logger } from './logger.js';

// Load environment variables from .env file
dotenv.config({
  path: ['.env.local', '.env'],
  debug:
    process.env['NODE_ENV'] === 'development' &&
    process.env['MCP_MODE'] !== 'true',
});

/**
 * Load Q-SYS Core configuration from JSON file if available
 * This allows users to configure their Core connection easily
 */
interface QSysConfigJSON {
  qsysCore: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    connectionSettings?: {
      timeout?: number;
      reconnectInterval?: number;
      maxReconnectAttempts?: number;
      heartbeatInterval?: number;
      pollingInterval?: number;
      enableAutoReconnect?: boolean;
    };
  };
}

function loadQSysConfigFromJSON(): Partial<QSysConfigJSON['qsysCore']> | null {
  // Use absolute path to ensure config is found regardless of cwd
  const configPath =
    '/Users/charliemccarrel/Desktop/Builds/MCP2.0/qsys-core.config.json';

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const configContent = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent) as QSysConfigJSON;
    if (process.env['MCP_MODE'] !== 'true') {
      // Use console during initialization
      console.info('Loaded Q-SYS Core configuration from qsys-core.config.json');
    }
    return config.qsysCore;
  } catch (error) {
    if (process.env['MCP_MODE'] !== 'true') {
      // Use console during initialization
      console.warn('Failed to load qsys-core.config.json:', error);
    }
    return null;
  }
}

// Load Q-SYS config from JSON if available
const qsysConfig = loadQSysConfigFromJSON();

/**
 * Environment schema using Zod for validation
 */
const envSchema = z.object({
  // Node.js Environment
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().min(1).max(65535).default(443),
  LOG_LEVEL: z
    .enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'])
    .default('info'),

  // Q-SYS Core Configuration - REMOVED FROM ENVIRONMENT
  // Q-SYS settings are now ONLY in qsys-core.config.json (no duplication!)
  // This eliminates confusion and ensures single source of truth

  // OpenAI Configuration (Phase 3 - Optional for now)
  OPENAI_API_KEY: z.string().min(1).startsWith('sk-').optional(),
  OPENAI_ORGANIZATION: z.string().startsWith('org-').optional(),
  OPENAI_MODEL: z.string().default('gpt-4').optional(),
  OPENAI_VOICE: z
    .enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'])
    .default('nova')
    .optional(),

  // Security Configuration
  JWT_SECRET: z
    .string()
    .min(32)
    .default('your-super-secret-jwt-key-change-this-in-production'),
  SESSION_SECRET: z
    .string()
    .min(32)
    .default('your-super-secret-session-key-change-this-in-production'),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().min(1000).default(900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().min(1).default(100),

  // Optional Features
  ENABLE_SWAGGER: z.coerce.boolean().default(true),
  ENABLE_METRICS: z.coerce.boolean().default(true),
  ENABLE_HEALTH_CHECK: z.coerce.boolean().default(true),

  // Database Configuration (if needed in the future)
  DATABASE_URL: z.string().url().optional(),

  // Development/Debug Options
  DEBUG_TESTS: z.coerce.boolean().default(false),
  VERBOSE_LOGGING: z.coerce.boolean().default(false),

  // Cache Configuration
  CACHE_MAX_ENTRIES: z.coerce.number().min(10).default(1000),
  CACHE_TTL_MS: z.coerce.number().min(1000).default(1800000), // 30 minutes
  CACHE_MAX_MEMORY_MB: z.coerce.number().min(1).default(50),

  // Performance Configuration
  TOOL_EXECUTION_WARNING_MS: z.coerce.number().min(100).default(1000),
  QSYS_CONNECTION_TIMEOUT: z.coerce.number().min(1000).default(10000),
  
  // Additional Timeout Configuration
  CHANGE_GROUP_TIMEOUT_MS: z.coerce.number().min(1000).default(30000),
  COMPRESSION_COOLDOWN_MS: z.coerce.number().min(1000).default(30000),
  CACHE_CLEANUP_INTERVAL_MS: z.coerce.number().min(60000).default(300000), // 5 minutes
  VALIDATION_CACHE_TTL_MS: z.coerce.number().min(1000).default(30000),
});

/**
 * Infer TypeScript type from schema
 */
export type Environment = z.infer<typeof envSchema>;

/**
 * Validate and parse environment variables
 */
function parseEnvironment(): Environment {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    // Use console.error during environment parsing to avoid circular dependency
    if (process.env['NODE_ENV'] === 'test') {
      // In test mode, show minimal error info
      const errors = result.error.errors.map((e: any) => ({
        path: e.path.join('.'),
        message: e.message
      }));
      console.error('Environment validation failed:', errors);
    } else {
      console.error('Invalid environment configuration:');
      console.error(JSON.stringify(result.error.format(), null, 2));
    }

    // In development, show helpful error messages
    if (process.env['NODE_ENV'] === 'development') {
      console.error('Common fixes:');
      console.error('• Copy .env.example to .env and fill in required values');
      console.error('• Ensure OPENAI_API_KEY is set and starts with "sk-"');
      console.error('• Check that port numbers are valid (1-65535)');
      console.error('• Verify IP addresses are in correct format');
    }

    // Exit with error code for scripts/CI
    if (process.env['NODE_ENV'] !== 'test') {
      process.exit(1);
    } else {
      throw new ConfigurationError('Invalid environment configuration',
        { missingVariables: result.error.errors.map((e: any) => e.path.join('.')) });
    }
  }

  return result.data;
}

/**
 * Validated environment configuration
 */
export const env = parseEnvironment();

/**
 * Environment helper functions
 */
export const isDevelopment = env.NODE_ENV === 'development';
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/**
 * Get the application root directory
 */
function getAppRoot(): string {
  // Use process.cwd() for consistent behavior in both CommonJS and ES modules
  // This assumes the app is run from the project root
  return process.cwd();
}

export const appRoot = getAppRoot();

/**
 * Configuration object for easy access
 */
export const config = {
  app: {
    name: 'MCP Voice/Text-Controlled Q-SYS Demo',
    version: '1.0.0',
    port: env.PORT,
    env: env.NODE_ENV,
    root: appRoot,
  },

  qsys: {
    host: qsysConfig?.host ?? 'localhost',
    port: qsysConfig?.port ?? 443,
    username: qsysConfig?.username ?? '',
    password: qsysConfig?.password ?? '',
    reconnectInterval:
      qsysConfig?.connectionSettings?.reconnectInterval ?? 5000,
    heartbeatInterval:
      qsysConfig?.connectionSettings?.heartbeatInterval ?? 30000,
  },

  openai: {
    apiKey: env.OPENAI_API_KEY,
    organization: env.OPENAI_ORGANIZATION,
    model: env.OPENAI_MODEL ?? 'gpt-4',
    voice: env.OPENAI_VOICE ?? 'nova',
  },

  security: {
    jwtSecret: env.JWT_SECRET,
    sessionSecret: env.SESSION_SECRET,
    corsOrigin: env.CORS_ORIGIN,
  },

  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  },

  logging: {
    level: env.LOG_LEVEL,
    verbose: env.VERBOSE_LOGGING,
  },

  features: {
    swagger: env.ENABLE_SWAGGER,
    metrics: env.ENABLE_METRICS,
    healthCheck: env.ENABLE_HEALTH_CHECK,
  },

  database: {
    url: env.DATABASE_URL,
  },

  paths: {
    logs: path.join(appRoot, 'logs'),
    public: path.join(appRoot, 'src/web'),
    uploads: path.join(appRoot, 'uploads'),
  },

  cache: {
    maxEntries: env.CACHE_MAX_ENTRIES,
    ttlMs: env.CACHE_TTL_MS,
    maxMemoryMB: env.CACHE_MAX_MEMORY_MB,
  },

  performance: {
    toolExecutionWarningMs: env.TOOL_EXECUTION_WARNING_MS,
    qsysConnectionTimeout: env.QSYS_CONNECTION_TIMEOUT,
  },

  timeouts: {
    changeGroupMs: env.CHANGE_GROUP_TIMEOUT_MS,
    compressionCooldownMs: env.COMPRESSION_COOLDOWN_MS,
    cacheCleanupIntervalMs: env.CACHE_CLEANUP_INTERVAL_MS,
    validationCacheTtlMs: env.VALIDATION_CACHE_TTL_MS,
  },
} as const;

/**
 * Validate configuration at startup
 */
export async function validateConfig(): Promise<void> {
  // Skip console output in MCP mode to avoid polluting stdout
  if (process.env['MCP_MODE'] === 'true') {
    return;
  }

  // Lazy load logger to avoid circular dependency
  const { createLogger } = await import('./logger.js');
  const logger = createLogger('Env');

  logger.info(`Environment: ${env.NODE_ENV}`);
  logger.info(`Port: ${env.PORT}`);
  logger.info(`Log Level: ${env.LOG_LEVEL}`);
  logger.info(
    `Q-SYS Core: ${qsysConfig?.host ?? 'localhost'}:${qsysConfig?.port ?? 443} (from JSON config)`
  );
  logger.info(`OpenAI Model: ${env.OPENAI_MODEL}`);
  logger.info(`Security: ${env.JWT_SECRET.length} char JWT secret`);

  // Warn about default secrets in production
  if (isProduction) {
    if (env.JWT_SECRET.includes('change-this')) {
      logger.warn('WARNING: Using default JWT secret in production!');
    }
    if (env.SESSION_SECRET.includes('change-this')) {
      logger.warn('WARNING: Using default session secret in production!');
    }
  }

  logger.info('Environment configuration validated');
}

/**
 * Export environment schema for testing
 */
export { envSchema };
