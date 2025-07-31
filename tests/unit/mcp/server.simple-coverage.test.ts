/**
 * Simple coverage tests for MCP server - focus on testable methods
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { IControlSystem } from '../../../src/mcp/interfaces/control-system.js';
import { ConnectionState } from '../../../src/shared/types/common.js';

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

  it('should handle getInfo method', async () => {
    const { MCPServer } = await import('../../../src/mcp/server.js');
    
    const mockQrwc: IControlSystem = {
      isConnected: jest.fn().mockReturnValue(false),
      connect: jest.fn(),
      disconnect: jest.fn(),
      sendCommand: jest.fn(),
      on: jest.fn(),
      removeAllListeners: jest.fn(),
      getState: jest.fn().mockReturnValue(ConnectionState.DISCONNECTED),
      // Optional methods
      once: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    };

    // Use any transport that won't interfere
    const mockTransport = {
      start: jest.fn(),
      close: jest.fn(),
    };

    const server = new MCPServer(
      {
        name: 'test-server',
        version: '1.0.0',
      },
      mockQrwc,
      mockTransport as any
    );
    
    const info = server.getInfo();
    expect(info).toEqual({
      name: 'test-server',
      version: '1.0.0',
    });
  });
});