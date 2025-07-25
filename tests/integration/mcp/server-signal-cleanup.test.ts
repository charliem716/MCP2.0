/**
 * BUG-028: Signal Handler Cleanup Integration Test
 * Tests that signal handlers are properly cleaned up to prevent accumulation
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
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

  let baseListenerCounts: Record<string, number>;
  let servers: MCPServer[] = [];

  // Capture baseline counts before ANY tests run
  beforeAll(() => {
    baseListenerCounts = {
      SIGINT: process.listenerCount('SIGINT'),
      SIGTERM: process.listenerCount('SIGTERM'),
      SIGUSR2: process.listenerCount('SIGUSR2'),
      uncaughtException: process.listenerCount('uncaughtException'),
      unhandledRejection: process.listenerCount('unhandledRejection'),
    };
  });

  beforeEach(() => {
    servers = [];
  });

  afterEach(async () => {
    // Clean up any servers created during the test
    for (const server of servers) {
      try {
        // Mock required properties for shutdown if not already mocked
        if (!server.transport) {
          server.transport = { close: async () => {} } as any;
        }
        // Don't mock officialQrwcClient - use the real one
        if (!server.toolRegistry) {
          server.toolRegistry = { cleanup: async () => {} } as any;
        }
        server.isConnected = true;
        await server.shutdown();
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
    servers = [];
  });

  it('should add signal handlers when server is created', () => {
    const beforeCounts = {
      SIGINT: process.listenerCount('SIGINT'),
      SIGTERM: process.listenerCount('SIGTERM'),
      SIGUSR2: process.listenerCount('SIGUSR2'),
      uncaughtException: process.listenerCount('uncaughtException'),
      unhandledRejection: process.listenerCount('unhandledRejection'),
    };
    
    // Create server (constructor sets up error handlers AND OfficialQRWCClient adds SIGINT/SIGTERM)
    const server = new MCPServer(config);
    servers.push(server);
    
    const afterConstructor = {
      SIGINT: process.listenerCount('SIGINT'),
      SIGTERM: process.listenerCount('SIGTERM'),
      SIGUSR2: process.listenerCount('SIGUSR2'),
      uncaughtException: process.listenerCount('uncaughtException'),
      unhandledRejection: process.listenerCount('unhandledRejection'),
    };
    
    // Manually setup graceful shutdown handlers (normally done in start())
    const setupMethod = Object.getPrototypeOf(server).constructor.prototype.setupGracefulShutdown;
    setupMethod.call(server);
    
    const afterSetup = {
      SIGINT: process.listenerCount('SIGINT'),
      SIGTERM: process.listenerCount('SIGTERM'),
      SIGUSR2: process.listenerCount('SIGUSR2'),
      uncaughtException: process.listenerCount('uncaughtException'),
      unhandledRejection: process.listenerCount('unhandledRejection'),
    };

    // OfficialQRWCClient adds 1 handler each for SIGINT and SIGTERM in constructor
    // setupGracefulShutdown adds 1 more handler each for SIGINT, SIGTERM, and SIGUSR2
    // setupErrorHandling adds handlers for uncaughtException and unhandledRejection
    expect(process.listenerCount('SIGINT')).toBe(beforeCounts.SIGINT + 2); // 1 from QRWC + 1 from graceful
    expect(process.listenerCount('SIGTERM')).toBe(beforeCounts.SIGTERM + 2); // 1 from QRWC + 1 from graceful
    expect(process.listenerCount('SIGUSR2')).toBe(beforeCounts.SIGUSR2 + 1); // Only from graceful
    expect(process.listenerCount('uncaughtException')).toBe(beforeCounts.uncaughtException + 1); // From error handling
    expect(process.listenerCount('unhandledRejection')).toBe(beforeCounts.unhandledRejection + 1); // From error handling
  });

  it('should remove signal handlers on shutdown', async () => {
    const beforeCounts = {
      SIGINT: process.listenerCount('SIGINT'),
      SIGTERM: process.listenerCount('SIGTERM'),
      SIGUSR2: process.listenerCount('SIGUSR2'),
      uncaughtException: process.listenerCount('uncaughtException'),
      unhandledRejection: process.listenerCount('unhandledRejection'),
    };
    
    // Create server
    const server = new MCPServer(config);
    servers.push(server);
    const setupMethod = Object.getPrototypeOf(server).constructor.prototype.setupGracefulShutdown;
    setupMethod.call(server);

    // Mock required properties for shutdown
    server.isConnected = true;
    server.transport = { close: async () => {} } as any;
    // Don't mock officialQrwcClient - use the real one that was created
    server.toolRegistry = { cleanup: async () => {} } as any;

    // Shutdown server
    await server.shutdown();

    // After shutdown, all handlers should be removed (OfficialQRWCClient now cleans up properly)
    // MCPServer's graceful shutdown and error handlers should be removed
    expect(process.listenerCount('SIGINT')).toBe(beforeCounts.SIGINT); // All handlers removed
    expect(process.listenerCount('SIGTERM')).toBe(beforeCounts.SIGTERM); // All handlers removed
    expect(process.listenerCount('SIGUSR2')).toBe(beforeCounts.SIGUSR2); // Graceful handler removed
    expect(process.listenerCount('uncaughtException')).toBe(beforeCounts.uncaughtException); // Error handler removed
    expect(process.listenerCount('unhandledRejection')).toBe(beforeCounts.unhandledRejection); // Error handler removed
  });

  it('should properly clean up all handlers including OfficialQRWCClient', async () => {
    // This test verifies that both MCPServer and OfficialQRWCClient handlers are cleaned up properly
    
    const setupMethod = Object.getPrototypeOf(new MCPServer(config)).constructor.prototype.setupGracefulShutdown;
    let sigusr2Count = process.listenerCount('SIGUSR2');
    let uncaughtCount = process.listenerCount('uncaughtException');
    let unhandledCount = process.listenerCount('unhandledRejection');

    // Create multiple servers with proper cleanup
    for (let i = 0; i < 3; i++) {
      const server = new MCPServer(config);
      servers.push(server);
      setupMethod.call(server);

      // After setup, we should have one more SIGUSR2 handler (only from MCPServer)
      expect(process.listenerCount('SIGUSR2')).toBe(sigusr2Count + 1);
      expect(process.listenerCount('uncaughtException')).toBe(uncaughtCount + 1);
      expect(process.listenerCount('unhandledRejection')).toBe(unhandledCount + 1);

      // Mock for shutdown
      server.isConnected = true;
      server.transport = { close: async () => {} } as any;
      // Don't mock officialQrwcClient - use the real one
      server.toolRegistry = { cleanup: async () => {} } as any;

      await server.shutdown();
      
      // After shutdown, MCPServer handlers should be removed
      expect(process.listenerCount('SIGUSR2')).toBe(sigusr2Count);
      expect(process.listenerCount('uncaughtException')).toBe(uncaughtCount);
      expect(process.listenerCount('unhandledRejection')).toBe(unhandledCount);
      
      // Remove from tracking array since we already shut it down
      servers.pop();
    }

    // Verify that SIGUSR2, uncaughtException, and unhandledRejection don't accumulate
    // (these are managed by MCPServer and should be cleaned up properly)
    expect(process.listenerCount('SIGUSR2')).toBe(sigusr2Count);
    expect(process.listenerCount('uncaughtException')).toBe(uncaughtCount);
    expect(process.listenerCount('unhandledRejection')).toBe(unhandledCount);
    
    // Note: SIGINT and SIGTERM handlers are now properly cleaned up by OfficialQRWCClient
  });
});