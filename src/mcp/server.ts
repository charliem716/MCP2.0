import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { globalLogger as logger } from "../shared/utils/logger.js";
import { MCPToolRegistry } from "./handlers/index.js";
import { OfficialQRWCClient } from "../qrwc/officialClient.js";
import { QRWCClientAdapter } from "./qrwc/adapter.js";
import type { MCPServerConfig } from "../shared/types/mcp.js";

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
  private isConnected = false;
  private serverName: string;
  private serverVersion: string;

  constructor(private config: MCPServerConfig) {
    this.serverName = config.name || "qsys-mcp-server";
    this.serverVersion = config.version || "1.0.0";
    
    // Initialize the MCP server with capabilities
    this.server = new Server(
      {
        name: this.serverName,
        version: this.serverVersion
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
          logging: {}
        }
      }
    );

    // Initialize components
    this.officialQrwcClient = new OfficialQRWCClient({
      host: config.qrwc.host,
      port: config.qrwc.port || 443,
      pollingInterval: 350,
      reconnectInterval: config.qrwc.reconnectInterval || 5000,
      maxReconnectAttempts: 5,
      connectionTimeout: 10000,
      enableAutoReconnect: true
    });
    this.qrwcClientAdapter = new QRWCClientAdapter(this.officialQrwcClient);
    this.toolRegistry = new MCPToolRegistry(this.qrwcClientAdapter);

    this.setupRequestHandlers();
    this.setupErrorHandling();
    
    logger.info("MCP Server initialized", { 
      name: this.serverName, 
      version: this.serverVersion 
    });
  }

  /**
   * Set up request handlers for all supported MCP methods
   */
  private setupRequestHandlers(): void {
    // Tools handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug("Received list_tools request");
      try {
        const tools = await this.toolRegistry.listTools();
        logger.debug("Returning tools list", { count: tools.length });
        return { tools };
      } catch (error) {
        logger.error("Error listing tools", { error });
        throw this.createMCPError(-32603, "Internal error listing tools", error);
      }
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      logger.info("Received call_tool request", { tool: name, args });
      
      try {
        const result = await this.toolRegistry.callTool(name, args);
        logger.info("Tool execution completed", { tool: name, success: true });
        return {
          content: result.content,
          isError: result.isError
        };
      } catch (error) {
        logger.error("Error executing tool", { tool: name, error });
        throw this.createMCPError(-32603, `Tool execution failed: ${name}`, error);
      }
    });

    // Resources handlers (placeholder for future implementation)
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      logger.debug("Received list_resources request");
      return { resources: [] };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      logger.debug("Received read_resource request", { uri: request.params.uri });
      throw this.createMCPError(-32601, "Resource reading not implemented");
    });

    // Prompts handlers (placeholder for future implementation)
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      logger.debug("Received list_prompts request");
      return { prompts: [] };
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      logger.debug("Received get_prompt request", { name: request.params.name });
      throw this.createMCPError(-32601, "Prompts not implemented");
    });
  }

  /**
   * Set up global error handling for the server
   */
  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      logger.error("MCP Server error", { error });
    };

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error("Uncaught exception in MCP server", { error });
      this.shutdown().catch(() => {});
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error("Unhandled rejection in MCP server", { reason, promise });
    });
  }

  /**
   * Create a properly formatted MCP error response
   */
  private createMCPError(code: number, message: string, data?: any) {
    return {
      code,
      message,
      data: data ? { details: String(data) } : undefined
    };
  }

  /**
   * Start the MCP server with stdio transport
   */
  async start(): Promise<void> {
    try {
      logger.info("Starting MCP server...");

      // Initialize QRWC client first
      await this.officialQrwcClient.connect();
      logger.info("QRWC client connected");

      // Initialize tool registry
      await this.toolRegistry.initialize();
      logger.info("Tool registry initialized");

      // Create and connect stdio transport
      this.transport = new StdioServerTransport();
      await this.server.connect(this.transport);
      
      this.isConnected = true;
      logger.info("MCP server started successfully with stdio transport");

      // Handle graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      logger.error("Failed to start MCP server", { error });
      throw error;
    }
  }

  /**
   * Set up graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGUSR2'];
    
    signals.forEach(signal => {
      process.on(signal, () => {
        logger.info(`Received ${signal}, shutting down gracefully...`);
        this.shutdown().catch((error) => {
          logger.error("Error during shutdown", { error });
          process.exit(1);
        });
      });
    });
  }

  /**
   * Shutdown the server and clean up resources
   */
  async shutdown(): Promise<void> {
    if (!this.isConnected) return;

    logger.info("Shutting down MCP server...");
    
    try {
      // Close transport
      if (this.transport) {
        await this.transport.close();
      }

      // Disconnect QRWC client
      await this.officialQrwcClient.disconnect();

      // Cleanup tool registry
      await this.toolRegistry.cleanup();

      this.isConnected = false;
      logger.info("MCP server shut down successfully");
      
    } catch (error) {
      logger.error("Error during MCP server shutdown", { error });
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
      version: this.serverVersion
    };
  }
} 