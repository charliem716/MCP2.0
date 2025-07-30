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
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  debug(message: string, meta?: any): void;
  child(meta: any): ILogger;
}

/**
 * Type guard to check if an object implements ILogger
 */
export function isLogger(obj: any): obj is ILogger {
  return (
    obj &&
    typeof obj.info === 'function' &&
    typeof obj.warn === 'function' &&
    typeof obj.error === 'function' &&
    typeof obj.debug === 'function' &&
    typeof obj.child === 'function'
  );
}