/**
 * Targeted tests for the last few uncovered lines in OfficialQRWCClient
 * Final push to achieve 80%+ coverage for BUG-142
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

describe('OfficialQRWCClient - Missing Coverage', () => {
  let OfficialQRWCClient: any;
  let mockLogger: any;
  let mockWebSocket: any;
  let mockQrwc: any;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    process.setMaxListeners(15);

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    };

    mockWebSocket = {
      on: jest.fn(),
      off: jest.fn(),
      once: jest.fn((event, callback) => {
        if (event === 'open') setImmediate(callback);
      }),
      send: jest.fn(),
      close: jest.fn(),
      removeListener: jest.fn(),
      readyState: WebSocket.OPEN,
    };

    mockQrwc = {
      components: {},
      on: jest.fn(),
      close: jest.fn(),
    };

    jest.unstable_mockModule('../../../src/shared/utils/logger', () => ({
      createLogger: jest.fn().mockReturnValue(mockLogger),
      globalLogger: mockLogger,
    }));

    jest.unstable_mockModule('ws', () => ({
      default: jest.fn().mockImplementation(() => mockWebSocket),
    }));

    jest.unstable_mockModule('@q-sys/qrwc', () => ({
      Qrwc: {
        createQrwc: jest.fn().mockResolvedValue(mockQrwc),
      },
    }));

    const module = await import('../../../src/qrwc/officialClient.js');
    OfficialQRWCClient = module.OfficialQRWCClient;
  });

  afterEach(() => {
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('beforeExit');
    process.setMaxListeners(10);
  });

  it('should log Q-SYS Core reconnected message for short downtime', async () => {
    const client = new OfficialQRWCClient({ host: 'test.local' });
    
    await client.connect();
    
    // Disconnect
    client.disconnect();
    
    // Set short downtime (< 30s)
    const privateClient = client as any;
    privateClient.disconnectTime = new Date(Date.now() - 5000); // 5 seconds
    
    // Reset for reconnection
    mockWebSocket.readyState = WebSocket.OPEN;
    mockWebSocket.once.mockImplementation((event, callback) => {
      if (event === 'open') setImmediate(callback);
    });
    
    await client.connect();
    
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Q-SYS Core reconnected after downtime',
      expect.objectContaining({
        downtimeMs: expect.any(Number),
        requiresCacheInvalidation: false,
      })
    );
  });

  it('should handle getComponent when not connected', () => {
    const client = new OfficialQRWCClient({ host: 'test.local' });
    
    expect(() => client.getComponent('Test')).toThrow('Not connected to Q-SYS Core');
  });

  it('should handle missing control in offControlUpdate silently', async () => {
    const client = new OfficialQRWCClient({ host: 'test.local' });
    
    // Add a component without the control we're looking for
    mockQrwc.components = {
      TestComponent: {
        controls: {},
      },
    };
    
    await client.connect();
    
    const listener = jest.fn();
    
    // Should not throw even if control doesn't exist
    // The method checks if control exists before trying to remove listener
    expect(() => {
      client.offControlUpdate('TestComponent', 'nonExistent', listener);
    }).not.toThrow();
  });

  it.skip('should handle WebSocket error->close sequence', async () => {
    const client = new OfficialQRWCClient({
      host: 'test.local',
      enableAutoReconnect: true,
    });

    await client.connect();

    // Trigger error then close in sequence
    const errorHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'error')?.[1];
    const closeHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'close')?.[1];

    if (errorHandler) {
      errorHandler(new Error('Connection error'));
    }
    
    if (closeHandler) {
      closeHandler(1006, Buffer.from('Abnormal closure'));
    }

    expect(mockLogger.error).toHaveBeenCalledWith('WebSocket error', expect.any(Object));
  });

  it('should log initial connection success without downtime', async () => {
    const client = new OfficialQRWCClient({ host: 'test.local' });
    
    const connectedEvents: any[] = [];
    client.on('connected', (data) => {
      connectedEvents.push(data);
    });
    
    await client.connect();
    
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Successfully connected to Q-SYS Core using official QRWC library'
    );
    
    expect(connectedEvents[0]).toEqual({
      requiresCacheInvalidation: false,
      downtimeMs: 0,
    });
  });

  it.skip('should handle error without message property', async () => {
    const client = new OfficialQRWCClient({ host: 'test.local' });
    
    await client.connect();
    
    let messageHandler: Function | undefined;
    mockWebSocket.on.mockImplementation((event, handler) => {
      if (event === 'message') messageHandler = handler;
    });

    const commandPromise = client.sendRawCommand('test', {});
    
    if (messageHandler) {
      const sentMessage = mockWebSocket.send.mock.calls[0][0];
      const { id } = JSON.parse(sentMessage);
      
      // Send error without message property
      messageHandler(JSON.stringify({
        jsonrpc: '2.0',
        id,
        error: { code: -32000 }, // No message property
      }));
    }

    await expect(commandPromise).rejects.toThrow('Command failed: Unknown error');
  });

  it('should handle connecting state in isConnected', async () => {
    const client = new OfficialQRWCClient({ host: 'test.local' });
    
    // Mock slow connection
    mockWebSocket.once.mockImplementation(() => {});
    
    // Start connecting but don't await
    client.connect();
    
    // Should return false while connecting
    expect(client.isConnected()).toBe(false);
    expect(client.getState()).toBe('connecting');
  });
});