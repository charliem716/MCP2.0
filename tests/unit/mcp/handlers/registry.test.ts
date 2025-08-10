import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MCPToolRegistry } from '../../../../src/mcp/handlers/index';
import { globalLogger as logger } from '../../../../src/shared/utils/logger';
import type { QRWCClientInterface } from '../../../../src/mcp/qrwc/adapter';

describe('MCPToolRegistry', () => {
  let mockQrwcClient: jest.Mocked<QRWCClientInterface>;
  let registry: MCPToolRegistry;

  beforeEach(() => {
    jest.clearAllMocks();

    mockQrwcClient = {
      isConnected: jest.fn().mockReturnValue(true),
      sendCommand: jest.fn(),
    } as any;

    // MCPToolRegistry now takes IControlSystem interface
    registry = new MCPToolRegistry(mockQrwcClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully with all Q-SYS tools', async () => {
      await registry.initialize();

      // 16 Q-SYS tools + 1 echo tool = 17 total
      expect(registry.getToolCount()).toBe(17);
      
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Tool registry initialized with'),
        expect.any(Object)
      );
    });

    it('should prevent double initialization', async () => {
      await registry.initialize();
      
      // Clear previous calls to focus on the second initialize
      jest.clearAllMocks();
      
      await registry.initialize();

      expect(logger.warn).toHaveBeenCalledWith(
        'MCPToolRegistry already initialized'
      );
    });

    it('should register all expected Q-SYS tools', async () => {
      await registry.initialize();

      expect(registry.hasTool('list_components')).toBe(true);
      expect(registry.hasTool('list_controls')).toBe(true);
      expect(registry.hasTool('get_control_values')).toBe(true);
      expect(registry.hasTool('set_control_values')).toBe(true);
      expect(registry.hasTool('query_core_status')).toBe(true);
      expect(registry.hasTool('echo')).toBe(true);
    });

    it('should handle initialization errors', async () => {
      const error = new Error('Init failed');
      jest
        .spyOn(registry as any, 'registerQSysTools')
        .mockImplementationOnce(() => {
          throw error;
        });

      // initialize() logs the error and then throws it
      expect(() => registry.initialize()).toThrow('Init failed');
      
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to initialize tool registry',
        { error }
      );
    });
  });

  describe('listTools', () => {
    beforeEach(async () => {
      await registry.initialize();
    });

    it('should list all registered tools', async () => {
      const tools = await registry.listTools();

      expect(tools).toHaveLength(17); // 16 Q-SYS tools + 1 echo tool
      expect(tools).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'list_components',
            description: expect.any(String),
            inputSchema: expect.any(Object),
          }),
          expect.objectContaining({
            name: 'list_controls',
            description: expect.any(String),
            inputSchema: expect.any(Object),
          }),
          expect.objectContaining({
            name: 'get_control_values',
            description: expect.any(String),
            inputSchema: expect.any(Object),
          }),
          expect.objectContaining({
            name: 'set_control_values',
            description: expect.any(String),
            inputSchema: expect.any(Object),
          }),
          expect.objectContaining({
            name: 'query_core_status',
            description: expect.any(String),
            inputSchema: expect.any(Object),
          }),
          expect.objectContaining({
            name: 'echo',
            description: expect.any(String),
            inputSchema: expect.any(Object),
          }),
        ])
      );
    });

    it('should throw error if not initialized', async () => {
      const newRegistry = new MCPToolRegistry(mockQrwcClient);
      await expect(newRegistry.listTools()).rejects.toThrow(
        'Tool registry not initialized'
      );
    });
  });

  describe('callTool', () => {
    beforeEach(async () => {
      await registry.initialize();
    });

    it('should execute echo tool successfully', async () => {
      const result = await registry.callTool('echo', {
        message: 'Hello World',
      });

      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: 'Echo: Hello World',
          },
        ],
      });
    });

    it('should execute list_components tool successfully', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: [
          { Name: 'Gain1', Type: 'gain', Properties: [] },
          { Name: 'Mixer1', Type: 'mixer', Properties: [] },
        ],
      });

      const result = await registry.callTool('list_components', {});

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'Component.GetComponents'
      );
      const components = JSON.parse(result.content[0].text);
      expect(components).toHaveLength(2);
      expect(components[0].Name).toBe('Gain1');
      expect(components[1].Name).toBe('Mixer1');
    });

    it('should handle tool execution errors gracefully', async () => {
      mockQrwcClient.sendCommand.mockRejectedValueOnce(
        new Error('Network error')
      );

      const result = await registry.callTool('list_components', {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Network error');
    });

    it('should throw error for unknown tool', async () => {
      await expect(registry.callTool('unknown_tool', {})).rejects.toThrow(
        "Tool 'unknown_tool' not found"
      );
    });

    it('should throw error if not initialized', async () => {
      const newRegistry = new MCPToolRegistry(mockQrwcClient);
      await expect(newRegistry.callTool('echo', {})).rejects.toThrow(
        'Tool registry not initialized'
      );
    });

    it('should log slow tool execution', async () => {
      // Mock a slow response
      mockQrwcClient.sendCommand.mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(() => resolve({ result: [] }), 1100)
          )
      );

      await registry.callTool('list_components', {});

      expect(logger.warn).toHaveBeenCalledWith(
        'Slow tool execution: list_components',
        expect.objectContaining({
          executionTimeMs: expect.any(Number),
          context: expect.any(Object),
        })
      );
    });

    it('should handle missing arguments', async () => {
      const result = await registry.callTool('echo', {});

      expect(result.content[0].text).toBe('Echo: undefined');
    });
  });

  describe('utility methods', () => {
    beforeEach(async () => {
      await registry.initialize();
    });

    it('should return correct tool count', () => {
      expect(registry.getToolCount()).toBe(17);
    });

    it('should check if tool exists', () => {
      expect(registry.hasTool('echo')).toBe(true);
      expect(registry.hasTool('nonexistent')).toBe(false);
    });

    it('should return tool names', () => {
      const names = registry.getToolNames();
      expect(names).toHaveLength(17);
      expect(names).toContain('list_components');
      expect(names).toContain('echo');
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources properly', async () => {
      await registry.initialize();
      expect(registry.getToolCount()).toBe(17);

      // Clear previous logs to focus on cleanup
      jest.clearAllMocks();
      
      await registry.cleanup();

      expect(registry.getToolCount()).toBe(0);
      expect(logger.info).toHaveBeenCalledWith(
        'Tool registry cleanup completed'
      );
    });

    it('should require re-initialization after cleanup', async () => {
      await registry.initialize();
      await registry.cleanup();

      await expect(registry.listTools()).rejects.toThrow(
        'Tool registry not initialized'
      );
    });
  });

  describe('edge cases', () => {
    it('should handle tool returning non-standard result', async () => {
      await registry.initialize();

      // Mock a Q-SYS tool returning undefined content
      mockQrwcClient.sendCommand.mockResolvedValueOnce(undefined);

      const result = await registry.callTool('list_components', {});

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('Invalid response');
    });

    it('should handle concurrent tool calls', async () => {
      await registry.initialize();

      const promises = [
        registry.callTool('echo', { message: 'Test1' }),
        registry.callTool('echo', { message: 'Test2' }),
        registry.callTool('echo', { message: 'Test3' }),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(results[0].content[0].text).toBe('Echo: Test1');
      expect(results[1].content[0].text).toBe('Echo: Test2');
      expect(results[2].content[0].text).toBe('Echo: Test3');
    });
  });

  describe('metadata preservation', () => {
    beforeEach(async () => {
      await registry.initialize();
    });

    it('should preserve execution metadata from Q-SYS tools', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: [
          { Name: 'Gain1', Type: 'gain', Properties: [] },
          { Name: 'Mixer1', Type: 'mixer', Properties: [] },
        ],
      });

      const result = await registry.callTool('list_components', {
        requestId: '550e8400-e29b-41d4-a716-446655440000',
      });

      // Verify the result has extended metadata
      expect(result).toHaveProperty('executionTimeMs');
      expect(result).toHaveProperty('context');

      // Type assertion to access extended properties
      const extendedResult = result as any;
      expect(typeof extendedResult.executionTimeMs).toBe('number');
      expect(extendedResult.executionTimeMs).toBeGreaterThanOrEqual(0);

      expect(extendedResult.context).toMatchObject({
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        toolName: 'list_components',
        startTime: expect.any(Number),
      });

      // Verify standard properties are also present
      expect(result.content).toBeDefined();
      const components = JSON.parse(result.content[0].text);
      expect(components).toHaveLength(2);
    });

    it('should log metadata for Q-SYS tools', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: { Status: { Code: 0 } },
      });

      await registry.callTool('query_core_status', {});

      // Verify that the logger was called with metadata
      expect(logger.debug).toHaveBeenCalledWith(
        'Tool execution completed: query_core_status',
        expect.objectContaining({
          executionTimeMs: expect.any(Number),
          context: expect.objectContaining({
            toolName: 'query_core_status',
            startTime: expect.any(Number),
          }),
          success: true,
        })
      );
    });

    it('should preserve metadata even on tool errors', async () => {
      mockQrwcClient.sendCommand.mockRejectedValueOnce(
        new Error('Connection failed')
      );

      const result = await registry.callTool('list_components', {
        requestId: 'test-request-123',
      });

      // Type assertion to access extended properties
      const extendedResult = result as any;

      expect(result.isError).toBe(true);
      expect(extendedResult.executionTimeMs).toBeDefined();
      expect(extendedResult.context).toMatchObject({
        requestId: 'test-request-123',
        toolName: 'list_components',
      });
    });

    it('should handle legacy tools without metadata', async () => {
      const result = await registry.callTool('echo', { message: 'test' });

      // Echo tool doesn't have extended metadata
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: 'Echo: test',
          },
        ],
      });

      // Should not have extended properties
      expect(result).not.toHaveProperty('executionTimeMs');
      expect(result).not.toHaveProperty('context');
    });
  });

  // Edge cases for 100% coverage
  describe('Edge Cases', () => {
    describe('duplicate tool registration', () => {
      it('should warn when trying to register a tool with duplicate name', async () => {
        // Create a custom registry with access to private methods
        const testRegistry = new MCPToolRegistry(mockQrwcClient);

        // Initialize and manually add a duplicate tool
        await testRegistry.initialize();

        // Try to register echo tool again (it's already registered)
        const duplicateTool = {
          name: 'echo',
          description: 'Duplicate echo tool',
          inputSchema: { type: 'object', properties: {} },
          execute: async () => ({
            content: [{ type: 'text' as const, text: 'duplicate' }],
          }),
        };

        // Access private method through any type
        (testRegistry as any).registerTool(duplicateTool);

        expect(logger.warn).toHaveBeenCalledWith(
          "Tool 'echo' already registered, skipping"
        );
      });
    });

    describe('tool execution edge cases', () => {
      it('should handle non-Error exceptions in tool execution', async () => {
        await registry.initialize();

        // Mock a tool that throws a non-Error object
        const customRegistry = new MCPToolRegistry(mockQrwcClient);
        await customRegistry.initialize();

        // Override echo tool to throw non-Error
        (customRegistry as any).tools.set('echo', {
          name: 'echo',
          description: 'Test tool',
          inputSchema: { type: 'object' },
          execute: async () => {
            throw 'String error'; // Throwing a string instead of Error
          },
        });

        const result = await customRegistry.callTool('echo', {});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain(
          'Tool execution failed: String error'
        );
        expect(logger.error).toHaveBeenCalledWith(
          'Tool execution failed: echo',
          expect.objectContaining({ error: 'String error' })
        );
      });
    });
  });
});