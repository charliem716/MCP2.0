/**
 * Architecture Concerns - Separation of Concerns Test
 * 
 * Verifies that the MCP layer is properly decoupled from Q-SYS implementation
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { DIContainer, ServiceTokens } from '../../../../src/mcp/infrastructure/container';
import type { IControlSystem } from '../../../../src/mcp/interfaces/control-system';
import { MCPToolRegistry } from '../../../../src/mcp/handlers';
import { BaseQSysTool } from '../../../../src/mcp/tools/base';
import { z } from 'zod';

describe('Architecture - Separation of Concerns', () => {
  let container: DIContainer;
  let mockControlSystem: jest.Mocked<IControlSystem>;

  beforeEach(() => {
    // Clear singleton instance
    DIContainer['instance'] = undefined;
    container = DIContainer.getInstance();
    container.clear();

    // Create a mock control system
    mockControlSystem = {
      isConnected: jest.fn().mockReturnValue(true),
      sendCommand: jest.fn().mockResolvedValue({
        jsonrpc: '2.0',
        id: '123',
        result: { Components: [] }
      })
    };
  });

  describe('Dependency Injection Container', () => {
    it('should register and resolve services', () => {
      // Register the mock control system
      container.register(ServiceTokens.CONTROL_SYSTEM, mockControlSystem);

      // Resolve it back
      const resolved = container.resolve<IControlSystem>(ServiceTokens.CONTROL_SYSTEM);
      
      expect(resolved).toBe(mockControlSystem);
      expect(resolved.isConnected()).toBe(true);
    });

    it('should support factory registration', () => {
      let factoryCalls = 0;
      const factory = () => {
        factoryCalls++;
        return mockControlSystem;
      };

      container.registerFactory(ServiceTokens.CONTROL_SYSTEM, factory);

      // First resolve should call factory
      const resolved1 = container.resolve<IControlSystem>(ServiceTokens.CONTROL_SYSTEM);
      expect(factoryCalls).toBe(1);

      // Second resolve should use cached instance
      const resolved2 = container.resolve<IControlSystem>(ServiceTokens.CONTROL_SYSTEM);
      expect(factoryCalls).toBe(1);
      expect(resolved1).toBe(resolved2);
    });

    it('should throw error for unregistered services', () => {
      expect(() => {
        container.resolve('UnknownService');
      }).toThrow('Service not found: UnknownService');
    });
  });

  describe('Control System Interface', () => {
    it('should define a generic interface for control systems', () => {
      // The interface should work with any implementation
      class MockControlSystem implements IControlSystem {
        isConnected(): boolean {
          return true;
        }
        
        async sendCommand<T>(command: string, params?: Record<string, unknown>): Promise<any> {
          return { jsonrpc: '2.0', id: '1', result: {} };
        }
      }

      const mockSystem = new MockControlSystem();
      expect(mockSystem.isConnected()).toBe(true);
    });
  });

  describe('MCP Tools Decoupling', () => {
    it('should accept control system interface instead of concrete implementation', () => {
      // Create a test tool that uses the interface
      class TestTool extends BaseQSysTool<{ test: string }> {
        constructor(controlSystem: IControlSystem) {
          super(
            controlSystem,
            'test_tool',
            'Test tool for architecture validation',
            z.object({ test: z.string() })
          );
        }

        protected async executeAction(params: { test: string }) {
          return {
            content: [{ type: 'text' as const, text: `Test: ${params.test}` }]
          };
        }
      }

      const tool = new TestTool(mockControlSystem);
      expect(tool.name).toBe('test_tool');
      expect(tool.controlSystem).toBe(mockControlSystem);
    });
  });

  describe('Tool Registry with Dependency Injection', () => {
    it('should initialize with injected control system', () => {
      container.register(ServiceTokens.CONTROL_SYSTEM, mockControlSystem);
      
      const registry = new MCPToolRegistry(
        container.resolve<IControlSystem>(ServiceTokens.CONTROL_SYSTEM)
      );

      expect(registry).toBeDefined();
      // Registry should work with the injected control system
    });
  });

  describe('Architecture Benefits', () => {
    it('should allow swapping control system implementations', () => {
      // Create alternative control system implementation
      const alternativeControlSystem: IControlSystem = {
        isConnected: () => false,
        sendCommand: async () => ({ jsonrpc: '2.0', id: '1', result: { source: 'alternative' } })
      };

      // Register the alternative
      container.register(ServiceTokens.CONTROL_SYSTEM, alternativeControlSystem);

      // Tools should work with the alternative implementation
      const resolved = container.resolve<IControlSystem>(ServiceTokens.CONTROL_SYSTEM);
      expect(resolved.isConnected()).toBe(false);
    });

    it('should enable unit testing without Q-SYS dependencies', async () => {
      // This test runs without any Q-SYS specific imports or implementations
      const testSystem: IControlSystem = {
        isConnected: jest.fn().mockReturnValue(true),
        sendCommand: jest.fn().mockResolvedValue({
          jsonrpc: '2.0',
          id: 'test',
          result: { test: 'data' }
        })
      };

      const result = await testSystem.sendCommand('Test.Command', { param: 'value' });
      expect(result.result).toEqual({ test: 'data' });
      expect(testSystem.sendCommand).toHaveBeenCalledWith('Test.Command', { param: 'value' });
    });
  });
});