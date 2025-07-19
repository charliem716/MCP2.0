/**
 * MCP Voice/Text-Controlled Q-SYS Demo
 * Main entry point for the application
 */

import 'dotenv/config';
import { createLogger, type Logger } from './shared/utils/logger.js';
import { validateConfig, config } from './shared/utils/env.js';
import { QRWCClient } from './qrwc/client.js';
import { QRCCommands } from './qrwc/commands.js';

const logger: Logger = createLogger('Main');

// Global references for cleanup
let qrwcClient: QRWCClient | null = null;
let qrcCommands: QRCCommands | null = null;

async function main(): Promise<void> {
  try {
    logger.info('🚀 Starting MCP Voice/Text-Controlled Q-SYS Demo...');
    
    // Validate configuration
    validateConfig();
    logger.info('✅ Configuration validated');
    
    // Initialize QRWC client with configuration
    const clientOptions = {
      host: config.qsys.host,
      port: config.qsys.port,
      username: config.qsys.username,
      password: config.qsys.password,
      reconnectInterval: config.qsys.reconnectInterval,
      heartbeatInterval: config.qsys.heartbeatInterval,
      maxReconnectAttempts: 5,
      connectionTimeout: 10000,
      enableHeartbeat: true,
      enableAutoReconnect: true
    };
    
    qrwcClient = new QRWCClient(clientOptions);
    logger.info('✅ QRWC client initialized');
    
    // Connect to Q-SYS Core
    await qrwcClient.connect();
    logger.info('✅ Connected to Q-SYS Core');
    
    // Initialize QRC commands
    qrcCommands = new QRCCommands(qrwcClient);
    logger.info('✅ QRC commands initialized');
    
    // Setup graceful shutdown
    const shutdownHandler = (): void => {
      logger.info('🛑 Received shutdown signal');
      cleanup();
      process.exit(0);
    };
    
    process.on('SIGINT', shutdownHandler);
    process.on('SIGTERM', shutdownHandler);
    
    logger.info('✅ Phase 1 components initialized successfully');
    logger.info('🎯 Application is ready and running');
    
    // Keep process alive
    process.stdin.resume();
    
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
    // Dispose of QRC commands if initialized
    if (qrcCommands) {
      qrcCommands.dispose();
      logger.info('✅ QRC commands disposed');
    }
    
    // Disconnect QRWC client if connected
    if (qrwcClient?.isConnected()) {
      qrwcClient.disconnect();
      logger.info('✅ QRWC client disconnected');
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