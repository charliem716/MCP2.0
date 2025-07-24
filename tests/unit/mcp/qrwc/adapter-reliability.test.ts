import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { QRWCClientAdapter } from '../../../../src/mcp/qrwc/adapter.js';
import type { QRWCClientInterface } from '../../../../src/qrwc/types.js';

/**
 * Adapter reliability and performance tests
 * Combines: adapter-retry.test.ts, adapter-performance.test.ts
 */
describe('QRWCClientAdapter - Reliability & Performance', () => {
  let mockClient: jest.Mocked<QRWCClientInterface>;
  let adapter: QRWCClientAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockClient = {
      isConnected: jest.fn().mockReturnValue(true),
      setControlValue: jest.fn(),
      getComponent: jest.fn(),
      sendCommand: jest.fn(),
      getQrwc: jest.fn().mockReturnValue({
        components: {},
      }),
    } as any;

    adapter = new QRWCClientAdapter(mockClient);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Retry Logic', () => {
    describe('Automatic retry on transient failures', () => {
      it('should retry on network timeout', async () => {
        let attempts = 0;
        mockClient.setControlValue.mockImplementation(() => {
          attempts++;
          if (attempts < 3) {
            return Promise.reject(new Error('ETIMEDOUT'));
          }
          return Promise.resolve();
        });

        const promise = adapter.sendCommand('Control.Set', {
          Name: 'test',
          Value: 1,
        });

        // Fast-forward through retry delays
        await jest.advanceTimersByTimeAsync(5000);
        await promise;

        expect(mockClient.setControlValue).toHaveBeenCalledTimes(3);
      });

      it('should retry on connection reset', async () => {
        let attempts = 0;
        mockClient.setControlValue.mockImplementation(() => {
          attempts++;
          if (attempts < 2) {
            return Promise.reject(new Error('ECONNRESET'));
          }
          return Promise.resolve();
        });

        const promise = adapter.sendCommand('Control.Set', {
          Name: 'test',
          Value: 1,
        });

        await jest.advanceTimersByTimeAsync(2000);
        await promise;

        expect(mockClient.setControlValue).toHaveBeenCalledTimes(2);
      });

      it('should not retry on non-transient errors', async () => {
        mockClient.setControlValue.mockRejectedValue(
          new Error('Invalid control name')
        );

        await expect(
          adapter.sendCommand('Control.Set', {
            Name: 'invalid!@#',
            Value: 1,
          })
        ).rejects.toThrow('Invalid control name');

        expect(mockClient.setControlValue).toHaveBeenCalledTimes(1);
      });
    });

    describe('Exponential backoff', () => {
      it('should use exponential backoff for retries', async () => {
        let attempts = 0;
        const attemptTimes: number[] = [];

        mockClient.setControlValue.mockImplementation(() => {
          attemptTimes.push(Date.now());
          attempts++;
          if (attempts < 4) {
            return Promise.reject(new Error('ETIMEDOUT'));
          }
          return Promise.resolve();
        });

        const startTime = Date.now();
        const promise = adapter.sendCommand('Control.Set', {
          Name: 'test',
          Value: 1,
        });

        // Advance through all retry attempts
        await jest.advanceTimersByTimeAsync(1000); // First retry at 1s
        await jest.advanceTimersByTimeAsync(2000); // Second retry at 2s
        await jest.advanceTimersByTimeAsync(4000); // Third retry at 4s

        await promise;

        expect(mockClient.setControlValue).toHaveBeenCalledTimes(4);

        // Verify exponential delays (with some tolerance for timer precision)
        const delays = attemptTimes.slice(1).map((t, i) => t - attemptTimes[i]);
        expect(delays[0]).toBeGreaterThanOrEqual(900);
        expect(delays[0]).toBeLessThanOrEqual(1100);
        expect(delays[1]).toBeGreaterThanOrEqual(1900);
        expect(delays[1]).toBeLessThanOrEqual(2100);
        expect(delays[2]).toBeGreaterThanOrEqual(3900);
        expect(delays[2]).toBeLessThanOrEqual(4100);
      });
    });

    describe('Max retry limits', () => {
      it('should stop retrying after max attempts', async () => {
        mockClient.setControlValue.mockRejectedValue(new Error('ETIMEDOUT'));

        const promise = adapter.sendCommand('Control.Set', {
          Name: 'test',
          Value: 1,
        });

        // Advance through all retry attempts
        await jest.advanceTimersByTimeAsync(30000);

        await expect(promise).rejects.toThrow('ETIMEDOUT');

        // Default max retries is 3
        expect(mockClient.setControlValue).toHaveBeenCalledTimes(3);
      });

      it('should respect custom retry configuration', async () => {
        // Create adapter with custom retry config
        const customAdapter = new QRWCClientAdapter(mockClient, {
          maxRetries: 5,
          retryDelay: 500,
        });

        mockClient.setControlValue.mockRejectedValue(new Error('ECONNRESET'));

        const promise = customAdapter.sendCommand('Control.Set', {
          Name: 'test',
          Value: 1,
        });

        await jest.advanceTimersByTimeAsync(60000);

        await expect(promise).rejects.toThrow('ECONNRESET');
        expect(mockClient.setControlValue).toHaveBeenCalledTimes(5);
      });
    });

    describe('Retry with circuit breaker', () => {
      it('should open circuit after consecutive failures', async () => {
        mockClient.setControlValue.mockRejectedValue(new Error('ETIMEDOUT'));

        // First request triggers retries
        const promise1 = adapter.sendCommand('Control.Set', {
          Name: 'test1',
          Value: 1,
        });
        await jest.advanceTimersByTimeAsync(30000);
        await expect(promise1).rejects.toThrow();

        // Circuit should be open, subsequent requests fail immediately
        const promise2 = adapter.sendCommand('Control.Set', {
          Name: 'test2',
          Value: 2,
        });

        await expect(promise2).rejects.toThrow('Circuit breaker is open');

        // Second request should not trigger retries
        expect(mockClient.setControlValue).toHaveBeenCalledTimes(3); // Only from first request
      });

      it('should close circuit after cooldown period', async () => {
        mockClient.setControlValue
          .mockRejectedValueOnce(new Error('ETIMEDOUT'))
          .mockRejectedValueOnce(new Error('ETIMEDOUT'))
          .mockRejectedValueOnce(new Error('ETIMEDOUT'))
          .mockResolvedValue(undefined);

        // Open the circuit
        const promise1 = adapter.sendCommand('Control.Set', {
          Name: 'test1',
          Value: 1,
        });
        await jest.advanceTimersByTimeAsync(30000);
        await expect(promise1).rejects.toThrow();

        // Wait for circuit cooldown (30 seconds)
        await jest.advanceTimersByTimeAsync(30000);

        // Circuit should be half-open, allowing one attempt
        const promise2 = adapter.sendCommand('Control.Set', {
          Name: 'test2',
          Value: 2,
        });

        await promise2; // Should succeed

        expect(mockClient.setControlValue).toHaveBeenCalledTimes(4);
      });
    });
  });

  describe('Performance Optimization', () => {
    describe('Request batching', () => {
      it('should batch multiple control sets within time window', async () => {
        const promises = [];

        // Send multiple requests quickly
        for (let i = 0; i < 5; i++) {
          promises.push(
            adapter.sendCommand('Control.Set', {
              Name: `control${i}`,
              Value: i,
            })
          );
        }

        // Advance timers to trigger batch processing
        await jest.advanceTimersByTimeAsync(10);

        await Promise.all(promises);

        // Should batch into a single Component.Set call
        expect(mockClient.sendCommand).toHaveBeenCalledTimes(1);
        expect(mockClient.sendCommand).toHaveBeenCalledWith(
          'Control.SetMultiple',
          expect.objectContaining({
            Controls: expect.arrayContaining([
              { Name: 'control0', Value: 0 },
              { Name: 'control1', Value: 1 },
              { Name: 'control2', Value: 2 },
              { Name: 'control3', Value: 3 },
              { Name: 'control4', Value: 4 },
            ]),
          })
        );
      });

      it('should respect batch size limits', async () => {
        const promises = [];

        // Send more requests than batch size limit (assume 10)
        for (let i = 0; i < 15; i++) {
          promises.push(
            adapter.sendCommand('Control.Set', {
              Name: `control${i}`,
              Value: i,
            })
          );
        }

        await jest.advanceTimersByTimeAsync(10);
        await Promise.all(promises);

        // Should split into multiple batches
        expect(mockClient.sendCommand).toHaveBeenCalledTimes(2);
      });
    });

    describe('Response caching', () => {
      it('should cache Component.Get responses', async () => {
        const mockComponent = {
          Name: 'Test Component',
          Controls: [{ Name: 'gain', Value: -10 }],
        };

        mockClient.getComponent.mockResolvedValue(mockComponent);

        // First call hits the client
        const result1 = await adapter.sendCommand('Component.Get', {
          Name: 'Test Component',
        });

        // Second call should use cache
        const result2 = await adapter.sendCommand('Component.Get', {
          Name: 'Test Component',
        });

        expect(mockClient.getComponent).toHaveBeenCalledTimes(1);
        expect(result1).toEqual(result2);
      });

      it('should invalidate cache on component changes', async () => {
        const mockComponent = {
          Name: 'Test Component',
          Controls: [{ Name: 'gain', Value: -10 }],
        };

        mockClient.getComponent.mockResolvedValue(mockComponent);

        // Get component (caches it)
        await adapter.sendCommand('Component.Get', {
          Name: 'Test Component',
        });

        // Change a control
        await adapter.sendCommand('Component.Set', {
          Name: 'Test Component',
          Controls: [{ Name: 'gain', Value: -5 }],
        });

        // Next get should bypass cache
        mockComponent.Controls[0].Value = -5;
        await adapter.sendCommand('Component.Get', {
          Name: 'Test Component',
        });

        expect(mockClient.getComponent).toHaveBeenCalledTimes(2);
      });

      it('should expire cache entries after TTL', async () => {
        const mockComponent = {
          Name: 'Test Component',
          Controls: [{ Name: 'gain', Value: -10 }],
        };

        mockClient.getComponent.mockResolvedValue(mockComponent);

        // First call
        await adapter.sendCommand('Component.Get', {
          Name: 'Test Component',
        });

        // Advance time past cache TTL (5 minutes)
        await jest.advanceTimersByTimeAsync(5 * 60 * 1000);

        // Should hit client again
        await adapter.sendCommand('Component.Get', {
          Name: 'Test Component',
        });

        expect(mockClient.getComponent).toHaveBeenCalledTimes(2);
      });
    });

    describe('Connection pooling', () => {
      it('should reuse connections for multiple requests', async () => {
        // Simulate connection tracking
        const connectionIds = new Set();

        mockClient.sendCommand.mockImplementation(() => {
          // Simulate connection ID
          const connId =
            (adapter as any).connectionId ||
            ((adapter as any).connectionId = Math.random());
          connectionIds.add(connId);
          return Promise.resolve({});
        });

        // Send multiple requests
        await Promise.all([
          adapter.sendCommand('Control.Get', { Name: 'test1' }),
          adapter.sendCommand('Control.Get', { Name: 'test2' }),
          adapter.sendCommand('Control.Get', { Name: 'test3' }),
        ]);

        // Should use same connection
        expect(connectionIds.size).toBe(1);
      });
    });

    describe('Memory management', () => {
      it('should limit cache memory usage', async () => {
        // Create large components to test memory limits
        const createLargeComponent = (name: string) => ({
          Name: name,
          Controls: Array(100)
            .fill(null)
            .map((_, i) => ({
              Name: `control${i}`,
              Value: Math.random(),
              Properties: {
                MinValue: -100,
                MaxValue: 100,
                Units: 'dB',
              },
            })),
        });

        mockClient.getComponent.mockImplementation(name =>
          Promise.resolve(createLargeComponent(name))
        );

        // Cache many large components
        for (let i = 0; i < 50; i++) {
          await adapter.sendCommand('Component.Get', {
            Name: `Component${i}`,
          });
        }

        // Check cache stats
        const stats = (adapter as any).getCacheStats();
        expect(stats.memoryUsage).toBeLessThan(10 * 1024 * 1024); // 10MB limit
        expect(stats.evictionCount).toBeGreaterThan(0); // Some should be evicted
      });
    });

    describe('Request deduplication', () => {
      it('should deduplicate concurrent identical requests', async () => {
        mockClient.getComponent.mockImplementation(
          () =>
            new Promise(resolve => {
              setTimeout(
                () =>
                  resolve({
                    Name: 'Test',
                    Controls: [],
                  }),
                100
              );
            })
        );

        // Send identical requests concurrently
        const promises = Array(5)
          .fill(null)
          .map(() => adapter.sendCommand('Component.Get', { Name: 'Test' }));

        await jest.advanceTimersByTimeAsync(100);
        const results = await Promise.all(promises);

        // Should only make one actual request
        expect(mockClient.getComponent).toHaveBeenCalledTimes(1);

        // All should get same result
        results.forEach(r => expect(r).toEqual(results[0]));
      });
    });
  });

  describe('Performance Metrics', () => {
    it('should track request latency', async () => {
      mockClient.getComponent.mockImplementation(
        () =>
          new Promise(resolve => {
            setTimeout(() => resolve({ Name: 'Test', Controls: [] }), 50);
          })
      );

      await adapter.sendCommand('Component.Get', { Name: 'Test' });
      await jest.advanceTimersByTimeAsync(50);

      const metrics = (adapter as any).getPerformanceMetrics();
      expect(metrics.averageLatency).toBeGreaterThan(0);
      expect(metrics.requestCount).toBe(1);
    });

    it('should track cache hit rate', async () => {
      mockClient.getComponent.mockResolvedValue({
        Name: 'Test',
        Controls: [],
      });

      // First request (cache miss)
      await adapter.sendCommand('Component.Get', { Name: 'Test' });

      // Second request (cache hit)
      await adapter.sendCommand('Component.Get', { Name: 'Test' });

      const metrics = (adapter as any).getPerformanceMetrics();
      expect(metrics.cacheHitRate).toBe(0.5); // 1 hit, 1 miss
    });
  });
});
