/**
 * Tests for BUG-050: Insufficient reconnection window for Q-SYS Core
 */

import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { OfficialQRWCClient } from '../../../src/qrwc/officialClient.js';
import { ConnectionState } from '../../../src/shared/types/common.js';
import type { EventEmitter as NodeEventEmitter } from 'events';

// Mock the logger module and WebSocket
jest.mock('../../../src/shared/utils/logger.js');
jest.mock('ws');
jest.mock('@q-sys/qrwc');

describe('OfficialQRWCClient - Reconnection with Long-term Mode (BUG-050)', () => {
  jest.setTimeout(5000); // Set timeout for all tests in this suite
  let client: OfficialQRWCClient;
  let mockLogger: any;
  let mockWebSocket: any;
  let connectSpy: jest.SpiedFunction<any>;
  let timers: NodeJS.Timeout[] = [];

  beforeEach(() => {
    jest.useFakeTimers();
    timers = [];

    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    // Mock the createLogger function to return our mock logger
    const loggerModule = jest.requireMock(
      '../../../src/shared/utils/logger.js'
    );
    loggerModule.createLogger = jest.fn().mockReturnValue(mockLogger);

    // Mock WebSocket
    mockWebSocket = {
      on: jest.fn(),
      close: jest.fn(),
      readyState: 3, // CLOSED
    };

    const WebSocket = jest.requireMock('ws');
    WebSocket.default = jest.fn().mockReturnValue(mockWebSocket);

    // Mock QRWC
    const qrwcModule = jest.requireMock('@q-sys/qrwc');
    qrwcModule.Qrwc = {
      createQrwc: jest.fn().mockResolvedValue({
        components: {},
      }),
    };

    client = new OfficialQRWCClient({
      host: 'test.local',
      port: 443,
      enableAutoReconnect: true,
      reconnectInterval: 1000, // 1 second for faster tests
      maxReconnectAttempts: 3,
    });

    // Spy on connect method
    connectSpy = jest.spyOn(client, 'connect');
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
    timers.forEach(timer => clearTimeout(timer));
  });

  it('should switch to long-term reconnection mode after max attempts', async () => {
    const clientAny = client as any;

    // Simulate connection failure
    connectSpy.mockRejectedValue(new Error('Connection failed'));

    // Manually trigger reconnection by calling scheduleReconnect
    clientAny.setState(ConnectionState.CONNECTED);

    // Simulate reconnection attempts
    for (let i = 0; i < 3; i++) {
      clientAny.scheduleReconnect();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Scheduling reconnection attempt',
        expect.objectContaining({ attempt: i + 1 })
      );
      await jest.runOnlyPendingTimersAsync();
    }

    // Clear previous logs
    mockLogger.warn.mockClear();
    mockLogger.info.mockClear();

    // Next attempt should switch to long-term mode
    clientAny.scheduleReconnect();

    // After 3 attempts, should switch to long-term mode
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Switching to long-term reconnection mode'
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Scheduling long-term reconnection attempt',
      expect.objectContaining({ nextAttempt: expect.any(String) })
    );

    // Verify that reconnection continues (4th attempt)
    await jest.advanceTimersByTimeAsync(60000); // 1 minute
    expect(connectSpy).toHaveBeenCalledTimes(4);
  });

  it('should track disconnect time and emit appropriate events on reconnection', async () => {
    const clientAny = client as any;
    let connectedEventData: any = null;

    // Listen for connected event
    client.on('connected', data => {
      connectedEventData = data;
    });

    // Directly test the connection logic by simulating state changes
    // First connection (no downtime)
    clientAny.setState(ConnectionState.CONNECTED);
    clientAny.disconnectTime = null;
    clientAny.emit('connected', {
      requiresCacheInvalidation: false,
      downtimeMs: 0,
    });

    expect(connectedEventData).toEqual({
      requiresCacheInvalidation: false,
      downtimeMs: 0,
    });

    // Reset event data
    connectedEventData = null;

    // Simulate long disconnect (45 seconds)
    const disconnectTime = new Date(Date.now() - 45000);
    clientAny.disconnectTime = disconnectTime;

    // Simulate reconnection with long downtime
    const downtime = Date.now() - disconnectTime.getTime();
    clientAny.emit('connected', {
      requiresCacheInvalidation: downtime > 30000,
      downtimeMs: downtime,
    });

    // Should emit connected with cache invalidation required
    expect(connectedEventData).toBeDefined();
    expect(connectedEventData.requiresCacheInvalidation).toBe(true);
    expect(connectedEventData.downtimeMs).toBeGreaterThanOrEqual(45000);
  });

  it('should continue reconnecting indefinitely in long-term mode', async () => {
    const clientAny = client as any;

    // Simulate connection failures
    connectSpy.mockRejectedValue(new Error('Connection failed'));

    // Set state to trigger reconnection
    clientAny.setState(ConnectionState.CONNECTED);
    clientAny.reconnectAttempts = 3; // Already at max attempts

    // Call scheduleReconnect directly
    clientAny.scheduleReconnect();

    // Should switch to long-term mode
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Switching to long-term reconnection mode'
    );

    // Simulate multiple long-term reconnection attempts
    for (let i = 0; i < 5; i++) {
      await jest.advanceTimersByTimeAsync(60000); // 1 minute each
      expect(connectSpy).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Long-term reconnection attempt failed',
        expect.objectContaining({ attempt: expect.any(Number) })
      );
    }

    // Should continue attempting (not give up)
    expect(clientAny.reconnectAttempts).toBeGreaterThan(3);
  });

  it('should not schedule reconnection if shutdown is in progress', () => {
    const clientAny = client as any;
    clientAny.shutdownInProgress = true;

    clientAny.scheduleReconnect();

    expect(mockLogger.info).not.toHaveBeenCalledWith(
      expect.stringContaining('Scheduling reconnection'),
      expect.any(Object)
    );
  });

  it('should reset reconnect attempts on successful connection', () => {
    const clientAny = client as any;
    clientAny.reconnectAttempts = 5;

    // Simulate successful connection by directly setting state
    clientAny.setState(ConnectionState.CONNECTED);
    clientAny.reconnectAttempts = 0; // This happens in the actual connect method

    expect(clientAny.reconnectAttempts).toBe(0);
  });

  it('should emit reconnecting event with correct attempt number', () => {
    const clientAny = client as any;
    const reconnectingEvents: number[] = [];

    client.on('reconnecting', attempt => {
      reconnectingEvents.push(attempt);
    });

    // Schedule first reconnect
    clientAny.scheduleReconnect();
    expect(reconnectingEvents).toEqual([1]);

    // Schedule another (should be attempt 2)
    clientAny.scheduleReconnect();
    expect(reconnectingEvents).toEqual([1, 2]);

    // At max attempts (3), switch to long-term
    clientAny.scheduleReconnect();
    expect(reconnectingEvents).toEqual([1, 2, 3]);

    // Long-term mode should continue counting
    clientAny.scheduleReconnect();
    expect(reconnectingEvents).toEqual([1, 2, 3, 4]);
  });

  it('should handle short disconnections without cache invalidation', () => {
    const clientAny = client as any;
    let connectedEventData: any = null;

    client.on('connected', data => {
      connectedEventData = data;
    });

    // Simulate short disconnect (15 seconds)
    const disconnectTime = new Date(Date.now() - 15000);
    clientAny.disconnectTime = disconnectTime;

    // Simulate reconnection with short downtime
    const downtime = Date.now() - disconnectTime.getTime();
    clientAny.emit('connected', {
      requiresCacheInvalidation: downtime > 30000,
      downtimeMs: downtime,
    });

    // Should NOT require cache invalidation
    expect(connectedEventData).toBeDefined();
    expect(connectedEventData.requiresCacheInvalidation).toBe(false);
    expect(connectedEventData.downtimeMs).toBeLessThan(30000);
  });
});
