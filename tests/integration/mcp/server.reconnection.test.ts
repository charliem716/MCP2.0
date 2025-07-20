/**
 * Integration tests for MCP Server reconnection handling (BUG-050)
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { MCPQSysServer } from '../../../src/mcp/server.js';
import { OfficialQRWCClient } from '../../../src/qrwc/officialClient.js';
import { QRWCClientAdapter } from '../../../src/mcp/qrwc/adapter.js';
import { MCPToolRegistry } from '../../../src/mcp/handlers/index.js';

// Mock dependencies
jest.mock('../../../src/qrwc/officialClient.js');
jest.mock('../../../src/mcp/qrwc/adapter.js');
jest.mock('../../../src/mcp/handlers/index.js');
jest.mock('../../../src/shared/utils/logger.js', () => ({
  globalLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => ({
    setRequestHandler: jest.fn(),
    connect: jest.fn(),
    onerror: undefined
  }))
}));
jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn().mockImplementation(() => ({}))
}));

describe('MCP Server - Reconnection Handling', () => {
  let server: MCPQSysServer;
  let mockQrwcClient: jest.Mocked<OfficialQRWCClient>;
  let mockAdapter: jest.Mocked<QRWCClientAdapter>;
  let mockToolRegistry: jest.Mocked<MCPToolRegistry>;
  let mockLogger: any;

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    jest.doMock('../../../src/shared/utils/logger.js', () => ({
      globalLogger: mockLogger
    }));

    // Create mock instances
    const QRWCClientMock = jest.mocked(OfficialQRWCClient);
    mockQrwcClient = new QRWCClientMock({
      host: 'test',
      port: 443
    }) as jest.Mocked<OfficialQRWCClient>;

    // Add event emitter functionality
    const eventHandlers = new Map<string, Function[]>();
    mockQrwcClient.on = jest.fn((event: string, handler: Function) => {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, []);
      }
      eventHandlers.get(event)!.push(handler);
    }) as any;
    
    mockQrwcClient.emit = jest.fn((event: string, ...args: any[]) => {
      const handlers = eventHandlers.get(event) || [];
      handlers.forEach(handler => handler(...args));
    }) as any;

    mockQrwcClient.connect = jest.fn().mockResolvedValue(undefined);
    mockQrwcClient.isConnected = jest.fn().mockReturnValue(true);

    const QRWCAdapterMock = jest.mocked(QRWCClientAdapter);
    mockAdapter = new QRWCAdapterMock(mockQrwcClient) as jest.Mocked<QRWCClientAdapter>;
    mockAdapter.clearAllCaches = jest.fn();

    const ToolRegistryMock = jest.mocked(MCPToolRegistry);
    mockToolRegistry = new ToolRegistryMock(mockAdapter) as jest.Mocked<MCPToolRegistry>;
    mockToolRegistry.initialize = jest.fn().mockResolvedValue(undefined);
    mockToolRegistry.listTools = jest.fn().mockResolvedValue([]);
    mockToolRegistry.getToolCount = jest.fn().mockReturnValue(0);

    // Create server
    server = new MCPQSysServer(mockQrwcClient, mockAdapter, mockToolRegistry);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should set up reconnection handlers when starting', async () => {
    await server.start();

    // Should have registered event handlers
    expect(mockQrwcClient.on).toHaveBeenCalledWith('connected', expect.any(Function));
    expect(mockQrwcClient.on).toHaveBeenCalledWith('disconnected', expect.any(Function));
    expect(mockQrwcClient.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
  });

  it('should clear caches on reconnection with long downtime', async () => {
    await server.start();

    // Simulate reconnection with long downtime
    mockQrwcClient.emit('connected' as any, { 
      requiresCacheInvalidation: true, 
      downtimeMs: 45000 
    });

    // Should clear adapter caches
    expect(mockAdapter.clearAllCaches).toHaveBeenCalled();
    
    // Should re-initialize tool registry
    expect(mockToolRegistry.initialize).toHaveBeenCalledTimes(2); // Once on start, once on reconnect
    
    // Should log the cache clearing
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Long disconnection detected - clearing caches',
      expect.objectContaining({ downtimeMs: 45000 })
    );
  });

  it('should not clear caches on reconnection with short downtime', async () => {
    await server.start();
    
    // Reset mock calls after start
    mockAdapter.clearAllCaches.mockClear();
    mockToolRegistry.initialize.mockClear();

    // Simulate reconnection with short downtime
    mockQrwcClient.emit('connected' as any, { 
      requiresCacheInvalidation: false, 
      downtimeMs: 15000 
    });

    // Should NOT clear adapter caches
    expect(mockAdapter.clearAllCaches).not.toHaveBeenCalled();
    
    // Should NOT re-initialize tool registry
    expect(mockToolRegistry.initialize).not.toHaveBeenCalled();
    
    // Should log normal reconnection
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Q-SYS Core reconnected',
      expect.objectContaining({ downtimeMs: 15000 })
    );
  });

  it('should log disconnection events', async () => {
    await server.start();

    // Simulate disconnection
    mockQrwcClient.emit('disconnected' as any, 'Connection lost');

    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Q-SYS Core disconnected',
      expect.objectContaining({ reason: 'Connection lost' })
    );
  });

  it('should log reconnection attempts', async () => {
    await server.start();

    // Simulate reconnection attempts
    mockQrwcClient.emit('reconnecting' as any, 1);
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Attempting to reconnect to Q-SYS Core',
      expect.objectContaining({ attempt: 1 })
    );

    mockQrwcClient.emit('reconnecting' as any, 5);
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Attempting to reconnect to Q-SYS Core',
      expect.objectContaining({ attempt: 5 })
    );
  });

  it('should handle tool registry re-initialization errors gracefully', async () => {
    await server.start();

    // Make tool registry initialization fail
    mockToolRegistry.initialize.mockRejectedValueOnce(new Error('Init failed'));

    // Simulate reconnection with cache invalidation
    mockQrwcClient.emit('connected' as any, { 
      requiresCacheInvalidation: true, 
      downtimeMs: 60000 
    });

    // Should log the error
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to re-initialize tool registry after reconnection',
      expect.objectContaining({ error: expect.any(Error) })
    );

    // Should still clear caches
    expect(mockAdapter.clearAllCaches).toHaveBeenCalled();
  });
});