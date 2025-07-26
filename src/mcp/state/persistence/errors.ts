/**
 * Persistence-specific error types
 */

import { BaseError, ErrorCategory, ErrorContext, ErrorSeverity } from '../../../shared/types/errors.js';

/**
 * Persistence error codes
 */
export enum PersistenceErrorCode {
  SAVE_FAILED = 'PERSISTENCE_SAVE_FAILED',
  LOAD_FAILED = 'PERSISTENCE_LOAD_FAILED',
  INVALID_STATE = 'PERSISTENCE_INVALID_STATE',
  BACKUP_FAILED = 'PERSISTENCE_BACKUP_FAILED',
  FILE_ACCESS_ERROR = 'PERSISTENCE_FILE_ACCESS_ERROR',
  SERIALIZATION_ERROR = 'PERSISTENCE_SERIALIZATION_ERROR',
  UNSUPPORTED_FORMAT = 'PERSISTENCE_UNSUPPORTED_FORMAT',
  VERSION_MISMATCH = 'PERSISTENCE_VERSION_MISMATCH',
  VALIDATION_ERROR = 'PERSISTENCE_VALIDATION_ERROR',
}

/**
 * Persistence-specific error class
 */
export class PersistenceError extends BaseError {
  constructor(
    message: string,
    code: PersistenceErrorCode,
    context?: ErrorContext
  ) {
    super(
      message,
      code,
      ErrorSeverity.HIGH,
      ErrorCategory.DATABASE, // Using DATABASE category for storage-related errors
      context
    );
  }
}