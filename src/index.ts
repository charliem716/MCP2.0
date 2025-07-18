/**
 * MCP Voice/Text-Controlled Q-SYS Demo
 * Main entry point for the application
 */

import 'dotenv/config';
import { createLogger, type Logger } from './shared/utils/logger.js';

const logger: Logger = createLogger('Main');

async function main(): Promise<void> {
  try {
    logger.info('🚀 Starting MCP Voice/Text-Controlled Q-SYS Demo...');
    
    // TODO: Initialize core services
    // - Logger setup
    // - Configuration validation
    // - QRWC client initialization
    // - MCP server startup
    // - OpenAI agent initialization
    // - REST API server startup
    
    logger.info('✅ MCP Voice/Text-Controlled Q-SYS Demo started successfully');
    
    // Graceful shutdown handlers
    process.on('SIGTERM', () => {
      logger.info('🛑 SIGTERM received, shutting down gracefully...');
      process.exit(0);
    });
    
    process.on('SIGINT', () => {
      logger.info('🛑 SIGINT received, shutting down gracefully...');
      process.exit(0);
    });
    
  } catch (error) {
    logger.error('❌ Failed to start application:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  logger.error('💥 Unhandled Rejection', { promise, reason });
  process.exit(1);
});

main().catch((error: Error) => {
  logger.error('💥 Application failed to start:', error);
  process.exit(1);
}); 