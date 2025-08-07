/**
 * Unit tests for CircuitBreaker pattern implementation
 */

import { CircuitBreaker } from '../../../src/qrwc/connection/CircuitBreaker.js';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    jest.useFakeTimers();
    circuitBreaker = new CircuitBreaker({
      threshold: 3,
      timeout: 10000,
      resetTimeout: 60000,
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('State Transitions', () => {
    it('should start in closed state', () => {
      expect(circuitBreaker.getState()).toBe('closed');
      expect(circuitBreaker.isOpen()).toBe(false);
    });

    it('should open after threshold failures', () => {
      // Record failures up to threshold
      circuitBreaker.onFailure();
      expect(circuitBreaker.getState()).toBe('closed');
      
      circuitBreaker.onFailure();
      expect(circuitBreaker.getState()).toBe('closed');
      
      circuitBreaker.onFailure();
      expect(circuitBreaker.getState()).toBe('open');
      expect(circuitBreaker.isOpen()).toBe(true);
    });

    it('should emit open event when opening', () => {
      const openHandler = jest.fn();
      circuitBreaker.on('open', openHandler);

      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();

      expect(openHandler).toHaveBeenCalledTimes(1);
    });

    it('should transition to half-open after timeout', () => {
      // Open the circuit
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      expect(circuitBreaker.getState()).toBe('open');

      // Advance time to timeout
      jest.advanceTimersByTime(10000);

      // Should be half-open
      expect(circuitBreaker.getState()).toBe('half-open');
    });

    it('should emit half_open event when transitioning', () => {
      const halfOpenHandler = jest.fn();
      circuitBreaker.on('half_open', halfOpenHandler);

      // Open the circuit
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();

      // Transition to half-open
      jest.advanceTimersByTime(10000);
      circuitBreaker.getState(); // Trigger state check

      expect(halfOpenHandler).toHaveBeenCalledTimes(1);
    });

    it('should close on success in half-open state', () => {
      // Open the circuit
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();

      // Move to half-open
      jest.advanceTimersByTime(10000);
      expect(circuitBreaker.getState()).toBe('half-open');

      // Success should close it
      circuitBreaker.onSuccess();
      expect(circuitBreaker.getState()).toBe('closed');
    });

    it('should emit close event when closing', () => {
      const closeHandler = jest.fn();
      circuitBreaker.on('close', closeHandler);

      // Open and then close
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      jest.advanceTimersByTime(10000);
      circuitBreaker.onSuccess();

      expect(closeHandler).toHaveBeenCalledTimes(1);
    });

    it('should re-open on failure in half-open state', () => {
      // Open the circuit
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();

      // Move to half-open
      jest.advanceTimersByTime(10000);
      expect(circuitBreaker.getState()).toBe('half-open');

      // Failure should re-open it
      circuitBreaker.onFailure();
      expect(circuitBreaker.getState()).toBe('open');
    });
  });

  describe('Failure Counting', () => {
    it('should reset failure count on success', () => {
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      
      const statsBefore = circuitBreaker.getStats();
      expect(statsBefore.failureCount).toBe(2);

      circuitBreaker.onSuccess();

      const statsAfter = circuitBreaker.getStats();
      expect(statsAfter.failureCount).toBe(0);
    });

    it('should track last failure time', () => {
      const beforeFailure = Date.now();
      
      circuitBreaker.onFailure();
      
      const stats = circuitBreaker.getStats();
      expect(stats.lastFailureTime).toBeDefined();
      expect(stats.lastFailureTime!.getTime()).toBeGreaterThanOrEqual(beforeFailure);
    });

    it('should not increment failure count when already open', () => {
      // Open the circuit
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      
      const statsBefore = circuitBreaker.getStats();
      
      // Additional failures shouldn't change count
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      
      const statsAfter = circuitBreaker.getStats();
      expect(statsAfter.failureCount).toBe(statsBefore.failureCount);
    });
  });

  describe('Success Counting', () => {
    it('should track success count in half-open state', () => {
      // Open the circuit
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();

      // Move to half-open
      jest.advanceTimersByTime(10000);

      circuitBreaker.onSuccess();

      const stats = circuitBreaker.getStats();
      expect(stats.successCount).toBe(1);
    });

    it('should reset success count when opening', () => {
      // Get to half-open and record success
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      jest.advanceTimersByTime(10000);
      
      // Don't close it completely
      const statsBefore = circuitBreaker.getStats();
      expect(statsBefore.successCount).toBe(0);

      // Fail to re-open
      circuitBreaker.onFailure();

      const statsAfter = circuitBreaker.getStats();
      expect(statsAfter.successCount).toBe(0);
    });
  });

  describe('Manual Controls', () => {
    it('should allow forcing open', () => {
      expect(circuitBreaker.getState()).toBe('closed');
      
      circuitBreaker.forceOpen();
      
      expect(circuitBreaker.getState()).toBe('open');
      expect(circuitBreaker.isOpen()).toBe(true);
    });

    it('should allow forcing closed', () => {
      // Open it first
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      expect(circuitBreaker.getState()).toBe('open');

      circuitBreaker.forceClose();

      expect(circuitBreaker.getState()).toBe('closed');
      expect(circuitBreaker.isOpen()).toBe(false);
    });

    it('should reset all state on reset()', () => {
      // Create some state
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      jest.advanceTimersByTime(10000);

      circuitBreaker.reset();

      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe('closed');
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.lastFailureTime).toBeNull();
      expect(stats.nextAttemptTime).toBeNull();
    });
  });

  describe('Statistics', () => {
    it('should provide comprehensive statistics', () => {
      const initialStats = circuitBreaker.getStats();
      
      expect(initialStats).toEqual({
        state: 'closed',
        failureCount: 0,
        successCount: 0,
        lastFailureTime: null,
        nextAttemptTime: null,
      });

      // Create some activity
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();

      const openStats = circuitBreaker.getStats();
      expect(openStats.state).toBe('open');
      expect(openStats.failureCount).toBe(3);
      expect(openStats.lastFailureTime).toBeDefined();
      expect(openStats.nextAttemptTime).toBeDefined();
    });

    it('should update nextAttemptTime when opening', () => {
      const beforeOpen = Date.now();
      
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();

      const stats = circuitBreaker.getStats();
      expect(stats.nextAttemptTime).toBeDefined();
      expect(stats.nextAttemptTime!.getTime()).toBe(beforeOpen + 10000);
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple open calls gracefully', () => {
      circuitBreaker.forceOpen();
      const stats1 = circuitBreaker.getStats();
      
      circuitBreaker.forceOpen();
      const stats2 = circuitBreaker.getStats();
      
      expect(stats1).toEqual(stats2);
    });

    it('should handle multiple close calls gracefully', () => {
      circuitBreaker.forceClose();
      const stats1 = circuitBreaker.getStats();
      
      circuitBreaker.forceClose();
      const stats2 = circuitBreaker.getStats();
      
      expect(stats1).toEqual(stats2);
    });

    it('should check state automatically on isOpen()', () => {
      // Open the circuit
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      circuitBreaker.onFailure();
      expect(circuitBreaker.isOpen()).toBe(true);

      // Advance time past timeout
      jest.advanceTimersByTime(10000);

      // isOpen should trigger transition check
      expect(circuitBreaker.isOpen()).toBe(false);
      expect(circuitBreaker.getState()).toBe('half-open');
    });
  });
});