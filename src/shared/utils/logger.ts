/**
 * Logger utility using Winston
 * Provides structured logging for the MCP Voice/Text-Controlled Q-SYS Demo
 */

import winston from 'winston';
import path from 'path';
import { getConfig, getMCPConfig } from '../../config/index.js';
import { getCorrelationContext } from './correlation.js';

// Ensure winston format is available
const { format } = winston;

export interface Logger {
  info(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  debug(message: string, meta?: unknown): void;
  child(meta: Record<string, unknown>): Logger;
  setContext(context: Record<string, unknown>): void;
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
  const config = getConfig();
  const mcpConfig = getMCPConfig();
  const isDevelopment = config.isDevelopment;
  const isProduction = config.isProduction;
  const isTest = config.isTest;
  // In production without MCP_MODE set, we should still avoid stdout
  // when running as an MCP server (Claude Desktop doesn't set MCP_MODE)
  const isMCPMode = mcpConfig.mcpMode || (isProduction && !process.stdin.isTTY);

  const level = mcpConfig.logLevel as LogLevel;

  // Add correlation ID to log entries
  const correlationFormat = format((info: any) => {
    const context = getCorrelationContext();
    if (context?.correlationId) {
      info.correlationId = context.correlationId;
      if (context.metadata) {
        info.requestMetadata = context.metadata;
      }
    }
    return info;
  });

  // Base format for all environments
  const baseFormat = format.combine(
    correlationFormat(),
    format.timestamp(),
    format.errors({ stack: true }),
    format.metadata({
      fillExcept: ['message', 'level', 'timestamp', 'service', 'correlationId', 'component', 'duration', 'requestMetadata'],
    })
  );

  // Development format with colors and pretty printing
  const devFormat = format.combine(
    baseFormat,
    format.colorize(),
    format.printf(info => {
      const { timestamp, level, message, service, correlationId, component, metadata } = info as {
        timestamp: string;
        level: string;
        message: string;
        service: string;
        correlationId?: string;
        component?: string;
        metadata?: unknown;
      };
      const corrId = correlationId ? ` [${correlationId.substring(0, 8)}]` : '';
      const comp = component ? ` [${component}]` : '';
      const meta =
        metadata &&
        typeof metadata === 'object' &&
        Object.keys(metadata).length > 0
          ? ` ${JSON.stringify(metadata)}`
          : '';
      return `${timestamp} [${service}]${comp}${corrId} ${level}: ${message}${meta}`;
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
          config.isTest && !mcpConfig.debugTests,
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
  } else if (isProduction) {
    // Production: Use stderr transport to avoid polluting stdout
    transports.push(
      new winston.transports.Stream({
        stream: process.stderr,
        level,
        format: prodFormat,
      })
    );
  }

  return {
    level,
    format: selectedFormat,
    transports,
    defaultMeta: { service: serviceName },
  };
}

/**
 * Enhanced logger with context support
 */
class EnhancedLogger implements Logger {
  private context: Record<string, unknown> = {};

  constructor(private winstonLogger: winston.Logger) {}

  info(message: string, meta?: unknown): void {
    this.log('info', message, meta);
  }

  error(message: string, meta?: unknown): void {
    this.log('error', message, meta);
  }

  warn(message: string, meta?: unknown): void {
    this.log('warn', message, meta);
  }

  debug(message: string, meta?: unknown): void {
    this.log('debug', message, meta);
  }

  private log(level: string, message: string, meta?: unknown): void {
    const logData: Record<string, any> = { message };
    
    // Add context
    if (Object.keys(this.context).length > 0) {
      Object.assign(logData, this.context);
    }
    
    // Add metadata
    if (meta && typeof meta === 'object') {
      Object.assign(logData, meta);
    } else if (meta !== undefined) {
      logData['data'] = meta;
    }
    
    // Add performance timing if available
    const correlationContext = getCorrelationContext();
    if (correlationContext?.metadata?.['startTime']) {
      const startTime = correlationContext.metadata['startTime'];
      const duration = typeof startTime === 'number' ? Date.now() - startTime : 0;
      logData['duration'] = duration;
      
      // Add explicit performance metrics
      if (!logData['performanceMetrics']) {
        logData['performanceMetrics'] = {};
      }
      if (typeof logData['performanceMetrics'] === 'object' && logData['performanceMetrics'] !== null) {
        Object.assign(logData['performanceMetrics'] as object, {
          executionTimeMs: duration,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    this.winstonLogger.log(level, logData);
  }

  child(meta: Record<string, unknown>): Logger {
    const childLogger = new EnhancedLogger(this.winstonLogger.child(meta));
    childLogger.context = { ...this.context, ...meta };
    return childLogger;
  }

  setContext(context: Record<string, unknown>): void {
    this.context = { ...this.context, ...context };
  }
}

/**
 * Create a logger instance for a specific service
 */
export function createLogger(serviceName: string): Logger {
  const loggerConfig = createLoggerConfig(serviceName);
  const appConfig = getConfig();
  const mcpConfig = getMCPConfig();

  // Check if we're in MCP mode
  const isMCPMode = mcpConfig.mcpMode || (appConfig.isProduction && !process.stdin.isTTY);
  
  const winstonLogger = winston.createLogger({
    level: loggerConfig.level,
    format: loggerConfig.format,
    defaultMeta: loggerConfig.defaultMeta,
    transports: loggerConfig.transports,
    exitOnError: false,
    silent: isMCPMode || (appConfig.isTest && !mcpConfig.debugTests),
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

  return new EnhancedLogger(winstonLogger);
}

/**
 * Global logger instance for the application
 */
export const globalLogger = createLogger('MCP-QSys-Demo');
