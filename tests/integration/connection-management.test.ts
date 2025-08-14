/**
 * Integration tests for Connection Management Tool (FR-002)
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { MCPToolRegistry } from '../../src/mcp/handlers/index.js';
import { QRWCClientAdapter } from '../../src/mcp/qrwc/adapter.js';
import { OfficialQRWCClient } from '../../src/qrwc/officialClient.js';
import type { IControlSystem } from '../../src/mcp/interfaces/control-system.js';

// Mock the OfficialQRWCClient
jest.mock('../../src/qrwc/officialClient.js', () => ({
  OfficialQRWCClient: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    isConnected: jest.fn().mockReturnValue(false),
    on: jest.fn(),
    emit: jest.fn(),
  })),
}));

describe('Connection Management Tool Integration', () => {
  let registry: MCPToolRegistry;
  let adapter: QRWCClientAdapter;
  let mockClient: any;

  beforeAll(() => {
    // Create mock client
    mockClient = new OfficialQRWCClient({ host: 'test', port: 443 });
    
    // Create adapter with mock client
    adapter = new QRWCClientAdapter(mockClient);
    
    // Create registry with adapter as control system
    registry = new MCPToolRegistry(adapter as IControlSystem);
    registry.initialize();
  });

  afterAll(async () => {
    await adapter.dispose();
  });

  describe('Tool Registration', () => {
    it('should register manage_connection tool', () => {
      const tools = registry.listTools();
      const connectionTool = tools.find(t => t.name === 'manage_connection');
      
      expect(connectionTool).toBeDefined();
      expect(connectionTool?.description).toContain('Manage Q-SYS connection');
    });

    it('should have 18 total tools registered', () => {
      const tools = registry.listTools();
      expect(tools.length).toBe(18); // 17 Q-SYS + 1 testing
    });
  });

  describe('Tool Execution', () => {
    it('should execute status action', async () => {
      const result = await registry.executeTool('manage_connection', {
        action: 'status',
      });

      expect(result).toBeDefined();
      expect(result.isError).toBe(false);
      
      const response = JSON.parse(result.content[0].text!);
      expect(response.success).toBe(true);
      expect(response.action).toBe('status');
      expect(response.data.connected).toBeDefined();
    });

    it('should execute diagnose action', async () => {
      const result = await registry.executeTool('manage_connection', {
        action: 'diagnose',
      });

      expect(result).toBeDefined();
      expect(result.isError).toBe(false);
      
      const response = JSON.parse(result.content[0].text!);
      expect(response.success).toBe(true);
      expect(response.action).toBe('diagnose');
      expect(response.data.network).toBeDefined();
      expect(response.data.summary).toBeDefined();
    });

    it('should execute history action', async () => {
      const result = await registry.executeTool('manage_connection', {
        action: 'history',
        timeRange: '1h',
      });

      expect(result).toBeDefined();
      expect(result.isError).toBe(false);
      
      const response = JSON.parse(result.content[0].text!);
      expect(response.success).toBe(true);
      expect(response.action).toBe('history');
      expect(response.data.summary).toBeDefined();
    });

    it('should validate invalid actions', async () => {
      const result = await registry.executeTool('manage_connection', {
        action: 'invalid',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid');
    });
  });

  describe('Connection Health Methods', () => {
    it('should provide connection health through adapter', () => {
      const health = adapter.getConnectionHealth();
      
      expect(health).toBeDefined();
      expect(health.isHealthy).toBeDefined();
      expect(health.state).toBeDefined();
      expect(health.circuitBreakerState).toBeDefined();
    });

    it('should provide connection history through adapter', () => {
      const history = adapter.getConnectionHistory(10);
      
      expect(history).toBeDefined();
      expect(Array.isArray(history)).toBe(true);
    });

    it('should support diagnostics through adapter', async () => {
      const diagnostics = await adapter.runDiagnostics();
      
      expect(diagnostics).toBeDefined();
      expect(diagnostics.network).toBeDefined();
      expect(diagnostics.summary).toBeDefined();
    });
  });
});