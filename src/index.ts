/**
 * MCP Voice/Text-Controlled Q-SYS Demo
 * Main entry point for the application
 */

// Imports
import { createLogger, type Logger } from './shared/utils/logger.js';
import { validateConfig, config } from './shared/utils/env.js';
import { configManager } from './config/index.js';
import { MCPServer } from './mcp/server.js';
import type { MCPServerConfig } from './shared/types/mcp.js';
import { DefaultMCPServerFactory } from './mcp/factories/default-factory.js';
import type { PartialMCPServerDependencies } from './mcp/interfaces/dependencies.js';

const logger: Logger = createLogger('Main');

// Global references for cleanup
let mcpServer: MCPServer | null = null;
let isShuttingDown = false;
let loggerClosed = false;

/**
 * Initialize and return MCP server
 * This is the composition root where all dependencies are wired together
 */
async function initializeMCPServer(): Promise<MCPServer> {
  const appConfig = configManager.getConfig();
  
  const mcpConfig: MCPServerConfig = {
    name: 'qsys-mcp-server',
    version: '1.0.0',
    transport: 'stdio',
    qrwc: {
      host: appConfig.qsys.host,
      port: appConfig.qsys.port,
      reconnectInterval: appConfig.qsys.reconnectInterval,
      heartbeatInterval: appConfig.qsys.heartbeatInterval,
    },
    rateLimiting: {
      requestsPerMinute: config.rateLimit.maxRequests * 60 / (config.rateLimit.windowMs / 1000),
      burstSize: 20,
      perClient: false,
    },
  };
  
  // Create factory for dependency creation
  const factory = new DefaultMCPServerFactory(logger);
  
  // Create all dependencies explicitly (composition root pattern)
  const server = factory.createServer(mcpConfig);
  const transport = factory.createTransport();
  const qrwcClient = factory.createQRWCClient(mcpConfig);
  const qrwcAdapter = factory.createQRWCAdapter(qrwcClient);
  const toolRegistry = await factory.createToolRegistry(qrwcAdapter);
  
  // Create production features
  const rateLimiter = factory.createRateLimiter(mcpConfig);
  const inputValidator = factory.createInputValidator();
  const healthChecker = factory.createHealthChecker(qrwcClient, mcpConfig.version);
  const circuitBreaker = factory.createCircuitBreaker();
  const authenticator = factory.createAuthenticator(mcpConfig);
  const metrics = factory.createMetrics();
  
  // Inject all dependencies into MCP server
  // Handle optional dependencies that may be undefined
  const dependencies: PartialMCPServerDependencies = {
    server,
    transport,
    officialQrwcClient: qrwcClient,
    qrwcClientAdapter: qrwcAdapter,
    toolRegistry,
    inputValidator,
    healthChecker,
    circuitBreaker,
    metrics,
  };
  
  // Only add optional dependencies if they exist
  if (rateLimiter) {
    dependencies.rateLimiter = rateLimiter;
  }
  if (authenticator) {
    dependencies.authenticator = authenticator;
  }
  
  return new MCPServer(mcpConfig, dependencies);
}

async function main(): Promise<void> {
  try {
    logger.info('🚀 Starting MCP Voice/Text-Controlled Q-SYS Demo...');

    // Configuration is validated by ConfigManager on initialization
    logger.info('✅ Configuration loaded');

    // Initialize and start MCP server
    mcpServer = await initializeMCPServer();
    logger.info('✅ MCP server initialized');

    // Start MCP server (this includes QRWC connection)
    await mcpServer.start();
    logger.info('✅ MCP server started and listening on stdio');
    logger.info('✅ Connected to Q-SYS Core via MCP server');

    logger.info('✅ MCP Voice/Text-Controlled Q-SYS Demo is ready');
    logger.info('🎯 AI agents can now control Q-SYS via stdio');
    
    // IMPORTANT: Keep the process alive for stdio transport
    // The StdioServerTransport handles the event loop, but we need to ensure
    // the main async function doesn't complete and allow Node.js to exit
    // This is the root cause fix for BUG-180
    await new Promise<void>(() => {
      // This promise never resolves, keeping the process alive
      // The process will exit via signal handlers (SIGTERM, SIGINT, etc.)
    });
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
    logger.info('⚠️  Already shutting down...');
    return;
  }

  isShuttingDown = true;
  // Force output during shutdown
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
  if (!loggerClosed) {
    logger.error('💥 Uncaught Exception:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
  }

  // Only exit for truly fatal errors
  const fatalErrors = [
    'EADDRINUSE',
    'EACCES',
    'write after end',
    'EPIPE',
    'ENOTFOUND',
    'ECONNREFUSED',
  ];
  
  const isFatal = fatalErrors.some(fatal => error.message.includes(fatal));
  
  if (isFatal) {
    logger.error('⚠️  Fatal error detected, initiating graceful shutdown');
    gracefulShutdown('UNCAUGHT_EXCEPTION').catch(() => {
      process.exit(1);
    });
  } else if (!loggerClosed) {
    logger.warn('⚠️  Attempting to continue after uncaught exception');
    // Try to recover by resetting any broken state
    if (mcpServer) {
      logger.info('🔄 Attempting to recover MCP server state');
      // The server should handle its own recovery
    }
  }
});

// Handle unhandled promise rejections - log and track for patterns
let unhandledRejectionCount = 0;
const rejectionResetInterval = 60000; // Reset count every minute
let rejectionResetTimer: NodeJS.Timeout | null = null;

process.on(
  'unhandledRejection',
  (reason: unknown, promise: Promise<unknown>) => {
    unhandledRejectionCount++;
    
    if (!loggerClosed) {
      // Enhanced logging with more context
      const errorInfo = {
        reason: reason instanceof Error ? {
          message: reason.message,
          stack: reason.stack,
          name: reason.name,
        } : String(reason),
        count: unhandledRejectionCount,
        promise: promise.toString(),
      };
      
      logger.error('💥 Unhandled Rejection', errorInfo);
      
      // If we see too many rejections in a short time, something is seriously wrong
      if (unhandledRejectionCount > 10) {
        logger.error('⚠️  Too many unhandled rejections, initiating graceful shutdown');
        gracefulShutdown('UNHANDLED_REJECTION_OVERFLOW').catch(() => {
          process.exit(1);
        });
      } else {
        logger.warn(
          `⚠️  Continuing after unhandled rejection #${unhandledRejectionCount} - this should be fixed`
        );
      }
    }
    
    // Reset count periodically to avoid shutdown from sporadic rejections
    if (rejectionResetTimer) {
      clearTimeout(rejectionResetTimer);
    }
    rejectionResetTimer = setTimeout(() => {
      if (unhandledRejectionCount > 0) {
        logger.info(`🔄 Resetting unhandled rejection count from ${unhandledRejectionCount} to 0`);
        unhandledRejectionCount = 0;
      }
    }, rejectionResetInterval);
  }
);

// Detect if we're running as an MCP server (stdin is piped, not a TTY)
const isMCPMode = process.env['NODE_ENV'] === 'production' && !process.stdin.isTTY;

// Silence Winston warnings in MCP mode to avoid stderr pollution
if (isMCPMode) {
  /* eslint-disable no-console */
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    // Filter out Winston warnings about no transports
    if (args[0] && typeof args[0] === 'string' && args[0].includes('[winston]')) {
      return; // Suppress Winston warnings
    }
    originalWarn.apply(console, args);
  };
  /* eslint-enable no-console */
}

// Start the application
main().catch(async (error: Error) => {
  logger.error('💥 Application failed to start:', error);
  await cleanup();
  process.exit(1);
});

