/**
 * Logger utility using Winston
 * Provides structured logging for the MCP Voice/Text-Controlled Q-SYS Demo
 */

import winston from 'winston';
import path from 'path';

export interface Logger {
  info(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  debug(message: string, meta?: unknown): void;
}

export type LogLevel = 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly';

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

  const level = (process.env['LOG_LEVEL'] as LogLevel | undefined) ?? 
    (isDevelopment ? 'debug' : isProduction ? 'info' : 'error');

  // Base format for all environments
  const baseFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.metadata({
      fillExcept: ['message', 'level', 'timestamp', 'service']
    })
  );

  // Development format with colors and pretty printing
  const devFormat = winston.format.combine(
    baseFormat,
    winston.format.colorize(),
    winston.format.printf((info) => {
      const { timestamp, level, message, service, metadata } = info as {
        timestamp: string;
        level: string;
        message: string;
        service: string;
        metadata?: unknown;
      };
      const meta = metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0 
        ? ` ${JSON.stringify(metadata)}` 
        : '';
      return `${timestamp} [${service}] ${level}: ${message}${meta}`;
    })
  );

  // Production format as structured JSON
  const prodFormat = winston.format.combine(
    baseFormat,
    winston.format.json()
  );

  // Test format - minimal output
  const testFormat = winston.format.combine(
    winston.format.printf((info) => {
      const { level, message, service } = info as {
        level: string;
        message: string;
        service: string;
      };
      return `[${service}] ${level}: ${message}`;
    })
  );

  const format = isTest ? testFormat : isDevelopment ? devFormat : prodFormat;

  // Configure transports based on environment
  const transports: winston.transport[] = [];

  if (isTest) {
    // In test environment, only log errors to console
    transports.push(
      new winston.transports.Console({
        level: 'error',
        silent: process.env['NODE_ENV'] === 'test' && !process.env['DEBUG_TESTS']
      })
    );
  } else if (isDevelopment) {
    // Development: Console with colors
    transports.push(
      new winston.transports.Console({
        level: 'debug',
        format: devFormat
      })
    );
  } else {
    // Production: Console + Files
    transports.push(
      new winston.transports.Console({
        level: 'info',
        format: prodFormat
      }),
      new winston.transports.File({
        filename: path.join('logs', 'error.log'),
        level: 'error',
        format: prodFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5
      }),
      new winston.transports.File({
        filename: path.join('logs', 'combined.log'),
        level: 'info',
        format: prodFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5
      })
    );
  }

  return {
    level,
    format,
    transports,
    defaultMeta: { service: serviceName }
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
    silent: process.env['NODE_ENV'] === 'test' && !process.env['DEBUG_TESTS']
  });

  // Handle unhandled promise rejections in production
  if (process.env['NODE_ENV'] === 'production') {
    logger.rejections.handle(
      new winston.transports.File({
        filename: path.join('logs', 'rejections.log'),
        format: winston.format.json()
      })
    );
  }

  return logger;
}

/**
 * Global logger instance for the application
 */
export const globalLogger = createLogger('MCP-QSys-Demo'); 