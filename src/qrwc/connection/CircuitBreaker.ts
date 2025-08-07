/**
 * Circuit Breaker pattern implementation
 * Prevents cascade failures by temporarily blocking requests after repeated failures
 */

import { EventEmitter } from 'events';
import type { Logger } from '../../shared/utils/logger.js';

export interface CircuitBreakerOptions {
  threshold: number;        // Number of failures before opening
  timeout: number;          // Time in ms before attempting to close
  resetTimeout?: number;    // Time in ms of success before fully resetting
  logger?: Logger;
}

export interface CircuitBreakerEvents {
  open: [];
  close: [];
  half_open: [];
}

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export class CircuitBreaker extends EventEmitter<CircuitBreakerEvents> {
  private state: CircuitBreakerState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: Date | null = null;
  private nextAttemptTime: Date | null = null;
  private resetTimer?: NodeJS.Timeout;
  private options: Required<CircuitBreakerOptions>;
  private logger?: Logger;

  constructor(options: CircuitBreakerOptions) {
    super();

    this.options = {
      threshold: options.threshold,
      timeout: options.timeout,
      resetTimeout: options.resetTimeout ?? 120000, // 2 minutes default
      logger: options.logger,
    };

    this.logger = options.logger;
  }

  /**
   * Check if circuit breaker is open
   */
  isOpen(): boolean {
    // Check if we should transition from open to half-open
    if (this.state === 'open' && this.nextAttemptTime) {
      if (Date.now() >= this.nextAttemptTime.getTime()) {
        this.transitionToHalfOpen();
      }
    }

    return this.state === 'open';
  }

  /**
   * Record a successful operation
   */
  onSuccess(): void {
    if (this.state === 'half-open') {
      this.successCount++;
      
      // After success in half-open, close the circuit
      if (this.successCount >= 1) {
        this.close();
      }
    } else if (this.state === 'closed') {
      this.failureCount = 0;
      // Reset any pending timers on success
      this.clearResetTimer();
    }

    this.logger?.debug('Circuit breaker success recorded', {
      state: this.state,
      successCount: this.successCount,
    });
  }

  /**
   * Record a failed operation
   */
  onFailure(): void {
    this.lastFailureTime = new Date();

    if (this.state === 'half-open') {
      // Any failure in half-open state immediately opens the circuit
      this.failureCount++;
      this.open();
    } else if (this.state === 'closed') {
      this.failureCount++;
      // Check if we've exceeded the threshold
      if (this.failureCount >= this.options.threshold) {
        this.open();
      }
    }
    // Don't increment failure count when already open

    this.logger?.debug('Circuit breaker failure recorded', {
      state: this.state,
      failureCount: this.failureCount,
      threshold: this.options.threshold,
    });
  }

  /**
   * Open the circuit breaker
   */
  private open(): void {
    if (this.state === 'open') return;

    const previousState = this.state;
    this.state = 'open';
    this.successCount = 0;
    this.nextAttemptTime = new Date(Date.now() + this.options.timeout);

    this.logger?.warn('Circuit breaker opened', {
      previousState,
      failureCount: this.failureCount,
      nextAttemptTime: this.nextAttemptTime.toISOString(),
    });

    this.emit('open');

    // Schedule automatic transition to half-open
    this.scheduleHalfOpen();
  }

  /**
   * Close the circuit breaker
   */
  private close(): void {
    if (this.state === 'closed') return;

    const previousState = this.state;
    this.state = 'closed';
    this.failureCount = 0;
    // Don't reset success count immediately on close
    this.nextAttemptTime = null;

    this.logger?.info('Circuit breaker closed', {
      previousState,
    });

    this.emit('close');
    this.clearResetTimer();
  }

  /**
   * Transition to half-open state
   */
  private transitionToHalfOpen(): void {
    if (this.state !== 'open') return;

    this.state = 'half-open';
    this.successCount = 0;

    this.logger?.info('Circuit breaker transitioned to half-open');
    this.emit('half_open');
  }

  /**
   * Schedule transition to half-open state
   */
  private scheduleHalfOpen(): void {
    this.clearResetTimer();

    this.resetTimer = setTimeout(() => {
      if (this.state === 'open') {
        this.transitionToHalfOpen();
      }
    }, this.options.timeout);
  }

  /**
   * Clear reset timer
   */
  private clearResetTimer(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    // Check for automatic transition
    if (this.state === 'open' && this.nextAttemptTime) {
      if (Date.now() >= this.nextAttemptTime.getTime()) {
        this.transitionToHalfOpen();
      }
    }

    return this.state;
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): {
    state: CircuitBreakerState;
    failureCount: number;
    successCount: number;
    lastFailureTime: Date | null;
    nextAttemptTime: Date | null;
  } {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.clearResetTimer();

    this.logger?.debug('Circuit breaker reset');
  }

  /**
   * Force open the circuit breaker
   */
  forceOpen(): void {
    this.open();
  }

  /**
   * Force close the circuit breaker
   */
  forceClose(): void {
    this.close();
  }
}