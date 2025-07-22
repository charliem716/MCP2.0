import { MCPServer } from './server.js';
import type { MCPServerConfig } from '../shared/types/mcp.js';
import { createLogger } from '../shared/utils/logger.js';

const logger = createLogger('MCP-Index');

/**
 * Entry point for MCP Server
 */
async function main() {
  const config: MCPServerConfig = {
    name: "qsys-mcp-server",
    version: "1.0.0",
    transport: "stdio",
    qrwc: {
      host: process.env['QSYS_HOST'] || "localhost",
      port: parseInt(process.env['QSYS_PORT'] || "443"),
      ...(process.env['QSYS_USERNAME'] && { username: process.env['QSYS_USERNAME'] }),
      ...(process.env['QSYS_PASSWORD'] && { password: process.env['QSYS_PASSWORD'] }),
      ...(process.env['QSYS_SECURE'] && { secure: process.env['QSYS_SECURE'] === "true" }),
      reconnectInterval: 5000,
      heartbeatInterval: 30000
    }
  };

  const server = new MCPServer(config);

  try {
    await server.start();
    logger.info("MCP Server started successfully");
    
    // Keep the process alive
    process.on('SIGINT', () => {
      logger.info("Received SIGINT, shutting down...");
      server.shutdown().then(() => {
        logger.info("Server shutdown complete");
        process.exit(0);
      }).catch((error) => {
        logger.error("Error during shutdown:", error);
        process.exit(1);
      });
    });

  } catch (error) {
    logger.error("Failed to start MCP server:", error);
    process.exit(1);
  }
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => logger.error('Main function error:', error));
}

export { MCPServer }; 