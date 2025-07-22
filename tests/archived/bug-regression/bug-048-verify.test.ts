import { describe, it, expect, beforeAll } from '@jest/globals';
import { createMCPHandlers } from '../../../src/mcp/handlers/index.js';
import { QRWCAdapter } from '../../../src/mcp/qrwc/adapter.js';

describe('BUG-048: Verify Tool Descriptions Help AI Agents', () => {
  let handlers: any;
  let mockQrwcClient: any;

  beforeAll(() => {
    // Create a mock QRWC client
    mockQrwcClient = {
      sendCommand: jest.fn().mockResolvedValue({
        result: []
      })
    };

    // Create MCP handlers with the mock client
    const adapter = new QRWCAdapter(mockQrwcClient);
    handlers = createMCPHandlers(adapter);
  });

  it('should list all tools with enhanced descriptions', async () => {
    const tools = await handlers.handleListTools();
    
    expect(tools).toBeDefined();
    expect(tools.tools).toBeDefined();
    expect(Array.isArray(tools.tools)).toBe(true);

    // Find our enhanced tools
    const enhancedTools = [
      'list_components',
      'qsys_component_get',
      'list_controls',
      'get_control_values',
      'set_control_values',
      'query_core_status'
    ];

    enhancedTools.forEach(toolName => {
      const tool = tools.tools.find((t: any) => t.name === toolName);
      expect(tool).toBeDefined();
      
      // Verify description contains examples and guidance
      const description = tool.description;
      
      // All enhanced descriptions should contain examples or specific guidance
      const hasExamples = 
        description.includes('Example') ||
        description.includes("'") ||  // Contains quoted examples
        description.includes('Main Mixer') ||
        description.includes('APM') ||
        description.includes('gain') ||
        description.includes('mute');
        
      expect(hasExamples).toBe(true);
      
      // All descriptions should mention Q-SYS
      expect(description).toContain('Q-SYS');
      
      console.log(`\n${toolName}:\n${description}\n`);
    });
  });

  it('should provide clear parameter descriptions in tool schemas', async () => {
    const tools = await handlers.handleListTools();
    
    // Check specific tools have proper parameter descriptions
    const listComponentsTool = tools.tools.find((t: any) => t.name === 'list_components');
    expect(listComponentsTool).toBeDefined();
    expect(listComponentsTool.inputSchema).toBeDefined();
    
    if (listComponentsTool.inputSchema.properties?.filter) {
      expect(listComponentsTool.inputSchema.properties.filter.description)
        .toContain('filter pattern');
    }
    
    const setControlValuesTool = tools.tools.find((t: any) => t.name === 'set_control_values');
    expect(setControlValuesTool).toBeDefined();
    expect(setControlValuesTool.inputSchema).toBeDefined();
    
    if (setControlValuesTool.inputSchema.properties?.controls) {
      const controlsSchema = setControlValuesTool.inputSchema.properties.controls;
      expect(controlsSchema.description).toContain('Array of controls');
    }
  });

  describe('Tool Description Patterns', () => {
    it('descriptions should follow consistent patterns', async () => {
      const tools = await handlers.handleListTools();
      
      const toolsToCheck = [
        'list_components',
        'qsys_component_get', 
        'list_controls',
        'get_control_values',
        'set_control_values',
        'query_core_status'
      ];

      toolsToCheck.forEach(toolName => {
        const tool = tools.tools.find((t: any) => t.name === toolName);
        const description = tool.description;
        
        // Check for action verb at start
        const startsWithVerb = /^(List|Get|Set|Query)/.test(description);
        expect(startsWithVerb).toBe(true);
        
        // Check length is reasonable
        expect(description.length).toBeGreaterThan(100); // Meaningful description
        expect(description.length).toBeLessThan(500); // Not too verbose
        
        // Should not have line breaks (single line description)
        expect(description).not.toContain('\n');
      });
    });
  });
});