/**
 * Error Handling Framework
 * Provides global error handling, recovery mechanisms, and error reporting
 */

import { createLogger, type Logger } from './logger.js';
import {
  BaseError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  ExternalAPIError,
  ErrorSeverity,
  ErrorCategory,
  type ErrorContext, 
  type ErrorHandler, 
  type ErrorRecovery, 
  type ErrorTransform
} from '../types/errors.js';

/**
 * Error handling configuration
 */
export interface ErrorHandlerConfig {
  logErrors: boolean;
  enableRecovery: boolean;
  enableReporting: boolean;
  maxRetryAttempts: number;
  retryDelay: number;
  reportingEndpoint?: string;
  excludeFromReporting: string[];
  transformErrors: boolean;
}

/**
 * Error report
 */
export interface ErrorReport {
  id: string;
  error: BaseError;
  context: ErrorContext;
  timestamp: number;
  stackTrace?: string | undefined;
  userAgent?: string;
  url?: string;
  userId?: string;
  sessionId?: string;
  environment: string;
  version: string;
}

/**
 * Recovery attempt result
 */
export interface RecoveryResult<T> {
  success: boolean;
  result?: T;
  error?: Error | undefined;
  attemptsUsed: number;
  recoveryMethod?: string;
}

/**
 * Global error handler class
 */
export class GlobalErrorHandler {
  private logger: Logger;
  private config: ErrorHandlerConfig;
  private handlers = new Map<string, ErrorHandler>();
  private recoveryStrategies = new Map<string, ErrorRecovery<unknown>>();
  private transformers = new Map<string, ErrorTransform>();
  private reportQueue: ErrorReport[] = [];
  private isReporting = false;

  constructor(config: Partial<ErrorHandlerConfig> = {}) {
    this.logger = createLogger('ErrorHandler');
    this.config = {
      logErrors: true,
      enableRecovery: true,
      enableReporting: false,
      maxRetryAttempts: 3,
      retryDelay: 1000,
      excludeFromReporting: ['ValidationError', 'NotFoundError'],
      transformErrors: true,
      ...config
    };

    this.setupDefaultHandlers();
    this.setupDefaultRecoveryStrategies();
    this.setupDefaultTransformers();
    this.setupGlobalHandlers();
  }

  /**
   * Handle an error with full processing pipeline
   */
  async handleError(error: Error, context?: ErrorContext): Promise<void> {
    return Promise.resolve().then(() => {
      try {
        // Transform error to structured format
        const structuredError = this.transformError(error, context);

        // Log the error
        if (this.config.logErrors) {
          this.logError(structuredError, context);
        }

        // Execute specific error handler
        this.executeHandler(structuredError, context);

        // Report error if enabled
        if (this.config.enableReporting && this.shouldReport(structuredError)) {
          this.reportError(structuredError, context);
        }
      } catch (handlingError) {
        // Prevent infinite error loops
        this.logger.error('Error in error handler:', handlingError);
      }
    });
  }

  /**
   * Handle error with recovery attempts
   */
  async handleWithRecovery<T>(
    operation: () => Promise<T>,
    errorType: string,
    context?: ErrorContext
  ): Promise<RecoveryResult<T>> {
    let lastError: Error | undefined;
    let attempts = 0;
    const maxAttempts = this.config.maxRetryAttempts;

    while (attempts < maxAttempts) {
      try {
        const result = await operation();
        return {
          success: true,
          result,
          attemptsUsed: attempts + 1,
          recoveryMethod: attempts > 0 ? 'retry' : 'initial'
        };
      } catch (error) {
        attempts++;
        lastError = error instanceof Error ? error : new Error(String(error));

        // Log attempt
        this.logger.warn(`Operation failed (attempt ${attempts}/${maxAttempts}):`, {
          error: lastError.message,
          context
        });

        // Try recovery
        const recoveryResult = await this.attemptRecovery<T>(lastError, errorType, context, attempts);
        if (recoveryResult) {
          return recoveryResult;
        }

        // Wait before retry (except on last attempt)
        if (attempts < maxAttempts) {
          await this.delay(this.config.retryDelay * attempts);
        }
      }
    }

    // All attempts failed
    if (lastError) {
      void this.handleError(lastError, context);
    }

    return {
      success: false,
      error: lastError,
      attemptsUsed: attempts
    };
  }

  /**
   * Attempt recovery for an error
   */
  private async attemptRecovery<T>(
    error: Error,
    errorType: string,
    context?: ErrorContext,
    attempts?: number
  ): Promise<RecoveryResult<T> | null> {
    if (!this.config.enableRecovery) {
      return null;
    }

    const recoveryStrategy = this.recoveryStrategies.get(errorType);
    if (!recoveryStrategy) {
      return null;
    }

    try {
      const recoveryResult = await recoveryStrategy(error, context);
      return {
        success: true,
        result: recoveryResult as T,
        attemptsUsed: attempts ?? 1,
        recoveryMethod: errorType
      };
    } catch (recoveryError) {
      this.logger.warn('Recovery strategy failed:', recoveryError);
      return null;
    }
  }

  /**
   * Register custom error handler
   */
  registerHandler(errorType: string, handler: ErrorHandler): void {
    this.handlers.set(errorType, handler);
    this.logger.debug(`Registered error handler for ${errorType}`);
  }

  /**
   * Register recovery strategy
   */
  registerRecoveryStrategy<T>(errorType: string, strategy: ErrorRecovery<T>): void {
    this.recoveryStrategies.set(errorType, strategy);
    this.logger.debug(`Registered recovery strategy for ${errorType}`);
  }

  /**
   * Register error transformer
   */
  registerTransformer(errorType: string, transformer: ErrorTransform): void {
    this.transformers.set(errorType, transformer);
    this.logger.debug(`Registered error transformer for ${errorType}`);
  }

  /**
   * Create error middleware for Express.js
   */
  createExpressMiddleware() {
    return async (error: Error, req: unknown, res: unknown, _next: unknown): Promise<void> => {
      const reqSafe = req as Record<string, unknown>;
      const context: ErrorContext = {
        url: reqSafe['url'] as string,
        method: reqSafe['method'] as string,
        userAgent: (reqSafe['get'] as ((name: string) => string) | undefined)?.('User-Agent'),
        ipAddress: reqSafe['ip'] as string,
        userId: (reqSafe['user'] as Record<string, unknown> | undefined)?.['id'] as string | undefined,
        sessionId: reqSafe['sessionID'] as string | undefined
      };

      await this.handleError(error, context);

      // Transform error for API response
      const structuredError = this.transformError(error, context);
      
      const resSafe = res as { status: (code: number) => { json: (data: unknown) => void } };
      
      resSafe.status(this.getHttpStatus(structuredError)).json({
        success: false,
        error: {
          code: structuredError.code,
          message: structuredError.message,
          details: process.env['NODE_ENV'] === 'development' ? structuredError.stack : undefined
        },
        meta: {
          requestId: (context as Record<string, unknown>)['requestId'] as string || 'unknown',
          timestamp: Date.now()
        }
      });
    };
  }

  /**
   * Transform raw error to structured error
   */
  private transformError(error: Error, context?: ErrorContext): BaseError {
    // If already a structured error, return as is
    if (error instanceof BaseError) {
      return error;
    }

    // Check for custom transformer
    const transformer = this.transformers.get(error.name) ?? this.transformers.get('default');
    if (transformer) {
      return transformer(error, context);
    }

    // Default transformation
    return new (class extends BaseError {
      // Anonymous error class for default transformation
    })(
      error.message,
      error.name.toUpperCase().replace(/ /g, '_'),
      'medium' as ErrorSeverity,
      'internal' as ErrorCategory,
      context
    );
  }

  /**
   * Log error with appropriate level
   */
  private logError(error: BaseError, context?: ErrorContext): void {
    const logContext = {
      errorId: error.id,
      code: error.code,
      severity: error.severity,
      category: error.category,
      context: error.context ?? context
    };

    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        this.logger.error(`CRITICAL: ${error.message}`, logContext);
        break;
      case ErrorSeverity.HIGH:
        this.logger.error(error.message, logContext);
        break;
      case ErrorSeverity.MEDIUM:
        this.logger.warn(error.message, logContext);
        break;
      case ErrorSeverity.LOW:
        this.logger.info(error.message, logContext);
        break;
      default:
        this.logger.error(error.message, logContext);
    }
  }

  /**
   * Execute specific error handler
   */
  private executeHandler(error: BaseError, context?: ErrorContext): void {
    const handler = this.handlers.get(error.code) ?? 
                   this.handlers.get(error.category) ?? 
                   this.handlers.get('default');

    if (handler) {
      try {
        handler(error, context);
      } catch (handlerError) {
        this.logger.error('Error handler failed:', handlerError);
      }
    }
  }

  /**
   * Check if error should be reported
   */
  private shouldReport(error: BaseError): boolean {
    return !this.config.excludeFromReporting.includes(error.code) &&
           error.severity !== ErrorSeverity.LOW;
  }

  /**
   * Report error to external service
   */
  private reportError(error: BaseError, context?: ErrorContext): void {
    const report: ErrorReport = {
      id: String(error.id),
      error,
      context: context ?? {},
      timestamp: error.timestamp,
      stackTrace: error.stack,
      environment: process.env['NODE_ENV'] ?? 'unknown',
      version: process.env['npm_package_version'] ?? 'unknown'
    };

    this.reportQueue.push(report);
    
    if (!this.isReporting) {
      void this.processReportQueue();
    }
  }

  /**
   * Process error report queue
   */
  private async processReportQueue(): Promise<void> {
    if (this.isReporting || this.reportQueue.length === 0) {
      return;
    }

    this.isReporting = true;

    while (this.reportQueue.length > 0) {
      const report = this.reportQueue.shift();
      if (report) {
        try {
          await this.sendReport(report);
        } catch (error) {
          this.logger.error('Failed to send error report:', error);
        }
      }
    }

    this.isReporting = false;
  }

  /**
   * Send error report to external service
   */
  private async sendReport(report: ErrorReport): Promise<void> {
    if (!this.config.reportingEndpoint) {
      return Promise.resolve();
    }

    // Implementation would depend on specific reporting service
    // This is a placeholder for the actual reporting logic
    this.logger.debug('Sending error report:', { reportId: report.id });
    return Promise.resolve();
  }

  /**
   * Get HTTP status code from error
   */
  private getHttpStatus(error: BaseError): number {
    switch (error.category) {
      case ErrorCategory.VALIDATION: return 400;
      case ErrorCategory.AUTHENTICATION: return 401;
      case ErrorCategory.AUTHORIZATION: return 403;
      case ErrorCategory.NOT_FOUND: return 404;
      case ErrorCategory.CONFLICT: return 409;
      case ErrorCategory.RATE_LIMIT: return 429;
      case ErrorCategory.EXTERNAL_API: return 502;
      case ErrorCategory.CONFIGURATION: return 500;
      default: return 500;
    }
  }

  /**
   * Setup default error handlers
   */
  private setupDefaultHandlers(): void {
    // Default handler
    this.handlers.set('default', (_error: Error, _context?: ErrorContext) => {
      // Default handling - already logged above
    });

    // Validation errors
    this.handlers.set('validation', (_error: Error, _context?: ErrorContext) => {
      // Could notify user about validation issues
    });

    // Critical errors
    this.handlers.set('critical', (_error: Error, _context?: ErrorContext) => {
      // Could send alerts, notifications, etc.
      this.logger.error('CRITICAL ERROR DETECTED - May require immediate attention');
    });
  }

  /**
   * Setup default recovery strategies
   */
  private setupDefaultRecoveryStrategies(): void {
    // Network error recovery
    this.recoveryStrategies.set('network', async (error: Error, _context?: ErrorContext) => {
      // Wait and retry with exponential backoff
      await this.delay(2000);
      throw error; // Re-attempt the original operation
    });

    // Rate limit recovery
    this.recoveryStrategies.set('rate_limit', async (error: Error, _context?: ErrorContext) => {
      if (error instanceof RateLimitError && error.retryAfter) {
        await this.delay(error.retryAfter * 1000);
        throw error; // Re-attempt the original operation
      }
      throw error;
    });
  }

  /**
   * Setup default error transformers
   */
  private setupDefaultTransformers(): void {
    this.transformers.set('default', (error: Error, context?: ErrorContext): BaseError => {
      return new (class extends BaseError {
        // Anonymous error class for default transformer
      })(
        error.message,
        error.name.toUpperCase().replace(/ /g, '_'),
        'medium' as ErrorSeverity,
        'internal' as ErrorCategory,
        context
      );
    });
  }

  /**
   * Setup global error handlers for unhandled errors
   */
  private setupGlobalHandlers(): void {
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, _promise) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      void this.handleError(error, { 
        source: 'unhandledRejection',
        promise: 'Promise object'
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.handleError(error, { 
        source: 'uncaughtException'
      }).finally(() => {
        // In production, you might want to exit the process
        if (process.env['NODE_ENV'] === 'production') {
          process.exit(1);
        }
      }).catch(() => {
        // Ignore errors during cleanup
        return;
      });
    });
  }

  /**
   * Utility delay function
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create global error handler instance
 */
export const globalErrorHandler = new GlobalErrorHandler();

/**
 * Utility functions for common error scenarios
 */
export const ErrorUtils = {
  /**
   * Safely execute async operation with error handling
   */
  async safeExecute<T>(
    operation: () => Promise<T>,
    errorContext?: ErrorContext
  ): Promise<T | null> {
    try {
      return await operation();
    } catch (error) {
      await globalErrorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        errorContext
      );
      return null;
    }
  },

  /**
   * Wrap function with error handling
   */
  wrapWithErrorHandling<T extends (...args: unknown[]) => Promise<unknown>>(
    fn: T,
    errorContext?: ErrorContext
  ): T {
    return (async (...args: Parameters<T>) => {
      try {
        return await fn(...args);
      } catch (error) {
        await globalErrorHandler.handleError(
          error instanceof Error ? error : new Error(String(error)),
          { ...errorContext, functionName: fn.name, arguments: args }
        );
        throw error;
      }
    }) as T;
  },

  /**
   * Create error from HTTP response
   */
  createHttpError(status: number, message: string, context?: ErrorContext): BaseError {
    switch (status) {
      case 400:
        return new ValidationError(message, [], context);
      case 401:
        return new UnauthorizedError(message, context);
      case 403:
        return new ForbiddenError(message, context);
      case 404:
        return new NotFoundError(message, undefined, context);
      case 409:
        return new ConflictError(message, context);
      case 429:
        return new RateLimitError(message, undefined, context);
      default:
        return new ExternalAPIError(message, status, undefined, context);
    }
  },

  /**
   * Validate and throw validation error if invalid
   */
  validate(condition: boolean, message: string, field?: string, context?: ErrorContext): void {
    if (!condition) {
      const fields = field ? [{ field, message, code: 'INVALID', value: undefined }] : [];
      throw new ValidationError(message, fields, context);
    }
  },

  /**
   * Assert existence and throw not found if missing
   */
  assertExists<T>(value: T | null | undefined, resource: string, id?: string, context?: ErrorContext): T {
    if (value == null) {
      throw new NotFoundError(resource, id, context);
    }
    return value;
  }
}; 