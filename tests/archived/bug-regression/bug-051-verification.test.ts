import { describe, it, expect, jest } from '@jest/globals';
import { MCPToolRegistry } from '../../src/mcp/handlers/index.js';
import { QRWCClientAdapter } from '../../src/mcp/qrwc/adapter.js';

describe('BUG-051 Verification - send_raw_command Deprecation', () => {
  let mockQrwcClient: any;
  let toolRegistry: MCPToolRegistry;
  let adapter: QRWCClientAdapter;

  beforeEach(() => {
    // Mock QRWC client
    mockQrwcClient = {
      isConnected: jest.fn().mockReturnValue(true),
      getQrwc: jest.fn().mockReturnValue({ components: {} }),
      getComponent: jest.fn(),
      setControlValue: jest.fn()
    };
    
    adapter = new QRWCClientAdapter(mockQrwcClient);
    toolRegistry = new MCPToolRegistry(adapter);
  });

  describe('Tool Registration', () => {
    it('should NOT have send_raw_command tool registered', async () => {
      await toolRegistry.initialize();
      
      // Verify send_raw_command is not in the tool list
      const tools = await toolRegistry.listTools();
      const toolNames = tools.map(t => t.name);
      
      expect(toolNames).not.toContain('send_raw_command');
      expect(toolRegistry.hasTool('send_raw_command')).toBe(false);
    });

    it('should have exactly 9 tools (8 Q-SYS + 1 echo)', async () => {
      await toolRegistry.initialize();
      
      const tools = await toolRegistry.listTools();
      expect(tools).toHaveLength(9);
      
      // Verify the 8 Q-SYS tools are present
      const expectedTools = [
        'list_components',
        'qsys_component_get',
        'list_controls',
        'get_control_values',
        'set_control_values',
        'query_core_status',
        'qsys_get_all_controls',
        'query_qsys_api',
        'echo' // Test tool
      ];
      
      const toolNames = tools.map(t => t.name);
      expectedTools.forEach(toolName => {
        expect(toolNames).toContain(toolName);
      });
    });

    it('should throw error when trying to call send_raw_command', async () => {
      await toolRegistry.initialize();
      
      await expect(
        toolRegistry.callTool('send_raw_command', { method: 'StatusGet' })
      ).rejects.toThrow(/Tool 'send_raw_command' not found/);
    });
  });

  describe('Adapter Interface', () => {
    it('should NOT have sendRawCommand method', () => {
      // Verify the method doesn't exist on the adapter
      expect(typeof (adapter as any).sendRawCommand).toBe('undefined');
    });

    it('should only have sendCommand method', () => {
      // Verify only the safe sendCommand method exists
      expect(typeof adapter.sendCommand).toBe('function');
      expect(typeof adapter.isConnected).toBe('function');
      
      // These should be the only public methods
      const publicMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(adapter))
        .filter(name => typeof (adapter as any)[name] === 'function')
        .filter(name => !name.startsWith('_') && name !== 'constructor');
      
      expect(publicMethods).toContain('sendCommand');
      expect(publicMethods).toContain('isConnected');
      expect(publicMethods).not.toContain('sendRawCommand');
    });
  });

  describe('Server Stability', () => {
    it('should handle Status.Get without raw commands', async () => {
      const result = await adapter.sendCommand('Status.Get');
      
      expect(result).toHaveProperty('result');
      expect(result.result).toHaveProperty('Platform', 'Q-SYS Core');
      expect(result.result).toHaveProperty('IsConnected', true);
      expect(result.result).toHaveProperty('note', 
        'Limited status information available without raw command access');
    });

    it('should remain stable when attempting change group operations', async () => {
      // Change group operations should fail gracefully without crashes
      const changeGroupCommand = {
        method: 'ChangeGroup.Subscribe',
        params: {
          Id: 'test-group',
          Controls: ['gain.1', 'mute.1']
        }
      };

      // This should not crash but return an error
      await expect(
        adapter.sendCommand('ChangeGroup.Subscribe', changeGroupCommand.params)
      ).rejects.toThrow(/Unknown QRWC command/);
    });
  });

  describe('Documentation Updates', () => {
    it('query_qsys_api should document tool deprecation', async () => {
      await toolRegistry.initialize();
      
      const result = await toolRegistry.callTool('query_qsys_api', {
        query_type: 'tools'
      });
      
      const content = JSON.parse(result.content[0].text);
      expect(content.overview.note).toContain('send_raw_command tool has been deprecated');
      expect(content.tools).toHaveLength(8); // Should list 8 MCP tools
      expect(content.tools.map((t: any) => t.name)).not.toContain('send_raw_command');
    });
  });
});