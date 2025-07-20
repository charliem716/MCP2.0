import { MCPToolRegistry } from '../../../../src/mcp/handlers/index.js';
import type { QRWCClientInterface } from '../../../../src/mcp/qrwc/adapter.js';
import { globalLogger } from '../../../../src/shared/utils/logger.js';

jest.mock('../../../../src/shared/utils/logger.js', () => ({
  globalLogger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }
}));

describe('MCPToolRegistry - Edge Cases for 100% Coverage', () => {
  let mockQrwcClient: jest.Mocked<QRWCClientInterface>;
  let registry: MCPToolRegistry;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockQrwcClient = {
      isConnected: jest.fn().mockReturnValue(true),
      sendCommand: jest.fn()
    };

    registry = new MCPToolRegistry(mockQrwcClient);
  });

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
        execute: async () => ({ content: [{ type: 'text' as const, text: 'duplicate' }] })
      };

      // Access private method through any type
      (testRegistry as any).registerTool(duplicateTool);

      expect(globalLogger.warn).toHaveBeenCalledWith(
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
        }
      });

      const result = await customRegistry.callTool('echo', {});
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Tool execution failed: String error');
      expect(globalLogger.error).toHaveBeenCalledWith(
        'Tool execution failed: echo',
        expect.objectContaining({ error: 'String error' })
      );
    });
  });
});