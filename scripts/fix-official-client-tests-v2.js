#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

/**
 * Fix officialClient tests to work with the actual API
 */

const testFiles = [
  'tests/unit/qrwc/officialClient.reconnection.test.ts',
  'tests/unit/qrwc/officialClient.disconnect.test.ts',
];

function fixOfficialClientTests(filePath) {
  console.log(`Fixing ${filePath}...`);
  
  const isReconnection = filePath.includes('reconnection');
  
  const newContent = `/**
 * Tests for ${isReconnection ? 'BUG-050: Insufficient reconnection window for Q-SYS Core' : 'OfficialQRWCClient disconnect behavior'}
 */

import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';

describe('OfficialQRWCClient - ${isReconnection ? 'Reconnection with Long-term Mode (BUG-050)' : 'Disconnect Behavior'}', () => {
  jest.setTimeout(10000);
  let OfficialQRWCClient: any;
  let mockLogger: any;
  let mockWebSocket: any;
  let mockQrwc: any;
  let mockEmit: any;

  beforeEach(async () => {
    jest.resetModules();
    jest.useFakeTimers();

    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    // Create mock WebSocket instance
    mockWebSocket = {
      on: jest.fn(),
      close: jest.fn(),
      readyState: 3, // CLOSED
    };

    // Create mock QRWC instance
    mockQrwc = {
      components: {
        TestComponent: {
          controls: {
            testControl: {
              state: { Value: 0 }
            }
          }
        }
      },
      on: jest.fn(),
      close: jest.fn(),
    };

    // Mock modules
    jest.unstable_mockModule('../../../src/shared/utils/logger', () => ({
      createLogger: jest.fn().mockReturnValue(mockLogger),
    }));

    jest.unstable_mockModule('ws', () => ({
      default: jest.fn().mockReturnValue(mockWebSocket),
    }));

    jest.unstable_mockModule('@q-sys/qrwc', () => ({
      Qrwc: {
        createQrwc: jest.fn().mockResolvedValue(mockQrwc),
      },
    }));

    // Import after mocking
    const module = await import('../../../src/qrwc/officialClient');
    OfficialQRWCClient = module.OfficialQRWCClient;
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

${isReconnection ? getReconnectionTestsV2() : getDisconnectTestsV2()}
});`;

  fs.writeFileSync(filePath, newContent);
  console.log(`✓ Fixed ${filePath}`);
}

function getReconnectionTestsV2() {
  return `  it('should attempt reconnection on connection failure', async () => {
    const client = new OfficialQRWCClient({
      host: 'test.local',
      port: 443,
      enableAutoReconnect: true,
      reconnectInterval: 1000,
      maxReconnectAttempts: 3,
    });

    // Simulate WebSocket error event callbacks
    const wsErrorCallback = mockWebSocket.on.mock.calls.find(call => call[0] === 'error')?.[1];
    const wsCloseCallback = mockWebSocket.on.mock.calls.find(call => call[0] === 'close')?.[1];

    // Trigger connection
    const connectPromise = client.connect();
    
    // Simulate connection failure
    if (wsErrorCallback) {
      wsErrorCallback(new Error('Connection failed'));
    }
    
    await expect(connectPromise).rejects.toThrow();

    // Should log reconnection scheduling
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Scheduling reconnection'),
      expect.any(Object)
    );
  });

  it('should emit reconnecting event during reconnection attempts', async () => {
    const client = new OfficialQRWCClient({
      host: 'test.local',
      port: 443,
      enableAutoReconnect: true,
      reconnectInterval: 100,
    });

    const reconnectingEvents: any[] = [];
    client.on('reconnecting', (data) => {
      reconnectingEvents.push(data);
    });

    // Force connection failure
    const { Qrwc } = await import('@q-sys/qrwc');
    (Qrwc.createQrwc as jest.Mock).mockRejectedValueOnce(new Error('Connection failed'));

    await expect(client.connect()).rejects.toThrow();

    // Wait for reconnection attempt
    await jest.advanceTimersByTimeAsync(150);

    expect(reconnectingEvents.length).toBeGreaterThan(0);
    expect(reconnectingEvents[0]).toEqual({ attempt: 1 });
  });

  it('should track connection state changes', async () => {
    const client = new OfficialQRWCClient({
      host: 'test.local',
      port: 443,
    });

    const stateChanges: any[] = [];
    client.on('state_change', (state) => {
      stateChanges.push(state);
    });

    // Successful connection
    const { Qrwc } = await import('@q-sys/qrwc');
    (Qrwc.createQrwc as jest.Mock).mockResolvedValueOnce(mockQrwc);

    await client.connect();

    expect(stateChanges).toContain('connecting');
    expect(stateChanges).toContain('connected');
    expect(client.getState()).toBe('connected');
  });

  it('should handle disconnection and track downtime', async () => {
    const client = new OfficialQRWCClient({
      host: 'test.local',
      port: 443,
    });

    // Connect successfully first
    await client.connect();
    
    // Simulate WebSocket close
    const wsCloseCallback = mockWebSocket.on.mock.calls.find(call => call[0] === 'close')?.[1];
    if (wsCloseCallback) {
      wsCloseCallback(1000, 'Normal closure');
    }

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('WebSocket connection closed'),
      expect.any(Object)
    );
    
    expect(client.getState()).toBe('disconnected');
  });

  it('should respect maxReconnectAttempts configuration', async () => {
    const client = new OfficialQRWCClient({
      host: 'test.local',
      port: 443,
      enableAutoReconnect: true,
      reconnectInterval: 100,
      maxReconnectAttempts: 2,
    });

    // Make all connection attempts fail
    const { Qrwc } = await import('@q-sys/qrwc');
    (Qrwc.createQrwc as jest.Mock).mockRejectedValue(new Error('Connection failed'));

    await expect(client.connect()).rejects.toThrow();

    // Advance through reconnection attempts
    for (let i = 0; i < 3; i++) {
      await jest.advanceTimersByTimeAsync(150);
    }

    // Should log about entering long-term mode after max attempts
    const warnCalls = mockLogger.warn.mock.calls;
    const longTermModeLog = warnCalls.find(call => 
      call[0]?.includes('long-term reconnection mode') ||
      call[0]?.includes('maximum reconnection attempts')
    );
    
    expect(longTermModeLog).toBeDefined();
  });

  it('should not reconnect after disconnect() is called', async () => {
    const client = new OfficialQRWCClient({
      host: 'test.local',
      port: 443,
      enableAutoReconnect: true,
    });

    await client.connect();
    await client.disconnect();

    // Clear previous logs
    mockLogger.info.mockClear();

    // Advance timers
    await jest.advanceTimersByTimeAsync(5000);

    // Should not attempt reconnection
    expect(mockLogger.info).not.toHaveBeenCalledWith(
      expect.stringContaining('Scheduling reconnection'),
      expect.any(Object)
    );
  });

  it('should emit connected event with downtime information', async () => {
    const client = new OfficialQRWCClient({
      host: 'test.local',
      port: 443,
    });

    const connectedEvents: any[] = [];
    client.on('connected', (data) => {
      connectedEvents.push(data);
    });

    await client.connect();

    expect(connectedEvents.length).toBe(1);
    expect(connectedEvents[0]).toHaveProperty('requiresCacheInvalidation');
    expect(connectedEvents[0]).toHaveProperty('downtimeMs');
  });`;
}

function getDisconnectTestsV2() {
  return `  it('should disconnect cleanly when connected', async () => {
    const client = new OfficialQRWCClient({
      host: 'test.local',
      port: 443,
    });

    await client.connect();
    expect(client.getState()).toBe('connected');

    await client.disconnect();
    
    expect(mockLogger.info).toHaveBeenCalledWith('Disconnecting from Q-SYS Core');
    expect(mockLogger.info).toHaveBeenCalledWith('Disconnected from Q-SYS Core');
    expect(client.getState()).toBe('disconnected');
  });

  it('should handle multiple disconnect calls gracefully', async () => {
    const client = new OfficialQRWCClient({
      host: 'test.local',
      port: 443,
    });

    await client.connect();

    // First disconnect
    await client.disconnect();
    
    // Clear logs
    mockLogger.info.mockClear();
    mockLogger.debug.mockClear();

    // Second disconnect - should not log info messages
    await client.disconnect();
    
    expect(mockLogger.info).not.toHaveBeenCalled();
    expect(mockLogger.debug).toHaveBeenCalledWith('Already disconnected');
  });

  it('should close WebSocket connection on disconnect', async () => {
    const client = new OfficialQRWCClient({
      host: 'test.local',
      port: 443,
    });

    await client.connect();
    
    mockWebSocket.close.mockClear();
    await client.disconnect();
    
    expect(mockWebSocket.close).toHaveBeenCalled();
  });

  it('should close QRWC instance on disconnect', async () => {
    const client = new OfficialQRWCClient({
      host: 'test.local',
      port: 443,
    });

    await client.connect();
    
    mockQrwc.close.mockClear();
    await client.disconnect();
    
    expect(mockQrwc.close).toHaveBeenCalled();
  });

  it('should emit disconnected event', async () => {
    const client = new OfficialQRWCClient({
      host: 'test.local',
      port: 443,
    });

    await client.connect();

    const disconnectedEvents: string[] = [];
    client.on('disconnected', (reason) => {
      disconnectedEvents.push(reason);
    });

    await client.disconnect();
    
    expect(disconnectedEvents).toContain('Client disconnect');
  });

  it('should handle disconnect when already disconnected', async () => {
    const client = new OfficialQRWCClient({
      host: 'test.local',
      port: 443,
    });

    // Client starts disconnected
    expect(client.getState()).toBe('disconnected');

    await client.disconnect();
    
    expect(mockLogger.debug).toHaveBeenCalledWith('Already disconnected');
  });

  it('should transition through disconnecting state', async () => {
    const client = new OfficialQRWCClient({
      host: 'test.local',
      port: 443,
    });

    await client.connect();

    const stateChanges: string[] = [];
    client.on('state_change', (state) => {
      stateChanges.push(state);
    });

    const disconnectPromise = client.disconnect();
    
    // Should transition to disconnecting immediately
    expect(client.getState()).toBe('disconnecting');
    
    await disconnectPromise;
    
    // Should end in disconnected state
    expect(client.getState()).toBe('disconnected');
    expect(stateChanges).toContain('disconnecting');
    expect(stateChanges).toContain('disconnected');
  });`;
}

// Process files
testFiles.forEach(filePath => {
  const fullPath = path.resolve(filePath);
  if (fs.existsSync(fullPath)) {
    fixOfficialClientTests(fullPath);
  } else {
    console.log(`File not found: ${filePath}`);
  }
});

console.log('Done!');