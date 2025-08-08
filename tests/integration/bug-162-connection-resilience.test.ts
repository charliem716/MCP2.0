/**
 * Test for BUG-162: Connection Resilience and Retry Logic
 * Tests that the connection properly recovers from network failures
 */

import { OfficialQRWCClient } from '../../src/qrwc/officialClient.js';
import { ConnectionState } from '../../src/shared/types/common.js';
import WebSocket from 'ws';

// Mock WebSocket
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

describe('BUG-162: Connection Resilience', () => {
  let client: OfficialQRWCClient;
  let mockWebSocket: jest.Mocked<WebSocket>;

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
    } as unknown as jest.Mocked<WebSocket>;

    // WebSocket is already mocked at module level
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    if (client) {
      client.disconnect();
    }
  });

  it('should NOT automatically recover from connection failure (current bug)', async () => {
    // Create client with auto-reconnect enabled
    client = new OfficialQRWCClient({
      host: 'test-core',
      port: 443,
      enableAutoReconnect: true,
      maxReconnectAttempts: 3,
      reconnectInterval: 1000,
    });

    // Mock successful initial connection
    mockWebSocket.once.mockImplementation((event, handler) => {
      if (event === 'open') {
        setImmediate(() => handler());
      }
      return mockWebSocket;
    });

    // Connect initially
    await client.connect();
    expect(client.getState()).toBe(ConnectionState.CONNECTED);

    // Simulate connection drop
    const closeHandler = mockWebSocket.on.mock.calls.find(
      call => call[0] === 'close'
    )?.[1] as (code: number, reason: string) => void;
    
    expect(closeHandler).toBeDefined();
    closeHandler(1006, 'Connection lost');

    // Verify disconnect state
    expect(client.getState()).toBe(ConnectionState.DISCONNECTED);

    // Fast-forward through reconnect attempts
    jest.advanceTimersByTime(10000);

    // Bug: Connection does not properly recover
    // The reconnect attempts fail because there's no proper retry mechanism
    expect(client.getState()).toBe(ConnectionState.DISCONNECTED);
  });

  it('should implement exponential backoff (expected behavior)', () => {
    client = new OfficialQRWCClient({
      host: 'test-core',
      port: 443,
      enableAutoReconnect: true,
      maxReconnectAttempts: 5,
      reconnectInterval: 1000,
    });

    const reconnectSpy = jest.fn();
    client.on('reconnecting', reconnectSpy);

    // Trigger reconnection logic
    // @ts-expect-error - Accessing private method for testing
    client.scheduleReconnect();

    // First attempt after 1000ms
    jest.advanceTimersByTime(1000);
    expect(reconnectSpy).toHaveBeenCalledWith({ attempt: 1 });

    // Simulate failure and next attempt
    // @ts-expect-error - Accessing private property
    client.reconnectAttempts = 1;
    // @ts-expect-error - Accessing private method
    client.scheduleReconnect();

    // Second attempt after 2000ms (exponential backoff)
    jest.advanceTimersByTime(2000);
    expect(reconnectSpy).toHaveBeenCalledWith({ attempt: 2 });

    // Third attempt after 4000ms
    // @ts-expect-error - Accessing private property
    client.reconnectAttempts = 2;
    // @ts-expect-error - Accessing private method
    client.scheduleReconnect();
    
    jest.advanceTimersByTime(4000);
    expect(reconnectSpy).toHaveBeenCalledWith({ attempt: 3 });
  });

  it('should not have circuit breaker pattern (current limitation)', () => {
    client = new OfficialQRWCClient({
      host: 'test-core',
      port: 443,
      enableAutoReconnect: true,
    });

    // There's no circuit breaker in current implementation
    // Multiple rapid failures should trigger circuit breaker but don't
    const errors: Error[] = [];
    client.on('error', (error) => errors.push(error));

    // Simulate rapid failures
    for (let i = 0; i < 10; i++) {
      const errorHandler = mockWebSocket.on.mock.calls.find(
        call => call[0] === 'error'
      )?.[1] as (error: Error) => void;
      
      if (errorHandler) {
        errorHandler(new Error('Connection failed'));
      }
    }

    // Bug: No circuit breaker means all failures are processed
    // This can cause cascade failures in production
    expect(errors.length).toBe(10);
  });

  it('should not have connection health monitoring (current limitation)', () => {
    client = new OfficialQRWCClient({
      host: 'test-core',
      port: 443,
    });

    // Bug: No health check endpoint or mechanism
    // @ts-expect-error - Method doesn't exist
    expect(client.getHealthStatus).toBeUndefined();
    
    // @ts-expect-error - Method doesn't exist
    expect(client.isHealthy).toBeUndefined();
  });
});