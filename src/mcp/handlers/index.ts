import type { MCPTool } from "../../shared/types/mcp.js";
import { globalLogger as logger } from "../../shared/utils/logger.js";
import type { QRWCClientInterface } from "../qrwc/adapter.js";

// Import all Q-SYS tools
import { createListComponentsTool, createGetComponentControlsTool } from "../tools/components.js";
import { 
  createListControlsTool,
  createGetControlValuesTool,
  createSetControlValuesTool 
} from "../tools/controls.js";
import { createQueryCoreStatusTool } from "../tools/status.js";
import { createGetAllControlsTool } from "../tools/discovery.js";
import { createQueryQSysAPITool } from "../tools/qsys-api.js";
import {
  createCreateChangeGroupTool,
  createAddControlsToChangeGroupTool,
  createPollChangeGroupTool,
  createDestroyChangeGroupTool,
  createRemoveControlsFromChangeGroupTool,
  createClearChangeGroupTool,
  createSetChangeGroupAutoPollTool,
  createListChangeGroupsTool,
  createReadChangeGroupEventsTool
} from "../tools/change-groups.js";
import type { EventCacheManager } from "../state/event-cache/manager.js";
import type { BaseQSysTool, ToolExecutionResult } from "../tools/base.js";

/**
 * Tool call result structure (legacy compatibility)
 */
export interface ToolCallResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    uri?: string;
  }>;
  isError?: boolean;
}

/**
 * Base tool interface for MCP compatibility
 */
export interface BaseTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: MCPTool['inputSchema'];
  execute(args: Record<string, unknown>): Promise<ToolCallResult | ToolExecutionResult>;
}

/**
 * Tool Registry for managing all Q-SYS control tools
 * 
 * Centralizes tool registration, validation, and execution with:
 * - Comprehensive Zod schema validation
 * - Real Q-SYS tool implementations
 * - Performance monitoring and logging
 * - Type-safe QRWC client integration
 */
export class MCPToolRegistry {
  private tools = new Map<string, BaseTool>();
  private initialized = false;

  constructor(
    private qrwcClient: QRWCClientInterface,
    private eventCacheManager?: EventCacheManager
  ) {
    logger.debug("MCPToolRegistry created");
  }

  /**
   * Initialize the tool registry with all Q-SYS tools
   */
  initialize(): void {
    if (this.initialized) {
      logger.warn("MCPToolRegistry already initialized");
      return;
    }

    try {
      logger.info("Initializing MCP tool registry with Q-SYS tools...");

      // Register all Q-SYS tools
      this.registerQSysTools();

      // Keep legacy echo tool for testing
      this.registerLegacyTestingTools();

      this.initialized = true;
      logger.info(`Tool registry initialized with ${this.tools.size} tools`, {
        tools: Array.from(this.tools.keys())
      });

    } catch (error) {
      logger.error("Failed to initialize tool registry", { error });
      throw error;
    }
  }

  /**
   * Register all Q-SYS control tools
   */
  private registerQSysTools(): void {
    const qsysTools: Array<BaseQSysTool<unknown>> = [
      createListComponentsTool(this.qrwcClient),
      createGetComponentControlsTool(this.qrwcClient),
      createListControlsTool(this.qrwcClient),
      createGetControlValuesTool(this.qrwcClient),
      createSetControlValuesTool(this.qrwcClient),
      createQueryCoreStatusTool(this.qrwcClient),
      createGetAllControlsTool(this.qrwcClient),
      createQueryQSysAPITool(this.qrwcClient),
      // Change Group tools
      createCreateChangeGroupTool(this.qrwcClient),
      createAddControlsToChangeGroupTool(this.qrwcClient),
      createPollChangeGroupTool(this.qrwcClient),
      createDestroyChangeGroupTool(this.qrwcClient),
      createRemoveControlsFromChangeGroupTool(this.qrwcClient),
      createClearChangeGroupTool(this.qrwcClient),
      createSetChangeGroupAutoPollTool(this.qrwcClient),
      createListChangeGroupsTool(this.qrwcClient),
    ];

    // Add event cache tool if available
    if (this.eventCacheManager) {
      qsysTools.push(createReadChangeGroupEventsTool(this.qrwcClient, this.eventCacheManager));
    }

    qsysTools.forEach(tool => {
      this.registerQSysTool(tool);
    });

    logger.info(`Registered ${qsysTools.length} Q-SYS tools`);
  }

  /**
   * Register a Q-SYS tool (adapts to legacy interface)
   */
  private registerQSysTool(qsysTool: BaseQSysTool<unknown>): void {
    const adaptedTool: BaseTool = {
      name: qsysTool.name,
      description: qsysTool.description,
      inputSchema: qsysTool.inputSchema,
      execute: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        const result: ToolExecutionResult = await qsysTool.execute(args);
        
        // Log execution metrics
        if (result.executionTimeMs > 1000) {
          logger.warn(`Slow tool execution: ${qsysTool.name}`, {
            executionTimeMs: result.executionTimeMs,
            context: result.context
          });
        }

        // Return full result with metadata
        return result;
      }
    };

    this.registerTool(adaptedTool);
  }

  /**
   * Register legacy testing tools
   */
  private registerLegacyTestingTools(): void {
    // Echo tool for testing
    this.registerTool({
      name: 'echo',
      description: 'Test MCP connection by echoing a message. Returns "Echo: {message}" confirming connectivity. Use before complex operations to verify connection. Example: {message:"test"} returns "Echo: test".',
      inputSchema: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'Text message to echo back for connectivity verification'
          }
        },
        required: ['message']
      },
      execute: async (args) => ({
        content: [{
          type: 'text',
          text: `Echo: ${args['message']}`
        }]
      })
    });

    logger.debug("Legacy testing tools registered");
  }

  /**
   * Register a tool in the registry
   */
  private registerTool(tool: BaseTool): void {
    if (this.tools.has(tool.name)) {
      logger.warn(`Tool '${tool.name}' already registered, skipping`);
      return;
    }

    this.tools.set(tool.name, tool);
    logger.debug(`Registered tool: ${tool.name}`);
  }

  /**
   * List all available tools
   */
  async listTools(): Promise<MCPTool[]> {
    if (!this.initialized) {
      throw new Error("Tool registry not initialized");
    }

    const tools = Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));

    logger.debug(`Listing ${tools.length} available tools`);
    return tools;
  }

  /**
   * Execute a tool by name
   */
  async callTool(name: string, args?: Record<string, unknown>): Promise<ToolCallResult | ToolExecutionResult> {
    if (!this.initialized) {
      throw new Error("Tool registry not initialized");
    }

    const tool = this.tools.get(name);
    if (!tool) {
      const availableTools = Array.from(this.tools.keys()).join(', ');
      throw new Error(`Tool '${name}' not found. Available tools: ${availableTools}`);
    }

    try {
      logger.debug(`Executing tool: ${name}`, { args });
      const startTime = Date.now();
      
      const result = await tool.execute(args ?? {});
      const executionTime = Date.now() - startTime;
      
      // Check if result has extended metadata
      if ('executionTimeMs' in result && 'context' in result) {
        logger.debug(`Tool execution completed: ${name}`, { 
          executionTimeMs: result.executionTimeMs,
          context: result.context,
          success: !result.isError 
        });
      } else {
        logger.debug(`Tool execution completed: ${name}`, { 
          executionTimeMs: executionTime,
          success: !result.isError 
        });
      }
      
      return result;
    } catch (error) {
      logger.error(`Tool execution failed: ${name}`, { error, args });
      return {
        content: [{
          type: 'text',
          text: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }

  /**
   * Get the number of registered tools
   */
  getToolCount(): number {
    return this.tools.size;
  }

  /**
   * Check if a tool exists
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get tool names for debugging
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    logger.info("Cleaning up tool registry...", {
      toolCount: this.tools.size,
      tools: this.getToolNames()
    });
    
    this.tools.clear();
    this.initialized = false;
    
    logger.info("Tool registry cleanup completed");
  }
} 