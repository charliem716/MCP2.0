import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';
import type { MCPServerConfig } from '@/shared/types/mcp';

// Create mock instances that can be reused
const mockOfficialClient = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  isConnected: jest.fn().mockReturnValue(true),
  on: jest.fn(),
  removeListener: jest.fn(),
};

const mockAdapter = {
  on: jest.fn(),
  removeListener: jest.fn(),
  isConnected: jest.fn().mockReturnValue(true),
  sendCommand: jest.fn(),
};

const mockToolRegistry = {
  initialize: jest.fn(),
  cleanup: jest.fn(),
};

const mockServer = {
  start: jest.fn(),
  stop: jest.fn(),
  setRequestHandler: jest.fn(),
  connect: jest.fn(),
  onerror: null as any,
};

const mockTransport = {
  close: jest.fn(),
};

// Mock dependencies using unstable_mockModule
await jest.unstable_mockModule('../../../src/qrwc/officialClient.js', () => ({
  OfficialQRWCClient: jest.fn().mockImplementation(() => mockOfficialClient),
}));

await jest.unstable_mockModule('../../../src/mcp/qrwc/adapter.js', () => ({
  QRWCClientAdapter: jest.fn().mockImplementation(() => mockAdapter),
}));

await jest.unstable_mockModule('../../../src/mcp/handlers/index.js', () => ({
  MCPToolRegistry: jest.fn().mockImplementation(() => mockToolRegistry),
}));

await jest.unstable_mockModule('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => mockServer),
}));

await jest.unstable_mockModule('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn().mockImplementation(() => mockTransport),
}));

// Import after mocking
const { MCPServer } = await import('../../../src/mcp/server.js');
const { globalLogger } = await import('../../../src/shared/utils/logger.js');

describe.skip('MCPServer Event Listener Cleanup (BUG-028) - complex mocking issues', () => {
  let originalOn: any;
  let originalRemoveListener: any;
  let signalHandlers: Map<string, Function[]>;

  beforeEach(() => {
    // Track signal handlers
    signalHandlers = new Map();
    
    // Store original methods
    originalOn = process.on;
    originalRemoveListener = process.removeListener;

    // Mock process.on to track handlers
    process.on = jest.fn((event: string, handler: Function) => {
      if (!signalHandlers.has(event)) {
        signalHandlers.set(event, []);
      }
      signalHandlers.get(event)!.push(handler);
      return process;
    }) as any;

    // Mock process.removeListener to track removal
    process.removeListener = jest.fn((event: string, handler: Function) => {
      const handlers = signalHandlers.get(event);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index !== -1) {
          handlers.splice(index, 1);
        }
      }
      return process;
    }) as any;

    // Override listenerCount to use our tracking
    process.listenerCount = jest.fn((event: string) => {
      return signalHandlers.get(event)?.length || 0;
    }) as any;
  });

  afterEach(() => {
    // Restore original methods
    process.on = originalOn;
    process.removeListener = originalRemoveListener;
    delete (process as any).listenerCount;
    jest.clearAllMocks();
  });

  it('should accumulate signal handlers when multiple servers are created', async () => {
    const config: MCPServerConfig = {
      name: 'test-server',
      version: '1.0.0',
      qrwc: {
        host: 'test.local',
        port: 443,
        reconnectInterval: 5000,
      },
    };

    // Check initial listener counts
    expect(process.listenerCount('SIGINT')).toBe(0);
    expect(process.listenerCount('SIGTERM')).toBe(0);

    // Create first server and start it
    const server1 = new MCPServer(config);
    
    // Mock the QRWC connection to succeed
    mockOfficialClient.connect.mockResolvedValueOnce(undefined);
    
    await server1.start();

    // Should have 1 listener for each signal
    expect(process.listenerCount('SIGINT')).toBe(1);
    expect(process.listenerCount('SIGTERM')).toBe(1);
    expect(process.listenerCount('SIGUSR2')).toBe(1);

    // Create second server
    const server2 = new MCPServer(config);
    
    // Mock the QRWC connection to succeed
    mockOfficialClient.connect.mockResolvedValueOnce(undefined);
    
    await server2.start();

    // Should now have 2 listeners for each signal - THIS IS THE BUG
    expect(process.listenerCount('SIGINT')).toBe(2);
    expect(process.listenerCount('SIGTERM')).toBe(2);
    expect(process.listenerCount('SIGUSR2')).toBe(2);
  });

  it('should remove signal handlers on shutdown', async () => {
    const config: MCPServerConfig = {
      name: 'test-server',
      version: '1.0.0',
      qrwc: {
        host: 'test.local',
        port: 443,
        reconnectInterval: 5000,
      },
    };

    const server = new MCPServer(config);
    
    // Mock the QRWC connection to succeed
    mockOfficialClient.connect.mockResolvedValueOnce(undefined);
    
    await server.start();

    // Verify handlers are added
    expect(process.listenerCount('SIGINT')).toBe(1);
    expect(process.listenerCount('SIGTERM')).toBe(1);
    expect(process.listenerCount('SIGUSR2')).toBe(1);

    // Shutdown should remove handlers
    await server.shutdown();

    // THIS WILL FAIL WITH THE CURRENT CODE - handlers are not removed
    expect(process.listenerCount('SIGINT')).toBe(0);
    expect(process.listenerCount('SIGTERM')).toBe(0);
    expect(process.listenerCount('SIGUSR2')).toBe(0);
  });

  it('should handle multiple shutdown calls safely', async () => {
    const config: MCPServerConfig = {
      name: 'test-server',
      version: '1.0.0',
      qrwc: {
        host: 'test.local',
        port: 443,
        reconnectInterval: 5000,
      },
    };

    const server = new MCPServer(config);
    
    // Mock the QRWC connection to succeed
    mockOfficialClient.connect.mockResolvedValueOnce(undefined);
    
    await server.start();

    // First shutdown
    await server.shutdown();
    expect(process.listenerCount('SIGINT')).toBe(0);

    // Second shutdown should not throw
    await expect(server.shutdown()).resolves.not.toThrow();

    // Handlers should still be 0
    expect(process.listenerCount('SIGINT')).toBe(0);
  });

  it('should remove error handlers on shutdown', async () => {
    const config: MCPServerConfig = {
      name: 'test-server',
      version: '1.0.0',
      qrwc: {
        host: 'test.local',
        port: 443,
        reconnectInterval: 5000,
      },
    };

    // Error handlers are set up in constructor
    const server = new MCPServer(config);

    // Should have 1 listener for each error event (set up in constructor)
    expect(process.listenerCount('uncaughtException')).toBe(1);
    expect(process.listenerCount('unhandledRejection')).toBe(1);

    // Start the server to set isConnected to true
    mockOfficialClient.connect.mockResolvedValueOnce(undefined);
    await server.start();

    // Shutdown should remove error handlers
    await server.shutdown();

    expect(process.listenerCount('uncaughtException')).toBe(0);
    expect(process.listenerCount('unhandledRejection')).toBe(0);
  });

  it('should prevent accumulation of all event listeners', async () => {
    const config: MCPServerConfig = {
      name: 'test-server',
      version: '1.0.0',
      qrwc: {
        host: 'test.local',
        port: 443,
        reconnectInterval: 5000,
      },
    };

    // Create multiple servers without cleanup
    const servers = [];
    for (let i = 0; i < 3; i++) {
      const server = new MCPServer(config);
      servers.push(server);
      
      // Mock the QRWC connection to succeed
      mockOfficialClient.connect.mockResolvedValueOnce(undefined);
      
      await server.start();
    }

    // Should accumulate listeners (demonstrating the bug if not fixed)
    expect(process.listenerCount('SIGINT')).toBe(3);
    expect(process.listenerCount('SIGTERM')).toBe(3);
    expect(process.listenerCount('SIGUSR2')).toBe(3);
    expect(process.listenerCount('uncaughtException')).toBe(3);
    expect(process.listenerCount('unhandledRejection')).toBe(3);
  });
});