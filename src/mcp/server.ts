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
import { EventCacheManager } from './state/event-cache/manager.js';
import type { MCPServerConfig } from '../shared/types/mcp.js';

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
  private eventCacheManager: EventCacheManager;
  private isConnected = false;
  private serverName: string;
  private serverVersion: string;
  private signalHandlers = new Map<NodeJS.Signals, () => void>();
  private errorHandlers = new Map<
    string,
    NodeJS.UncaughtExceptionListener | NodeJS.UnhandledRejectionListener
  >();

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

    // Initialize components
    this.officialQrwcClient = new OfficialQRWCClient({
      host: config.qrwc.host,
      port: config.qrwc.port ?? 443,
      pollingInterval: 350,
      reconnectInterval: config.qrwc.reconnectInterval ?? 5000,
      maxReconnectAttempts: 5,
      connectionTimeout: 10000,
      enableAutoReconnect: true,
    });
    this.qrwcClientAdapter = new QRWCClientAdapter(this.officialQrwcClient);

    // Initialize Event Cache Manager
    this.eventCacheManager = new EventCacheManager({
      maxEvents: config.eventCache?.maxEvents ?? 100000,
      maxAgeMs: config.eventCache?.maxAgeMs ?? 3600000, // 1 hour default
    });

    // Attach event cache to adapter to start capturing events
    this.eventCacheManager.attachToAdapter(this.qrwcClientAdapter);

    this.toolRegistry = new MCPToolRegistry(
      this.qrwcClientAdapter,
      this.eventCacheManager
    );

    this.setupRequestHandlers();
    this.setupErrorHandling();

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
      logger.info('Received call_tool request', { tool: name, args });

      try {
        const result = await this.toolRegistry.callTool(name, args);
        logger.info('Tool execution completed', { tool: name, success: true });
        return {
          content: result.content,
          isError: result.isError,
        };
      } catch (error) {
        logger.error('Error executing tool', { tool: name, error });
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
      this.shutdown().catch((shutdownError) => {
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
      this.officialQrwcClient.disconnect();

      // Cleanup tool registry
      await this.toolRegistry.cleanup();

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
    };
  }
}
