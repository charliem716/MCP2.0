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

// Add stderr logging for debugging MCP issues
const debugLog = (message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    const logEntry = data 
        ? `${timestamp} [DEBUG] ${message}: ${JSON.stringify(data)}\n`
        : `${timestamp} [DEBUG] ${message}\n`;
    process.stderr.write(logEntry);
};

// Global references for cleanup
let mcpServer: MCPServer | null = null;
let isShuttingDown = false;

async function main(): Promise<void> {
  try {
    debugLog('Process started', { pid: process.pid, args: process.argv, cwd: process.cwd() });
    logger.info('🚀 Starting MCP Voice/Text-Controlled Q-SYS Demo...');
    
    // Validate configuration
    validateConfig();
    logger.info('✅ Configuration validated');
    debugLog('Configuration validated');
    
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
    debugLog('MCP config created', mcpConfig);
    
    // Initialize and start MCP server
    mcpServer = new MCPServer(mcpConfig);
    logger.info('✅ MCP server initialized');
    debugLog('MCP server initialized');
    
    // Start MCP server (this includes QRWC connection)
    await mcpServer.start();
    logger.info('✅ MCP server started and listening on stdio');
    logger.info('✅ Connected to Q-SYS Core via MCP server');
    debugLog('MCP server started successfully');
    
    // Setup graceful shutdown handlers
    
    logger.info('✅ MCP Voice/Text-Controlled Q-SYS Demo is ready');
    logger.info('🎯 AI agents can now control Q-SYS via stdio');
    debugLog('Application ready and waiting for input');
    
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
async function cleanup(): Promise<void> {
  if (isShuttingDown) {
    logger.info('⚠️  Already shutting down...');
    return;
  }
  
  isShuttingDown = true;
  logger.info('🧹 Cleaning up resources...');
  
  try {
    // Shutdown MCP server if running
    if (mcpServer) {
      await mcpServer.shutdown();
      logger.info('✅ MCP server shutdown completed');
    }
    
    logger.info('✅ Cleanup completed');
  } catch (error) {
    logger.error('❌ Error during cleanup:', error);
  }
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`🛑 ${signal} received, shutting down gracefully...`);
  
  try {
    await cleanup();
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
}

// Graceful shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions - try to recover if possible
process.on('uncaughtException', async (error: Error) => {
  debugLog('Uncaught exception', { message: error.message, stack: error.stack });
  logger.error('💥 Uncaught Exception:', error);
  
  // Only exit for fatal errors
  if (error.message.includes('EADDRINUSE') || error.message.includes('EACCES')) {
    await gracefulShutdown('UNCAUGHT_EXCEPTION');
  } else {
    logger.warn('⚠️  Attempting to continue after uncaught exception');
  }
});

// Handle unhandled promise rejections - log but don't exit
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  debugLog('Unhandled rejection', { reason });
  logger.error('💥 Unhandled Rejection', { reason, promise });
  logger.warn('⚠️  Continuing after unhandled rejection - consider fixing the root cause');
});

// Log stdio events
process.stdin.on('end', () => {
  debugLog('stdin ended');
});

process.stdin.on('close', () => {
  debugLog('stdin closed');
});

process.stdout.on('close', () => {
  debugLog('stdout closed');
});

process.on('exit', (code) => {
  debugLog('Process exiting', { code });
});

main().catch(async (error: Error) => {
  logger.error('💥 Application failed to start:', error);
  await cleanup();
  process.exit(1);
}); 