/**
 * Circuit Breaker Pattern Implementation
 * 
 * Provides fault tolerance for external service calls (Q-SYS connections)
 * by preventing cascading failures and allowing systems to recover.
 */

import { EventEmitter } from 'events';
import { createLogger, type Logger } from '../../shared/utils/logger.js';

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',         // Failing, rejecting calls
  HALF_OPEN = 'half-open' // Testing if service recovered
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Name for logging and identification */
  name: string;
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Success threshold to close circuit from half-open */
  successThreshold: number;
  /** Time in ms before attempting to close circuit */
  timeout: number;
  /** Optional custom error filter */
  errorFilter?: (error: unknown) => boolean;
  /** Monitor function to check service health */
  monitor?: () => Promise<boolean>;
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  totalCalls: number;
  rejectedCalls: number;
}

/**
 * Circuit breaker events
 */
export interface CircuitBreakerEvents {
  'state-change': [oldState: CircuitState, newState: CircuitState];
  'open': [stats: CircuitBreakerStats];
  'close': [stats: CircuitBreakerStats];
  'half-open': [stats: CircuitBreakerStats];
  'call-rejected': [state: CircuitState];
  'call-success': [duration: number];
  'call-failure': [error: unknown, duration: number];
}

/**
 * Circuit Breaker Implementation
 * 
 * Implements the circuit breaker pattern to protect against cascading failures
 */
export class CircuitBreaker extends EventEmitter<CircuitBreakerEvents> {
  private readonly logger: Logger;
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private nextAttempt?: Date;
  private totalCalls = 0;
  private rejectedCalls = 0;
  private resetTimer?: NodeJS.Timeout;
  private monitorInterval?: NodeJS.Timeout;

  constructor(private readonly config: CircuitBreakerConfig) {
    super();
    this.logger = createLogger(`circuit-breaker-${config.name}`);
    
    // Start monitoring if configured
    if (config.monitor) {
      this.startMonitoring();
    }

    this.logger.info('Circuit breaker initialized', {
      name: config.name,
      failureThreshold: config.failureThreshold,
      timeout: config.timeout,
    });
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalCalls++;

    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        this.rejectedCalls++;
        this.emit('call-rejected', this.state);
        throw new Error(`Circuit breaker is OPEN for ${this.config.name}`);
      }
    }

    // Attempt the call
    const startTime = Date.now();
    
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      
      this.onSuccess(duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error should trip circuit
      if (this.config.errorFilter && !this.config.errorFilter(error)) {
        // Error doesn't count towards circuit breaker
        throw error;
      }
      
      this.onFailure(error, duration);
      throw error;
    }
  }

  /**
   * Handle successful call
   */
  private onSuccess(duration: number): void {
    this.failures = 0;
    this.successes++;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses++;
    this.lastSuccessTime = new Date();

    this.emit('call-success', duration);

    // Close circuit if in half-open state and reached success threshold
    if (
      this.state === CircuitState.HALF_OPEN &&
      this.consecutiveSuccesses >= this.config.successThreshold
    ) {
      this.transitionTo(CircuitState.CLOSED);
    }
  }

  /**
   * Handle failed call
   */
  private onFailure(error: unknown, duration: number): void {
    this.failures++;
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = new Date();

    this.emit('call-failure', error, duration);

    this.logger.warn('Call failed', {
      error: error instanceof Error ? error.message : String(error),
      consecutiveFailures: this.consecutiveFailures,
      state: this.state,
    });

    // Open circuit if threshold reached
    if (
      this.state === CircuitState.CLOSED &&
      this.consecutiveFailures >= this.config.failureThreshold
    ) {
      this.transitionTo(CircuitState.OPEN);
    } else if (this.state === CircuitState.HALF_OPEN) {
      // Single failure in half-open state reopens circuit
      this.transitionTo(CircuitState.OPEN);
    }
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    
    if (oldState === newState) {
      return;
    }

    this.state = newState;
    this.emit('state-change', oldState, newState);

    this.logger.info('Circuit breaker state changed', {
      name: this.config.name,
      oldState,
      newState,
      stats: this.getStats(),
    });

    // Handle state-specific actions
    switch (newState) {
      case CircuitState.OPEN:
        this.nextAttempt = new Date(Date.now() + this.config.timeout);
        this.emit('open', this.getStats());
        this.scheduleReset();
        break;

      case CircuitState.HALF_OPEN:
        this.consecutiveSuccesses = 0;
        this.emit('half-open', this.getStats());
        break;

      case CircuitState.CLOSED:
        this.consecutiveFailures = 0;
        this.emit('close', this.getStats());
        this.clearResetTimer();
        break;
    }
  }

  /**
   * Check if we should attempt to reset the circuit
   */
  private shouldAttemptReset(): boolean {
    return (
      this.nextAttempt !== undefined &&
      Date.now() >= this.nextAttempt.getTime()
    );
  }

  /**
   * Schedule automatic reset attempt
   */
  private scheduleReset(): void {
    this.clearResetTimer();

    this.resetTimer = setTimeout(() => {
      if (this.state === CircuitState.OPEN) {
        this.logger.debug('Attempting automatic reset', {
          name: this.config.name,
        });
        this.transitionTo(CircuitState.HALF_OPEN);
      }
    }, this.config.timeout);
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
   * Start health monitoring
   */
  private startMonitoring(): void {
    if (!this.config.monitor) {
      return;
    }

    // Check health every 30 seconds
    this.monitorInterval = setInterval(() => {
      if (this.state === CircuitState.OPEN) {
        this.config.monitor?.()
          .then(healthy => {
            if (healthy) {
              this.logger.info('Monitor detected service recovery', {
                name: this.config.name,
              });
              this.transitionTo(CircuitState.HALF_OPEN);
            }
          })
          .catch(error => {
            this.logger.debug('Monitor check failed', {
              name: this.config.name,
              error,
            });
          });
      }
    }, 30000);
  }

  /**
   * Get current statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalCalls: this.totalCalls,
      rejectedCalls: this.rejectedCalls,
    };
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Force circuit to open state
   */
  trip(): void {
    this.transitionTo(CircuitState.OPEN);
  }

  /**
   * Force circuit to closed state
   */
  reset(): void {
    this.failures = 0;
    this.successes = 0;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.transitionTo(CircuitState.CLOSED);
  }

  /**
   * Stop the circuit breaker
   */
  stop(): void {
    this.clearResetTimer();
    
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
    }

    this.removeAllListeners();
    this.logger.info('Circuit breaker stopped', { name: this.config.name });
  }
}

/**
 * Create a circuit breaker for Q-SYS connections
 */
export function createQSysCircuitBreaker(
  name = 'qsys-connection'
): CircuitBreaker {
  return new CircuitBreaker({
    name,
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 60000, // 1 minute
    errorFilter: (error: unknown) => {
      // Only count connection errors
      if (error instanceof Error) {
        return (
          error.message.includes('connection') ||
          error.message.includes('timeout') ||
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('ETIMEDOUT')
        );
      }
      return true;
    },
  });
}