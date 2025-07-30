/**
 * Final tests to achieve 80%+ coverage for OfficialQRWCClient
 * Targets specific uncovered lines identified in BUG-142
 */

import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from '@jest/globals';
import WebSocket from 'ws';
import { ConnectionState } from '../../../src/shared/types/common.js';

describe('OfficialQRWCClient - Final Coverage Push', () => {
  let OfficialQRWCClient: any;
  let mockLogger: any;
  let mockWebSocket: any;
  let mockQrwc: any;
  let mockWsConstructor: jest.Mock;
  let originalMaxListeners: number;

  beforeAll(() => {
    // Fix MaxListenersExceededWarning
    originalMaxListeners = process.getMaxListeners();
    process.setMaxListeners(20);
  });

  afterAll(() => {
    // Restore original max listeners
    process.setMaxListeners(originalMaxListeners);
  });

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
      once: jest.fn(),
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

  afterEach(async () => {
    // Clean up all signal listeners
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('beforeExit');
    
    jest.clearAllMocks();
    await new Promise(resolve => setImmediate(resolve));
  });

  describe('Logger Edge Cases', () => {
    it('should handle undefined logger from createLogger', async () => {
      jest.resetModules();
      
      // Mock createLogger to return undefined
      jest.unstable_mockModule('../../../src/shared/utils/logger', () => ({
        createLogger: jest.fn().mockReturnValue(undefined),
        globalLogger: mockLogger,
      }));

      const module = await import('../../../src/qrwc/officialClient.js');
      const client = new module.OfficialQRWCClient({
        host: 'test.local',
      });

      // Should have fallback logger
      expect(() => client.getState()).not.toThrow();
    });
  });

  describe('Connection Error Scenarios', () => {
    it('should handle connection timeout with proper cleanup', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
        connectionTimeout: 100,
        enableAutoReconnect: false,
      });

      // Mock no WebSocket events
      mockWebSocket.once.mockImplementation(() => {});

      await expect(client.connect()).rejects.toThrow('Failed to connect to Q-SYS Core');
      
      // Verify timeout was cleared
      expect(client.getState()).toBe(ConnectionState.DISCONNECTED);
    });

    it('should handle WebSocket null during connection', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
        enableAutoReconnect: false,
      });

      // Make ws constructor return null first time
      mockWsConstructor.mockReturnValueOnce(null);

      await expect(client.connect()).rejects.toThrow('Failed to connect to Q-SYS Core');
    });

    it('should handle error event followed by open event', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
        enableAutoReconnect: false,
      });

      let errorCallback: Function | undefined;
      let openCallback: Function | undefined;
      
      mockWebSocket.once.mockImplementation((event, callback) => {
        if (event === 'error') {
          errorCallback = callback;
        } else if (event === 'open') {
          openCallback = callback;
        }
      });

      const connectPromise = client.connect();

      // Trigger error first
      if (errorCallback) {
        errorCallback(new Error('Initial error'));
      }

      // Should still fail
      await expect(connectPromise).rejects.toThrow('Failed to connect to Q-SYS Core');
    });
  });

  describe('Reconnection and Recovery', () => {
    it('should emit cache invalidation for >30s downtime', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
      });

      const connectedEvents: any[] = [];
      client.on('connected', (data) => {
        connectedEvents.push(data);
      });

      // Connect
      await client.connect();
      
      // Simulate disconnection with WebSocket close
      const closeHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'close')?.[1];
      if (closeHandler) {
        closeHandler(1006, Buffer.from('Abnormal'));
      }

      // Wait 35 seconds (simulated)
      const privateClient = client as any;
      privateClient.disconnectTime = new Date(Date.now() - 35000);

      // Reset mocks for reconnection
      mockWebSocket.readyState = WebSocket.OPEN;
      mockWebSocket.once.mockImplementation((event, callback) => {
        if (event === 'open') {
          setImmediate(callback);
        }
      });

      // Clear events
      connectedEvents.length = 0;

      // Reconnect
      await client.connect();

      expect(connectedEvents[0].requiresCacheInvalidation).toBe(true);
      expect(connectedEvents[0].downtimeMs).toBeGreaterThan(30000);
    });

    it('should switch to long-term reconnection mode', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
        enableAutoReconnect: true,
        reconnectInterval: 50,
        maxReconnectAttempts: 2,
      });

      // Make all connections fail
      const { Qrwc } = await import('@q-sys/qrwc');
      (Qrwc.createQrwc as jest.Mock).mockRejectedValue(new Error('Persistent failure'));

      // Track reconnecting events
      const reconnectingEvents: any[] = [];
      client.on('reconnecting', (data) => {
        reconnectingEvents.push(data);
      });

      // Initial connection fails
      await expect(client.connect()).rejects.toThrow();

      // Wait for retries
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should have warned about long-term mode
      expect(mockLogger.warn).toHaveBeenCalledWith('Switching to long-term reconnection mode');
      
      // Should continue incrementing attempts
      expect(reconnectingEvents.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle reconnection during shutdown gracefully', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
        enableAutoReconnect: true,
      });

      await client.connect();

      // Start disconnecting
      const disconnectPromise = client.disconnect();

      // Simulate WebSocket close during shutdown
      const closeHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'close')?.[1];
      if (closeHandler) {
        closeHandler(1006, Buffer.from('Abnormal'));
      }

      await disconnectPromise;

      // Should not attempt reconnection
      expect(mockLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Scheduling reconnection'),
        expect.any(Object)
      );
    });
  });

  describe('Signal Handler Coverage', () => {
    it('should handle SIGINT during active connection', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
      });

      await client.connect();

      // Find SIGINT handler
      const sigIntListeners = process.listeners('SIGINT');
      const handler = sigIntListeners[sigIntListeners.length - 1];
      
      if (handler) {
        handler('SIGINT' as any);
      }

      // Give async disconnect time
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(client.getState()).toBe(ConnectionState.DISCONNECTED);
    });

    it('should handle beforeExit event', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
      });

      await client.connect();

      // Find beforeExit handler
      const beforeExitListeners = process.listeners('beforeExit');
      const handler = beforeExitListeners[beforeExitListeners.length - 1];
      
      if (handler) {
        handler(0);
      }

      // Give async disconnect time
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(client.getState()).toBe(ConnectionState.DISCONNECTED);
    });

    it('should prevent duplicate signal handler installation', () => {
      // Create multiple clients
      const client1 = new OfficialQRWCClient({ host: 'test1.local' });
      const client2 = new OfficialQRWCClient({ host: 'test2.local' });
      const client3 = new OfficialQRWCClient({ host: 'test3.local' });

      // Clean up
      client1.disconnect();
      client2.disconnect();
      client3.disconnect();

      // Should only install handlers once
      const installCalls = mockLogger.debug.mock.calls.filter(
        call => call[0] === 'Signal handlers installed'
      );
      expect(installCalls.length).toBe(1);
    });
  });

  describe('Raw Command Edge Cases', () => {
    it('should handle malformed JSON in WebSocket response', async () => {
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

      const commandPromise = client.sendRawCommand('test.method', { param: 'value' });

      // Send malformed responses
      if (messageHandler) {
        // Invalid JSON
        messageHandler('not json at all');
        messageHandler('{invalid json');
        messageHandler('{"incomplete":');
        
        // Then send valid response
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

    it('should handle various WebSocket.Data types', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
      });

      await client.connect();

      // Test with Blob-like object (fallback to JSON.stringify)
      let messageHandler: Function | undefined;
      mockWebSocket.on.mockImplementation((event, handler) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      const commandPromise = client.sendRawCommand('test.method', {});

      if (messageHandler) {
        const sentMessage = mockWebSocket.send.mock.calls[0][0];
        const { id } = JSON.parse(sentMessage);
        
        // Send as plain object (will use JSON.stringify fallback)
        messageHandler({
          jsonrpc: '2.0',
          id,
          result: { success: true },
        });
      }

      const result = await commandPromise;
      expect(result).toEqual({ success: true });
    });

    it('should clear timeout on successful response', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
      });

      await client.connect();

      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      let messageHandler: Function | undefined;
      mockWebSocket.on.mockImplementation((event, handler) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      const commandPromise = client.sendRawCommand('test.method', {});

      // Send immediate response
      if (messageHandler) {
        const sentMessage = mockWebSocket.send.mock.calls[0][0];
        const { id } = JSON.parse(sentMessage);
        messageHandler(JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: { success: true },
        }));
      }

      await commandPromise;
      expect(clearTimeoutSpy).toHaveBeenCalled();
      
      clearTimeoutSpy.mockRestore();
    });
  });

  describe('WebSocket State Transitions', () => {
    it('should handle WebSocket close without reason buffer', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
        enableAutoReconnect: false,
      });

      const disconnectedEvents: string[] = [];
      client.on('disconnected', (reason) => {
        disconnectedEvents.push(reason);
      });

      await client.connect();

      // Trigger close without Buffer reason
      const closeHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'close')?.[1];
      if (closeHandler) {
        closeHandler(1006, 'String reason');
      }

      expect(disconnectedEvents[0]).toContain('1006 String reason');
    });

    it('should not emit disconnected when already disconnecting', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
      });

      const disconnectedEvents: string[] = [];
      client.on('disconnected', (reason) => {
        disconnectedEvents.push(reason);
      });

      await client.connect();

      // Force state to DISCONNECTING
      const privateClient = client as any;
      privateClient.connectionState = ConnectionState.DISCONNECTING;

      // Trigger close
      const closeHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'close')?.[1];
      if (closeHandler) {
        closeHandler(1000, Buffer.from('Normal'));
      }

      // Should not emit since already disconnecting
      expect(disconnectedEvents).toHaveLength(0);
    });
  });

  describe('Connection State Edge Cases', () => {
    it('should handle rapid connect/disconnect cycles', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
      });

      // Rapid operations
      const promise1 = client.connect();
      client.disconnect();
      const promise2 = client.connect();
      client.disconnect();

      // Should handle gracefully
      await expect(promise1).resolves.toBeUndefined();
      await expect(promise2).resolves.toBeUndefined();
    });

    it('should handle getQrwc when connected', async () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
      });

      await client.connect();
      
      const qrwc = client.getQrwc();
      expect(qrwc).toBe(mockQrwc);
    });
  });
});