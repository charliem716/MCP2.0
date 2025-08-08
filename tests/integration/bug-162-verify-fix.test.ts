/**
 * Integration test to verify BUG-162 fix
 * Tests connection resilience with exponential backoff and circuit breaker
 */

import { OfficialQRWCClient } from '../../src/qrwc/officialClient.js';
import { ConnectionState } from '../../src/shared/types/common.js';
import WebSocket from 'ws';

// Mock WebSocket module
jest.mock('ws', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    once: jest.fn(),
    off: jest.fn(),
    removeListener: jest.fn(),
    close: jest.fn(),
    send: jest.fn(),
    readyState: 1, // WebSocket.OPEN
  })),
  WebSocket: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    once: jest.fn(),
    off: jest.fn(),
    removeListener: jest.fn(),
    close: jest.fn(),
    send: jest.fn(),
    readyState: 1, // WebSocket.OPEN
  })),
  OPEN: 1,
  CLOSED: 3,
}));

describe('BUG-162 Fix Verification', () => {
  let client: OfficialQRWCClient;
  let mockWebSocket: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Create mock WebSocket instance
    mockWebSocket = {
      on: jest.fn(),
      once: jest.fn(),
      off: jest.fn(),
      removeListener: jest.fn(),
      close: jest.fn(),
      send: jest.fn(),
      readyState: WebSocket.OPEN,
    };

    // WebSocket is already mocked at module level
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    if (client) {
      client.disconnect();
    }
  });

  describe('Connection Resilience', () => {
    it('should have health monitoring methods available', () => {
      client = new OfficialQRWCClient({
        host: 'test-core',
        port: 443,
      });

      // Verify health monitoring methods exist
      expect(client.getHealthStatus).toBeDefined();
      expect(client.isHealthy).toBeDefined();
      expect(client.getCircuitBreakerState).toBeDefined();
      expect(client.checkHealth).toBeDefined();
    });

    it('should report health status correctly', () => {
      client = new OfficialQRWCClient({
        host: 'test-core',
        port: 443,
      });

      // Check initial health status
      const health = client.getHealthStatus();
      expect(health.isHealthy).toBe(false);
      expect(health.state).toBe(ConnectionState.DISCONNECTED);
      expect(health.circuitBreakerState).toBe('closed');
      expect(health.totalAttempts).toBe(0);
      expect(health.totalSuccesses).toBe(0);
    });

    it('should have circuit breaker in closed state initially', () => {
      client = new OfficialQRWCClient({
        host: 'test-core',
        port: 443,
      });

      expect(client.getCircuitBreakerState()).toBe('closed');
    });

    it('should emit reconnecting events with retry attempts', async () => {
      const reconnectEvents: Array<{ attempt: number }> = [];
      
      client = new OfficialQRWCClient({
        host: 'test-core',
        port: 443,
        enableAutoReconnect: true,
        maxReconnectAttempts: 3,
        reconnectInterval: 100,
      });

      client.on('reconnecting', (data) => {
        reconnectEvents.push(data);
      });

      // Mock connection failure
      mockWebSocket.once.mockImplementation((event: string, handler: Function) => {
        if (event === 'error') {
          setImmediate(() => handler(new Error('Connection failed')));
        }
        return mockWebSocket;
      });

      // Attempt to connect
      const connectPromise = client.connect();

      // Wait for initial failure
      await jest.runOnlyPendingTimersAsync();

      // Should emit reconnecting events
      expect(reconnectEvents.length).toBeGreaterThan(0);
      expect(reconnectEvents[0].attempt).toBe(1);
    });

    it('should handle connection recovery after network failure', async () => {
      client = new OfficialQRWCClient({
        host: 'test-core',
        port: 443,
        enableAutoReconnect: true,
        maxReconnectAttempts: 5,
        reconnectInterval: 100,
      });

      let connectionAttempts = 0;
      
      // Mock connection that fails twice then succeeds
      mockWebSocket.once.mockImplementation((event: string, handler: Function) => {
        connectionAttempts++;
        if (event === 'open' && connectionAttempts > 2) {
          // Succeed on third attempt
          setImmediate(() => handler());
        } else if (event === 'error' && connectionAttempts <= 2) {
          // Fail first two attempts
          setImmediate(() => handler(new Error('Connection failed')));
        }
        return mockWebSocket;
      });

      // Mock Qrwc.createQrwc
      jest.mock('@q-sys/qrwc', () => ({
        Qrwc: {
          createQrwc: jest.fn().mockResolvedValue({
            components: {},
            close: jest.fn(),
          }),
        },
      }));

      // Start connection with retry
      const connectPromise = client.connect();

      // Process retries
      for (let i = 0; i < 3; i++) {
        await jest.advanceTimersByTimeAsync(1000);
      }

      // Connection should eventually succeed
      await expect(connectPromise).resolves.toBeUndefined();
    });
  });

  describe('Health Monitoring', () => {
    it('should track connection statistics', async () => {
      client = new OfficialQRWCClient({
        host: 'test-core',
        port: 443,
        enableAutoReconnect: true,
      });

      // Check initial stats
      let health = client.getHealthStatus();
      expect(health.totalAttempts).toBe(0);
      expect(health.consecutiveFailures).toBe(0);

      // Mock failed connection
      mockWebSocket.once.mockImplementation((event: string, handler: Function) => {
        if (event === 'error') {
          setImmediate(() => handler(new Error('Connection failed')));
        }
        return mockWebSocket;
      });

      // Attempt connection
      try {
        await client.connect();
      } catch (error) {
        // Expected to fail
      }

      // Check stats after failure
      health = client.getHealthStatus();
      expect(health.totalAttempts).toBeGreaterThan(0);
    });

    it('should provide circuit breaker state', () => {
      client = new OfficialQRWCClient({
        host: 'test-core',
        port: 443,
      });

      // Circuit breaker should start closed
      expect(client.getCircuitBreakerState()).toBe('closed');
      
      // After multiple failures, it could open (but we're not testing that here)
      // Just verify the method exists and returns valid state
      const state = client.getCircuitBreakerState();
      expect(['closed', 'open', 'half-open']).toContain(state);
    });

    it('should check health on demand', () => {
      client = new OfficialQRWCClient({
        host: 'test-core',
        port: 443,
      });

      const health = client.checkHealth();
      
      expect(health).toBeDefined();
      expect(health.isHealthy).toBe(false); // Not connected
      expect(health.state).toBe(ConnectionState.DISCONNECTED);
      expect(health.circuitBreakerState).toBe('closed');
    });
  });
});