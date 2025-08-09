/**
 * Correlation ID management for request tracing
 */

import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * Async local storage for correlation context
 */
const correlationStorage = new AsyncLocalStorage<{
  correlationId: string;
  metadata?: Record<string, unknown>;
}>();

/**
 * Generate a new correlation ID
 */
export function generateCorrelationId(): string {
  return randomUUID();
}

/**
 * Run a function with a correlation context
 */
export function runWithCorrelation<T>(
  correlationId: string,
  fn: () => T,
  metadata?: Record<string, unknown>
): T {
  return correlationStorage.run(
    metadata ? { correlationId, metadata } : { correlationId }, 
    fn
  );
}

/**
 * Get the current correlation ID from context
 */
export function getCorrelationId(): string | undefined {
  const context = correlationStorage.getStore();
  return context?.correlationId;
}

/**
 * Get the current correlation context
 */
export function getCorrelationContext(): {
  correlationId: string;
  metadata?: Record<string, unknown>;
} | undefined {
  return correlationStorage.getStore();
}

/**
 * Create a correlation middleware for MCP requests
 */
export function createCorrelationMiddleware() {
  return (request: { method?: string }, next: () => unknown) => {
    const correlationId = generateCorrelationId();
    return runWithCorrelation(correlationId, next, { 
      method: request.method,
      timestamp: new Date().toISOString()
    });
  };
}