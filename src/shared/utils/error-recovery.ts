/**
 * Error recovery utilities
 */

import { globalLogger as logger } from './logger.js';
import type { ErrorContext, BaseError } from '../types/errors.js';

/**
 * Options for error recovery
 */
export interface ErrorRecoveryOptions<T> {
  /**
   * Context for logging and debugging
   */
  context: string;
  /**
   * Fallback value to return on error
   */
  fallback: T;
  /**
   * Whether to log the error (default: true)
   */
  logError?: boolean;
  /**
   * Additional context data
   */
  contextData?: ErrorContext;
}

/**
 * Execute an operation with error recovery
 * 
 * @param operation - The async operation to execute
 * @param options - Recovery options
 * @returns The operation result or fallback value
 */
export async function withErrorRecovery<T>(
  operation: () => Promise<T>,
  options: ErrorRecoveryOptions<T>
): Promise<T> {
  const { context, fallback, logError = true, contextData } = options;
  
  try {
    return await operation();
  } catch (error) {
    if (logError) {
      logger.error(`${context} failed`, {
        error: error instanceof Error ? error : new Error(String(error)),
        context: contextData,
      });
    }
    
    return fallback;
  }
}

/**
 * Options for retry with exponential backoff
 */
export interface RetryOptions {
  /**
   * Maximum number of retry attempts
   */
  maxRetries?: number;
  /**
   * Initial delay in milliseconds
   */
  initialDelay?: number;
  /**
   * Backoff multiplier
   */
  backoffMultiplier?: number;
  /**
   * Maximum delay in milliseconds
   */
  maxDelay?: number;
  /**
   * Function to determine if error is retryable
   */
  isRetryable?: (error: unknown) => boolean;
  /**
   * Context for logging
   */
  context?: string;
}

/**
 * Execute an operation with retry logic
 * 
 * @param operation - The async operation to execute
 * @param options - Retry options
 * @returns The operation result
 * @throws The last error if all retries fail
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    backoffMultiplier = 2,
    maxDelay = 30000,
    isRetryable = () => true,
    context = 'Operation',
  } = options;
  
  let lastError: Error = new Error('No attempts made');
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (!isRetryable(error) || attempt === maxRetries) {
        throw lastError;
      }
      
      const delay = Math.min(
        initialDelay * Math.pow(backoffMultiplier, attempt),
        maxDelay
      );
      
      logger.warn(`${context} failed, retrying in ${delay}ms`, {
        attempt: attempt + 1,
        maxRetries,
        error: lastError.message,
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Transform a generic error into a domain-specific error
 * 
 * @param error - The error to transform
 * @param transformer - Function to transform the error
 * @returns The transformed error
 */
export function transformError<T extends BaseError>(
  error: unknown,
  transformer: (error: Error) => T
): T {
  if (error instanceof Error) {
    return transformer(error);
  }
  
  return transformer(new Error(String(error)));
}

/**
 * Execute an operation and transform any errors
 * 
 * @param operation - The async operation to execute
 * @param transformer - Function to transform errors
 * @returns The operation result
 * @throws The transformed error
 */
export async function withErrorTransform<T, E extends BaseError>(
  operation: () => Promise<T>,
  transformer: (error: Error) => E
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw transformError(error, transformer);
  }
}