/* eslint-disable @typescript-eslint/unbound-method */
import { QRWCClient } from '../../../src/qrwc/client.js';
import { ConnectionState } from '../../../src/shared/types/common.js';
import WebSocket from 'ws';

// Mock WebSocket
jest.mock('ws');
const MockedWebSocket = WebSocket as jest.MockedClass<typeof WebSocket>;

// Mock logger
jest.mock('../../../src/shared/utils/logger.js', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }))
}));

// Mock config
jest.mock('../../../src/shared/utils/env.js', () => ({
  config: {
    qsys: {
      host: 'localhost',
      port: 8443,
      username: 'test-user',
      password: 'test-pass',
      ssl: true,
      timeout: 5000,
      retryAttempts: 3,
      retryDelay: 1000,
      heartbeatInterval: 30000,
    }
  }
}));

describe('QRWCClient', () => {
  let client: QRWCClient;
  let mockWebSocket: jest.Mocked<WebSocket>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock WebSocket instance
    mockWebSocket = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      CONNECTING: WebSocket.CONNECTING,
      OPEN: WebSocket.OPEN,
      CLOSING: WebSocket.CLOSING,
      CLOSED: WebSocket.CLOSED,
    } as any;
    
    // Define readyState as a writable property
    Object.defineProperty(mockWebSocket, 'readyState', {
      value: WebSocket.CONNECTING,
      writable: true,
      configurable: true
    });

    MockedWebSocket.mockImplementation(() => mockWebSocket);
    
    client = new QRWCClient({
      host: 'test-host',
      port: 8443,
      username: 'test-user',
      password: 'test-pass'
    });
  });

  afterEach(() => {
    client.disconnect();
  });

  // Helper function to set readyState on mock
  const setMockReadyState = (state: number) => {
    (mockWebSocket as any).readyState = state;
  };

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultClient = new QRWCClient();
      expect(defaultClient).toBeInstanceOf(QRWCClient);
    });

    it('should initialize with custom options', () => {
      const customClient = new QRWCClient({
        host: 'custom-host',
        port: 9443,
        username: 'custom-user',
        password: 'custom-pass',
        connectionTimeout: 10000
      });
      expect(customClient).toBeInstanceOf(QRWCClient);
    });
  });

  describe('connection management', () => {
    describe('connect', () => {
      it('should establish WebSocket connection', () => {
        const connectPromise = client.connect();
        
        // Simulate successful connection
        const openHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'open')?.[1] as () => void;
        expect(openHandler).toBeDefined();
        
        setMockReadyState(WebSocket.OPEN);
        openHandler();

        await connectPromise;
        
        expect(MockedWebSocket).toHaveBeenCalledWith(
          expect.stringContaining('wss://test-host:8443'),
          expect.any(Object)
        );
      });

      it('should handle connection timeout', () => {
        const connectPromise = client.connect();
        
        // Simulate timeout
        jest.advanceTimersByTime(6000);
        
        await expect(connectPromise).rejects.toThrow('Connection timeout');
      });

      it('should emit connected event on successful connection', () => {
        const connectedSpy = jest.fn();
        client.on('connected', connectedSpy);

        const connectPromise = client.connect();
        
        const openHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'open')?.[1] as () => void;
        setMockReadyState(WebSocket.OPEN);
        openHandler();

        await connectPromise;
        
        expect(connectedSpy).toHaveBeenCalled();
      });

      it('should not connect if already connected', () => {
        // First connection
        const connectPromise1 = client.connect();
        const openHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'open')?.[1] as () => void;
        setMockReadyState(WebSocket.OPEN);
        openHandler();
        await connectPromise1;

        // Second connection attempt
        const connectPromise2 = client.connect();
        await connectPromise2;

        // Should only create one WebSocket instance
        expect(MockedWebSocket).toHaveBeenCalledTimes(1);
      });
    });

    describe('disconnect', () => {
      it('should close WebSocket connection', () => {
        // Establish connection first
        const connectPromise = client.connect();
        const openHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'open')?.[1] as () => void;
        setMockReadyState(WebSocket.OPEN);
        openHandler();
        await connectPromise;

        // Disconnect
        client.disconnect();

        expect(mockWebSocket.close).toHaveBeenCalled();
      });

      it('should emit disconnected event', () => {
        const disconnectedSpy = jest.fn();
        client.on('disconnected', disconnectedSpy);

        // Establish connection first
        const connectPromise = client.connect();
        const openHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'open')?.[1] as () => void;
        setMockReadyState(WebSocket.OPEN);
        openHandler();
        await connectPromise;

        // Disconnect
        const closeHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'close')?.[1] as () => void;
        closeHandler();

        expect(disconnectedSpy).toHaveBeenCalled();
      });

      it('should handle graceful shutdown', () => {
        const shutdownSpy = jest.spyOn(process, 'on');
        
        new QRWCClient();
        
        expect(shutdownSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
        expect(shutdownSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
        expect(shutdownSpy).toHaveBeenCalledWith('beforeExit', expect.any(Function));
      });
    });

    describe('isConnected', () => {
      it('should return false when not connected', () => {
        expect(client.isConnected()).toBe(false);
      });

      it('should return true when connected', () => {
        const connectPromise = client.connect();
        const openHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'open')?.[1] as () => void;
        setMockReadyState(WebSocket.OPEN);
        openHandler();
        await connectPromise;

        expect(client.isConnected()).toBe(true);
      });
    });

    describe('getState', () => {
      it('should return connection state information', () => {
        const state = client.getState();
        
        expect(state).toHaveProperty('state');
        expect(state).toHaveProperty('reconnectAttempts');
        expect(state).toHaveProperty('lastError');
        expect(state).toHaveProperty('uptime');
      });
    });
  });

  describe('retry logic', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    it('should retry with exponential backoff', () => {
      const errorHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'error')?.[1] as () => void;
      
      void client.connect();
      
      // Simulate connection error
      errorHandler(new Error('Connection failed'));
      
      // Should schedule retry
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 1000); // First retry: 1s
      
      jest.advanceTimersByTime(1000);
      
      // Simulate another error
      errorHandler(new Error('Connection failed again'));
      
      // Should schedule retry with exponential backoff
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 2000); // Second retry: 2s
    });

    it('should respect max retry attempts', () => {
      const client = new QRWCClient({ maxReconnectAttempts: 2 });
      const errorHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'error')?.[1] as () => void;
      const errorSpy = jest.fn();
      
      client.on('error', errorSpy);
      void client.connect();
      
      // Simulate max retry attempts
      for (let i = 0; i < 3; i++) {
        errorHandler(new Error('Connection failed'));
        jest.advanceTimersByTime(Math.pow(2, i) * 1000);
      }
      
      // Should give up after max attempts
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Max retry attempts')
        })
      );
    });

    it('should reset retry attempts on successful connection', () => {
      void client.connect();
      
      // Simulate error and retry
      const errorHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'error')?.[1] as () => void;
      errorHandler(new Error('Connection failed'));
      jest.advanceTimersByTime(1000);
      
      // Simulate successful connection
      const openHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'open')?.[1] as () => void;
      setMockReadyState(WebSocket.OPEN);
      openHandler();
      
      const state = client.getState();
      expect(state.reconnectAttempts).toBe(0);
    });
  });

  describe('heartbeat mechanism', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    it('should start heartbeat after connection', () => {
      const connectPromise = client.connect();
      const openHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'open')?.[1] as () => void;
      setMockReadyState(WebSocket.OPEN);
      openHandler();
      await connectPromise;

      // Should schedule heartbeat
      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 30000);
    });

    it('should send ping messages', () => {
      const connectPromise = client.connect();
      const openHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'open')?.[1] as () => void;
      setMockReadyState(WebSocket.OPEN);
      openHandler();
      await connectPromise;

      // Advance time to trigger heartbeat
      jest.advanceTimersByTime(30000);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"method":"ping"')
      );
    });

    it('should handle pong responses', () => {
      const connectPromise = client.connect();
      const openHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'open')?.[1] as () => void;
      setMockReadyState(WebSocket.OPEN);
      openHandler();
      await connectPromise;

      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')?.[1] as () => void;
      
      // Simulate pong response
      messageHandler(JSON.stringify({
        jsonrpc: '2.0',
        result: 'pong',
        id: 1
      }));

      // Should not disconnect due to heartbeat timeout
      expect(mockWebSocket.close).not.toHaveBeenCalled();
    });

    it('should disconnect on heartbeat timeout', () => {
      const connectPromise = client.connect();
      const openHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'open')?.[1] as () => void;
      setMockReadyState(WebSocket.OPEN);
      openHandler();
      await connectPromise;

      // Send heartbeat but don't respond
      jest.advanceTimersByTime(30000); // Heartbeat interval
      jest.advanceTimersByTime(10000); // Heartbeat timeout

      expect(mockWebSocket.close).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should emit error events', () => {
      const errorSpy = jest.fn();
      client.on('error', errorSpy);

      const errorHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'error')?.[1] as () => void;
      const testError = new Error('Test error');
      
      errorHandler(testError);

      expect(errorSpy).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle WebSocket close events', () => {
      const disconnectedSpy = jest.fn();
      client.on('disconnected', disconnectedSpy);

      const closeHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'close')?.[1] as () => void;
      
      closeHandler(1000, 'Normal closure');

      expect(disconnectedSpy).toHaveBeenCalled();
    });

    it('should handle malformed JSON messages', () => {
      const errorSpy = jest.fn();
      client.on('error', errorSpy);

      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')?.[1] as () => void;
      
      messageHandler('invalid json');

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Invalid JSON')
        })
      );
    });
  });

  describe('sendCommand', () => {
    beforeEach(() => {
      const connectPromise = client.connect();
      const openHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'open')?.[1] as () => void;
      setMockReadyState(WebSocket.OPEN);
      openHandler();
      await connectPromise;
    });

    it('should send JSON-RPC commands', () => {
      const responsePromise = client.sendCommand({
        jsonrpc: '2.0',
        method: 'Component.GetComponents',
        params: {}
      });

      // Simulate response
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')?.[1] as () => void;
      messageHandler(JSON.stringify({
        jsonrpc: '2.0',
        result: { components: [] },
        id: 1
      }));

      const result = await responsePromise;
      expect(result).toEqual({ components: [] });
    });

    it('should handle command errors', () => {
      const responsePromise = client.sendCommand({
        jsonrpc: '2.0',
        method: 'InvalidMethod',
        params: {}
      });

      // Simulate error response
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')?.[1] as () => void;
      messageHandler(JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32601,
          message: 'Method not found'
        },
        id: 1
      }));

      await expect(responsePromise).rejects.toThrow('Method not found');
    });

    it('should timeout on no response', () => {
      jest.useFakeTimers();

      const responsePromise = client.sendCommand({
        jsonrpc: '2.0',
        method: 'SlowMethod',
        params: {}
      });

      // Advance time to trigger timeout
      jest.advanceTimersByTime(6000);

      await expect(responsePromise).rejects.toThrow('timeout');
      
      jest.useRealTimers();
    });

    it('should reject commands when not connected', () => {
      void client.disconnect();

      const responsePromise = client.sendCommand({
        jsonrpc: '2.0',
        method: 'TestMethod',
        params: {}
      });

      await expect(responsePromise).rejects.toThrow('not connected');
    });
  });

  describe('QSysClient interface implementation', () => {
    beforeEach(() => {
      const connectPromise = client.connect();
      const openHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'open')?.[1] as () => void;
      setMockReadyState(WebSocket.OPEN);
      openHandler();
      await connectPromise;
    });

    it('should implement getComponents method', () => {
      const responsePromise = client.getComponents();

      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')?.[1] as () => void;
      messageHandler(JSON.stringify({
        jsonrpc: '2.0',
        result: { components: [{ name: 'test', type: 'gain' }] },
        id: 1
      }));

      const result = await responsePromise;
      expect(result).toEqual([{ name: 'test', type: 'gain' }]);
    });

    it('should implement setAutoPolling method', () => {
      const responsePromise = client.setAutoPolling(true, 1000);

      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')?.[1] as () => void;
      messageHandler(JSON.stringify({
        jsonrpc: '2.0',
        result: {},
        id: 1
      }));

      await responsePromise;
      
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"method":"ChangeGroup.AutoPoll"')
      );
    });

    it('should implement poll method', () => {
      const responsePromise = client.poll();

      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')?.[1] as () => void;
      messageHandler(JSON.stringify({
        jsonrpc: '2.0',
        result: { changes: [] },
        id: 1
      }));

      const result = await responsePromise;
      expect(result).toEqual([]);
    });
  });

  describe('Request ID Overflow Protection', () => {
    beforeEach(() => {
      client = new QRWCClient({
        host: 'localhost',
        port: 8443,
        username: 'test',
        password: 'test'
      });
    });

    it('should handle request ID overflow safely', () => {
      // Access private requestId for testing
      const clientAny = client as any;
      
      // Set requestId close to MAX_SAFE_INTEGER
      clientAny.requestId = Number.MAX_SAFE_INTEGER - 500;
      
      // Mock successful connection
      clientAny.connectionState = ConnectionState.CONNECTED;
      clientAny.isAuthenticated = true;
      clientAny.ws = mockWebSocket;
      
      // Mock response for the first request
      const responsePromise = client.sendCommand({
        jsonrpc: '2.0',
        method: 'Component.GetComponents',
        params: {}
      });
      
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')?.[1] as () => void;
      messageHandler(JSON.stringify({
        jsonrpc: '2.0',
        result: {},
        id: 1 // ID should wrap around to 1
      }));
      
      await responsePromise;
      
      // requestId should have wrapped around
      expect(clientAny.requestId).toBeLessThan(1000);
      expect(clientAny.requestId).toBeGreaterThan(0);
    });

    it('should avoid ID collisions with pending requests', () => {
      const clientAny = client as any;
      
      // Mock successful connection
      clientAny.connectionState = ConnectionState.CONNECTED;
      clientAny.isAuthenticated = true;
      clientAny.ws = mockWebSocket;
      
      // Set requestId to a known value
      clientAny.requestId = 1;
      
      // Add a pending request with ID 2
      clientAny.pendingRequests.set(2, {
        resolve: jest.fn(),
        reject: jest.fn(),
        timeout: setTimeout(() => { void 0; }, 1000)
      });
      
      // Send a command - should get ID 3, not 2
      const responsePromise = client.sendCommand({
        jsonrpc: '2.0',
        method: 'Component.GetComponents',
        params: {}
      });
      
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')?.[1] as () => void;
      messageHandler(JSON.stringify({
        jsonrpc: '2.0',
        result: {},
        id: 3
      }));
      
      await responsePromise;
      
      // Should have skipped ID 2 and used ID 3
      expect(clientAny.requestId).toBe(3);
    });

    it('should never use 0 as a request ID', () => {
      const clientAny = client as any;
      
      // Mock successful connection
      clientAny.connectionState = ConnectionState.CONNECTED;
      clientAny.isAuthenticated = true;
      clientAny.ws = mockWebSocket;
      
      // Set requestId to -1 to test 0 avoidance
      clientAny.requestId = -1;
      
      const responsePromise = client.sendCommand({
        jsonrpc: '2.0',
        method: 'Component.GetComponents',
        params: {}
      });
      
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')?.[1] as () => void;
      messageHandler(JSON.stringify({
        jsonrpc: '2.0',
        result: {},
        id: 1
      }));
      
      await responsePromise;
      
      // Should have used ID 1, not 0
      expect(clientAny.requestId).toBe(1);
    });

    it('should handle edge case when all IDs are pending', () => {
      const clientAny = client as any;
      
      // Mock successful connection
      clientAny.connectionState = ConnectionState.CONNECTED;
      clientAny.isAuthenticated = true;
      clientAny.ws = mockWebSocket;
      
      // Set requestId near limit and fill pending requests
      clientAny.requestId = Number.MAX_SAFE_INTEGER - 1005;
      
      // Add pending requests for a range of IDs
      for (let i = 1; i <= 10; i++) {
        clientAny.pendingRequests.set(i, {
          resolve: jest.fn(),
          reject: jest.fn(),
          timeout: setTimeout(() => { void 0; }, 1000)
        });
      }
      
      const responsePromise = client.sendCommand({
        jsonrpc: '2.0',
        method: 'Component.GetComponents',
        params: {}
      });
      
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')?.[1] as () => void;
      messageHandler(JSON.stringify({
        jsonrpc: '2.0',
        result: {},
        id: 11
      }));
      
      await responsePromise;
      
      // Should have found an available ID
      expect(clientAny.requestId).toBe(11);
    });
  });
}); 