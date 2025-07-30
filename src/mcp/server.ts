import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { globalLogger as logger } from '../shared/utils/logger.js';

// Add stderr logging for debugging MCP issues
const debugLog = (message: string, data?: unknown) => {
  const timestamp = new Date().toISOString();
  const logEntry = data
    ? `${timestamp} [MCP-DEBUG] ${message}: ${JSON.stringify(data)}\n`
    : `${timestamp} [MCP-DEBUG] ${message}\n`;
  process.stderr.write(logEntry);
};
import { MCPToolRegistry } from './handlers/index.js';
import { OfficialQRWCClient } from '../qrwc/officialClient.js';
import { QRWCClientAdapter } from './qrwc/adapter.js';
// BUG-132: EventCacheManager removed - using simplified state management
import type { MCPServerConfig } from '../shared/types/mcp.js';
import { DIContainer, ServiceTokens } from './infrastructure/container.js';
import type { IControlSystem } from './interfaces/control-system.js';

// Production readiness imports
import { MCPRateLimiter, createRateLimitError } from './middleware/rate-limit.js';
import { InputValidator } from './middleware/validation.js';
import { HealthChecker } from './health/health-check.js';
import { createQSysCircuitBreaker, type CircuitBreaker } from './infrastructure/circuit-breaker.js';
import { getMetrics } from './monitoring/metrics.js';
import { MCPAuthenticator, createAuthError } from './middleware/auth.js';

/**
 * MCP Server for Q-SYS Control
 *
 * Implements the Model Context Protocol server with stdio transport
 * for AI agent integration with Q-SYS systems.
 */
export class MCPServer {
  private server: Server;
  private transport?: StdioServerTransport;
  private toolRegistry: MCPToolRegistry;
  private officialQrwcClient: OfficialQRWCClient;
  private qrwcClientAdapter: QRWCClientAdapter;
  // BUG-132: EventCacheManager removed - simplified architecture
  private isConnected = false;
  private serverName: string;
  private serverVersion: string;
  private signalHandlers = new Map<NodeJS.Signals, () => void>();
  private errorHandlers = new Map<
    string,
    NodeJS.UncaughtExceptionListener | NodeJS.UnhandledRejectionListener
  >();
  
  // Production readiness components
  private rateLimiter?: MCPRateLimiter;
  private inputValidator?: InputValidator;
  private healthChecker?: HealthChecker;
  private circuitBreaker?: CircuitBreaker;
  private authenticator?: MCPAuthenticator;
  private metrics = getMetrics();
  private auditLog: Array<{
    timestamp: Date;
    tool: string;
    clientId?: string | undefined;
    success: boolean;
    duration: number;
  }> = [];

  constructor(private config: MCPServerConfig) {
    debugLog('MCPServer constructor called', config);
    this.serverName = config.name;
    this.serverVersion = config.version;

    // Initialize the MCP server with capabilities
    debugLog('Creating MCP Server instance');
    this.server = new Server(
      {
        name: this.serverName,
        version: this.serverVersion,
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
    debugLog('MCP Server instance created');

    // Initialize components with dependency injection
    const container = DIContainer.getInstance();
    
    // Create Q-SYS client with logger
    this.officialQrwcClient = new OfficialQRWCClient({
      host: config.qrwc.host,
      port: config.qrwc.port ?? 443,
      pollingInterval: 350,
      reconnectInterval: config.qrwc.reconnectInterval ?? 5000,
      maxReconnectAttempts: 5,
      connectionTimeout: 10000,
      enableAutoReconnect: true,
      logger: logger.child({ component: 'OfficialQRWCClient' }),
    });
    this.qrwcClientAdapter = new QRWCClientAdapter(this.officialQrwcClient);

    // Register services in the container
    container.register(ServiceTokens.CONTROL_SYSTEM, this.qrwcClientAdapter);

    // Initialize State Repository using the factory (BUG-132 fix)
    container.registerFactory(ServiceTokens.STATE_REPOSITORY, async () => {
      const { createStateRepository } = await import('./state/factory.js');
      return await createStateRepository('simple', {
        maxEntries: 1000,
        ttlMs: 3600000,
        cleanupIntervalMs: 60000,
        enableMetrics: true,
        persistenceEnabled: false,
      });
    });

    // BUG-132: Simplified architecture - EventCacheManager removed
    // Event caching functionality is now integrated into SimpleStateManager if needed
    // container.register(ServiceTokens.EVENT_CACHE, null); // Deprecated

    this.toolRegistry = new MCPToolRegistry(
      container.resolve<IControlSystem>(ServiceTokens.CONTROL_SYSTEM)
      // BUG-132: EventCacheManager parameter removed
    );

    this.setupRequestHandlers();
    this.setupErrorHandling();
    this.initializeProductionFeatures();

    logger.info('MCP Server initialized', {
      name: this.serverName,
      version: this.serverVersion,
    });
  }

  /**
   * Set up request handlers for all supported MCP methods
   */
  private setupRequestHandlers(): void {
    // Tools handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('Received list_tools request');
      try {
        const tools = await this.toolRegistry.listTools();
        logger.debug('Returning tools list', { count: tools.length });
        return { tools };
      } catch (error) {
        logger.error('Error listing tools', { error });
        throw this.createMCPError(
          -32603,
          'Internal error listing tools',
          error
        );
      }
    });

    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;
      const startTime = Date.now();
      
      // Extract client ID from request context if available
      let clientId = this.extractClientId(request);
      
      logger.info('Received call_tool request', { tool: name, clientId });

      try {
        // Authentication
        if (this.authenticator) {
          const authResult = this.authenticator.authenticate(
            `tools/${name}`,
            this.extractHeaders(request),
            { tool: name }
          );
          
          if (!authResult.authenticated) {
            logger.warn('Authentication failed', { 
              tool: name, 
              error: authResult.error,
            });
            throw createAuthError(authResult.error || 'Authentication required');
          }
          
          // Use authenticated client ID
          clientId = authResult.clientId || clientId;
        }

        // Rate limiting
        if (this.rateLimiter) {
          const allowed = this.rateLimiter.checkLimit(clientId);
          if (!allowed) {
            logger.warn('Rate limit exceeded', { tool: name, clientId });
            throw createRateLimitError(clientId);
          }
        }

        // Input validation
        if (this.inputValidator) {
          const validation = this.inputValidator.validate(name, args);
          if (!validation.valid) {
            logger.warn('Input validation failed', { tool: name, errors: validation.error });
            throw validation.error;
          }
        }

        // Execute tool with circuit breaker if Q-SYS related
        let result;
        if (name.startsWith('qsys.') && this.circuitBreaker) {
          result = await this.circuitBreaker.execute(async () => 
            this.toolRegistry.callTool(name, args)
          );
        } else {
          result = await this.toolRegistry.callTool(name, args);
        }
        
        // Collect metrics
        const duration = Date.now() - startTime;
        this.metrics.toolCalls.inc({ tool: name, status: 'success' });
        this.metrics.toolDuration.observe(duration / 1000); // Convert to seconds
        this.metrics.requestCount.inc({ method: 'tools/call', status: 'success' });
        this.metrics.requestDuration.observe(duration / 1000);
        
        // Audit logging
        this.addAuditLog(name, clientId, true, duration);
        
        logger.info('Tool execution completed', { 
          tool: name, 
          success: true,
          duration,
          clientId,
        });
        
        return {
          content: result.content,
          isError: result.isError,
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        
        // Collect error metrics
        const errorType = error instanceof Error ? error.constructor.name : 'UnknownError';
        this.metrics.toolCalls.inc({ tool: name, status: 'error' });
        this.metrics.toolErrors.inc({ tool: name, error_type: errorType });
        this.metrics.requestCount.inc({ method: 'tools/call', status: 'error' });
        this.metrics.requestErrors.inc({ method: 'tools/call', error_type: errorType });
        
        this.addAuditLog(name, clientId, false, duration);
        
        logger.error('Error executing tool', { tool: name, error, clientId });
        
        // Re-throw if already formatted MCP error
        if (typeof error === 'object' && error !== null && 'code' in error) {
          throw error;
        }
        
        throw this.createMCPError(
          -32603,
          `Tool execution failed: ${name}`,
          error
        );
      }
    });

    // Resources handlers (placeholder for future implementation)
    this.server.setRequestHandler(ListResourcesRequestSchema, () => {
      logger.debug('Received list_resources request');
      return { resources: [] };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, request => {
      logger.debug('Received read_resource request', {
        uri: request.params.uri,
      });
      throw this.createMCPError(-32601, 'Resource reading not implemented');
    });

    // Prompts handlers (placeholder for future implementation)
    this.server.setRequestHandler(ListPromptsRequestSchema, () => {
      logger.debug('Received list_prompts request');
      return { prompts: [] };
    });

    this.server.setRequestHandler(GetPromptRequestSchema, request => {
      logger.debug('Received get_prompt request', {
        name: request.params.name,
      });
      throw this.createMCPError(-32601, 'Prompts not implemented');
    });
  }

  /**
   * Set up global error handling for the server
   */
  private setupErrorHandling(): void {
    this.server.onerror = error => {
      logger.error('MCP Server error', { error });
    };

    // Handle uncaught exceptions
    const uncaughtHandler: NodeJS.UncaughtExceptionListener = (
      error: Error,
      origin: string
    ) => {
      logger.error('Uncaught exception in MCP server', { error, origin });
      this.shutdown().catch((shutdownError: unknown) => {
        logger.error('Shutdown error during uncaught exception', { shutdownError });
      });
      process.exit(1);
    };

    const unhandledHandler: NodeJS.UnhandledRejectionListener = (
      reason: unknown,
      promise: Promise<unknown>
    ) => {
      logger.error('Unhandled rejection in MCP server', { reason, promise });
    };

    this.errorHandlers.set('uncaughtException', uncaughtHandler);
    this.errorHandlers.set('unhandledRejection', unhandledHandler);

    process.on('uncaughtException', uncaughtHandler);
    process.on('unhandledRejection', unhandledHandler);
  }

  /**
   * Create a properly formatted MCP error response
   */
  private createMCPError(code: number, message: string, data?: unknown) {
    return {
      code,
      message,
      data: data ? { details: typeof data === 'object' ? JSON.stringify(data) : String(data as string | number | boolean) } : undefined,
    };
  }

  /**
   * Start the MCP server with stdio transport
   */
  async start(): Promise<void> {
    try {
      logger.info('Starting MCP server...');
      debugLog('Starting MCP server');

      // Initialize QRWC client first
      await this.officialQrwcClient.connect();
      logger.info('QRWC client connected');
      debugLog('QRWC client connected');

      // Set up reconnection handlers
      this.setupReconnectionHandlers();

      // Initialize tool registry
      await this.toolRegistry.initialize();
      logger.info('Tool registry initialized');
      debugLog('Tool registry initialized');

      // Create and connect stdio transport
      debugLog('Creating stdio transport');
      this.transport = new StdioServerTransport();

      debugLog('Connecting server to transport');
      await this.server.connect(this.transport);
      debugLog('Server connected to transport');

      this.isConnected = true;
      logger.info('MCP server started successfully with stdio transport');
      debugLog('MCP server started successfully');

      // Handle graceful shutdown
      this.setupGracefulShutdown();
    } catch (error) {
      logger.error('Failed to start MCP server', { error });
      throw error;
    }
  }

  /**
   * Set up reconnection handlers for Q-SYS Core connection
   */
  private setupReconnectionHandlers(): void {
    // Handle connection events
    this.officialQrwcClient.on('connected', data => {
      if (data.requiresCacheInvalidation) {
        logger.warn('Long disconnection detected - clearing caches', {
          downtimeMs: data.downtimeMs,
        });

        // Clear adapter caches
        this.qrwcClientAdapter.clearAllCaches();

        // Re-initialize tool registry to refresh component data
        try {
          this.toolRegistry.initialize();
        } catch (error) {
          logger.error(
            'Failed to re-initialize tool registry after reconnection',
            { error }
          );
        }
      } else {
        logger.info('Q-SYS Core reconnected', { downtimeMs: data.downtimeMs });
      }
    });

    this.officialQrwcClient.on('disconnected', reason => {
      logger.warn('Q-SYS Core disconnected', { reason });
    });

    this.officialQrwcClient.on('reconnecting', attempt => {
      logger.info('Attempting to reconnect to Q-SYS Core', { attempt });
    });
  }

  /**
   * Set up graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGUSR2'];

    signals.forEach(signal => {
      const handler = () => {
        logger.info(`Received ${signal}, shutting down gracefully...`);
        this.shutdown().catch((error: unknown) => {
          logger.error('Error during shutdown', { 
            error: error instanceof Error ? error.message : String(error)
          });
          process.exit(1);
        });
      };

      this.signalHandlers.set(signal, handler);
      process.on(signal, handler);
    });
  }

  /**
   * Shutdown the server and clean up resources
   */
  // eslint-disable-next-line max-statements -- Complex shutdown sequence requires proper cleanup of all resources
  async shutdown(): Promise<void> {
    if (!this.isConnected) return;

    logger.info('Shutting down MCP server...');

    try {
      // Remove signal handlers first to prevent duplicate shutdowns
      for (const [signal, handler] of this.signalHandlers) {
        process.removeListener(signal, handler);
      }
      this.signalHandlers.clear();

      // Remove error handlers
      const uncaughtHandler = this.errorHandlers.get('uncaughtException');
      if (uncaughtHandler) {
        process.removeListener(
          'uncaughtException',
          uncaughtHandler as NodeJS.UncaughtExceptionListener
        );
      }

      const unhandledHandler = this.errorHandlers.get('unhandledRejection');
      if (unhandledHandler) {
        process.removeListener(
          'unhandledRejection',
          unhandledHandler as NodeJS.UnhandledRejectionListener
        );
      }

      this.errorHandlers.clear();

      // Close transport
      if (this.transport) {
        await this.transport.close();
      }

      // Disconnect QRWC client
      await this.officialQrwcClient.disconnect();

      // Cleanup tool registry
      await this.toolRegistry.cleanup();

      // Stop production features
      if (this.rateLimiter) {
        this.rateLimiter.stop();
      }
      
      if (this.healthChecker) {
        this.healthChecker.stopPeriodicChecks();
      }
      
      if (this.circuitBreaker) {
        this.circuitBreaker.stop();
      }
      
      this.metrics.stop();

      // Persist state if available
      try {
        // Log state persistence check
        logger.debug('Checking state persistence...');

        // If we had access to state repository, we would call persist() here
        // For now, ensure all pending operations complete
        logger.info('State persistence check initiated');

        // Give a moment for any pending writes to complete
        await new Promise(resolve => setTimeout(resolve, 100));

        logger.debug('State persistence check completed');
        logger.debug('State persistence check completed');
      } catch (persistError) {
        logger.error('Error persisting state:', persistError);
        logger.error('Error persisting state during shutdown', {
          error: persistError,
        });
        // Don't throw - continue with shutdown
      }

      this.isConnected = false;
      logger.info('MCP server shut down successfully');
    } catch (error) {
      logger.error('Error during MCP server shutdown', { error });
      throw error;
    }
  }

  /**
   * Get server status information
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      qrwcConnected: this.officialQrwcClient.isConnected(),
      toolsCount: this.toolRegistry.getToolCount(),
      name: this.serverName,
      version: this.serverVersion,
      production: {
        rateLimiting: !!this.rateLimiter,
        inputValidation: !!this.inputValidator,
        healthCheck: !!this.healthChecker,
      },
    };
  }

  /**
   * Initialize production readiness features
   */
  private initializeProductionFeatures(): void {
    try {
      // Initialize rate limiter
      this.rateLimiter = new MCPRateLimiter({
        requestsPerMinute: this.config.rateLimiting?.requestsPerMinute ?? 60,
        burstSize: this.config.rateLimiting?.burstSize ?? 10,
        perClient: this.config.rateLimiting?.perClient ?? false,
      });
      logger.info('Rate limiter initialized');

      // Initialize input validator
      this.inputValidator = new InputValidator();
      logger.info('Input validator initialized');

      // Initialize health checker
      this.healthChecker = new HealthChecker(
        DIContainer.getInstance(),
        this.officialQrwcClient,
        this.serverVersion
      );
      // Start periodic health checks
      this.healthChecker.startPeriodicChecks(60000); // Every minute
      logger.info('Health checker initialized');

      // Initialize circuit breaker for Q-SYS connections
      this.circuitBreaker = createQSysCircuitBreaker();
      
      // Monitor circuit breaker state changes
      this.circuitBreaker.on('state-change', (oldState, newState) => {
        logger.warn('Circuit breaker state changed', { oldState, newState });
        this.metrics.connectionErrors.inc({ error_type: 'circuit_breaker_open' });
      });
      
      logger.info('Circuit breaker initialized');

      // Initialize authentication
      if (this.config.authentication?.enabled) {
        this.authenticator = new MCPAuthenticator({
          enabled: true,
          apiKeys: this.config.authentication.apiKeys ?? [],
          tokenExpiration: this.config.authentication.tokenExpiration ?? 3600,
          allowAnonymous: this.config.authentication.allowAnonymous ?? [],
        });
        logger.info('Authentication initialized');
      }

      // Track connection metrics
      this.officialQrwcClient.on('connected', () => {
        this.metrics.activeConnections.set(1);
      });
      
      this.officialQrwcClient.on('disconnected', () => {
        this.metrics.activeConnections.set(0);
        this.metrics.connectionErrors.inc({ error_type: 'disconnected' });
      });
      
      this.officialQrwcClient.on('reconnecting', () => {
        this.metrics.reconnects.inc();
      });

      logger.info('Production features initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize production features', { error });
      // Continue without production features rather than failing startup
    }
  }

  /**
   * Extract client ID from request
   */
  private extractClientId(request: unknown): string | undefined {
    // In MCP, client identification might come from:
    // 1. Request metadata
    // 2. Connection context
    // 3. Custom headers
    
    // For now, return undefined as MCP doesn't have built-in client ID
    // This would need to be implemented based on specific MCP server setup
    return undefined;
  }

  /**
   * Extract headers from request
   */
  private extractHeaders(request: unknown): Record<string, string | string[]> | undefined {
    // MCP doesn't have standard headers in stdio transport
    // This would be implemented for HTTP/WebSocket transports
    // For now, check if request has headers property
    if (typeof request === 'object' && request !== null && 'headers' in request) {
      return (request as any).headers;
    }
    return undefined;
  }

  /**
   * Add audit log entry
   */
  private addAuditLog(
    tool: string,
    clientId: string | undefined,
    success: boolean,
    duration: number
  ): void {
    this.auditLog.push({
      timestamp: new Date(),
      tool,
      clientId,
      success,
      duration,
    });

    // Keep only last 1000 entries to prevent memory growth
    if (this.auditLog.length > 1000) {
      this.auditLog.shift();
    }
  }

  /**
   * Get audit log entries
   */
  getAuditLog(limit = 100): typeof this.auditLog {
    return this.auditLog.slice(-limit);
  }

  /**
   * Get health status
   */
  async getHealth(verbose = false) {
    if (!this.healthChecker) {
      return {
        status: 'unknown',
        message: 'Health checker not initialized',
      };
    }

    return this.healthChecker.getHealthEndpointResponse(verbose);
  }

  /**
   * Get metrics in Prometheus format
   */
  getMetrics(): string {
    return this.metrics.export();
  }

  /**
   * Get metrics as JSON
   */
  getMetricsJSON(): Record<string, unknown> {
    return this.metrics.toJSON();
  }
}
