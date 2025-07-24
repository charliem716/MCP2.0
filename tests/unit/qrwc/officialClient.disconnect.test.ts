/**
 * Tests for BUG-046: Excessive Disconnect Logging During Shutdown
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

// Mock the logger module and WebSocket
jest.mock('../../../src/shared/utils/logger.js');
jest.mock('ws');

describe('OfficialQRWCClient - Disconnect Logging (BUG-046)', () => {
  let client: OfficialQRWCClient;
  let disconnectLogs: string[] = [];
  let mockLogger: any;

  beforeEach(() => {
    disconnectLogs = [];

    // Create mock logger that captures disconnect messages
    mockLogger = {
      info: jest.fn((message: string) => {
        if (
          message.includes('Disconnecting') ||
          message.includes('Disconnected')
        ) {
          disconnectLogs.push(message);
        }
      }),
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
    const WebSocket = jest.requireMock('ws');
    WebSocket.default = jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      close: jest.fn(),
      readyState: 3, // CLOSED
    }));

    client = new OfficialQRWCClient({
      host: 'test.local',
      port: 443,
      enableAutoReconnect: false,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should only log disconnect messages once when disconnect is called multiple times', () => {
    // Mock connected state first
    const clientAny = client as any;
    clientAny.connectionState = ConnectionState.CONNECTED;

    // Call disconnect multiple times rapidly
    for (let i = 0; i < 100; i++) {
      client.disconnect();
    }

    // Should only have 2 disconnect messages (start and complete)
    expect(disconnectLogs).toHaveLength(2);
    expect(disconnectLogs[0]).toBe('Disconnecting from Q-SYS Core');
    expect(disconnectLogs[1]).toBe('Disconnected successfully from Q-SYS Core');
  });

  it('should not log when already disconnected', () => {
    // Mock connected state first
    const clientAny = client as any;
    clientAny.connectionState = ConnectionState.CONNECTED;

    // First disconnect
    client.disconnect();
    expect(disconnectLogs).toHaveLength(2);

    // Clear logs
    disconnectLogs = [];

    // Try to disconnect again (already disconnected)
    client.disconnect();
    expect(disconnectLogs).toHaveLength(0);
  });

  it('should handle process shutdown events without excessive logging', () => {
    // Get process event listeners
    const listeners = process.listeners('beforeExit');
    const beforeExitHandler = listeners[listeners.length - 1];

    if (beforeExitHandler) {
      // Trigger beforeExit multiple times
      for (let i = 0; i < 50; i++) {
        beforeExitHandler(0);
      }
    }

    // Should only have 2 disconnect messages or none if no handler registered
    expect(disconnectLogs.length).toBeLessThanOrEqual(2);
    if (disconnectLogs.length > 0) {
      expect(disconnectLogs[0]).toBe('Disconnecting from Q-SYS Core');
      if (disconnectLogs.length === 2) {
        expect(disconnectLogs[1]).toBe(
          'Disconnected successfully from Q-SYS Core'
        );
      }
    }
  });

  it('should prevent disconnect during ongoing shutdown', () => {
    // Access private property for testing
    const clientAny = client as any;

    // Set shutdownInProgress flag
    clientAny.shutdownInProgress = true;

    // Try to disconnect
    client.disconnect();

    // Should not log anything
    expect(disconnectLogs).toHaveLength(0);
  });

  it('should track connection state correctly during disconnect', () => {
    const clientAny = client as any;

    // Mock connected state
    clientAny.connectionState = ConnectionState.CONNECTED;

    // First disconnect
    client.disconnect();
    expect(clientAny.connectionState).toBe(ConnectionState.DISCONNECTED);
    expect(clientAny.shutdownInProgress).toBe(false); // Should be reset after disconnect

    // Clear logs
    disconnectLogs = [];

    // Second disconnect should be ignored (already disconnected)
    client.disconnect();
    expect(disconnectLogs).toHaveLength(0);
  });

  it('should reset shutdownInProgress flag after disconnect completes', () => {
    const clientAny = client as any;

    // Initially false
    expect(clientAny.shutdownInProgress).toBe(false);

    // Mock connected state
    clientAny.connectionState = ConnectionState.CONNECTED;

    // Disconnect
    client.disconnect();

    // Flag should be reset to false after disconnect completes
    expect(clientAny.shutdownInProgress).toBe(false);
    expect(disconnectLogs).toHaveLength(2);
  });
});
