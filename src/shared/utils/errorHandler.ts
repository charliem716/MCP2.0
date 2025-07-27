/**
 * Simple Error Handler for MCP
 * Provides basic error handling and utilities
 */

import { createLogger, type Logger } from './logger.js';
import type { ErrorContext } from '../types/errors.js';

/**
 * Error handler configuration
 */
export interface ErrorHandlerConfig {
  logErrors?: boolean;
  enableRecovery?: boolean;
  maxRetryAttempts?: number;
  retryDelay?: number;
}

/**
 * Global error handler
 */
export class GlobalErrorHandler {
  private logger: Logger;
  private config: ErrorHandlerConfig;

  constructor(config: ErrorHandlerConfig = {}) {
    this.logger = createLogger('ErrorHandler');
    this.config = {
      logErrors: true,
      enableRecovery: false,
      maxRetryAttempts: 3,
      retryDelay: 1000,
      ...config,
    };
  }

  /**
   * Handle an error with logging
   */
  handleError(error: Error, context?: ErrorContext): void {
    if (this.config.logErrors) {
      this.logger.error(error.message, {
        error: error.stack,
        context,
        name: error.name,
      });
    }
  }

  /**
   * Format error for user display
   */
  formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}

/**
 * Error utilities
 */
export class ErrorUtils {
  /**
   * Check if error is retryable
   */
  static isRetryable(error: Error): boolean {
    // Network and timeout errors are typically retryable
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnrefused')
    );
  }

  /**
   * Sleep for specified milliseconds
   */
  static async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retry an operation with exponential backoff
   */
  static async retry<T>(
    operation: () => Promise<T>,
    maxAttempts = 3,
    baseDelay = 1000
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxAttempts || !this.isRetryable(lastError)) {
          throw lastError;
        }

        const delay = baseDelay * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }
    }

    throw lastError!;
  }
}

// Export singleton instance
export const globalErrorHandler = new GlobalErrorHandler();

// Export for backward compatibility
export default GlobalErrorHandler;
