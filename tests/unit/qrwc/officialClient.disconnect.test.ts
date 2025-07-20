/**
 * Tests for BUG-046: Excessive Disconnect Logging During Shutdown
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { OfficialQRWCClient } from '../../../src/qrwc/officialClient.js';
import { ConnectionState } from '../../../src/shared/types/common.js';

// Mock the logger module
jest.mock('../../../src/shared/utils/logger.js');

describe('OfficialQRWCClient - Disconnect Logging (BUG-046)', () => {
  let client: OfficialQRWCClient;
  let disconnectLogs: string[] = [];
  let mockLogger: any;

  beforeEach(() => {
    disconnectLogs = [];
    
    // Create mock logger that captures disconnect messages
    mockLogger = {
      info: jest.fn((message: string) => {
        if (message.includes('Disconnecting') || message.includes('Disconnected')) {
          disconnectLogs.push(message);
        }
      }),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };

    // Mock the createLogger function
    const logger = require('../../../src/shared/utils/logger.js');
    logger.createLogger = jest.fn().mockReturnValue(mockLogger);

    client = new OfficialQRWCClient({
      host: 'test.local',
      port: 443,
      enableAutoReconnect: false
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should only log disconnect messages once when disconnect is called multiple times', () => {
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
    // First disconnect
    client.disconnect();
    expect(disconnectLogs).toHaveLength(2);

    // Clear logs
    disconnectLogs = [];

    // Try to disconnect again
    client.disconnect();
    expect(disconnectLogs).toHaveLength(0);
  });

  it('should handle process shutdown events without excessive logging', () => {
    // Simulate multiple beforeExit events (which can happen during shutdown)
    const beforeExitHandler = (process as any).listeners('beforeExit').slice(-1)[0];
    
    // Trigger beforeExit multiple times
    for (let i = 0; i < 50; i++) {
      beforeExitHandler();
    }

    // Should still only have 2 disconnect messages
    expect(disconnectLogs).toHaveLength(2);
    expect(disconnectLogs[0]).toBe('Disconnecting from Q-SYS Core');
    expect(disconnectLogs[1]).toBe('Disconnected successfully from Q-SYS Core');
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
    expect(clientAny.shutdownInProgress).toBe(true);
    
    // Clear logs
    disconnectLogs = [];
    
    // Second disconnect should be ignored
    client.disconnect();
    expect(disconnectLogs).toHaveLength(0);
  });
});