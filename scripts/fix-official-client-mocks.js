#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

/**
 * Fix officialClient test mocks to use jest.unstable_mockModule for ESM compatibility
 */

const testFiles = [
  'tests/unit/qrwc/officialClient.reconnection.test.ts',
  'tests/unit/qrwc/officialClient.disconnect.test.ts',
];

function fixOfficialClientMocks(filePath) {
  console.log(`Fixing ${filePath}...`);
  
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Complete rewrite for ESM compatibility
  const newContent = `/**
 * Tests for ${filePath.includes('reconnection') ? 'BUG-050: Insufficient reconnection window for Q-SYS Core' : 'OfficialQRWCClient disconnect behavior'}
 */

import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { ConnectionState } from '../../../src/shared/types/common';
import type { EventEmitter as NodeEventEmitter } from 'events';

describe('OfficialQRWCClient - ${filePath.includes('reconnection') ? 'Reconnection with Long-term Mode (BUG-050)' : 'Disconnect Behavior'}', () => {
  jest.setTimeout(5000); // Set timeout for all tests in this suite
  let client: any;
  let mockLogger: any;
  let mockWebSocket: any;
  let mockCreateQrwc: any;
  let timers: NodeJS.Timeout[] = [];

  beforeEach(async () => {
    jest.resetModules();
    jest.useFakeTimers();
    timers = [];

    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    // Mock WebSocket
    mockWebSocket = {
      on: jest.fn(),
      close: jest.fn(),
      readyState: 3, // CLOSED
    };

    // Mock createQrwc
    mockCreateQrwc = jest.fn().mockResolvedValue({
      components: {},
      on: jest.fn(),
      close: jest.fn(),
    });

    // Set up module mocks with jest.unstable_mockModule
    jest.unstable_mockModule('../../../src/shared/utils/logger', () => ({
      createLogger: jest.fn(() => mockLogger),
    }));

    jest.unstable_mockModule('ws', () => ({
      default: jest.fn(() => mockWebSocket),
    }));

    jest.unstable_mockModule('@q-sys/qrwc', () => ({
      Qrwc: {
        createQrwc: mockCreateQrwc,
      },
    }));

    // Import after mocking
    const { OfficialQRWCClient } = await import('../../../src/qrwc/officialClient');
    
    client = new OfficialQRWCClient({
      host: 'test.local',
      port: 443,
      enableAutoReconnect: true,
      reconnectInterval: 1000, // 1 second for faster tests
      maxReconnectAttempts: 3,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
    timers.forEach(timer => clearTimeout(timer));
  });

${filePath.includes('reconnection') ? getReconnectionTests() : getDisconnectTests()}
});`;

  fs.writeFileSync(filePath, newContent);
  console.log(`✓ Fixed ${filePath}`);
}

function getReconnectionTests() {
  return `  it('should switch to long-term reconnection mode after max attempts', async () => {
    // Simulate connection failure
    const connectSpy = jest.spyOn(client, 'connect').mockRejectedValue(new Error('Connection failed'));

    // Manually trigger reconnection by calling scheduleReconnect
    client.setState(ConnectionState.CONNECTED);

    // Simulate reconnection attempts
    for (let i = 0; i < 3; i++) {
      client.scheduleReconnect();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Scheduling reconnection attempt',
        expect.objectContaining({ attempt: i + 1 })
      );
      
      // Advance timers to trigger reconnection
      await jest.advanceTimersByTimeAsync(1000);
    }

    // Should enter long-term mode after max attempts
    client.scheduleReconnect();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Entering long-term reconnection mode',
      expect.objectContaining({ interval: 30000 })
    );
  });

  it('should track disconnect time and emit appropriate events on reconnection', async () => {
    const now = Date.now();
    jest.setSystemTime(now);

    // Simulate disconnection
    client.setState(ConnectionState.DISCONNECTED);
    client.lastDisconnectTime = now;

    // Mock successful reconnection
    const connectSpy = jest.spyOn(client, 'connect').mockResolvedValue(undefined);
    client.qrwc = mockCreateQrwc();

    // Advance time and reconnect
    jest.setSystemTime(now + 45000); // 45 seconds later
    await client.handleReconnection();

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Successfully reconnected to Q-SYS Core',
      expect.objectContaining({
        disconnectDuration: 45000,
        cacheInvalidated: false,
      })
    );
  });

  it('should continue reconnecting indefinitely in long-term mode', async () => {
    client.reconnectAttempts = 10; // Already in long-term mode
    client.isLongTermReconnectMode = true;

    const connectSpy = jest.spyOn(client, 'connect').mockRejectedValue(new Error('Connection failed'));

    for (let i = 0; i < 5; i++) {
      client.scheduleReconnect();
      expect(client.reconnectAttempts).toBe(10); // Should not increase
      await jest.advanceTimersByTimeAsync(30000);
    }

    expect(mockLogger.info).toHaveBeenCalledTimes(5);
  });

  it('should not schedule reconnection if shutdown is in progress', () => {
    client.shutdownInProgress = true;
    client.scheduleReconnect();

    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Skipping reconnection - shutdown in progress'
    );
  });

  it('should reset reconnect attempts on successful connection', async () => {
    client.reconnectAttempts = 5;
    client.isLongTermReconnectMode = true;

    // Mock successful connection
    const connectSpy = jest.spyOn(client, 'connect').mockResolvedValue(undefined);
    client.qrwc = mockCreateQrwc();

    await client.handleReconnection();

    expect(client.reconnectAttempts).toBe(0);
    expect(client.isLongTermReconnectMode).toBe(false);
  });

  it('should emit reconnecting event with correct attempt number', () => {
    const emitSpy = jest.spyOn(client, 'emit');
    
    client.scheduleReconnect();
    
    expect(emitSpy).toHaveBeenCalledWith('reconnecting', { attempt: 1 });
  });

  it('should handle short disconnections without cache invalidation', async () => {
    const now = Date.now();
    jest.setSystemTime(now);

    client.lastDisconnectTime = now;
    
    // Mock successful reconnection
    const connectSpy = jest.spyOn(client, 'connect').mockResolvedValue(undefined);
    client.qrwc = mockCreateQrwc();

    // Reconnect after 30 seconds (less than 60 second threshold)
    jest.setSystemTime(now + 30000);
    await client.handleReconnection();

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Successfully reconnected to Q-SYS Core',
      expect.objectContaining({
        cacheInvalidated: false,
      })
    );
  });`;
}

function getDisconnectTests() {
  return `  it('should only log disconnect messages once when disconnect is called multiple times', async () => {
    client.qrwc = mockCreateQrwc();
    client.setState(ConnectionState.CONNECTED);

    // First disconnect
    await client.disconnect();
    expect(mockLogger.info).toHaveBeenCalledWith('Disconnecting from Q-SYS Core');
    expect(mockLogger.info).toHaveBeenCalledWith('Disconnected from Q-SYS Core');

    // Reset mock calls
    mockLogger.info.mockClear();

    // Second disconnect
    await client.disconnect();
    expect(mockLogger.info).not.toHaveBeenCalled();
  });

  it('should not log when already disconnected', async () => {
    client.setState(ConnectionState.DISCONNECTED);

    await client.disconnect();
    expect(mockLogger.info).not.toHaveBeenCalled();
    expect(mockLogger.debug).toHaveBeenCalledWith('Already disconnected');
  });

  it('should handle process shutdown events without excessive logging', async () => {
    client.qrwc = mockCreateQrwc();
    client.setState(ConnectionState.CONNECTED);

    // Simulate process shutdown
    client.handleProcessShutdown();
    
    expect(mockLogger.info).toHaveBeenCalledWith('Shutting down Q-SYS connection due to process termination');
    expect(client.shutdownInProgress).toBe(true);

    // Try to disconnect again
    mockLogger.info.mockClear();
    await client.disconnect();
    
    expect(mockLogger.info).not.toHaveBeenCalled();
  });

  it('should prevent disconnect during ongoing shutdown', async () => {
    client.shutdownInProgress = true;

    await client.disconnect();
    
    expect(mockLogger.debug).toHaveBeenCalledWith('Shutdown already in progress');
  });

  it('should track connection state correctly during disconnect', async () => {
    client.qrwc = mockCreateQrwc();
    client.setState(ConnectionState.CONNECTED);

    const disconnectPromise = client.disconnect();
    expect(client.getState()).toBe(ConnectionState.DISCONNECTING);

    await disconnectPromise;
    expect(client.getState()).toBe(ConnectionState.DISCONNECTED);
  });

  it('should reset shutdownInProgress flag after disconnect completes', async () => {
    client.qrwc = mockCreateQrwc();
    client.setState(ConnectionState.CONNECTED);
    client.shutdownInProgress = true;

    await client.disconnect();
    
    expect(client.shutdownInProgress).toBe(false);
  });

  it('should handle multiple concurrent disconnect calls', async () => {
    client.qrwc = mockCreateQrwc();
    client.setState(ConnectionState.CONNECTED);

    // Call disconnect multiple times concurrently
    const promises = [
      client.disconnect(),
      client.disconnect(),
      client.disconnect(),
    ];

    await Promise.all(promises);
    
    // Should only log once
    expect(mockLogger.info).toHaveBeenCalledWith('Disconnecting from Q-SYS Core');
    expect(mockLogger.info).toHaveBeenCalledWith('Disconnected from Q-SYS Core');
    expect(mockLogger.info).toHaveBeenCalledTimes(2);
  });`;
}

// Process files
testFiles.forEach(filePath => {
  const fullPath = path.resolve(filePath);
  if (fs.existsSync(fullPath)) {
    fixOfficialClientMocks(fullPath);
  } else {
    console.log(`File not found: ${filePath}`);
  }
});

console.log('Done!');