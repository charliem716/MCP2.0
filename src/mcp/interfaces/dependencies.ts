/**
 * Dependency interfaces for MCP Server
 * 
 * These interfaces define the contracts for all injectable dependencies,
 * enabling loose coupling and improved testability.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { OfficialQRWCClient } from '../../qrwc/officialClient.js';
import type { QRWCClientAdapter } from '../qrwc/adapter.js';
import type { MCPToolRegistry } from '../handlers/index.js';
import type { MCPRateLimiter } from '../middleware/rate-limit.js';
import type { InputValidator } from '../middleware/validation.js';
import type { HealthChecker } from '../health/health-check.js';
import type { CircuitBreaker } from '../infrastructure/circuit-breaker.js';
import type { MCPAuthenticator } from '../middleware/auth.js';
import type { MCPMetrics } from '../monitoring/metrics.js';
import type { MCPServerConfig } from '../../shared/types/mcp.js';
import type { ILogger } from './logger.js';

/**
 * Factory interface for creating MCP server components
 */
export interface IMCPServerFactory {
  createServer(config: MCPServerConfig): Server;
  createTransport(): StdioServerTransport;
  createQRWCClient(config: MCPServerConfig): OfficialQRWCClient;
  createQRWCAdapter(client: OfficialQRWCClient): QRWCClientAdapter;
  createToolRegistry(adapter: QRWCClientAdapter): MCPToolRegistry;
  createRateLimiter(config: MCPServerConfig): MCPRateLimiter | undefined;
  createInputValidator(): InputValidator;
  createHealthChecker(
    client: OfficialQRWCClient, 
    version: string
  ): HealthChecker;
  createCircuitBreaker(): CircuitBreaker;
  createAuthenticator(config: MCPServerConfig): MCPAuthenticator | undefined;
  createMetrics(): MCPMetrics;
}

/**
 * Dependencies required by MCPServer
 */
export interface MCPServerDependencies {
  logger: ILogger;
  server: Server;
  transport: StdioServerTransport;
  officialQrwcClient: OfficialQRWCClient;
  qrwcClientAdapter: QRWCClientAdapter;
  toolRegistry: MCPToolRegistry;
  rateLimiter?: MCPRateLimiter;
  inputValidator: InputValidator;
  healthChecker: HealthChecker;
  circuitBreaker: CircuitBreaker;
  authenticator?: MCPAuthenticator;
  metrics: MCPMetrics;
}

/**
 * Partial dependencies that can be optionally provided
 */
export type PartialMCPServerDependencies = Partial<MCPServerDependencies>;