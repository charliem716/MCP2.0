/**
 * Integration tests for dependency injection pattern
 * 
 * These tests verify that the complete DI system works correctly
 * with the composition root pattern in src/index.ts
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { MCPServerConfig } from '../../../src/shared/types/mcp.js';
import { DefaultMCPServerFactory } from '../../../src/mcp/factories/default-factory.js';
import { DIContainer } from '../../../src/mcp/infrastructure/container.js';
import { createMockLogger } from '../../mocks/logger.js';

describe('Dependency Injection Integration', () => {
  let container: DIContainer;
  let componentsToCleanup: Array<{ stop?: () => void | Promise<void> }> = [];

  // Use fake timers to prevent hanging tests
  beforeAll(() => {
    jest.useFakeTimers();
  });
  
  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    container = DIContainer.getInstance();
    container.clear();
  });

  afterEach(() => {
    // Clear all timers to prevent any pending timers from executing
    jest.clearAllTimers();
    componentsToCleanup = [];
    container.clear();
  });

  it('should create all dependencies using the factory', async () => {
    const config: MCPServerConfig = {
      name: 'test-server',
      version: '1.0.0',
      transport: 'stdio',
      qrwc: {
        host: 'test.local',
        port: 443,
      },
      rateLimiting: {
        requestsPerMinute: 100,
        burstSize: 20,
      },
      authentication: {
        enabled: true,
        apiKeys: ['test-key'],
      },
    };

    const factory = new DefaultMCPServerFactory(createMockLogger());

    // Test creating all dependencies
    const server = factory.createServer(config);
    expect(server).toBeDefined();
    expect(server.constructor.name).toBe('Server');

    const transport = factory.createTransport();
    expect(transport).toBeDefined();
    expect(transport.constructor.name).toBe('StdioServerTransport');

    const qrwcClient = factory.createQRWCClient(config);
    componentsToCleanup.push(qrwcClient);
    expect(qrwcClient).toBeDefined();
    expect(qrwcClient.constructor.name).toBe('OfficialQRWCClient');

    const qrwcAdapter = factory.createQRWCAdapter(qrwcClient);
    expect(qrwcAdapter).toBeDefined();
    expect(qrwcAdapter.constructor.name).toBe('QRWCClientAdapter');

    const toolRegistry = await factory.createToolRegistry(qrwcAdapter);
    expect(toolRegistry).toBeDefined();
    expect(toolRegistry.constructor.name).toBe('MCPToolRegistry');

    const rateLimiter = factory.createRateLimiter(config);
    componentsToCleanup.push(rateLimiter!);
    expect(rateLimiter).toBeDefined();
    expect(rateLimiter?.constructor.name).toBe('MCPRateLimiter');

    const inputValidator = factory.createInputValidator();
    expect(inputValidator).toBeDefined();
    expect(inputValidator.constructor.name).toBe('InputValidator');

    const healthChecker = factory.createHealthChecker(qrwcClient, config.version);
    componentsToCleanup.push(healthChecker);
    expect(healthChecker).toBeDefined();
    expect(healthChecker.constructor.name).toBe('HealthChecker');

    const circuitBreaker = factory.createCircuitBreaker();
    componentsToCleanup.push(circuitBreaker);
    expect(circuitBreaker).toBeDefined();
    expect(circuitBreaker.constructor.name).toBe('CircuitBreaker');

    const authenticator = factory.createAuthenticator(config);
    expect(authenticator).toBeDefined();
    expect(authenticator?.constructor.name).toBe('MCPAuthenticator');

    const metrics = factory.createMetrics();
    componentsToCleanup.push(metrics);
    expect(metrics).toBeDefined();
    expect(metrics.constructor.name).toBe('MCPMetrics');
  });

  it('should properly register dependencies in the container', () => {
    const config: MCPServerConfig = {
      name: 'test-server',
      version: '1.0.0',
      transport: 'stdio',
      qrwc: {
        host: 'test.local',
        port: 443,
      },
    };

    const factory = new DefaultMCPServerFactory(createMockLogger());
    const qrwcClient = factory.createQRWCClient(config);
    componentsToCleanup.push(qrwcClient);
    const qrwcAdapter = factory.createQRWCAdapter(qrwcClient);

    // Verify adapter was registered in container
    expect(container.has('IControlSystem')).toBe(true);
    const resolvedAdapter = container.resolve('IControlSystem');
    expect(resolvedAdapter).toBe(qrwcAdapter);
  });

  it('should create optional dependencies based on config', () => {
    const factory = new DefaultMCPServerFactory(createMockLogger());

    // Config without rate limiting
    const configNoRateLimit: MCPServerConfig = {
      name: 'test-server',
      version: '1.0.0',
      transport: 'stdio',
      qrwc: {
        host: 'test.local',
        port: 443,
      },
    };

    const rateLimiter = factory.createRateLimiter(configNoRateLimit);
    expect(rateLimiter).toBeUndefined();

    // Config with rate limiting
    const configWithRateLimit: MCPServerConfig = {
      ...configNoRateLimit,
      rateLimiting: {
        requestsPerMinute: 60,
        burstSize: 10,
      },
    };

    const rateLimiterEnabled = factory.createRateLimiter(configWithRateLimit);
    componentsToCleanup.push(rateLimiterEnabled!);
    expect(rateLimiterEnabled).toBeDefined();

    // Config without authentication
    const configNoAuth: MCPServerConfig = {
      ...configNoRateLimit,
    };

    const authenticator = factory.createAuthenticator(configNoAuth);
    expect(authenticator).toBeUndefined();

    // Config with authentication
    const configWithAuth: MCPServerConfig = {
      ...configNoRateLimit,
      authentication: {
        enabled: true,
        apiKeys: ['test'],
      },
    };

    const authenticatorEnabled = factory.createAuthenticator(configWithAuth);
    expect(authenticatorEnabled).toBeDefined();
  });

  it('should demonstrate composition root pattern', async () => {
    // This test simulates what happens in src/index.ts
    const config: MCPServerConfig = {
      name: 'test-server',
      version: '1.0.0',
      transport: 'stdio',
      qrwc: {
        host: 'test.local',
        port: 443,
      },
    };

    // Composition root: create all dependencies
    const factory = new DefaultMCPServerFactory(createMockLogger());
    const server = factory.createServer(config);
    const transport = factory.createTransport();
    const qrwcClient = factory.createQRWCClient(config);
    const qrwcAdapter = factory.createQRWCAdapter(qrwcClient);
    const toolRegistry = await factory.createToolRegistry(qrwcAdapter);
    const rateLimiter = factory.createRateLimiter(config);
    const inputValidator = factory.createInputValidator();
    const healthChecker = factory.createHealthChecker(qrwcClient, config.version);
    const circuitBreaker = factory.createCircuitBreaker();
    const authenticator = factory.createAuthenticator(config);
    const metrics = factory.createMetrics();

    // Import MCPServer
    const { MCPServer } = await import('../../../src/mcp/server.js');

    // Inject all dependencies
    const mcpServer = new MCPServer(config, {
      logger: createMockLogger(),
      server,
      transport,
      officialQrwcClient: qrwcClient,
      qrwcClientAdapter: qrwcAdapter,
      toolRegistry,
      rateLimiter,
      inputValidator,
      healthChecker,
      circuitBreaker,
      authenticator,
      metrics,
    });
    componentsToCleanup.push(mcpServer);

    expect(mcpServer).toBeDefined();
    expect(mcpServer.constructor.name).toBe('MCPServer');

    // Verify server status
    const status = mcpServer.getStatus();
    expect(status.name).toBe('test-server');
    expect(status.version).toBe('1.0.0');
    expect(status.isConnected).toBe(false); // Not started yet
  });
});