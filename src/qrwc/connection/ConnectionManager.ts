/**
 * Connection Manager with resilience and retry logic
 * Implements exponential backoff, circuit breaker, and health monitoring
 */

import { EventEmitter } from 'events';
import { ConnectionState } from '../../shared/types/common.js';
import { createLogger, type Logger } from '../../shared/utils/logger.js';
import type { CircuitBreakerOptions } from './CircuitBreaker.js';
import { CircuitBreaker } from './CircuitBreaker.js';

export interface ConnectionManagerOptions {
  maxRetries?: number;
  initialRetryDelay?: number;
  maxRetryDelay?: number;
  connectionTimeout?: number;
  healthCheckInterval?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerTimeout?: number;
  logger?: Logger;
}

export interface ConnectionManagerEvents {
  state_change: [state: ConnectionState];
  retry: [attempt: number, delay: number];
  circuit_breaker_open: [];
  circuit_breaker_close: [];
  health_check: [isHealthy: boolean];
}

export interface ConnectionHealth {
  isHealthy: boolean;
  lastSuccessfulConnection: Date | null;
  consecutiveFailures: number;
  totalAttempts: number;
  totalSuccesses: number;
  uptime: number;
  state: ConnectionState;
  circuitBreakerState: 'closed' | 'open' | 'half-open';
}

export class ConnectionManager extends EventEmitter<ConnectionManagerEvents> {
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private retryCount = 0;
  private options: Required<ConnectionManagerOptions>;
  private logger: Logger;
  private circuitBreaker: CircuitBreaker;
  private lastSuccessfulConnection: Date | null = null;
  private consecutiveFailures = 0;
  private totalAttempts = 0;
  private totalSuccesses = 0;
  private connectionStartTime: Date | null = null;
  private healthCheckTimer?: NodeJS.Timeout;
  private retryTimer?: NodeJS.Timeout;
  private connectFunction?: () => Promise<void>;

  constructor(options: ConnectionManagerOptions = {}) {
    super();

    // Create a fallback logger for test environments
    const noop = () => { /* no-op */ };
    const fallbackLogger: Logger = { 
      info: noop, 
      error: noop, 
      warn: noop, 
      debug: noop,
      child: () => fallbackLogger,
      setContext: noop,
    };

    try {
      this.logger = options.logger ?? createLogger('connection-manager') ?? fallbackLogger;
    } catch {
      this.logger = fallbackLogger;
    }

    this.options = {
      maxRetries: options.maxRetries ?? 10,
      initialRetryDelay: options.initialRetryDelay ?? 1000,
      maxRetryDelay: options.maxRetryDelay ?? 30000,
      connectionTimeout: options.connectionTimeout ?? 10000,
      healthCheckInterval: options.healthCheckInterval ?? 30000,
      circuitBreakerThreshold: options.circuitBreakerThreshold ?? 5,
      circuitBreakerTimeout: options.circuitBreakerTimeout ?? 60000,
      logger: this.logger,
    };

    // Initialize circuit breaker with proper logger handling
    const circuitBreakerOptions: CircuitBreakerOptions = {
      threshold: this.options.circuitBreakerThreshold,
      timeout: this.options.circuitBreakerTimeout,
    };
    
    if (this.logger.child) {
      circuitBreakerOptions.logger = this.logger.child({ component: 'circuit-breaker' });
    }

    this.circuitBreaker = new CircuitBreaker(circuitBreakerOptions);

    this.circuitBreaker.on('open', () => {
      this.logger.warn('Circuit breaker opened - stopping connection attempts');
      this.emit('circuit_breaker_open');
    });

    this.circuitBreaker.on('close', () => {
      this.logger.info('Circuit breaker closed - resuming connection attempts');
      this.emit('circuit_breaker_close');
    });
  }

  /**
   * Connect with retry logic and circuit breaker
   */
  async connectWithRetry(connectFn: () => Promise<void>): Promise<void> {
    this.connectFunction = connectFn;
    this.totalAttempts++;

    // Check circuit breaker
    if (this.circuitBreaker.isOpen()) {
      const error = new Error('Circuit breaker is open - connection blocked');
      this.logger.error('Connection blocked by circuit breaker');
      throw error;
    }

    this.setState(ConnectionState.CONNECTING);

    try {
      // Attempt connection with timeout
      await this.executeWithTimeout(connectFn, this.options.connectionTimeout);

      // Success - reset counters
      this.handleConnectionSuccess();
    } catch (error) {
      // Failure - handle retry logic
      await this.handleConnectionFailure(error);
    }
  }

  /**
   * Handle successful connection
   */
  private handleConnectionSuccess(): void {
    this.setState(ConnectionState.CONNECTED);
    this.retryCount = 0;
    this.consecutiveFailures = 0;
    this.totalSuccesses++;
    this.lastSuccessfulConnection = new Date();
    this.connectionStartTime = new Date();

    // Notify circuit breaker of success
    this.circuitBreaker.onSuccess();

    // Start health monitoring
    this.startHealthMonitoring();

    this.logger.info('Connection successful', {
      totalAttempts: this.totalAttempts,
      totalSuccesses: this.totalSuccesses,
    });
  }

  /**
   * Handle connection failure with retry logic
   */
  private async handleConnectionFailure(error: unknown): Promise<void> {
    this.consecutiveFailures++;
    this.setState(ConnectionState.DISCONNECTED);

    // Notify circuit breaker of failure
    this.circuitBreaker.onFailure();

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    this.logger.error('Connection failed', {
      error: errorMessage,
      consecutiveFailures: this.consecutiveFailures,
      retryCount: this.retryCount,
    });

    // Check if we should retry
    if (this.retryCount < this.options.maxRetries && !this.circuitBreaker.isOpen()) {
      await this.scheduleRetry();
    } else {
      const reason = this.circuitBreaker.isOpen() 
        ? 'Circuit breaker open' 
        : 'Max retries exceeded';
      
      this.logger.error('Connection retry stopped', { reason });
      throw new Error(`Connection failed: ${reason}`);
    }
  }

  /**
   * Schedule a retry with exponential backoff
   */
  private async scheduleRetry(): Promise<void> {
    this.retryCount++;

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.options.initialRetryDelay * Math.pow(2, this.retryCount - 1),
      this.options.maxRetryDelay
    );

    this.logger.info('Scheduling connection retry', {
      attempt: this.retryCount,
      delay,
      maxRetries: this.options.maxRetries,
    });

    this.emit('retry', this.retryCount, delay);

    // Wait for delay
    await this.sleep(delay);

    // Retry connection if we have a connect function
    if (this.connectFunction) {
      await this.connectWithRetry(this.connectFunction);
    }
  }

  /**
   * Execute a function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout')), timeout)
      ),
    ]);
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.stopHealthMonitoring();

    this.healthCheckTimer = setInterval(() => {
      const health = this.getHealthStatus();
      this.emit('health_check', health.isHealthy);

      if (!health.isHealthy && this.state === ConnectionState.CONNECTED) {
        this.logger.warn('Health check failed - connection may be degraded');
      }
    }, this.options.healthCheckInterval);
  }

  /**
   * Stop health monitoring
   */
  private stopHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      delete this.healthCheckTimer;
    }
  }

  /**
   * Get connection health status
   */
  getHealthStatus(): ConnectionHealth {
    const uptime = this.connectionStartTime
      ? Date.now() - this.connectionStartTime.getTime()
      : 0;

    const isHealthy =
      this.state === ConnectionState.CONNECTED &&
      this.consecutiveFailures === 0 &&
      !this.circuitBreaker.isOpen();

    return {
      isHealthy,
      lastSuccessfulConnection: this.lastSuccessfulConnection,
      consecutiveFailures: this.consecutiveFailures,
      totalAttempts: this.totalAttempts,
      totalSuccesses: this.totalSuccesses,
      uptime,
      state: this.state,
      circuitBreakerState: this.circuitBreaker.getState(),
    };
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Set connection state
   */
  private setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      const oldState = this.state;
      this.state = newState;
      this.logger.debug('Connection state changed', { from: oldState, to: newState });
      this.emit('state_change', newState);
    }
  }

  /**
   * Reset connection manager
   */
  reset(): void {
    this.retryCount = 0;
    this.consecutiveFailures = 0;
    this.circuitBreaker.reset();
    this.stopHealthMonitoring();
    
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      delete this.retryTimer;
    }

    this.setState(ConnectionState.DISCONNECTED);
    this.logger.info('Connection manager reset');
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    this.reset();
    delete this.connectFunction;
    this.logger.info('Connection manager disconnected');
  }

  /**
   * Sleep for specified milliseconds
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
      this.retryTimer = setTimeout(resolve, ms);
    });
  }

  /**
   * Check if connection is healthy
   */
  isHealthy(): boolean {
    return this.getHealthStatus().isHealthy;
  }

  /**
   * Get circuit breaker state
   */
  getCircuitBreakerState(): 'closed' | 'open' | 'half-open' {
    return this.circuitBreaker.getState();
  }

  /**
   * Manually trigger a health check
   */
  checkHealth(): ConnectionHealth {
    const health = this.getHealthStatus();
    this.emit('health_check', health.isHealthy);
    return health;
  }
}