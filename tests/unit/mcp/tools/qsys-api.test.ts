/**
 * Tests for QueryQSysAPITool (BUG-047)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { QueryQSysAPITool } from '../../../../src/mcp/tools/qsys-api.js';
import type { ToolExecutionContext } from '../../../../src/mcp/tools/base.js';

describe('QueryQSysAPITool', () => {
  let tool: QueryQSysAPITool;
  let mockQrwcClient: any;
  let mockContext: ToolExecutionContext;

  beforeEach(() => {
    mockQrwcClient = {
      isConnected: jest.fn().mockReturnValue(true),
    };

    mockContext = {
      userId: 'test-user',
      timestamp: new Date().toISOString(),
    };

    tool = new QueryQSysAPITool(mockQrwcClient);
  });

  it('should have correct tool name and description', () => {
    expect(tool.name).toBe('query_qsys_api');
    expect(tool.description).toContain('Query Q-SYS API reference');
    expect(tool.description).toContain('methods');
    expect(tool.description).toContain('examples');
  });

  it('should query methods by component type', async () => {
    const params = {
      query_type: 'methods' as const,
      component_type: 'mixer' as const,
    };

    const result = await tool.execute(params, mockContext);

    expect(result.isError).toBe(false);
    const response = JSON.parse(result.content[0].text);

    expect(response.query_type).toBe('methods');
    expect(response.methods).toBeDefined();
    expect(response.count).toBeGreaterThan(0);

    const mixerMethods = response.methods.filter(
      (m: any) => m.name.includes('Mixer') || m.category === 'Mixer'
    );
    expect(mixerMethods.length).toBeGreaterThan(0);
  });

  it('should search for methods by keyword', async () => {
    const params = {
      query_type: 'methods' as const,
      search: 'gain',
    };

    const result = await tool.execute(params, mockContext);

    const response = JSON.parse(result.content[0].text);
    expect(
      response.methods.some(
        (m: any) =>
          m.name.toLowerCase().includes('gain') ||
          m.description.toLowerCase().includes('gain')
      )
    ).toBe(true);
  });

  it('should query component types', async () => {
    const params = {
      query_type: 'components' as const,
    };

    const result = await tool.execute(params, mockContext);

    const response = JSON.parse(result.content[0].text);
    expect(response.query_type).toBe('components');
    expect(response.component_types).toBeDefined();
    expect(response.count).toBeGreaterThan(0);

    const types = response.component_types.map((t: any) => t.type);
    expect(types).toContain('mixer');
    expect(types).toContain('gain');
  });

  it('should query control types', async () => {
    const params = {
      query_type: 'controls' as const,
    };

    const result = await tool.execute(params, mockContext);

    const response = JSON.parse(result.content[0].text);
    expect(response.query_type).toBe('controls');
    expect(response.control_types).toBeDefined();

    const types = response.control_types.map((t: any) => t.type);
    expect(types).toContain('gain');
    expect(types).toContain('mute');
    expect(types).toContain('position');
  });

  it('should get examples for specific method', async () => {
    const params = {
      query_type: 'examples' as const,
      method_name: 'Component.Set',
    };

    const result = await tool.execute(params, mockContext);

    const response = JSON.parse(result.content[0].text);
    expect(response.query_type).toBe('examples');
    expect(response.examples.length).toBeGreaterThan(0);
    expect(response.examples[0].method).toBe('Component.Set');
  });

  it('should handle search with no results', async () => {
    const params = {
      query_type: 'methods' as const,
      search: 'nonexistentmethod',
    };

    const result = await tool.execute(params, mockContext);

    const response = JSON.parse(result.content[0].text);
    expect(response.count).toBe(0);
    expect(response.methods).toHaveLength(0);
  });

  it('should filter by method category', async () => {
    const params = {
      query_type: 'methods' as const,
      method_category: 'Snapshot' as const,
    };

    const result = await tool.execute(params, mockContext);

    const response = JSON.parse(result.content[0].text);
    expect(response.methods.every((m: any) => m.category === 'Snapshot')).toBe(
      true
    );
  });

  it('should validate parameters', async () => {
    // Invalid query_type
    let result = await tool.execute(
      { query_type: 'invalid' } as any,
      mockContext
    );
    expect(result.isError).toBe(true);

    // Invalid component_type
    result = await tool.execute(
      {
        query_type: 'methods' as const,
        component_type: 'invalid' as any,
      },
      mockContext
    );
    expect(result.isError).toBe(true);
  });
});
