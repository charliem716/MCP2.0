/**
 * Unit tests for ManageConnectionTool
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ManageConnectionTool } from '../../../../src/mcp/tools/connection.js';
import type { IControlSystem } from '../../../../src/mcp/interfaces/control-system.js';
import type { ConnectionHealth } from '../../../../src/qrwc/connection/ConnectionManager.js';

describe('ManageConnectionTool', () => {
  let mockControlSystem: jest.Mocked<IControlSystem>;
  let tool: ManageConnectionTool;

  beforeEach(() => {
    // Create mock control system
    mockControlSystem = {
      isConnected: jest.fn(),
      sendCommand: jest.fn(),
      getConnectionHealth: jest.fn(),
      switchCore: jest.fn(),
      disconnect: jest.fn(),
    } as any;

    // Create tool instance
    tool = new ManageConnectionTool(mockControlSystem);
  });

  describe('Tool Metadata', () => {
    it('should have correct name and description', () => {
      expect(tool.name).toBe('manage_connection');
      expect(tool.description).toContain('Manage Q-SYS Core connection');
      expect(tool.description).toContain('status');
      expect(tool.description).toContain('connect');
      expect(tool.description).toContain('disconnect');
      expect(tool.description.length).toBeLessThan(240); // MCP limit
    });
  });

  describe('Status Action', () => {
    it('should return connection status when connected', async () => {
      // Arrange
      mockControlSystem.isConnected.mockReturnValue(true);
      const mockHealth: ConnectionHealth = {
        isHealthy: true,
        lastSuccessfulConnection: new Date(),
        consecutiveFailures: 0,
        totalAttempts: 10,
        totalSuccesses: 10,
        lastError: null,
        circuitBreakerState: 'closed',
        connectionState: 'connected' as any,
      };
      mockControlSystem.getConnectionHealth.mockReturnValue(mockHealth);

      // Act
      const result = await tool.execute({ action: 'status' });

      // Assert
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.action).toBe('status');
      expect(data.data.connected).toBe(true);
      expect(data.data.message).toContain('Connected');
      expect(data.data.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return connection status when disconnected', async () => {
      // Arrange
      mockControlSystem.isConnected.mockReturnValue(false);

      // Act
      const result = await tool.execute({ action: 'status' });

      // Assert
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.action).toBe('status');
      expect(data.data.connected).toBe(false);
      expect(data.data.message).toContain('Not connected');
    });
  });

  describe('Connect Action', () => {
    it('should connect to Q-SYS Core with host and default port', async () => {
      // Arrange
      mockControlSystem.switchCore.mockResolvedValue(undefined);
      mockControlSystem.isConnected.mockReturnValue(true);

      // Act
      const result = await tool.execute({ 
        action: 'connect',
        host: '192.168.1.100'
      });

      // Assert
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.action).toBe('connect');
      expect(data.data.connected).toBe(true);
      expect(data.data.host).toBe('192.168.1.100');
      expect(data.data.port).toBe(443);
      expect(data.data.message).toContain('Connected to Q-SYS Core at 192.168.1.100');
      
      // Verify switchCore was called
      expect(mockControlSystem.switchCore).toHaveBeenCalledWith({
        host: '192.168.1.100',
        port: 443
      });
    });

    it('should connect with custom port', async () => {
      // Arrange
      mockControlSystem.switchCore.mockResolvedValue(undefined);
      mockControlSystem.isConnected.mockReturnValue(true);

      // Act
      const result = await tool.execute({ 
        action: 'connect',
        host: '192.168.1.100',
        port: 8080
      });

      // Assert
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.data.port).toBe(8080);
      
      // Verify switchCore was called with custom port
      expect(mockControlSystem.switchCore).toHaveBeenCalledWith({
        host: '192.168.1.100',
        port: 8080
      });
    });

    it('should switch cores when already connected', async () => {
      // Arrange - already connected to a different core
      mockControlSystem.isConnected.mockReturnValue(true);
      mockControlSystem.switchCore.mockResolvedValue(undefined);

      // Act - connect to new core
      const result = await tool.execute({ 
        action: 'connect',
        host: '192.168.1.200'
      });

      // Assert
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.data.host).toBe('192.168.1.200');
      
      // Verify switchCore was called (it handles disconnecting from current)
      expect(mockControlSystem.switchCore).toHaveBeenCalledWith({
        host: '192.168.1.200',
        port: 443
      });
    });

    it('should handle connection failure', async () => {
      // Arrange
      mockControlSystem.switchCore.mockRejectedValue(new Error('Connection refused'));
      mockControlSystem.isConnected.mockReturnValue(false);

      // Act
      const result = await tool.execute({ 
        action: 'connect',
        host: '192.168.1.100'
      });

      // Assert
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(false);
      expect(data.error.message).toContain('Connection refused');
    });
  });

  describe('Disconnect Action', () => {
    it('should disconnect from Q-SYS Core', async () => {
      // Arrange
      mockControlSystem.disconnect!.mockResolvedValue(undefined);
      mockControlSystem.isConnected.mockReturnValue(false);

      // Act
      const result = await tool.execute({ action: 'disconnect' });

      // Assert
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.action).toBe('disconnect');
      expect(data.data.connected).toBe(false);
      expect(data.data.message).toContain('Successfully disconnected');
      
      // Verify disconnect was called
      expect(mockControlSystem.disconnect).toHaveBeenCalled();
    });

    it('should handle disconnect when already disconnected', async () => {
      // Arrange
      mockControlSystem.isConnected.mockReturnValue(false);
      mockControlSystem.disconnect!.mockResolvedValue(undefined);

      // Act
      const result = await tool.execute({ action: 'disconnect' });

      // Assert
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.data.message).toContain('Successfully disconnected');
    });

    it('should handle disconnect failure', async () => {
      // Arrange
      mockControlSystem.disconnect!.mockRejectedValue(new Error('Disconnect failed'));

      // Act
      const result = await tool.execute({ action: 'disconnect' });

      // Assert
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(false);
      expect(data.error.message).toContain('Disconnect failed');
    });
  });

  describe('Validation', () => {
    it('should validate required host parameter for connect', async () => {
      // Act - missing host
      const result = await tool.execute({ 
        action: 'connect'
      } as any);

      // Assert
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('validation');
    });

    it('should validate port range', async () => {
      // Act - invalid port
      const result = await tool.execute({ 
        action: 'connect',
        host: '192.168.1.100',
        port: 99999
      });

      // Assert
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('validation');
    });

    it('should handle unknown action', async () => {
      // Act
      const result = await tool.execute({ 
        action: 'unknown'
      } as any);

      // Assert
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('validation');
    });
  });
});