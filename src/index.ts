/**
 * MCP Voice/Text-Controlled Q-SYS Demo
 * Main entry point for the application
 */

import 'dotenv/config';
import { createLogger, type Logger } from './shared/utils/logger.js';
import { validateConfig, config } from './shared/utils/env.js';
import { OfficialQRWCClient } from './qrwc/officialClient.js';

const logger: Logger = createLogger('Main');

// Global references for cleanup
let qrwcClient: OfficialQRWCClient | null = null;

async function main(): Promise<void> {
  try {
    logger.info('🚀 Starting MCP Voice/Text-Controlled Q-SYS Demo...');
    
    // Validate configuration
    validateConfig();
    logger.info('✅ Configuration validated');
    
    // Initialize Official QRWC client with configuration
    const clientOptions = {
      host: config.qsys.host,
      port: config.qsys.port,
      pollingInterval: 350,
      reconnectInterval: config.qsys.reconnectInterval,
      maxReconnectAttempts: 5,
      connectionTimeout: 10000,
      enableAutoReconnect: true
    };
    
    qrwcClient = new OfficialQRWCClient(clientOptions);
    logger.info('✅ Official QRWC client initialized');
    
    // Connect to Q-SYS Core
    await qrwcClient.connect();
    logger.info('✅ Connected to Q-SYS Core using official @q-sys/qrwc library');
    
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
    // Disconnect Official QRWC client if connected
    if (qrwcClient?.isConnected()) {
      qrwcClient.disconnect();
      logger.info('✅ Official QRWC client disconnected');
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