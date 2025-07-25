/**
 * BUG-028: Signal Handler Cleanup Integration Test
 * Tests that signal handlers are properly cleaned up to prevent accumulation
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { MCPServer } from '../../../src/mcp/server.js';

describe('MCP Server Signal Handler Cleanup (BUG-028)', () => {
  const config = {
    name: 'test-server',
    version: '1.0.0',
    qrwc: {
      host: 'test.local',
      port: 443,
      reconnectInterval: 5000,
    },
  };

  let initialListenerCounts: Record<string, number>;

  beforeEach(() => {
    // Store initial listener counts
    initialListenerCounts = {
      SIGINT: process.listenerCount('SIGINT'),
      SIGTERM: process.listenerCount('SIGTERM'),
      SIGUSR2: process.listenerCount('SIGUSR2'),
      uncaughtException: process.listenerCount('uncaughtException'),
      unhandledRejection: process.listenerCount('unhandledRejection'),
    };
  });

  it('should add signal handlers when server is created', () => {
    // Create server (constructor sets up error handlers)
    const server = new MCPServer(config);
    
    // Manually setup graceful shutdown handlers (normally done in start())
    const setupMethod = Object.getPrototypeOf(server).constructor.prototype.setupGracefulShutdown;
    setupMethod.call(server);

    // Check listener counts increased
    expect(process.listenerCount('SIGINT')).toBe(initialListenerCounts.SIGINT + 1);
    expect(process.listenerCount('SIGTERM')).toBe(initialListenerCounts.SIGTERM + 1);
    expect(process.listenerCount('SIGUSR2')).toBe(initialListenerCounts.SIGUSR2 + 1);
    expect(process.listenerCount('uncaughtException')).toBe(initialListenerCounts.uncaughtException + 1);
    expect(process.listenerCount('unhandledRejection')).toBe(initialListenerCounts.unhandledRejection + 1);
  });

  it('should remove signal handlers on shutdown', async () => {
    // Create server
    const server = new MCPServer(config);
    const setupMethod = Object.getPrototypeOf(server).constructor.prototype.setupGracefulShutdown;
    setupMethod.call(server);

    // Mock required properties for shutdown
    server.isConnected = true;
    server.transport = { close: async () => {} } as any;
    server.officialQrwcClient = { disconnect: async () => {} } as any;
    server.toolRegistry = { cleanup: async () => {} } as any;

    // Shutdown server
    await server.shutdown();

    // Check listeners were removed
    expect(process.listenerCount('SIGINT')).toBe(initialListenerCounts.SIGINT);
    expect(process.listenerCount('SIGTERM')).toBe(initialListenerCounts.SIGTERM);
    expect(process.listenerCount('SIGUSR2')).toBe(initialListenerCounts.SIGUSR2);
    expect(process.listenerCount('uncaughtException')).toBe(initialListenerCounts.uncaughtException);
    expect(process.listenerCount('unhandledRejection')).toBe(initialListenerCounts.unhandledRejection);
  });

  it('should not accumulate handlers after multiple create/shutdown cycles', async () => {
    const setupMethod = Object.getPrototypeOf(new MCPServer(config)).constructor.prototype.setupGracefulShutdown;

    // Create multiple servers with proper cleanup
    for (let i = 0; i < 3; i++) {
      const server = new MCPServer(config);
      setupMethod.call(server);

      // Mock for shutdown
      server.isConnected = true;
      server.transport = { close: async () => {} } as any;
      server.officialQrwcClient = { disconnect: async () => {} } as any;
      server.toolRegistry = { cleanup: async () => {} } as any;

      await server.shutdown();
    }

    // Verify no accumulation
    expect(process.listenerCount('SIGINT')).toBe(initialListenerCounts.SIGINT);
    expect(process.listenerCount('SIGTERM')).toBe(initialListenerCounts.SIGTERM);
    expect(process.listenerCount('SIGUSR2')).toBe(initialListenerCounts.SIGUSR2);
    expect(process.listenerCount('uncaughtException')).toBe(initialListenerCounts.uncaughtException);
    expect(process.listenerCount('unhandledRejection')).toBe(initialListenerCounts.unhandledRejection);
  });
});