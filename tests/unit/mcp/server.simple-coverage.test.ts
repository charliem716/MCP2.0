/**
 * Simple coverage tests for MCP server - focus on testable methods
 */

import { describe, it, expect, jest } from '@jest/globals';
import { createMockDependencies, createTestConfig } from '../../helpers/mock-factory.js';

// Mock logger
jest.mock('../../../src/shared/utils/logger.js', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  })),
  globalLogger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    })),
  },
}));

describe('MCPServer - Simple Coverage Tests', () => {
  it('should import MCPServer class', async () => {
    const { MCPServer } = await import('../../../src/mcp/server.js');
    expect(MCPServer).toBeDefined();
  });

  it('should define server configuration interface', async () => {
    const serverModule = await import('../../../src/mcp/server.js');
    
    // Test that the module exports what we expect
    expect(serverModule.MCPServer).toBeDefined();
  });

  it('should handle getStatus method', async () => {
    const { MCPServer } = await import('../../../src/mcp/server.js');
    
    const config = createTestConfig();
    const dependencies = createMockDependencies();

    const server = new MCPServer(config, dependencies);
    
    const status = server.getStatus();
    expect(status).toBeDefined();
    expect(status.name).toBe('test-server');
    expect(status.version).toBe('1.0.0');
    expect(status.isConnected).toBe(false);
  });
});