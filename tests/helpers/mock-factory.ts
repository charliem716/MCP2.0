import { jest } from '@jest/globals';
import type { MCPServerConfig } from '../../src/shared/types/mcp.js';
import type { PartialMCPServerDependencies } from '../../src/mcp/interfaces/dependencies.js';

/**
 * Creates a complete set of mock dependencies for MCPServer testing
 */
export function createMockDependencies(overrides?: Partial<PartialMCPServerDependencies>): PartialMCPServerDependencies {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    })),
  };

  const mockServer = {
    setRequestHandler: jest.fn(),
    onerror: null,
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  };

  const mockTransport = {
    start: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    send: jest.fn(),
  };

  const mockOfficialQrwcClient = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    isConnected: jest.fn().mockReturnValue(false),
    on: jest.fn(),
    off: jest.fn(),
    once: jest.fn(),
    emit: jest.fn(),
    removeAllListeners: jest.fn(),
    addChangeGroup: jest.fn().mockResolvedValue({ id: 'test-cg' }),
    invalidateChangeGroup: jest.fn().mockResolvedValue(undefined),
    getComponents: jest.fn().mockResolvedValue([]),
    getComponent: jest.fn().mockResolvedValue(null),
    addControlToChangeGroup: jest.fn().mockResolvedValue(undefined),
    addComponentControlToChangeGroup: jest.fn().mockResolvedValue(undefined),
  };

  const mockQrwcAdapter = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    isConnected: jest.fn().mockReturnValue(false),
    sendCommand: jest.fn().mockResolvedValue({ result: 'success' }),
    on: jest.fn(),
    off: jest.fn(),
    once: jest.fn(),
    emit: jest.fn(),
    removeAllListeners: jest.fn(),
    getState: jest.fn().mockReturnValue('disconnected'),
    clearAllCaches: jest.fn(),
    setStateManager: jest.fn(),
  };

  const mockToolRegistry = {
    initialize: jest.fn().mockResolvedValue(undefined),
    cleanup: jest.fn().mockResolvedValue(undefined),
    listTools: jest.fn().mockResolvedValue([]),
    callTool: jest.fn().mockResolvedValue({ content: [], isError: false }),
    getToolCount: jest.fn().mockReturnValue(0),
  };

  const mockRateLimiter = {
    checkLimit: jest.fn().mockResolvedValue(true),
    reset: jest.fn(),
    getRemainingRequests: jest.fn().mockReturnValue(100),
  };

  const mockInputValidator = {
    validate: jest.fn().mockReturnValue({ valid: true }),
    validateTool: jest.fn().mockReturnValue({ valid: true }),
    getValidationStats: jest.fn().mockReturnValue({ total: 0, passed: 0, failed: 0 }),
  };

  const mockHealthChecker = {
    startPeriodicChecks: jest.fn(),
    stopPeriodicChecks: jest.fn(),
    getHealthEndpointResponse: jest.fn().mockResolvedValue({ status: 'healthy' }),
    checkHealth: jest.fn().mockResolvedValue({ healthy: true }),
  };

  const mockCircuitBreaker = {
    execute: jest.fn((fn: any) => fn()),
    on: jest.fn(),
    stop: jest.fn(),
    getState: jest.fn().mockReturnValue('closed'),
    getStats: jest.fn().mockReturnValue({ failures: 0, successes: 0 }),
  };

  const mockAuthenticator = {
    authenticate: jest.fn().mockResolvedValue({ authenticated: true }),
    authorize: jest.fn().mockResolvedValue({ authorized: true }),
    middleware: jest.fn(),
    generateToken: jest.fn().mockReturnValue('test-token'),
    verifyToken: jest.fn().mockResolvedValue({ valid: true }),
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
    toJSON: jest.fn().mockReturnValue({ test: 1 }),
  };

  return {
    logger: mockLogger as any,
    server: mockServer as any,
    transport: mockTransport as any,
    officialQrwcClient: mockOfficialQrwcClient as any,
    qrwcClientAdapter: mockQrwcAdapter as any,
    toolRegistry: mockToolRegistry as any,
    rateLimiter: mockRateLimiter as any,
    inputValidator: mockInputValidator as any,
    healthChecker: mockHealthChecker as any,
    circuitBreaker: mockCircuitBreaker as any,
    authenticator: mockAuthenticator as any,
    metrics: mockMetrics as any,
    ...overrides,
  };
}

/**
 * Creates a default test configuration for MCPServer
 */
export function createTestConfig(overrides?: Partial<MCPServerConfig>): MCPServerConfig {
  return {
    name: 'test-server',
    version: '1.0.0',
    transport: 'stdio',
    qrwc: {
      host: 'test.local',
      port: 443,
      username: 'test',
      password: 'test',
    },
    ...overrides,
  };
}