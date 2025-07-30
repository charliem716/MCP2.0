/**
 * Additional focused tests for OfficialQRWCClient to achieve 80%+ coverage
 * Addresses BUG-142: Critical Low Coverage Files Risk Production Stability
 */

import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import WebSocket from 'ws';

describe('OfficialQRWCClient - Additional Coverage Tests', () => {
  let OfficialQRWCClient: any;
  let mockLogger: any;
  let mockWebSocket: any;
  let mockQrwc: any;
  let mockWsConstructor: jest.Mock;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    };

    // Create mock WebSocket instance
    mockWebSocket = {
      on: jest.fn(),
      off: jest.fn(),
      once: jest.fn((event, callback) => {
        if (event === 'open') {
          // Simulate immediate connection
          setImmediate(callback);
        }
      }),
      send: jest.fn(),
      close: jest.fn(),
      removeListener: jest.fn(),
      readyState: WebSocket.OPEN,
    };

    // Create mock QRWC instance
    mockQrwc = {
      components: {
        TestComponent: {
          controls: {
            testControl: {
              state: { Value: 50, Position: 0.5 },
              update: jest.fn().mockResolvedValue(undefined),
              on: jest.fn(),
              removeListener: jest.fn(),
            },
          },
        },
      },
      on: jest.fn(),
      close: jest.fn(),
    };

    // Mock WebSocket constructor
    mockWsConstructor = jest.fn().mockImplementation(() => mockWebSocket);
    Object.assign(mockWsConstructor, {
      OPEN: 1,
      CLOSED: 3,
      CONNECTING: 0,
      CLOSING: 2,
    });

    // Mock modules
    jest.unstable_mockModule('../../../src/shared/utils/logger', () => ({
      createLogger: jest.fn().mockReturnValue(mockLogger),
      globalLogger: mockLogger,
    }));

    jest.unstable_mockModule('ws', () => ({
      default: mockWsConstructor,
    }));

    jest.unstable_mockModule('@q-sys/qrwc', () => ({
      Qrwc: {
        createQrwc: jest.fn().mockResolvedValue(mockQrwc),
      },
    }));

    // Import after mocking
    const module = await import('../../../src/qrwc/officialClient.js');
    OfficialQRWCClient = module.OfficialQRWCClient;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle createLogger returning null', async () => {
      jest.resetModules();
      
      jest.unstable_mockModule('../../../src/shared/utils/logger', () => ({
        createLogger: jest.fn().mockReturnValue(null),
      }));

      const module = await import('../../../src/qrwc/officialClient.js');
      const client = new module.OfficialQRWCClient({
        host: 'test.local',
      });

      // Should not throw
      expect(client.getState()).toBe('disconnected');
    });

    it('should handle QRWC creation failure', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
        enableAutoReconnect: false,
      });

      const { Qrwc } = await import('@q-sys/qrwc');
      (Qrwc.createQrwc as jest.Mock).mockRejectedValueOnce(new Error('QRWC creation failed'));

      await expect(client.connect()).rejects.toThrow('Failed to connect to Q-SYS Core');
    });

    it('should handle connection errors with different error types', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
        enableAutoReconnect: false,
      });

      // Test non-Error object
      const { Qrwc } = await import('@q-sys/qrwc');
      (Qrwc.createQrwc as jest.Mock).mockRejectedValueOnce('String error');

      await expect(client.connect()).rejects.toThrow('Failed to connect to Q-SYS Core');
    });

    it('should handle WebSocket message with different data types', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
      });

      await client.connect();

      let messageHandler: Function | undefined;
      mockWebSocket.on.mockImplementation((event, handler) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      const commandPromise = client.sendRawCommand('test.method', {});

      // Get the request ID from the sent message
      const sentMessage = mockWebSocket.send.mock.calls[0][0];
      const { id } = JSON.parse(sentMessage);

      // Test with ArrayBuffer
      if (messageHandler) {
        const response = JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: { success: true },
        });
        const encoder = new TextEncoder();
        const arrayBuffer = encoder.encode(response).buffer;
        messageHandler(arrayBuffer);
      }

      const result = await commandPromise;
      expect(result).toEqual({ success: true });
    });

    it('should handle disconnect during connecting state', () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
      });

      // Mock slow connection
      mockWebSocket.once.mockImplementation(() => {
        // Don't call callback immediately
      });

      // Start connecting but don't await
      client.connect();

      // Disconnect while connecting
      client.disconnect();

      expect(client.getState()).toBe('disconnected');
    });

    it('should handle WebSocket error without auto-reconnect', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
        enableAutoReconnect: false,
      });

      const errorEvents: Error[] = [];
      client.on('error', (error) => {
        errorEvents.push(error);
      });

      await client.connect();

      // Trigger WebSocket error
      const errorHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'error')?.[1];
      if (errorHandler) {
        errorHandler(new Error('WebSocket error'));
      }

      expect(errorEvents).toHaveLength(1);
    });

    it('should handle close event during disconnecting state', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
      });

      await client.connect();

      // Start disconnecting
      client.disconnect();

      // Trigger close while disconnecting
      const closeHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'close')?.[1];
      if (closeHandler) {
        closeHandler(1000, Buffer.from('Normal'));
      }

      expect(client.getState()).toBe('disconnected');
    });

    it('should handle raw command with non-matching response ID', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
      });

      await client.connect();

      let messageHandler: Function | undefined;
      mockWebSocket.on.mockImplementation((event, handler) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      const commandPromise = client.sendRawCommand('test.method', {});

      // Send response with different ID
      if (messageHandler) {
        messageHandler(JSON.stringify({
          jsonrpc: '2.0',
          id: 'different-id',
          result: { ignored: true },
        }));
        
        // Then send correct response
        const sentMessage = mockWebSocket.send.mock.calls[0][0];
        const { id } = JSON.parse(sentMessage);
        messageHandler(JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: { success: true },
        }));
      }

      const result = await commandPromise;
      expect(result).toEqual({ success: true });
    });

    it('should handle missing component gracefully', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
      });

      await client.connect();

      // Try to get non-existent component
      const component = client.getComponent('NonExistentComponent');
      expect(component).toBeUndefined();
    });

    it('should handle control listener removal for existing control', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
      });

      await client.connect();

      const listener = jest.fn();
      
      // Test with existing control
      client.offControlUpdate('TestComponent', 'testControl', listener);
      
      expect(mockQrwc.components.TestComponent.controls.testControl.removeListener)
        .toHaveBeenCalledWith('update', listener);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Removed control update listener',
        expect.objectContaining({
          componentName: 'TestComponent',
          controlName: 'testControl',
        })
      );
    });

    it('should handle different WebSocket ready states', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
      });

      await client.connect();

      // Test with CONNECTING state
      mockWebSocket.readyState = WebSocket.CONNECTING;
      await expect(client.sendRawCommand('test', {})).rejects.toThrow('WebSocket not connected');

      // Test with CLOSING state
      mockWebSocket.readyState = WebSocket.CLOSING;
      await expect(client.sendRawCommand('test', {})).rejects.toThrow('WebSocket not connected');
    });

    it('should handle connection with existing qrwc', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
      });

      await client.connect();
      
      // Try to connect again
      await client.connect();
      
      // Should not create new connection
      const { Qrwc } = await import('@q-sys/qrwc');
      expect(Qrwc.createQrwc).toHaveBeenCalledTimes(1);
    });

    it('should handle getConnectionState method', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
      });

      expect(client.getConnectionState()).toBe('disconnected');

      await client.connect();

      expect(client.getConnectionState()).toBe('connected');
    });

    it('should handle isConnected with missing qrwc', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
      });

      // Mock connection but no qrwc
      await client.connect();
      
      // Force qrwc to be undefined
      const privateClient = client as any;
      privateClient.qrwc = undefined;

      expect(client.isConnected()).toBe(false);
    });

    it('should handle long downtime reconnection', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
      });

      const connectedEvents: any[] = [];
      client.on('connected', (data) => {
        connectedEvents.push(data);
      });

      // First connection
      await client.connect();
      
      // Clear previous events
      connectedEvents.length = 0;
      
      // Disconnect and set downtime
      client.disconnect();
      const privateClient = client as any;
      privateClient.disconnectTime = new Date(Date.now() - 40000); // 40 seconds ago
      
      // Need to reset WebSocket mock for reconnection
      mockWebSocket.readyState = WebSocket.OPEN;
      mockWebSocket.once.mockImplementation((event, callback) => {
        if (event === 'open') {
          setImmediate(callback);
        }
      });
      
      // Reconnect
      await client.connect();

      expect(connectedEvents).toHaveLength(1);
      expect(connectedEvents[0].requiresCacheInvalidation).toBe(true);
      expect(connectedEvents[0].downtimeMs).toBeGreaterThan(30000);
    });
  });

  describe('Reconnection Scenarios', () => {
    it('should handle exponential backoff correctly', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
        enableAutoReconnect: true,
        reconnectInterval: 100,
        maxReconnectAttempts: 3,
      });

      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      // Make connection fail
      const { Qrwc } = await import('@q-sys/qrwc');
      (Qrwc.createQrwc as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      await expect(client.connect()).rejects.toThrow();

      // Check first retry delay
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 100);

      setTimeoutSpy.mockRestore();
    });

    it('should clear qrwc on WebSocket close', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
        enableAutoReconnect: false,
      });

      await client.connect();
      
      expect(client.getQrwc()).toBeDefined();

      // Trigger WebSocket close
      const closeHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'close')?.[1];
      if (closeHandler) {
        closeHandler(1006, Buffer.from('Abnormal'));
      }

      expect(client.getQrwc()).toBeUndefined();
    });

    it('should not schedule reconnect when shutdownInProgress', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
        enableAutoReconnect: true,
      });

      await client.connect();

      // Set shutdown flag
      const privateClient = client as any;
      privateClient.shutdownInProgress = true;

      // Trigger close
      const closeHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'close')?.[1];
      if (closeHandler) {
        closeHandler(1006, Buffer.from('Abnormal'));
      }

      // Should not schedule reconnect
      expect(mockLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Scheduling reconnection'),
        expect.any(Object)
      );
    });
  });
});