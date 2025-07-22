/**
 * Phase 1: Q-SYS QRWC Client Demo
 * Simple demonstration of direct QRWC connection without MCP
 */

import 'dotenv/config';
import { createLogger, type Logger } from './shared/utils/logger.js';
import { validateConfig, config } from './shared/utils/env.js';
import { OfficialQRWCClient } from './qrwc/officialClient.js';

const logger: Logger = createLogger('Phase1Demo');

// Global reference for cleanup
let qrwcClient: OfficialQRWCClient | null = null;
let isShuttingDown = false;

async function main(): Promise<void> {
  try {
    logger.info('🚀 Starting Phase 1: Q-SYS QRWC Client Demo...');
    
    // Validate configuration
    validateConfig();
    logger.info('✅ Configuration validated');
    
    // Create and connect QRWC client
    qrwcClient = new OfficialQRWCClient({
      host: config.qsys.host,
      port: config.qsys.port,
      username: config.qsys.username,
      password: config.qsys.password
    });
    
    await qrwcClient.connect();
    logger.info('✅ Connected to Q-SYS Core');
    
    // Demonstrate basic functionality
    const components = await qrwcClient.getAllComponents();
    logger.info(`📊 Found ${components.length} components in Q-SYS design`);
    
    // Log first 5 components as example
    components.slice(0, 5).forEach((comp: any) => {
      logger.info(`  - ${comp.Name} (${comp.Type})`);
    });
    
    logger.info('✅ Phase 1 QRWC Client Demo is ready');
    logger.info('📡 Direct connection to Q-SYS established');
    
    // Keep process alive for manual testing
    process.stdin.resume();
    
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
  if (isShuttingDown) return;
  
  isShuttingDown = true;
  logger.info('🧹 Cleaning up resources...');
  
  try {
    if (qrwcClient) {
      await qrwcClient.disconnect();
      logger.info('✅ QRWC client disconnected');
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
  await cleanup();
  process.exit(0);
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

// Start the application
main().catch(async (error: Error) => {
  logger.error('💥 Application failed to start:', error);
  await cleanup();
  process.exit(1);
});