/**
 * Unit tests for dependency injection in MCPServer
 * 
 * These tests verify that MCPServer properly accepts dependencies via constructor,
 * enabling better testability and loose coupling.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { MCPServer } from '../../../src/mcp/server.js';
import type { MCPServerConfig } from '../../../src/shared/types/mcp.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMockLogger } from '../../mocks/logger.js';

describe('MCPServer Dependency Injection', () => {
  let config: MCPServerConfig;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let server: MCPServer | null = null;
  
  // Use fake timers to prevent hanging tests
  beforeAll(() => {
    jest.useFakeTimers();
  });
  
  afterAll(() => {
    jest.useRealTimers();
  });
  
  beforeEach(() => {
    config = {
      name: 'test-server',
      version: '1.0.0',
      transport: 'stdio',
      qrwc: {
        host: 'test.local',
        port: 443,
      },
    };
    mockLogger = createMockLogger();
  });

  afterEach(() => {
    // Clear all timers to prevent any pending timers from executing
    jest.clearAllTimers();
  });

  it('should create MCPServer with default dependencies when none provided', () => {
    server = new MCPServer(config, { logger: mockLogger });
    expect(server).toBeInstanceOf(MCPServer);
  });

  it('should accept custom dependencies via constructor', () => {
    // Create mock dependencies
    const mockServer = {
      setRequestHandler: jest.fn(),
      onerror: null,
      connect: jest.fn().mockResolvedValue(undefined),
    } as unknown as Server;

    const mockTransport = {
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as StdioServerTransport;

    const mockQRWCClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      isConnected: jest.fn().mockReturnValue(false),
      on: jest.fn(),
    };

    const mockQRWCAdapter = {
      clearAllCaches: jest.fn(),
    };

    const mockToolRegistry = {
      initialize: jest.fn().mockResolvedValue(undefined),
      cleanup: jest.fn().mockResolvedValue(undefined),
      listTools: jest.fn().mockResolvedValue([]),
      callTool: jest.fn().mockResolvedValue({ content: [], isError: false }),
      getToolCount: jest.fn().mockReturnValue(0),
    };

    const mockInputValidator = {
      validate: jest.fn().mockReturnValue({ valid: true }),
    };

    const mockHealthChecker = {
      startPeriodicChecks: jest.fn(),
      stopPeriodicChecks: jest.fn(),
      getHealthEndpointResponse: jest.fn().mockResolvedValue({ status: 'healthy' }),
    };

    const mockCircuitBreaker = {
      on: jest.fn(),
      stop: jest.fn(),
      execute: jest.fn((fn) => fn()),
    };

    const mockMetrics = {
      activeConnections: { set: jest.fn() },
      connectionErrors: { inc: jest.fn() },
      reconnects: { inc: jest.fn() },
      toolCalls: { inc: jest.fn() },
      toolDuration: { observe: jest.fn() },
      requestCount: { inc: jest.fn() },
      requestDuration: { observe: jest.fn() },
      toolErrors: { inc: jest.fn() },
      requestErrors: { inc: jest.fn() },
      stop: jest.fn(),
      export: jest.fn().mockReturnValue('# HELP test\n# TYPE test gauge\ntest 1'),
      toJSON: jest.fn().mockReturnValue({}),
    };

    // Create server with injected dependencies
    server = new MCPServer(config, {
      logger: mockLogger,
      server: mockServer,
      transport: mockTransport,
      officialQrwcClient: mockQRWCClient as any,
      qrwcClientAdapter: mockQRWCAdapter as any,
      toolRegistry: mockToolRegistry as any,
      inputValidator: mockInputValidator as any,
      healthChecker: mockHealthChecker as any,
      circuitBreaker: mockCircuitBreaker as any,
      metrics: mockMetrics as any,
    });

    expect(server).toBeInstanceOf(MCPServer);
    
    // Verify that production features were set up with injected dependencies
    expect(mockHealthChecker.startPeriodicChecks).toHaveBeenCalledWith(60000);
    expect(mockCircuitBreaker.on).toHaveBeenCalledWith('state-change', expect.any(Function));
    expect(mockQRWCClient.on).toHaveBeenCalledWith('connected', expect.any(Function));
    expect(mockQRWCClient.on).toHaveBeenCalledWith('disconnected', expect.any(Function));
    expect(mockQRWCClient.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
  });

  it('should allow partial dependency injection', () => {
    // Only inject some dependencies
    const mockToolRegistry = {
      initialize: jest.fn().mockResolvedValue(undefined),
      cleanup: jest.fn().mockResolvedValue(undefined),
      listTools: jest.fn().mockResolvedValue([]),
      callTool: jest.fn().mockResolvedValue({ content: [], isError: false }),
      getToolCount: jest.fn().mockReturnValue(0),
    };

    server = new MCPServer(config, {
      logger: mockLogger,
      toolRegistry: mockToolRegistry as any,
    });

    expect(server).toBeInstanceOf(MCPServer);
  });

  it('should properly set up request handlers with injected dependencies', async () => {
    const mockServer = {
      setRequestHandler: jest.fn(),
      onerror: null,
      connect: jest.fn().mockResolvedValue(undefined),
    } as unknown as Server;

    server = new MCPServer(config, {
      logger: mockLogger,
      server: mockServer,
    });

    // Verify request handlers were set up
    expect(mockServer.setRequestHandler).toHaveBeenCalledTimes(6); // All MCP method handlers
  });

  it('should use injected metrics for tracking', async () => {
    const mockMetrics = {
      activeConnections: { set: jest.fn() },
      connectionErrors: { inc: jest.fn() },
      reconnects: { inc: jest.fn() },
      toolCalls: { inc: jest.fn() },
      toolDuration: { observe: jest.fn() },
      requestCount: { inc: jest.fn() },
      requestDuration: { observe: jest.fn() },
      toolErrors: { inc: jest.fn() },
      requestErrors: { inc: jest.fn() },
      stop: jest.fn(),
      export: jest.fn().mockReturnValue('# HELP test\n# TYPE test gauge\ntest 1'),
      toJSON: jest.fn().mockReturnValue({ test: 1 }),
    };

    server = new MCPServer(config, {
      logger: mockLogger,
      metrics: mockMetrics as any,
    });

    // Test metrics methods
    const metricsExport = server.getMetrics();
    expect(metricsExport).toContain('# HELP test');
    expect(mockMetrics.export).toHaveBeenCalled();

    const metricsJSON = server.getMetricsJSON();
    expect(metricsJSON).toEqual({ test: 1 });
    expect(mockMetrics.toJSON).toHaveBeenCalled();
  });
});