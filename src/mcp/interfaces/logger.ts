/**
 * Logger Interface for Dependency Injection
 * 
 * Defines the contract for logger implementations to ensure
 * consistency across the application and enable easy mocking in tests.
 */

/**
 * Logger interface matching Winston's API
 */
export interface ILogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  child(meta: Record<string, unknown>): ILogger;
}

/**
 * Type guard to check if an object implements ILogger
 */
export function isLogger(obj: unknown): obj is ILogger {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'info' in obj && typeof (obj as ILogger).info === 'function' &&
    'warn' in obj && typeof (obj as ILogger).warn === 'function' &&
    'error' in obj && typeof (obj as ILogger).error === 'function' &&
    'debug' in obj && typeof (obj as ILogger).debug === 'function' &&
    'child' in obj && typeof (obj as ILogger).child === 'function'
  );
}