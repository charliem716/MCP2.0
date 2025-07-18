/**
 * Error types and base error classes
 */

import type { ID, Timestamp } from './common.js';

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Error categories
 */
export enum ErrorCategory {
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  NOT_FOUND = 'not_found',
  CONFLICT = 'conflict',
  RATE_LIMIT = 'rate_limit',
  EXTERNAL_API = 'external_api',
  DATABASE = 'database',
  NETWORK = 'network',
  CONFIGURATION = 'configuration',
  INTERNAL = 'internal',
}

/**
 * Error context information
 */
export interface ErrorContext {
  [key: string]: any;
}

/**
 * Structured error information
 */
export interface ErrorInfo {
  id: ID;
  code: string;
  message: string;
  severity: ErrorSeverity;
  category: ErrorCategory;
  timestamp: Timestamp;
  context?: ErrorContext | undefined;
  stack?: string | undefined;
  cause?: Error | undefined;
}

/**
 * Validation error field
 */
export interface ValidationErrorField {
  field: string;
  message: string;
  code: string;
  value?: any;
}

/**
 * Validation error details
 */
export interface ValidationErrorDetails {
  fields: ValidationErrorField[];
  totalErrors: number;
}

/**
 * API error response
 */
export interface APIErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: Timestamp;
    requestId?: string;
  };
}

/**
 * Q-SYS specific error codes
 */
export enum QSysErrorCode {
  CONNECTION_FAILED = 'QSYS_CONNECTION_FAILED',
  CONNECTION_CLOSED = 'QSYS_CONNECTION_CLOSED',
  AUTHENTICATION_FAILED = 'QSYS_AUTHENTICATION_FAILED',
  INVALID_COMPONENT = 'QSYS_INVALID_COMPONENT',
  INVALID_CONTROL = 'QSYS_INVALID_CONTROL',
  COMMAND_FAILED = 'QSYS_COMMAND_FAILED',
  TIMEOUT = 'QSYS_TIMEOUT',
  WEBSOCKET_ERROR = 'QSYS_WEBSOCKET_ERROR',
}

/**
 * OpenAI specific error codes
 */
export enum OpenAIErrorCode {
  API_KEY_INVALID = 'OPENAI_API_KEY_INVALID',
  RATE_LIMIT_EXCEEDED = 'OPENAI_RATE_LIMIT_EXCEEDED',
  TOKEN_LIMIT_EXCEEDED = 'OPENAI_TOKEN_LIMIT_EXCEEDED',
  MODEL_NOT_FOUND = 'OPENAI_MODEL_NOT_FOUND',
  INSUFFICIENT_QUOTA = 'OPENAI_INSUFFICIENT_QUOTA',
  API_ERROR = 'OPENAI_API_ERROR',
}

/**
 * MCP specific error codes
 */
export enum MCPErrorCode {
  TRANSPORT_ERROR = 'MCP_TRANSPORT_ERROR',
  PROTOCOL_ERROR = 'MCP_PROTOCOL_ERROR',
  METHOD_NOT_FOUND = 'MCP_METHOD_NOT_FOUND',
  INVALID_PARAMS = 'MCP_INVALID_PARAMS',
  TOOL_NOT_FOUND = 'MCP_TOOL_NOT_FOUND',
  TOOL_EXECUTION_ERROR = 'MCP_TOOL_EXECUTION_ERROR',
}

/**
 * Base application error class
 */
export abstract class BaseError extends Error {
  public readonly id: ID;
  public readonly code: string;
  public readonly severity: ErrorSeverity;
  public readonly category: ErrorCategory;
  public readonly timestamp: Timestamp;
  public readonly context?: ErrorContext | undefined;

  constructor(
    message: string,
    code: string,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    category: ErrorCategory = ErrorCategory.INTERNAL,
    context?: ErrorContext | undefined
  ) {
    super(message);
    this.name = this.constructor.name;
    this.id = crypto.randomUUID();
    this.code = code;
    this.severity = severity;
    this.category = category;
    this.timestamp = Date.now();
    this.context = context;

    // Ensure the error stack is captured
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON(): ErrorInfo {
    return {
      id: this.id,
      code: this.code,
      message: this.message,
      severity: this.severity,
      category: this.category,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * Validation error class
 */
export class ValidationError extends BaseError {
  public readonly fields: ValidationErrorField[];

  constructor(
    message: string,
    fields: ValidationErrorField[],
    context?: ErrorContext
  ) {
    super(message, 'VALIDATION_ERROR', ErrorSeverity.MEDIUM, ErrorCategory.VALIDATION, context);
    this.fields = fields;
  }

  override toJSON(): ErrorInfo & { fields: ValidationErrorField[] } {
    return {
      ...super.toJSON(),
      fields: this.fields,
    };
  }
}

/**
 * Not found error class
 */
export class NotFoundError extends BaseError {
  constructor(resource: string, id?: ID, context?: ErrorContext) {
    const message = id ? `${resource} with ID ${id} not found` : `${resource} not found`;
    super(message, 'NOT_FOUND', ErrorSeverity.LOW, ErrorCategory.NOT_FOUND, context);
  }
}

/**
 * Unauthorized error class
 */
export class UnauthorizedError extends BaseError {
  constructor(message: string = 'Unauthorized', context?: ErrorContext) {
    super(message, 'UNAUTHORIZED', ErrorSeverity.HIGH, ErrorCategory.AUTHENTICATION, context);
  }
}

/**
 * Forbidden error class
 */
export class ForbiddenError extends BaseError {
  constructor(message: string = 'Forbidden', context?: ErrorContext) {
    super(message, 'FORBIDDEN', ErrorSeverity.HIGH, ErrorCategory.AUTHORIZATION, context);
  }
}

/**
 * Conflict error class
 */
export class ConflictError extends BaseError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'CONFLICT', ErrorSeverity.MEDIUM, ErrorCategory.CONFLICT, context);
  }
}

/**
 * Rate limit error class
 */
export class RateLimitError extends BaseError {
  public readonly retryAfter?: number | undefined;

  constructor(message: string = 'Rate limit exceeded', retryAfter?: number | undefined, context?: ErrorContext | undefined) {
    super(message, 'RATE_LIMIT_EXCEEDED', ErrorSeverity.MEDIUM, ErrorCategory.RATE_LIMIT, context);
    this.retryAfter = retryAfter;
  }
}

/**
 * External API error class
 */
export class ExternalAPIError extends BaseError {
  public readonly statusCode?: number | undefined;
  public readonly responseBody?: any;

  constructor(
    message: string,
    statusCode?: number | undefined,
    responseBody?: any,
    context?: ErrorContext | undefined
  ) {
    super(message, 'EXTERNAL_API_ERROR', ErrorSeverity.HIGH, ErrorCategory.EXTERNAL_API, context);
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

/**
 * Q-SYS specific error class
 */
export class QSysError extends BaseError {
  constructor(
    message: string,
    code: QSysErrorCode,
    context?: ErrorContext
  ) {
    super(message, code, ErrorSeverity.HIGH, ErrorCategory.EXTERNAL_API, context);
  }
}

/**
 * OpenAI specific error class
 */
export class OpenAIError extends BaseError {
  constructor(
    message: string,
    code: OpenAIErrorCode,
    context?: ErrorContext
  ) {
    super(message, code, ErrorSeverity.HIGH, ErrorCategory.EXTERNAL_API, context);
  }
}

/**
 * MCP specific error class
 */
export class MCPError extends BaseError {
  constructor(
    message: string,
    code: MCPErrorCode,
    context?: ErrorContext
  ) {
    super(message, code, ErrorSeverity.HIGH, ErrorCategory.EXTERNAL_API, context);
  }
}

/**
 * Configuration error class
 */
export class ConfigurationError extends BaseError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'CONFIGURATION_ERROR', ErrorSeverity.CRITICAL, ErrorCategory.CONFIGURATION, context);
  }
}

/**
 * Network error class
 */
export class NetworkError extends BaseError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'NETWORK_ERROR', ErrorSeverity.HIGH, ErrorCategory.NETWORK, context);
  }
}

/**
 * Database error class
 */
export class DatabaseError extends BaseError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'DATABASE_ERROR', ErrorSeverity.HIGH, ErrorCategory.DATABASE, context);
  }
}

/**
 * Error handler function type
 */
export type ErrorHandler = (error: Error, context?: ErrorContext) => void;

/**
 * Error recovery function type
 */
export type ErrorRecovery<T> = (error: Error, context?: ErrorContext) => Promise<T>;

/**
 * Error transformation function type
 */
export type ErrorTransform = (error: Error, context?: ErrorContext) => BaseError; 