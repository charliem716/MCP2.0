/**
 * Unit tests for ManageConnectionTool
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ManageConnectionTool } from '../../../../src/mcp/tools/connection.js';
import type { IControlSystem } from '../../../../src/mcp/interfaces/control-system.js';
import type { ConnectionHealth } from '../../../../src/qrwc/connection/ConnectionManager.js';
import { ConnectionState } from '../../../../src/shared/types/common.js';
import type { ConnectionEvent } from '../../../../src/mcp/types/connection.js';

describe('ManageConnectionTool', () => {
  let mockControlSystem: jest.Mocked<IControlSystem>;
  let tool: ManageConnectionTool;

  beforeEach(() => {
    // Create mock control system
    mockControlSystem = {
      isConnected: jest.fn(),
      sendCommand: jest.fn(),
      getConnectionHealth: jest.fn(),
      reconnect: jest.fn(),
      getConnectionHistory: jest.fn(),
      runDiagnostics: jest.fn(),
      testConnection: jest.fn(),
      updateConnectionConfig: jest.fn(),
    } as any;

    // Create tool instance
    tool = new ManageConnectionTool(mockControlSystem);
  });

  describe('Tool Metadata', () => {
    it('should have correct name and description', () => {
      expect(tool.name).toBe('manage_connection');
      expect(tool.description).toContain('Manage Q-SYS connection');
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
        uptime: 3600000,
        state: ConnectionState.CONNECTED,
        circuitBreakerState: 'closed',
      };
      mockControlSystem.getConnectionHealth!.mockReturnValue(mockHealth);

      // Act
      const result = await tool.execute({ action: 'status' });

      // Assert
      expect(result.isError).toBe(false);
      expect(result.content[0].type).toBe('text');
      const data = JSON.parse(result.content[0].text!);
      expect(data.success).toBe(true);
      expect(data.action).toBe('status');
      expect(data.data.connected).toBe(true);
      expect(data.data.health).toEqual(mockHealth);
    });

    it('should return verbose status with history when requested', async () => {
      // Arrange
      mockControlSystem.isConnected.mockReturnValue(true);
      const mockEvents: ConnectionEvent[] = [
        {
          timestamp: new Date(),
          type: 'connect',
          correlationId: 'test-1',
          success: true,
        },
        {
          timestamp: new Date(),
          type: 'disconnect',
          correlationId: 'test-2',
          reason: 'Network error',
        },
      ];
      mockControlSystem.getConnectionHistory!.mockReturnValue(mockEvents);

      // Act
      const result = await tool.execute({ action: 'status', verbose: true });

      // Assert
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text!);
      expect(data.data.history).toBeDefined();
      expect(data.data.history.summary.connections).toBe(1);
      expect(data.data.history.summary.disconnections).toBe(1);
    });
  });

  describe('Reconnect Action', () => {
    it('should trigger reconnection', async () => {
      // Arrange
      mockControlSystem.reconnect!.mockResolvedValue(undefined);
      mockControlSystem.isConnected.mockReturnValue(true);

      // Act
      const result = await tool.execute({ 
        action: 'reconnect',
        force: true,
        maxAttempts: 5,
      });

      // Assert
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text!);
      expect(data.success).toBe(true);
      expect(data.action).toBe('reconnect');
      expect(data.data.connected).toBe(true);
      expect(mockControlSystem.reconnect).toHaveBeenCalledWith({
        force: true,
        maxAttempts: 5,
      });
    });

    it('should handle reconnection failure', async () => {
      // Arrange
      mockControlSystem.reconnect!.mockRejectedValue(new Error('Connection failed'));
      
      // Act
      const result = await tool.execute({ action: 'reconnect' });

      // Assert
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text!);
      expect(data.success).toBe(false);
      expect(data.error.message).toBe('Connection failed');
    });
  });

  describe('Diagnose Action', () => {
    it('should run diagnostics when connected', async () => {
      // Arrange
      mockControlSystem.isConnected.mockReturnValue(true);
      mockControlSystem.runDiagnostics!.mockResolvedValue({
        timestamp: new Date(),
        network: { reachable: true, latency: 10 },
        dns: { resolved: true, addresses: ['192.168.1.100'] },
        port: { open: true, service: 'qsys-websocket' },
        websocket: { compatible: true, protocols: ['qrwc'] },
        authentication: { valid: true, method: 'internal' },
        resources: {
          memory: { used: 100000, available: 200000, percentage: 50 },
        },
        summary: 'Connection healthy',
      });

      // Act
      const result = await tool.execute({ action: 'diagnose' });

      // Assert
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text!);
      expect(data.success).toBe(true);
      expect(data.data.summary).toBe('Connection healthy');
    });

    it('should provide basic diagnostics when methods not available', async () => {
      // Arrange
      mockControlSystem.isConnected.mockReturnValue(false);
      mockControlSystem.runDiagnostics = undefined;

      // Act
      const result = await tool.execute({ action: 'diagnose' });

      // Assert
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text!);
      expect(data.success).toBe(true);
      expect(data.data.summary).toContain('not established');
    });
  });

  describe('History Action', () => {
    it('should retrieve connection history', async () => {
      // Arrange
      const mockEvents: ConnectionEvent[] = [
        { timestamp: new Date(), type: 'connect', correlationId: '1', success: true },
        { timestamp: new Date(), type: 'error', correlationId: '2', reason: 'Timeout' },
        { timestamp: new Date(), type: 'disconnect', correlationId: '3' },
      ];
      mockControlSystem.getConnectionHistory!.mockReturnValue(mockEvents);

      // Act
      const result = await tool.execute({ 
        action: 'history',
        timeRange: '1h',
        eventType: 'all',
      });

      // Assert
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text!);
      expect(data.success).toBe(true);
      expect(data.data.summary.totalEvents).toBe(3);
      expect(data.data.summary.connections).toBe(1);
      expect(data.data.summary.errors).toBe(1);
    });

    it('should filter history by event type', async () => {
      // Arrange
      const mockEvents: ConnectionEvent[] = [
        { timestamp: new Date(), type: 'connect', correlationId: '1' },
        { timestamp: new Date(), type: 'error', correlationId: '2' },
        { timestamp: new Date(), type: 'error', correlationId: '3' },
      ];
      mockControlSystem.getConnectionHistory!.mockReturnValue(mockEvents);

      // Act
      const result = await tool.execute({ 
        action: 'history',
        eventType: 'errors',
      });

      // Assert
      const data = JSON.parse(result.content[0].text!);
      expect(data.data.events.length).toBe(2);
      expect(data.data.events.every((e: any) => e.type === 'error')).toBe(true);
    });
  });

  describe('Input Validation', () => {
    it('should reject invalid action', async () => {
      // Act
      const result = await tool.execute({ action: 'invalid' as any });

      // Assert
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid');
    });

    it('should validate reconnect parameters', async () => {
      // Act
      const result = await tool.execute({ 
        action: 'reconnect',
        maxAttempts: 999, // exceeds max
      });

      // Assert
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('validation');
    });
  });
});