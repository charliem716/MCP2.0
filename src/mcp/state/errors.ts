/**
 * State management specific error types
 */

import { BaseError, ErrorSeverity, ErrorCategory, type ErrorContext } from '../../shared/types/errors.js';

/**
 * State-specific error codes
 */
export enum StateErrorCode {
  INVALID_STATE = 'STATE_INVALID_STATE',
  STATE_NOT_FOUND = 'STATE_NOT_FOUND',
  STATE_CONFLICT = 'STATE_CONFLICT',
  CACHE_ERROR = 'STATE_CACHE_ERROR',
  INVALIDATION_ERROR = 'STATE_INVALIDATION_ERROR',
  SYNC_ERROR = 'STATE_SYNC_ERROR',
}

/**
 * Cache-specific error codes
 */
export enum CacheErrorCode {
  CAPACITY_ERROR = 'CACHE_CAPACITY_ERROR',
  INVALID_DATA = 'CACHE_INVALID_DATA',
  SERIALIZATION_ERROR = 'CACHE_SERIALIZATION_ERROR',
  RETRIEVAL_ERROR = 'CACHE_RETRIEVAL_ERROR',
  EVICTION_ERROR = 'CACHE_EVICTION_ERROR',
}

/**
 * State management error class
 */
export class StateError extends BaseError {
  constructor(
    message: string,
    code: StateErrorCode,
    context?: ErrorContext
  ) {
    super(
      message,
      code,
      ErrorSeverity.HIGH,
      ErrorCategory.INTERNAL,
      context
    );
  }
}

/**
 * Cache error class
 */
export class CacheError extends BaseError {
  constructor(
    message: string,
    code: CacheErrorCode,
    context?: ErrorContext
  ) {
    super(
      message,
      code,
      ErrorSeverity.MEDIUM,
      ErrorCategory.INTERNAL,
      context
    );
  }
}