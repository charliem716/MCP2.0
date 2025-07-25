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
        if (!server.officialQrwcClient) {
          server.officialQrwcClient = { disconnect: () => {} } as any;
        }
        if (!server.toolRegistry) {
          server.toolRegistry = { cleanup: async () => {} } as any;
        }
        server.isConnected = true;
        await server.shutdown();
        
        // Also call disconnect on the official client to trigger its cleanup
        if (server.officialQrwcClient && server.officialQrwcClient.disconnect) {
          server.officialQrwcClient.disconnect();
        }
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
    server.officialQrwcClient = { disconnect: () => {} } as any; // disconnect is sync, not async
    server.toolRegistry = { cleanup: async () => {} } as any;

    // Shutdown server
    await server.shutdown();

    // After shutdown, only OfficialQRWCClient handlers should remain (it doesn't clean up its own handlers)
    // MCPServer's graceful shutdown and error handlers should be removed
    expect(process.listenerCount('SIGINT')).toBe(beforeCounts.SIGINT + 1); // Only QRWC handler remains
    expect(process.listenerCount('SIGTERM')).toBe(beforeCounts.SIGTERM + 1); // Only QRWC handler remains
    expect(process.listenerCount('SIGUSR2')).toBe(beforeCounts.SIGUSR2); // Graceful handler removed
    expect(process.listenerCount('uncaughtException')).toBe(beforeCounts.uncaughtException); // Error handler removed
    expect(process.listenerCount('unhandledRejection')).toBe(beforeCounts.unhandledRejection); // Error handler removed
  });

  it('should properly clean up MCPServer handlers but OfficialQRWCClient handlers accumulate', async () => {
    // This test verifies that MCPServer's own handlers are cleaned up properly
    // even though OfficialQRWCClient doesn't clean up its handlers (a bug in that component)
    
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
      server.officialQrwcClient = { disconnect: () => {} } as any;
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
    
    // Note: SIGINT and SIGTERM will accumulate due to OfficialQRWCClient not cleaning up
    // This is a known issue in OfficialQRWCClient that should be fixed separately
  });
});