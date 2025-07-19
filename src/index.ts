/**
 * MCP Voice/Text-Controlled Q-SYS Demo
 * Main entry point for the application
 */

import 'dotenv/config';
import { createLogger, type Logger } from './shared/utils/logger.js';
import { validateConfig, config } from './shared/utils/env.js';
import { MCPServer } from './mcp/server.js';
import type { MCPServerConfig } from './shared/types/mcp.js';

const logger: Logger = createLogger('Main');

// Global references for cleanup
let mcpServer: MCPServer | null = null;

async function main(): Promise<void> {
  try {
    logger.info('🚀 Starting MCP Voice/Text-Controlled Q-SYS Demo...');
    
    // Validate configuration
    validateConfig();
    logger.info('✅ Configuration validated');
    
    // Create MCP server configuration
    const mcpConfig: MCPServerConfig = {
      name: "qsys-mcp-server",
      version: "1.0.0",
      transport: "stdio",
      qrwc: {
        host: config.qsys.host,
        port: config.qsys.port,
        reconnectInterval: config.qsys.reconnectInterval,
        heartbeatInterval: 30000
      }
    };
    
    // Initialize and start MCP server
    mcpServer = new MCPServer(mcpConfig);
    logger.info('✅ MCP server initialized');
    
    // Start MCP server (this includes QRWC connection)
    await mcpServer.start();
    logger.info('✅ MCP server started and listening on stdio');
    logger.info('✅ Connected to Q-SYS Core via MCP server');
    
    // Setup graceful shutdown
    const shutdownHandler = (): void => {
      logger.info('🛑 Received shutdown signal');
      cleanup();
      process.exit(0);
    };
    
    process.on('SIGINT', shutdownHandler);
    process.on('SIGTERM', shutdownHandler);
    
    logger.info('✅ MCP Voice/Text-Controlled Q-SYS Demo is ready');
    logger.info('🎯 AI agents can now control Q-SYS via stdio');
    
    // Keep process alive - MCP server handles stdio
    // No need to resume stdin as MCP handles it
    
  } catch (error) {
    logger.error('❌ Failed to start application:', error);
    cleanup();
    process.exit(1);
  }
}

/**
 * Cleanup function for graceful shutdown
 */
function cleanup(): void {
  logger.info('🧹 Cleaning up resources...');
  
  try {
    // Shutdown MCP server if running
    if (mcpServer) {
      mcpServer.shutdown().catch((error) => {
        logger.error('❌ Error shutting down MCP server:', error);
      });
      logger.info('✅ MCP server shutdown initiated');
    }
    
    logger.info('✅ Cleanup completed');
  } catch (error) {
    logger.error('❌ Error during cleanup:', error);
  }
}

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  logger.info('🛑 SIGTERM received, shutting down gracefully...');
  cleanup();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('🛑 SIGINT received, shutting down gracefully...');
  cleanup();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('💥 Uncaught Exception:', error);
  cleanup();
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  logger.error('💥 Unhandled Rejection', { promise, reason });
  cleanup();
  process.exit(1);
});

main().catch((error: Error) => {
  logger.error('💥 Application failed to start:', error);
  cleanup();
  process.exit(1);
}); 