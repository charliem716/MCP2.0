import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { MCPServer } from '../../../src/mcp/server.js';
import type { MCPServerConfig } from '../../../src/shared/types/mcp.js';

// Mock dependencies
jest.mock('../../../src/shared/utils/logger.js', () => ({
  globalLogger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../src/qrwc/officialClient.js');
jest.mock('../../../src/mcp/qrwc/adapter.js');
jest.mock('../../../src/mcp/handlers/index.js');
jest.mock('@modelcontextprotocol/sdk/server/index.js');
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');

describe('MCPServer Event Listener Cleanup (BUG-028)', () => {
  let originalProcess: NodeJS.Process;
  let mockProcess: NodeJS.Process & EventEmitter;

  beforeEach(() => {
    // Store original process
    originalProcess = global.process;

    // Create a mock process that extends EventEmitter
    mockProcess = new EventEmitter() as any;
    mockProcess.exit = jest.fn();
    mockProcess.on = jest.fn(EventEmitter.prototype.on.bind(mockProcess));
    mockProcess.removeListener = jest.fn(
      EventEmitter.prototype.removeListener.bind(mockProcess)
    );
    mockProcess.listenerCount =
      EventEmitter.prototype.listenerCount.bind(mockProcess);
    
    // Add mock stdin/stdout/stderr
    mockProcess.stdin = { 
      on: jest.fn(),
      read: jest.fn(),
      write: jest.fn()
    } as any;
    mockProcess.stdout = {
      on: jest.fn(),
      write: jest.fn()
    } as any;
    mockProcess.stderr = {
      on: jest.fn(),
      write: jest.fn()
    } as any;

    // Replace global process
    global.process = mockProcess;
  });

  afterEach(() => {
    // Restore original process
    global.process = originalProcess;
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

    // Create first server
    const server1 = new MCPServer(config);

    // Check initial listener counts
    expect(mockProcess.listenerCount('SIGINT')).toBe(0);
    expect(mockProcess.listenerCount('SIGTERM')).toBe(0);

    // Mock the start method to only call setupGracefulShutdown
    const setupGracefulShutdown = (server1 as any).setupGracefulShutdown.bind(
      server1
    );
    setupGracefulShutdown();

    // Should have 1 listener for each signal
    expect(mockProcess.listenerCount('SIGINT')).toBe(1);
    expect(mockProcess.listenerCount('SIGTERM')).toBe(1);
    expect(mockProcess.listenerCount('SIGUSR2')).toBe(1);

    // Create second server
    const server2 = new MCPServer(config);
    const setupGracefulShutdown2 = (server2 as any).setupGracefulShutdown.bind(
      server2
    );
    setupGracefulShutdown2();

    // Should now have 2 listeners for each signal - THIS IS THE BUG
    expect(mockProcess.listenerCount('SIGINT')).toBe(2);
    expect(mockProcess.listenerCount('SIGTERM')).toBe(2);
    expect(mockProcess.listenerCount('SIGUSR2')).toBe(2);
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

    // Mock dependencies for shutdown
    (server as any).isConnected = true;
    (server as any).transport = { close: jest.fn() };
    (server as any).officialQrwcClient = { disconnect: jest.fn() };
    (server as any).toolRegistry = { cleanup: jest.fn() };

    // Setup signal handlers
    const setupGracefulShutdown = (server as any).setupGracefulShutdown.bind(
      server
    );
    setupGracefulShutdown();

    // Verify handlers are added
    expect(mockProcess.listenerCount('SIGINT')).toBe(1);
    expect(mockProcess.listenerCount('SIGTERM')).toBe(1);
    expect(mockProcess.listenerCount('SIGUSR2')).toBe(1);

    // Shutdown should remove handlers
    await server.shutdown();

    // THIS WILL FAIL WITH THE CURRENT CODE - handlers are not removed
    expect(mockProcess.listenerCount('SIGINT')).toBe(0);
    expect(mockProcess.listenerCount('SIGTERM')).toBe(0);
    expect(mockProcess.listenerCount('SIGUSR2')).toBe(0);
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

    // Mock dependencies for shutdown
    (server as any).isConnected = true;
    (server as any).transport = { close: jest.fn() };
    (server as any).officialQrwcClient = { disconnect: jest.fn() };
    (server as any).toolRegistry = { cleanup: jest.fn() };

    // Setup signal handlers
    const setupGracefulShutdown = (server as any).setupGracefulShutdown.bind(
      server
    );
    setupGracefulShutdown();

    // First shutdown
    await server.shutdown();
    expect(mockProcess.listenerCount('SIGINT')).toBe(0);

    // Second shutdown should not throw
    await expect(server.shutdown()).resolves.not.toThrow();

    // Handlers should still be 0
    expect(mockProcess.listenerCount('SIGINT')).toBe(0);
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
    expect(mockProcess.listenerCount('uncaughtException')).toBe(1);
    expect(mockProcess.listenerCount('unhandledRejection')).toBe(1);

    // Mock dependencies for shutdown
    (server as any).isConnected = true;
    (server as any).transport = { close: jest.fn() };
    (server as any).officialQrwcClient = { disconnect: jest.fn() };
    (server as any).toolRegistry = { cleanup: jest.fn() };

    // Shutdown should remove error handlers
    await server.shutdown();

    expect(mockProcess.listenerCount('uncaughtException')).toBe(0);
    expect(mockProcess.listenerCount('unhandledRejection')).toBe(0);
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
    for (let i = 0; i < 3; i++) {
      const server = new MCPServer(config); // Constructor sets up error handlers
      const setupGracefulShutdown = (server as any).setupGracefulShutdown.bind(
        server
      );
      setupGracefulShutdown();
    }

    // Should accumulate listeners (demonstrating the bug if not fixed)
    expect(mockProcess.listenerCount('SIGINT')).toBe(3);
    expect(mockProcess.listenerCount('SIGTERM')).toBe(3);
    expect(mockProcess.listenerCount('SIGUSR2')).toBe(3);
    expect(mockProcess.listenerCount('uncaughtException')).toBe(3);
    expect(mockProcess.listenerCount('unhandledRejection')).toBe(3);
  });
});
