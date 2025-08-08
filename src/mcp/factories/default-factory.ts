/**
 * Default factory implementation for MCP Server dependencies
 * 
 * This factory creates all the default implementations of dependencies
 * required by the MCP Server. It serves as the production configuration.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { OfficialQRWCClient } from '../../qrwc/officialClient.js';
import { QRWCClientAdapter } from '../qrwc/adapter.js';
import { MCPToolRegistry } from '../handlers/index.js';
import { MCPRateLimiter } from '../middleware/rate-limit.js';
import { InputValidator } from '../middleware/validation.js';
import { HealthChecker } from '../health/health-check.js';
import { createQSysCircuitBreaker, type CircuitBreaker } from '../infrastructure/circuit-breaker.js';
import { MCPAuthenticator } from '../middleware/auth.js';
import { initializeMetrics, getMetrics, type MCPMetrics } from '../monitoring/metrics.js';
import { DIContainer, ServiceTokens } from '../infrastructure/container.js';
import { globalLogger as logger } from '../../shared/utils/logger.js';
import type { MCPServerConfig } from '../../shared/types/mcp.js';
import type { IMCPServerFactory } from '../interfaces/dependencies.js';
import type { IControlSystem } from '../interfaces/control-system.js';
import type { IStateRepository } from '../state/repository.js';
import type { ILogger } from '../interfaces/logger.js';

/**
 * Default factory for creating MCP Server dependencies
 */
export class DefaultMCPServerFactory implements IMCPServerFactory {
  private container: DIContainer;
  private readonly logger: ILogger;

  constructor(logger: ILogger) {
    this.logger = logger;
    this.container = DIContainer.getInstance();
  }

  createServer(config: MCPServerConfig): Server {
    return new Server(
      {
        name: config.name,
        version: config.version,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
          logging: {},
        },
      }
    );
  }

  createTransport(): StdioServerTransport {
    return new StdioServerTransport();
  }

  createQRWCClient(config: MCPServerConfig): OfficialQRWCClient {
    return new OfficialQRWCClient({
      host: config.qrwc.host,
      port: config.qrwc.port ?? 443,
      pollingInterval: 350,
      reconnectInterval: config.qrwc.reconnectInterval ?? 5000,
      maxReconnectAttempts: 5,
      connectionTimeout: 10000,
      enableAutoReconnect: true,
      logger: logger.child({ component: 'OfficialQRWCClient' }),
    });
  }

  createQRWCAdapter(client: OfficialQRWCClient): QRWCClientAdapter {
    const adapter = new QRWCClientAdapter(client);
    // Register in container for other components
    this.container.register(ServiceTokens.CONTROL_SYSTEM, adapter);
    return adapter;
  }

  async createToolRegistry(adapter: QRWCClientAdapter): Promise<MCPToolRegistry> {
    // Create state repository first
    const stateRepo = await this.createStateRepository(adapter);
    
    // Attach state manager to adapter
    adapter.setStateManager(stateRepo);
    
    // Register state repository in container for other components
    if (!this.container.has(ServiceTokens.STATE_REPOSITORY)) {
      this.container.register(ServiceTokens.STATE_REPOSITORY, stateRepo);
    }
    
    // Create tool registry with the actual adapter that has state manager attached
    // The adapter parameter IS the control system registered in the container
    return new MCPToolRegistry(adapter as IControlSystem);
  }

  private async createStateRepository(adapter: QRWCClientAdapter): Promise<IStateRepository> {
    const { createStateRepository } = await import('../state/factory.js');
    const { configManager } = await import('../../config/index.js');
    
    // Get event monitoring config from centralized config manager
    const mcpConfig = configManager.get('mcp');
    const eventMonitoringEnabled = mcpConfig.eventMonitoring?.enabled ?? false;
    const repoType = eventMonitoringEnabled ? 'monitored' : 'simple';
    
    logger.debug('Creating state repository', {
      eventMonitoringEnabled,
      repoType,
      hasEventMonitoring: !!mcpConfig.eventMonitoring,
      eventMonitoringConfig: mcpConfig.eventMonitoring
    });
    
    const config = {
      maxEntries: 1000,
      ttlMs: 3600000,
      cleanupIntervalMs: 60000,
      enableMetrics: true,
      persistenceEnabled: false,
      // Add event monitoring config if available
      ...(mcpConfig.eventMonitoring ? {
        eventMonitoring: mcpConfig.eventMonitoring
      } : {})
    };
    
    return await createStateRepository(repoType, config, adapter);
  }

  createRateLimiter(config: MCPServerConfig): MCPRateLimiter | undefined {
    if (!config.rateLimiting) {
      return undefined;
    }

    return new MCPRateLimiter({
      requestsPerMinute: config.rateLimiting.requestsPerMinute ?? 60,
      burstSize: config.rateLimiting.burstSize ?? 10,
      perClient: config.rateLimiting.perClient ?? false,
    }, this.logger);
  }

  createInputValidator(): InputValidator {
    return new InputValidator(this.logger);
  }

  createHealthChecker(
    client: OfficialQRWCClient,
    version: string
  ): HealthChecker {
    return new HealthChecker(
      this.container,
      client,
      version,
      this.logger
    );
  }

  createCircuitBreaker(): CircuitBreaker {
    return createQSysCircuitBreaker('qsys-connection', this.logger);
  }

  createAuthenticator(config: MCPServerConfig): MCPAuthenticator | undefined {
    if (!config.authentication?.enabled) {
      return undefined;
    }

    return new MCPAuthenticator({
      enabled: true,
      apiKeys: config.authentication.apiKeys ?? [],
      tokenExpiration: config.authentication.tokenExpiration ?? 3600,
      allowAnonymous: config.authentication.allowAnonymous ?? [],
    }, this.logger);
  }

  createMetrics(): MCPMetrics {
    // Initialize metrics with logger if not already initialized
    try {
      return getMetrics();
    } catch {
      return initializeMetrics(this.logger);
    }
  }
}