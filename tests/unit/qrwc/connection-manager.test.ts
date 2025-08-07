/**
 * Unit tests for ConnectionManager with resilience features
 */

import { ConnectionManager } from '../../../src/qrwc/connection/ConnectionManager.js';
import { ConnectionState } from '../../../src/shared/types/common.js';

describe('ConnectionManager', () => {
  let connectionManager: ConnectionManager;
  let connectFn: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    connectFn = jest.fn();
    connectionManager = new ConnectionManager({
      maxRetries: 3,
      initialRetryDelay: 1000,
      maxRetryDelay: 10000,
      connectionTimeout: 5000,
      circuitBreakerThreshold: 2,
      circuitBreakerTimeout: 30000,
    });
  });

  afterEach(() => {
    connectionManager.disconnect();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Exponential Backoff', () => {
    it('should implement exponential backoff on connection failures', async () => {
      const retryEvents: Array<{ attempt: number; delay: number }> = [];
      
      connectionManager.on('retry', (attempt, delay) => {
        retryEvents.push({ attempt, delay });
      });

      // Make connection fail
      connectFn.mockRejectedValue(new Error('Connection failed'));

      // Start connection attempt
      const connectPromise = connectionManager.connectWithRetry(connectFn);

      // First attempt fails immediately
      await jest.runOnlyPendingTimersAsync();
      expect(connectFn).toHaveBeenCalledTimes(1);

      // First retry after 1000ms
      await jest.advanceTimersByTimeAsync(1000);
      expect(retryEvents[0]).toEqual({ attempt: 1, delay: 1000 });
      expect(connectFn).toHaveBeenCalledTimes(2);

      // Second retry after 2000ms (exponential backoff)
      await jest.advanceTimersByTimeAsync(2000);
      expect(retryEvents[1]).toEqual({ attempt: 2, delay: 2000 });
      expect(connectFn).toHaveBeenCalledTimes(3);

      // Third retry after 4000ms
      await jest.advanceTimersByTimeAsync(4000);
      expect(retryEvents[2]).toEqual({ attempt: 3, delay: 4000 });
      expect(connectFn).toHaveBeenCalledTimes(4);

      // Should fail after max retries
      await expect(connectPromise).rejects.toThrow('Connection failed: Max retries exceeded');
    });

    it('should cap retry delay at maxRetryDelay', async () => {
      const retryEvents: Array<{ attempt: number; delay: number }> = [];
      
      // Create manager with lower max delay for testing
      connectionManager = new ConnectionManager({
        maxRetries: 10,
        initialRetryDelay: 1000,
        maxRetryDelay: 5000,
      });

      connectionManager.on('retry', (attempt, delay) => {
        retryEvents.push({ attempt, delay });
      });

      connectFn.mockRejectedValue(new Error('Connection failed'));

      // Start connection
      const connectPromise = connectionManager.connectWithRetry(connectFn);

      // Run through several retries
      await jest.runOnlyPendingTimersAsync();
      await jest.advanceTimersByTimeAsync(1000);  // 1st retry: 1000ms
      await jest.advanceTimersByTimeAsync(2000);  // 2nd retry: 2000ms
      await jest.advanceTimersByTimeAsync(4000);  // 3rd retry: 4000ms
      await jest.advanceTimersByTimeAsync(5000);  // 4th retry: should be capped at 5000ms
      await jest.advanceTimersByTimeAsync(5000);  // 5th retry: should be capped at 5000ms

      // Verify delays are capped
      expect(retryEvents[3].delay).toBe(5000);
      expect(retryEvents[4].delay).toBe(5000);
    });

    it('should reset retry count on successful connection', async () => {
      const retryEvents: Array<{ attempt: number; delay: number }> = [];
      
      connectionManager.on('retry', (attempt, delay) => {
        retryEvents.push({ attempt, delay });
      });

      // First fail, then succeed
      connectFn
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce(undefined);

      await connectionManager.connectWithRetry(connectFn);

      // First attempt fails
      expect(connectFn).toHaveBeenCalledTimes(1);

      // Retry succeeds
      await jest.advanceTimersByTimeAsync(1000);
      expect(connectFn).toHaveBeenCalledTimes(2);
      expect(connectionManager.getState()).toBe(ConnectionState.CONNECTED);

      // Now disconnect and try again - retry count should be reset
      connectionManager.reset();
      retryEvents.length = 0;

      connectFn
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce(undefined);

      await connectionManager.connectWithRetry(connectFn);

      await jest.advanceTimersByTimeAsync(1000);
      
      // Should start from attempt 1 again
      expect(retryEvents[0]).toEqual({ attempt: 1, delay: 1000 });
    });
  });

  describe('Circuit Breaker', () => {
    it('should open circuit breaker after threshold failures', async () => {
      connectFn.mockRejectedValue(new Error('Connection failed'));

      const circuitBreakerEvents: string[] = [];
      connectionManager.on('circuit_breaker_open', () => {
        circuitBreakerEvents.push('open');
      });

      // Start connection - will fail and retry
      const connectPromise = connectionManager.connectWithRetry(connectFn);

      // First attempt
      await jest.runOnlyPendingTimersAsync();
      expect(connectionManager.getCircuitBreakerState()).toBe('closed');

      // First retry (2 total failures)
      await jest.advanceTimersByTimeAsync(1000);
      
      // Circuit breaker should open after 2 failures (threshold)
      expect(connectionManager.getCircuitBreakerState()).toBe('open');
      expect(circuitBreakerEvents).toContain('open');

      // Connection should fail due to circuit breaker
      await expect(connectPromise).rejects.toThrow('Circuit breaker open');
    });

    it('should block connections when circuit breaker is open', async () => {
      // Force circuit breaker open by failing multiple times
      connectFn.mockRejectedValue(new Error('Connection failed'));

      // Fail twice to open circuit breaker
      try {
        await connectionManager.connectWithRetry(connectFn);
      } catch {
        // Expected to fail
      }

      expect(connectionManager.getCircuitBreakerState()).toBe('open');

      // New connection attempt should be blocked immediately
      await expect(connectionManager.connectWithRetry(connectFn))
        .rejects.toThrow('Circuit breaker is open - connection blocked');

      // Connect function should not be called when circuit breaker is open
      const callCountBefore = connectFn.mock.calls.length;
      try {
        await connectionManager.connectWithRetry(connectFn);
      } catch {
        // Expected to fail
      }
      expect(connectFn).toHaveBeenCalledTimes(callCountBefore);
    });

    it('should transition to half-open after timeout', async () => {
      connectFn.mockRejectedValue(new Error('Connection failed'));

      // Open circuit breaker
      try {
        await connectionManager.connectWithRetry(connectFn);
      } catch {
        // Expected
      }

      expect(connectionManager.getCircuitBreakerState()).toBe('open');

      // Advance time to circuit breaker timeout (30 seconds)
      jest.advanceTimersByTime(30000);

      // Should be half-open now
      expect(connectionManager.getCircuitBreakerState()).toBe('half-open');
    });

    it('should close circuit breaker on success in half-open state', async () => {
      // Open circuit breaker first
      connectFn.mockRejectedValue(new Error('Connection failed'));
      try {
        await connectionManager.connectWithRetry(connectFn);
      } catch {
        // Expected
      }

      // Move to half-open
      jest.advanceTimersByTime(30000);
      expect(connectionManager.getCircuitBreakerState()).toBe('half-open');

      // Now succeed
      connectFn.mockResolvedValue(undefined);
      await connectionManager.connectWithRetry(connectFn);

      // Circuit breaker should be closed
      expect(connectionManager.getCircuitBreakerState()).toBe('closed');
    });
  });

  describe('Health Monitoring', () => {
    it('should report healthy status when connected', async () => {
      connectFn.mockResolvedValue(undefined);
      
      await connectionManager.connectWithRetry(connectFn);

      const health = connectionManager.getHealthStatus();
      
      expect(health.isHealthy).toBe(true);
      expect(health.state).toBe(ConnectionState.CONNECTED);
      expect(health.consecutiveFailures).toBe(0);
      expect(health.totalSuccesses).toBe(1);
      expect(health.circuitBreakerState).toBe('closed');
    });

    it('should report unhealthy status when disconnected', () => {
      const health = connectionManager.getHealthStatus();
      
      expect(health.isHealthy).toBe(false);
      expect(health.state).toBe(ConnectionState.DISCONNECTED);
    });

    it('should report unhealthy when circuit breaker is open', async () => {
      connectFn.mockRejectedValue(new Error('Connection failed'));
      
      try {
        await connectionManager.connectWithRetry(connectFn);
      } catch {
        // Expected
      }

      const health = connectionManager.getHealthStatus();
      
      expect(health.isHealthy).toBe(false);
      expect(health.circuitBreakerState).toBe('open');
    });

    it('should track connection statistics', async () => {
      connectFn
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(undefined);

      await connectionManager.connectWithRetry(connectFn);

      const health = connectionManager.getHealthStatus();
      
      expect(health.totalAttempts).toBe(2); // Initial + 1 retry
      expect(health.totalSuccesses).toBe(1);
      expect(health.uptime).toBeGreaterThan(0);
    });

    it('should emit health check events periodically', async () => {
      const healthCheckEvents: boolean[] = [];
      
      connectionManager.on('health_check', (isHealthy) => {
        healthCheckEvents.push(isHealthy);
      });

      connectFn.mockResolvedValue(undefined);
      await connectionManager.connectWithRetry(connectFn);

      // Advance time to trigger health checks (every 30 seconds by default)
      jest.advanceTimersByTime(30000);
      jest.advanceTimersByTime(30000);

      expect(healthCheckEvents).toEqual([true, true]);
    });
  });

  describe('Connection Timeout', () => {
    it('should timeout long-running connections', async () => {
      // Make connection hang indefinitely
      connectFn.mockImplementation(() => new Promise(() => {}));

      const connectPromise = connectionManager.connectWithRetry(connectFn);

      // Advance past timeout (5 seconds)
      await jest.advanceTimersByTimeAsync(5000);

      // Should retry after timeout
      expect(connectFn).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });
  });

  describe('State Management', () => {
    it('should emit state change events', async () => {
      const stateChanges: ConnectionState[] = [];
      
      connectionManager.on('state_change', (state) => {
        stateChanges.push(state);
      });

      connectFn.mockResolvedValue(undefined);
      await connectionManager.connectWithRetry(connectFn);

      expect(stateChanges).toContain(ConnectionState.CONNECTING);
      expect(stateChanges).toContain(ConnectionState.CONNECTED);
    });

    it('should handle disconnect properly', async () => {
      connectFn.mockResolvedValue(undefined);
      await connectionManager.connectWithRetry(connectFn);

      expect(connectionManager.getState()).toBe(ConnectionState.CONNECTED);

      connectionManager.disconnect();

      expect(connectionManager.getState()).toBe(ConnectionState.DISCONNECTED);
      expect(connectionManager.getHealthStatus().isHealthy).toBe(false);
    });

    it('should reset state on reset()', async () => {
      connectFn.mockRejectedValue(new Error('Failed'));
      
      try {
        await connectionManager.connectWithRetry(connectFn);
      } catch {
        // Expected
      }

      connectionManager.reset();

      const health = connectionManager.getHealthStatus();
      expect(health.consecutiveFailures).toBe(0);
      expect(health.circuitBreakerState).toBe('closed');
      expect(connectionManager.getState()).toBe(ConnectionState.DISCONNECTED);
    });
  });
});