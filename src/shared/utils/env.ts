/**
 * Environment Configuration System
 * Uses Zod for validation and dotenv for loading environment variables
 */

import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';

// Load environment variables from .env file
dotenv.config({
  path: ['.env.local', '.env'],
  debug: process.env['NODE_ENV'] === 'development' && process.env['MCP_MODE'] !== 'true'
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
  const configPath = '/Users/charliemccarrel/Desktop/Builds/MCP2.0/qsys-core.config.json';
  
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const configContent = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent) as QSysConfigJSON;
    if (process.env['MCP_MODE'] !== 'true') {
      console.log('📋 Loaded Q-SYS Core configuration from qsys-core.config.json');
    }
    return config.qsysCore;
  } catch (error) {
    if (process.env['MCP_MODE'] !== 'true') {
      console.warn('⚠️  Failed to load qsys-core.config.json:', error);
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
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().min(1).max(65535).default(443),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),

  // Q-SYS Core Configuration - REMOVED FROM ENVIRONMENT
  // Q-SYS settings are now ONLY in qsys-core.config.json (no duplication!)
  // This eliminates confusion and ensures single source of truth

  // OpenAI Configuration (Phase 3 - Optional for now)
  OPENAI_API_KEY: z.string().min(1).startsWith('sk-').optional(),
  OPENAI_ORGANIZATION: z.string().startsWith('org-').optional(),
  OPENAI_MODEL: z.string().default('gpt-4').optional(),
  OPENAI_VOICE: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']).default('nova').optional(),

  // Security Configuration
  JWT_SECRET: z.string().min(32).default('your-super-secret-jwt-key-change-this-in-production'),
  SESSION_SECRET: z.string().min(32).default('your-super-secret-session-key-change-this-in-production'),
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
  VERBOSE_LOGGING: z.coerce.boolean().default(false)
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
    /* eslint-disable no-console */
    console.error('❌ Invalid environment configuration:');
    console.error(result.error.format());
    
    // In development, show helpful error messages
    if (process.env['NODE_ENV'] === 'development') {
      console.error('\n🔧 Common fixes:');
      console.error('• Copy .env.example to .env and fill in required values');
      console.error('• Ensure OPENAI_API_KEY is set and starts with "sk-"');
      console.error('• Check that port numbers are valid (1-65535)');
      console.error('• Verify IP addresses are in correct format');
    }
    /* eslint-enable no-console */
    
    // Exit with error code for scripts/CI
    if (process.env['NODE_ENV'] !== 'test') {
      process.exit(1);
    } else {
      throw new Error('Invalid environment configuration');
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
  if (typeof __dirname !== 'undefined') {
    // CommonJS
    return path.resolve(__dirname, '../../../');
  } else {
    // ES Modules
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    return path.resolve(__dirname, '../../../');
  }
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
    root: appRoot
  },
  
  qsys: {
    host: qsysConfig?.host ?? 'localhost',
    port: qsysConfig?.port ?? 443,
    username: qsysConfig?.username ?? '',
    password: qsysConfig?.password ?? '',
    reconnectInterval: qsysConfig?.connectionSettings?.reconnectInterval ?? 5000,
    heartbeatInterval: qsysConfig?.connectionSettings?.heartbeatInterval ?? 30000
  },

  openai: {
    apiKey: env.OPENAI_API_KEY,
    organization: env.OPENAI_ORGANIZATION,
    model: env.OPENAI_MODEL ?? 'gpt-4',
    voice: env.OPENAI_VOICE ?? 'nova'
  },

  security: {
    jwtSecret: env.JWT_SECRET,
    sessionSecret: env.SESSION_SECRET,
    corsOrigin: env.CORS_ORIGIN
  },

  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS
  },

  logging: {
    level: env.LOG_LEVEL,
    verbose: env.VERBOSE_LOGGING
  },

  features: {
    swagger: env.ENABLE_SWAGGER,
    metrics: env.ENABLE_METRICS,
    healthCheck: env.ENABLE_HEALTH_CHECK
  },

  database: {
    url: env.DATABASE_URL
  },

  paths: {
    logs: path.join(appRoot, 'logs'),
    public: path.join(appRoot, 'src/web'),
    uploads: path.join(appRoot, 'uploads')
  }
} as const;

/**
 * Validate configuration at startup
 */
export function validateConfig(): void {
  /* eslint-disable no-console */
  // Skip console output in MCP mode to avoid polluting stdout
  if (process.env['MCP_MODE'] === 'true') {
    return;
  }
  
  console.log(`🔧 Environment: ${env.NODE_ENV}`);
  console.log(`🚀 Port: ${env.PORT}`);
  console.log(`📝 Log Level: ${env.LOG_LEVEL}`);
  console.log(`🎯 Q-SYS Core: ${qsysConfig?.host ?? 'localhost'}:${qsysConfig?.port ?? 443} (from JSON config)`);
  console.log(`🤖 OpenAI Model: ${env.OPENAI_MODEL}`);
  console.log(`🔐 Security: ${env.JWT_SECRET.length} char JWT secret`);
  
  // Warn about default secrets in production
  if (isProduction) {
    if (env.JWT_SECRET.includes('change-this')) {
      console.warn('⚠️  WARNING: Using default JWT secret in production!');
    }
    if (env.SESSION_SECRET.includes('change-this')) {
      console.warn('⚠️  WARNING: Using default session secret in production!');
    }
  }
  
  console.log('✅ Environment configuration validated');
  /* eslint-enable no-console */
}

/**
 * Export environment schema for testing
 */
export { envSchema }; 