/**
 * Logger utility using Winston
 * Provides structured logging for the MCP Voice/Text-Controlled Q-SYS Demo
 */

import winston from 'winston';
import path from 'path';

// Ensure winston format is available
const { format } = winston;

export interface Logger {
  info(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  debug(message: string, meta?: unknown): void;
}

export type LogLevel =
  | 'error'
  | 'warn'
  | 'info'
  | 'http'
  | 'verbose'
  | 'debug'
  | 'silly';

export interface LoggerConfig {
  level: LogLevel;
  format: winston.Logform.Format;
  transports: winston.transport[];
  defaultMeta?: Record<string, unknown>;
}

/**
 * Create environment-specific logger configuration
 */
function createLoggerConfig(serviceName: string): LoggerConfig {
  const isDevelopment = process.env['NODE_ENV'] === 'development';
  const isProduction = process.env['NODE_ENV'] === 'production';
  const isTest = process.env['NODE_ENV'] === 'test';
  const isMCPMode = process.env['MCP_MODE'] === 'true';

  const level =
    (process.env['LOG_LEVEL'] as LogLevel | undefined) ??
    (isDevelopment ? 'debug' : isProduction ? 'info' : 'error');

  // Base format for all environments
  const baseFormat = format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.metadata({
      fillExcept: ['message', 'level', 'timestamp', 'service'],
    })
  );

  // Development format with colors and pretty printing
  const devFormat = format.combine(
    baseFormat,
    format.colorize(),
    format.printf(info => {
      const { timestamp, level, message, service, metadata } = info as {
        timestamp: string;
        level: string;
        message: string;
        service: string;
        metadata?: unknown;
      };
      const meta =
        metadata &&
        typeof metadata === 'object' &&
        Object.keys(metadata).length > 0
          ? ` ${JSON.stringify(metadata)}`
          : '';
      return `${timestamp} [${service}] ${level}: ${message}${meta}`;
    })
  );

  // Production format as structured JSON
  const prodFormat = format.combine(baseFormat, format.json());

  // Test format - minimal output
  const testFormat = format.combine(
    format.printf(info => {
      const { level, message, service } = info as {
        level: string;
        message: string;
        service: string;
      };
      return `[${service}] ${level}: ${message}`;
    })
  );

  const selectedFormat = isTest ? testFormat : isDevelopment ? devFormat : prodFormat;

  // Configure transports based on environment
  const transports: winston.transport[] = [];

  // In MCP mode, no transports at all to avoid any output
  if (isMCPMode) {
    // MCP mode: No transports - all logging is disabled
    // This prevents any stdout pollution that would break JSON-RPC
  } else if (isTest) {
    // In test environment, only log errors to console
    transports.push(
      new winston.transports.Console({
        level: 'error',
        silent:
          process.env['NODE_ENV'] === 'test' && !process.env['DEBUG_TESTS'],
      })
    );
  } else if (isDevelopment) {
    // Development: Console with colors
    transports.push(
      new winston.transports.Console({
        level: 'debug',
        format: devFormat,
      })
    );
  } else {
    // Production: No transports to avoid polluting stdout for MCP
    // All output must go to stderr or be disabled
  }

  return {
    level,
    format: selectedFormat,
    transports,
    defaultMeta: { service: serviceName },
  };
}

/**
 * Create a logger instance for a specific service
 */
export function createLogger(serviceName: string): Logger {
  const config = createLoggerConfig(serviceName);

  const logger = winston.createLogger({
    level: config.level,
    format: config.format,
    defaultMeta: config.defaultMeta,
    transports: config.transports,
    exitOnError: false,
    silent: process.env['NODE_ENV'] === 'test' && !process.env['DEBUG_TESTS'],
  });

  // Handle unhandled promise rejections in production
  // Disabled for MCP mode to avoid file system access
  // if (process.env['NODE_ENV'] === 'production') {
  //   logger.rejections.handle(
  //     new winston.transports.File({
  //       filename: path.join('logs', 'rejections.log'),
  //       format: winston.format.json()
  //     })
  //   );
  // }

  return logger;
}

/**
 * Global logger instance for the application
 */
export const globalLogger = createLogger('MCP-QSys-Demo');
