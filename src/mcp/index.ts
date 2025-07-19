import { MCPServer } from './server.js';
import type { MCPServerConfig } from '../shared/types/mcp.js';

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
    console.log("MCP Server started successfully");
    
    // Keep the process alive
    process.on('SIGINT', () => {
      console.log("\nReceived SIGINT, shutting down...");
      server.shutdown().then(() => {
        console.log("Server shutdown complete");
        process.exit(0);
      }).catch((error) => {
        console.error("Error during shutdown:", error);
        process.exit(1);
      });
    });

  } catch (error) {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
  }
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { MCPServer }; 