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
const debugLog = (message: string, data?: unknown) => {
  const timestamp = new Date().toISOString();
  const logEntry = data
    ? `${timestamp} [DEBUG] ${message}: ${JSON.stringify(data)}\n`
    : `${timestamp} [DEBUG] ${message}\n`;
  process.stderr.write(logEntry);
};

// Global references for cleanup
let mcpServer: MCPServer | null = null;
let isShuttingDown = false;
let loggerClosed = false;

/**
 * Initialize and return MCP server
 */
function initializeMCPServer(): MCPServer {
  const mcpConfig: MCPServerConfig = {
    name: 'qsys-mcp-server',
    version: '1.0.0',
    transport: 'stdio',
    qrwc: {
      host: config.qsys.host,
      port: config.qsys.port,
      reconnectInterval: config.qsys.reconnectInterval,
      heartbeatInterval: config.qsys.heartbeatInterval,
    },
  };
  debugLog('MCP config created', mcpConfig);
  return new MCPServer(mcpConfig);
}

async function main(): Promise<void> {
  try {
    debugLog('Process started', {
      pid: process.pid,
      args: process.argv,
      cwd: process.cwd(),
    });
    logger.info('🚀 Starting MCP Voice/Text-Controlled Q-SYS Demo...');

    // Validate configuration
    validateConfig();
    logger.info('✅ Configuration validated');
    debugLog('Configuration validated');

    // Initialize and start MCP server
    mcpServer = initializeMCPServer();
    logger.info('✅ MCP server initialized');
    debugLog('MCP server initialized');

    // Start MCP server (this includes QRWC connection)
    await mcpServer.start();
    logger.info('✅ MCP server started and listening on stdio');
    logger.info('✅ Connected to Q-SYS Core via MCP server');
    debugLog('MCP server started successfully');

    logger.info('✅ MCP Voice/Text-Controlled Q-SYS Demo is ready');
    logger.info('🎯 AI agents can now control Q-SYS via stdio');
    debugLog('Application ready and waiting for input');
  } catch (error) {
    logger.error('❌ Failed to start application:', error);
    await cleanup();
    process.exit(1);
  }
}

/**
 * Cleanup function for graceful shutdown
 */
async function cleanup(): Promise<void> {
  if (isShuttingDown) {
    // Force output during shutdown
    debugLog('Already shutting down...');
    logger.info('⚠️  Already shutting down...');
    return;
  }

  isShuttingDown = true;
  // Force output during shutdown
  debugLog('Cleaning up resources...');
  logger.info('🧹 Cleaning up resources...');

  // Set a timeout to force exit if cleanup takes too long
  const forceExitTimeout = setTimeout(() => {
    logger.error('⚡ Forced exit after timeout - cleanup took too long');
    process.exit(1);
  }, 10000); // 10 second timeout

  try {
    // Shutdown MCP server if running
    if (mcpServer) {
      await mcpServer.shutdown();
      logger.info('✅ MCP server shutdown completed');
    }

    clearTimeout(forceExitTimeout);

    // Log completion before closing logger
    debugLog('Cleanup completed');
    logger.info('✅ Cleanup completed');

    // Flush logger transports last
    if (!loggerClosed) {
      loggerClosed = true;
      // Logger cleanup is handled internally
    }
  } catch (error) {
    logger.error('❌ Error during cleanup:', error);
    clearTimeout(forceExitTimeout);
  }
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal: string): Promise<void> {
  // Force output during shutdown
  debugLog(`${signal} received, shutting down gracefully...`);
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
process.on('SIGTERM', () => {
  gracefulShutdown('SIGTERM').catch(error => {
    logger.error('Error during SIGTERM shutdown:', error);
    process.exit(1);
  });
});

process.on('SIGINT', () => {
  gracefulShutdown('SIGINT').catch(error => {
    logger.error('Error during SIGINT shutdown:', error);
    process.exit(1);
  });
});

// Handle additional signals for complete coverage
process.on('SIGHUP', () => {
  gracefulShutdown('SIGHUP').catch(error => {
    logger.error('Error during SIGHUP shutdown:', error);
    process.exit(1);
  });
});

process.on('SIGUSR2', () => {
  // Used by nodemon for restart
  gracefulShutdown('SIGUSR2').catch(error => {
    logger.error('Error during SIGUSR2 shutdown:', error);
    process.exit(1);
  });
});

// Handle uncaught exceptions - try to recover if possible
process.on('uncaughtException', (error: Error) => {
  debugLog('Uncaught exception', {
    message: error.message,
    stack: error.stack,
  });

  if (!loggerClosed) {
    logger.error('💥 Uncaught Exception:', error);
  } else {
    debugLog('Uncaught Exception (logger closed)', error);
  }

  // Only exit for fatal errors
  if (
    error.message.includes('EADDRINUSE') ||
    error.message.includes('EACCES') ||
    error.message.includes('write after end')
  ) {
    gracefulShutdown('UNCAUGHT_EXCEPTION').catch(shutdownError => {
      debugLog('Error during exception shutdown', shutdownError);
      process.exit(1);
    });
  } else if (!loggerClosed) {
    logger.warn('⚠️  Attempting to continue after uncaught exception');
  }
});

// Handle unhandled promise rejections - log but don't exit
process.on(
  'unhandledRejection',
  (reason: unknown, promise: Promise<unknown>) => {
    debugLog('Unhandled rejection', { reason });
    if (!loggerClosed) {
      logger.error('💥 Unhandled Rejection', { reason, promise });
      logger.warn(
        '⚠️  Continuing after unhandled rejection - consider fixing the root cause'
      );
    } else {
      debugLog('Unhandled Rejection (logger closed)', reason);
    }
  }
);

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

process.on('exit', code => {
  debugLog('Process exiting', { code });
});

main().catch(async (error: Error) => {
  logger.error('💥 Application failed to start:', error);
  await cleanup();
  process.exit(1);
});
