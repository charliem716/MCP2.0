/**
 * Tests for OfficialQRWCClient disconnect behavior
 */

import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';

describe('OfficialQRWCClient - Disconnect Behavior', () => {
  jest.setTimeout(10000);
  let OfficialQRWCClient: any;
  let mockLogger: any;
  let mockWebSocket: any;
  let mockQrwc: any;
  let mockEmit: any;
  let createLoggerMock: any;

  beforeEach(async () => {
    jest.resetModules();
    // Don't use fake timers for this test as it causes issues with async operations

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
      once: jest.fn((event, callback) => {
        if (event === 'open') {
          // Simulate immediate connection
          Promise.resolve().then(() => callback());
        }
      }),
      close: jest.fn(),
      readyState: 1, // OPEN
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

    // Mock modules BEFORE importing officialClient
    createLoggerMock = jest.fn(() => mockLogger);
    jest.unstable_mockModule('../../../src/shared/utils/logger', () => ({
      createLogger: createLoggerMock,
      globalLogger: mockLogger,
    }));

    jest.unstable_mockModule('ws', () => ({
      default: Object.assign(jest.fn().mockImplementation(() => mockWebSocket), {
        OPEN: 1,
        CLOSED: 3,
      }),
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
  });

  it('should disconnect cleanly when connected', async () => {
    const client = new OfficialQRWCClient({
      host: 'test.local',
      port: 443,
    });

    await client.connect();
    expect(client.getState()).toBe('connected');
    
    await client.disconnect();
    
    // Check state transition
    expect(client.getState()).toBe('disconnected');
    
    // Verify WebSocket and QRWC cleanup
    expect(mockWebSocket.close).toHaveBeenCalledWith(1000, 'Client disconnect');
    expect(mockQrwc.close).toHaveBeenCalled();
  });

  it('should handle multiple disconnect calls gracefully', async () => {
    const client = new OfficialQRWCClient({
      host: 'test.local',
      port: 443,
    });

    await client.connect();

    // First disconnect
    await client.disconnect();
    expect(client.getState()).toBe('disconnected');
    
    // Clear mock calls
    mockWebSocket.close.mockClear();
    mockQrwc.close.mockClear();

    // Second disconnect - should not do anything
    await client.disconnect();
    
    // Should not try to close again
    expect(mockWebSocket.close).not.toHaveBeenCalled();
    expect(mockQrwc.close).not.toHaveBeenCalled();
    expect(client.getState()).toBe('disconnected');
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
    
    // Should not try to close anything
    expect(mockWebSocket.close).not.toHaveBeenCalled();
    expect(mockQrwc.close).not.toHaveBeenCalled();
    expect(client.getState()).toBe('disconnected');
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

    // Capture state immediately when disconnect starts
    let disconnectingStateSeen = false;
    client.on('state_change', (state) => {
      if (state === 'disconnecting') {
        disconnectingStateSeen = true;
      }
    });

    await client.disconnect();
    
    // Should end in disconnected state
    expect(client.getState()).toBe('disconnected');
    expect(disconnectingStateSeen).toBe(true);
    expect(stateChanges).toContain('disconnecting');
    expect(stateChanges).toContain('disconnected');
  });
});