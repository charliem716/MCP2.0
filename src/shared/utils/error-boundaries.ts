/**
 * Error boundary utilities for comprehensive error handling
 */

import { globalLogger as logger } from './logger.js';
import { QSysError, QSysErrorCode } from '../types/errors.js';

/**
 * Timeout wrapper for async operations
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName = 'Operation'
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const timeoutError = new QSysError(
        `${operationName} timed out after ${timeoutMs}ms`,
        QSysErrorCode.TIMEOUT
      );
      reject(timeoutError);
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error: unknown) => {
        clearTimeout(timeoutId);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
  });
}

/**
 * Safe async operation wrapper with error boundaries
 */
export async function safeAsyncOperation<T>(
  operation: () => Promise<T>,
  context: {
    operationName: string;
    timeoutMs?: number;
    fallbackValue?: T;
    logError?: boolean;
  }
): Promise<T> {
  const { operationName, timeoutMs = 30000, fallbackValue, logError = true } = context;

  try {
    const result = await withTimeout(operation(), timeoutMs, operationName);
    return result;
  } catch (error) {
    if (logError) {
      logger.error(`Error in ${operationName}`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        operationName,
        timeoutMs,
      });
    }

    if (fallbackValue !== undefined) {
      logger.warn(`Using fallback value for ${operationName}`);
      return fallbackValue;
    }

    throw error;
  }
}

/**
 * Validate required parameters with detailed error messages
 */
export function validateRequiredParams<T extends Record<string, unknown>>(
  params: T,
  required: Array<keyof T>,
  context: string
): void {
  const missing = required.filter((key) => params[key] === undefined || params[key] === null);

  if (missing.length > 0) {
    throw new QSysError(
      `Missing required parameters in ${context}: ${missing.join(', ')}`,
      QSysErrorCode.COMMAND_FAILED
    );
  }
}

/**
 * Safe property access with undefined checking
 */
export function safeGet<T, K extends keyof T>(
  obj: T | undefined | null,
  key: K,
  defaultValue?: T[K]
): T[K] | undefined {
  if (!obj) {
    return defaultValue;
  }
  return obj[key] ?? defaultValue;
}

/**
 * Format error for user-friendly display
 */
export function formatUserError(error: unknown, context?: string): string {
  let message: string;
  let code = 'UNKNOWN_ERROR';

  if (error instanceof QSysError) {
    message = error.message;
    code = error.code;
  } else if (error instanceof Error) {
    message = error.message;
    if ('code' in error && typeof error.code === 'string') {
      code = error.code;
    }
  } else {
    message = String(error);
  }

  if (context) {
    return `${context}: ${message} (${code})`;
  }

  return `${message} (${code})`;
}

/**
 * Wrap a function to catch and log errors
 */
export function errorBoundary<T extends (...args: never[]) => unknown>(
  fn: T,
  context: string
): T {
  return ((...args: Parameters<T>) => {
    try {
      const result = fn(...args);
      
      // Handle async functions
      if (result instanceof Promise) {
        return result.catch((error) => {
          logger.error(`Error in ${context}`, {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            args: args.length > 0 ? args : undefined,
          });
          throw error;
        });
      }
      
      return result;
    } catch (error) {
      logger.error(`Error in ${context}`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        args: args.length > 0 ? args : undefined,
      });
      throw error;
    }
  }) as T;
}

/**
 * Create a circuit breaker for handling repeated failures
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private readonly threshold = 5,
    private readonly resetTimeout = 60000, // 1 minute
    private readonly context = 'Operation'
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure > this.resetTimeout) {
        this.state = 'half-open';
        logger.info(`Circuit breaker for ${this.context} entering half-open state`);
      } else {
        const circuitOpenError = new QSysError(
          `Circuit breaker for ${this.context} is open due to repeated failures`,
          QSysErrorCode.CONNECTION_FAILED
        );
        throw circuitOpenError;
      }
    }

    try {
      const result = await operation();
      
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failures = 0;
        logger.info(`Circuit breaker for ${this.context} closed - operation successful`);
      }
      
      return result;
    } catch (error: unknown) {
      this.failures++;
      this.lastFailureTime = Date.now();

      if (this.failures >= this.threshold) {
        this.state = 'open';
        logger.error(`Circuit breaker for ${this.context} opened after ${this.failures} failures`);
      }

      throw error;
    }
  }

  reset(): void {
    this.failures = 0;
    this.state = 'closed';
    this.lastFailureTime = 0;
  }
}