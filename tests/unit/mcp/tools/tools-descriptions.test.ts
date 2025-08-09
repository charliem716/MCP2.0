import { describe, it, expect } from '@jest/globals';
import { GetComponentControlsTool, ListComponentsTool } from '../../../../src/mcp/tools/components';
import {
  ListControlsTool,
  GetControlValuesTool,
  SetControlValuesTool,
} from '../../../../src/mcp/tools/controls';
import { QueryCoreStatusTool } from '../../../../src/mcp/tools/status';
import { GetAllControlsTool } from '../../../../src/mcp/tools/discovery';

// Tool description regression tests - ensure all MCP tools have detailed, helpful descriptions
describe('Tool Descriptions Validation', () => {
  const mockQrwcClient = {};

  it('should have detailed description for list_components tool', () => {
    const tool = new ListComponentsTool(mockQrwcClient);
    const description = (tool as any).description;

    // Check basic requirements
    expect(description.length).toBeGreaterThan(50);
    expect(description).toBeTruthy();
    
    // Check for key concepts
    expect(description.toLowerCase()).toMatch(/discover|list|component/i);
    expect(description.toLowerCase()).toContain('filter');
    expect(description.toLowerCase()).toContain('regex');
    expect(description).toContain('includeProperties');
    
    // Check for examples
    expect(description).toMatch(/example|e\.g\.|{.*}/i);
  });

  it('should have detailed description for qsys_component_get tool', () => {
    const tool = new GetComponentControlsTool(mockQrwcClient);
    const description = (tool as any).description;

    // Check basic requirements
    expect(description.length).toBeGreaterThan(50);
    expect(description).toBeTruthy();
    
    // Check for key concepts
    expect(description.toLowerCase()).toMatch(/get|retrieve|control/i);
    expect(description.toLowerCase()).toContain('component');
    expect(description.toLowerCase()).toContain('efficient');
    
    // Check for examples
    expect(description).toMatch(/example|{.*component.*}/i);
  });

  it('should have detailed description for list_controls tool', () => {
    const tool = new ListControlsTool(mockQrwcClient);
    const description = (tool as any).description;

    // Check basic requirements
    expect(description.length).toBeGreaterThan(50);
    expect(description).toBeTruthy();
    
    // Check for key concepts
    expect(description.toLowerCase()).toMatch(/list|control/i);
    expect(description.toLowerCase()).toContain('filter');
    expect(description).toContain('controlType');
    expect(description).toContain('includeMetadata');
    
    // Check for examples
    expect(description).toMatch(/example|{.*}/i);
  });

  it('should have detailed description for get_control_values tool', () => {
    const tool = new GetControlValuesTool(mockQrwcClient);
    const description = (tool as any).description;

    // Check basic requirements
    expect(description.length).toBeGreaterThan(50);
    expect(description).toBeTruthy();
    
    // Check for key concepts
    expect(description.toLowerCase()).toMatch(/get|current|value/i);
    expect(description.toLowerCase()).toContain('control');
    expect(description).toContain('includeMetadata');
    expect(description).toMatch(/max|limit|100/i);
    
    // Check for examples with control paths
    expect(description).toMatch(/[A-Za-z\s]+\.(gain|mute|delay)/);
  });

  it('should have detailed description for set_control_values tool', () => {
    const tool = new SetControlValuesTool(mockQrwcClient);
    const description = (tool as any).description;

    // Check basic requirements
    expect(description.length).toBeGreaterThan(50);
    expect(description).toBeTruthy();
    
    // Check for key concepts
    expect(description.toLowerCase()).toMatch(/set|control|value/i);
    expect(description.toLowerCase()).toContain('ramp');
    expect(description).toMatch(/gain.*dB|-100.*20/i);
    expect(description.toLowerCase()).toContain('transition');
    
    // Check for examples
    expect(description).toMatch(/example|{.*name.*value.*}/i);
  });

  it('should have detailed description for query_core_status tool', () => {
    const tool = new QueryCoreStatusTool(mockQrwcClient);
    const description = (tool as any).description;

    // Check basic requirements
    expect(description.length).toBeGreaterThan(50);
    expect(description).toBeTruthy();
    
    // Check for key concepts
    expect(description.toLowerCase()).toMatch(/status|health|telemetry/i);
    expect(description.toLowerCase()).toMatch(/core|system/i);
    expect(description).toContain('includeDetails');
    expect(description).toContain('includeNetworkInfo');
    
    // Check for examples
    expect(description).toMatch(/example|{.*}/i);
  });

  it('should have detailed description for qsys_get_all_controls tool', () => {
    const tool = new GetAllControlsTool(mockQrwcClient);
    const description = (tool as any).description;

    // Check basic requirements
    expect(description.length).toBeGreaterThan(50);
    expect(description).toBeTruthy();
    
    // Check for key concepts
    expect(description.toLowerCase()).toMatch(/bulk|all|control/i);
    expect(description.toLowerCase()).toContain('filter');
    expect(description.toLowerCase()).toMatch(/mode|summary|full/i);
    expect(description.toLowerCase()).toContain('pagination');
    
    // Check for examples
    expect(description).toMatch(/example|{.*mode.*}/i);
  });

  describe('Description Quality Metrics', () => {
    it('all descriptions should be reasonable length (under 500 chars)', () => {
      const tools = [
        new ListComponentsTool(mockQrwcClient),
        new GetComponentControlsTool(mockQrwcClient),
        new ListControlsTool(mockQrwcClient),
        new GetControlValuesTool(mockQrwcClient),
        new SetControlValuesTool(mockQrwcClient),
        new QueryCoreStatusTool(mockQrwcClient),
        new GetAllControlsTool(mockQrwcClient),
      ];

      tools.forEach(tool => {
        const description = (tool as any).description;
        const toolName = (tool as any).name;
        expect(description.length).toBeLessThan(500);
        expect(description.length).toBeGreaterThan(50); // Ensure descriptions are meaningful
      });
    });

    it('all descriptions should contain examples', () => {
      const tools = [
        new ListComponentsTool(mockQrwcClient),
        new GetComponentControlsTool(mockQrwcClient),
        new ListControlsTool(mockQrwcClient),
        new GetControlValuesTool(mockQrwcClient),
        new SetControlValuesTool(mockQrwcClient),
        new QueryCoreStatusTool(mockQrwcClient),
        new GetAllControlsTool(mockQrwcClient),
      ];

      tools.forEach(tool => {
        const description = (tool as any).description;
        const toolName = (tool as any).name;
        // Check that descriptions contain examples - either with quotes, braces, or the word "example"
        expect(description).toMatch(/['"`{]|example|e\.g\./i);
      });
    });
  });
});
