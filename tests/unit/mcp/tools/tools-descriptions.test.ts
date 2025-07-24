import { describe, it, expect } from '@jest/globals';
import { ListComponentsTool } from '../../../../src/mcp/tools/components.js';
import { GetComponentControlsTool } from '../../../../src/mcp/tools/components.js';
import {
  ListControlsTool,
  GetControlValuesTool,
  SetControlValuesTool,
} from '../../../../src/mcp/tools/controls.js';
import { QueryCoreStatusTool } from '../../../../src/mcp/tools/status.js';
import { GetAllControlsTool } from '../../../../src/mcp/tools/discovery.js';

// BUG-048 regression tests - ensure all MCP tools have detailed, helpful descriptions
describe('Tool Descriptions Validation', () => {
  const mockQrwcClient = {};

  it('should have detailed description for list_components tool', () => {
    const tool = new ListComponentsTool(mockQrwcClient);
    const description = (tool as any).description;

    expect(description).toContain('List all Q-SYS components');
    expect(description).toContain('devices like mixers, gains, delays');
    expect(description).toContain("'Main Mixer', 'Output Gain 1', 'APM 1'");
    expect(description).toContain('Filter uses regex');
    expect(description).toContain('includeProperties=true');
  });

  it('should have detailed description for qsys_component_get tool', () => {
    const tool = new GetComponentControlsTool(mockQrwcClient);
    const description = (tool as any).description;

    expect(description).toContain('Get specific controls from one component');
    expect(description).toContain("Example: component='Main Mixer'");
    expect(description).toContain("controls=['gain', 'mute', 'input.1.level']");
    expect(description).toContain('More efficient than listing all controls');
    expect(description).toContain('Control names are relative to component');
  });

  it('should have detailed description for list_controls tool', () => {
    const tool = new ListControlsTool(mockQrwcClient);
    const description = (tool as any).description;

    expect(description).toContain('List controls');
    expect(description).toContain(
      'parameters like gain, mute, crosspoint levels'
    );
    expect(description).toContain(
      "'gain', 'mute', 'input.1.gain', 'crosspoint.1.3'"
    );
    expect(description).toContain("component='Main Mixer'");
    expect(description).toContain('Filter by controlType');
  });

  it('should have detailed description for get_control_values tool', () => {
    const tool = new GetControlValuesTool(mockQrwcClient);
    const description = (tool as any).description;

    expect(description).toContain('Get current values of Q-SYS controls');
    expect(description).toContain(
      "'Main Mixer.gain', 'APM 1.input.mute', 'Delay.delay_ms'"
    );
    expect(description).toContain('-10.5 for gain in dB');
    expect(description).toContain('includeMetadata=true');
    expect(description).toContain('Max 100 controls per request');
  });

  it('should have detailed description for set_control_values tool', () => {
    const tool = new SetControlValuesTool(mockQrwcClient);
    const description = (tool as any).description;

    expect(description).toContain('Set Q-SYS control values');
    expect(description).toContain("{'Main Mixer.gain': -10}");
    expect(description).toContain("{'APM 1.input.mute': true}");
    expect(description).toContain('Ramp creates smooth transitions');
    expect(description).toContain('gains in dB (-100 to 20)');
    expect(description).toContain('Changes are immediate unless ramp');
  });

  it('should have detailed description for query_core_status tool', () => {
    const tool = new QueryCoreStatusTool(mockQrwcClient);
    const description = (tool as any).description;

    expect(description).toContain('Get Q-SYS Core status');
    expect(description).toContain('CPU/memory usage, active design, uptime');
    expect(description).toContain('includeDetails=true');
    expect(description).toContain('includeNetworkInfo=true');
    expect(description).toContain('Status.Code 0 means OK');
  });

  it('should have detailed description for qsys_get_all_controls tool', () => {
    const tool = new GetAllControlsTool(mockQrwcClient);
    const description = (tool as any).description;

    expect(description).toContain('Get all controls from all components');
    expect(description).toContain('Supports regex filtering');
    expect(description).toContain("'APM' matches any component with APM");
    expect(description).toContain(
      "'^Mix' matches components starting with Mix"
    );
    expect(description).toContain("'APM|Mixer' matches APM or Mixer");
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
        // Most descriptions should contain quotes indicating examples
        expect(description).toMatch(/['"`]/);
      });
    });
  });
});
