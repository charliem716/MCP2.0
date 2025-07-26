/**
 * Tests for GetAllControlsTool (BUG-040)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { GetAllControlsTool } from '../../../../src/mcp/tools/discovery.js';
import type { ToolExecutionContext } from '../../../../src/mcp/tools/base.js';

describe('GetAllControlsTool', () => {
  let tool: GetAllControlsTool;
  let mockQrwcClient: any;
  let mockContext: ToolExecutionContext;

  beforeEach(() => {
    // Mock QRWC client
    mockQrwcClient = {
      sendCommand: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
    };

    // Mock context
    mockContext = {
      userId: 'test-user',
      timestamp: new Date().toISOString(),
    };

    tool = new GetAllControlsTool(mockQrwcClient);
  });

  it('should have correct tool name and description', () => {
    expect(tool.name).toBe('qsys_get_all_controls');
    expect(tool.description).toBe(
      "Bulk control retrieval with filtering and pagination. Modes: 'summary' for system stats, 'filtered' for targeted retrieval with filters (component/type/hasNonDefaultValue), 'full' for all controls. Supports pagination with limit/offset. Optimized for large systems (2000+ controls). Example: {mode:'filtered',filter:{type:'gain'},includeValues:true} for all gain controls."
    );
  });

  it('should successfully get all controls in summary mode (default)', async () => {
    // Mock successful response
    const mockResponse = {
      result: {
        Controls: [
          {
            Name: 'Component1.gain',
            Value: -10.5,
            String: '-10.5dB',
            Type: 'Float',
            Component: 'Component1',
          },
          {
            Name: 'Component1.mute',
            Value: false,
            String: 'false',
            Type: 'Boolean',
            Component: 'Component1',
          },
          {
            Name: 'Component2.level',
            Value: 0,
            String: '0dB',
            Type: 'Float',
            Component: 'Component2',
          },
        ],
      },
    };

    mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

    const params = {
      includeValues: true,
    };

    const result = await tool.execute(params, mockContext);

    expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
      'Component.GetAllControls'
    );
    expect(result.isError).toBe(false);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const responseData = JSON.parse(result.content[0].text);
    expect(responseData.summary).toBeDefined();
    expect(responseData.summary.totalControls).toBe(3);
    expect(responseData.summary.totalComponents).toBe(2);
    expect(responseData.summary.controlsByType).toBeDefined();
    expect(responseData.summary.controlsByType.gain).toBe(2); // gain and level
    expect(responseData.summary.controlsByType.mute).toBe(1);
    expect(responseData.summary.componentsWithMostControls).toHaveLength(2);
    expect(responseData.summary.suggestions).toBeDefined();
  });

  it('should filter components in filtered mode', async () => {
    const mockResponse = {
      result: {
        Controls: [
          {
            Name: 'APM1.gain',
            Value: -5,
            String: '-5dB',
            Type: 'Float',
            Component: 'APM1',
          },
          {
            Name: 'Mixer.level',
            Value: 0,
            String: '0dB',
            Type: 'Float',
            Component: 'Mixer',
          },
          {
            Name: 'APM2.mute',
            Value: true,
            String: 'true',
            Type: 'Boolean',
            Component: 'APM2',
          },
        ],
      },
    };

    mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

    const params = {
      mode: 'filtered' as const,
      filter: {
        component: 'APM',
      },
      includeValues: true,
    };

    const result = await tool.execute(params, mockContext);

    const responseData = JSON.parse(result.content[0].text);
    expect(responseData.mode).toBe('filtered');
    expect(responseData.summary).toBeDefined();
    expect(responseData.summary.totalControls).toBe(3);
    expect(responseData.summary.filteredControls).toBe(2); // Only APM components
    expect(responseData.summary.returnedControls).toBe(2);
    expect(responseData.controls).toHaveLength(2);
    expect(
      responseData.controls.every((c: any) => c.Component.includes('APM'))
    ).toBe(true);
  });

  it('should handle includeValues=false in full mode', async () => {
    const mockResponse = {
      result: {
        Controls: [
          {
            Name: 'Component1.gain',
            Value: -10.5,
            String: '-10.5dB',
            Type: 'Float',
            Component: 'Component1',
          },
        ],
      },
    };

    mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

    const params = {
      mode: 'full' as const,
      includeValues: false,
    };

    const result = await tool.execute(params, mockContext);

    const responseData = JSON.parse(result.content[0].text);
    expect(responseData.mode).toBe('full');
    expect(responseData.controls).toHaveLength(1);
    expect(responseData.controls[0]).toHaveProperty('name', 'Component1.gain');
    expect(responseData.controls[0]).toHaveProperty('component', 'Component1');
    expect(responseData.controls[0]).not.toHaveProperty('Value');
    expect(responseData.controls[0]).not.toHaveProperty('String');
  });

  it('should handle empty response', async () => {
    const mockResponse = {
      result: {
        Controls: [],
      },
    };

    mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

    const params = {};

    const result = await tool.execute(params, mockContext);

    expect(result.isError).toBe(false);
    const responseData = JSON.parse(result.content[0].text);
    expect(responseData.summary).toBeDefined();
    expect(responseData.summary.totalControls).toBe(0);
    expect(responseData.summary.totalComponents).toBe(0);
    expect(responseData.summary.controlsByType).toBeDefined();
    expect(responseData.summary.componentsWithMostControls).toHaveLength(0);
  });

  it('should handle invalid response format', async () => {
    const mockResponse = {
      result: {
        Controls: 'not an array',
      },
    };

    mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

    const params = {};

    const result = await tool.execute(params, mockContext);

    expect(result.isError).toBe(true);
    const errorResponse = JSON.parse(result.content[0].text);
    expect(errorResponse.message).toContain('expected array of controls');
  });

  it('should handle connection errors', async () => {
    mockQrwcClient.sendCommand.mockRejectedValue(
      new Error('Connection failed')
    );

    const params = {};

    const result = await tool.execute(params, mockContext);

    expect(result.isError).toBe(true);
    const errorResponse = JSON.parse(result.content[0].text);
    expect(errorResponse.message).toContain('Connection failed');
  });

  it('should validate parameters', async () => {
    // Test invalid includeValues type
    let result = await tool.execute(
      { includeValues: 'not-boolean' } as any,
      mockContext
    );
    expect(result.isError).toBe(true);
    let errorResponse = JSON.parse(result.content[0].text);
    expect(errorResponse.error).toBe(true);
    expect(errorResponse.message).toContain('Parameter validation failed');

    // Test invalid mode type
    result = await tool.execute({ mode: 'invalid' } as any, mockContext);
    expect(result.isError).toBe(true);
    errorResponse = JSON.parse(result.content[0].text);
    expect(errorResponse.error).toBe(true);
    expect(errorResponse.message).toContain('Parameter validation failed');

    // Test filtered mode without filter
    result = await tool.execute({ mode: 'filtered' } as any, mockContext);
    expect(result.isError).toBe(true);
    errorResponse = JSON.parse(result.content[0].text);
    expect(errorResponse.error).toBe(true);
    expect(errorResponse.message).toContain('Filter required when using');
  });

  it('should handle pagination in filtered mode', async () => {
    const mockResponse = {
      result: {
        Controls: Array.from({ length: 150 }, (_, i) => ({
          Name: `Component${i}.gain`,
          Value: i,
          Type: 'Float',
          Component: `Component${i}`,
        })),
      },
    };

    mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

    const params = {
      mode: 'filtered' as const,
      filter: {
        type: 'gain' as const,
      },
      pagination: {
        limit: 50,
        offset: 20,
      },
    };

    const result = await tool.execute(params, mockContext);

    const responseData = JSON.parse(result.content[0].text);
    expect(responseData.mode).toBe('filtered');
    expect(responseData.summary.totalControls).toBe(150);
    expect(responseData.summary.filteredControls).toBe(150);
    expect(responseData.summary.returnedControls).toBe(50);
    expect(responseData.summary.offset).toBe(20);
    expect(responseData.summary.limit).toBe(50);
    expect(responseData.controls).toHaveLength(50);
    expect(responseData.controls[0].Name).toBe('Component20.gain');
  });

  it('should filter by control type', async () => {
    const mockResponse = {
      result: {
        Controls: [
          {
            Name: 'Component1.gain',
            Value: -5,
            Type: 'Float',
            Component: 'Component1',
          },
          {
            Name: 'Component1.mute',
            Value: true,
            Type: 'Boolean',
            Component: 'Component1',
          },
          {
            Name: 'Component2.trigger',
            Value: 0,
            Type: 'Trigger',
            Component: 'Component2',
          },
        ],
      },
    };

    mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

    const params = {
      mode: 'filtered' as const,
      filter: {
        type: 'mute' as const,
      },
    };

    const result = await tool.execute(params, mockContext);

    const responseData = JSON.parse(result.content[0].text);
    expect(responseData.summary.filteredControls).toBe(1);
    expect(responseData.controls).toHaveLength(1);
    expect(responseData.controls[0].Name).toBe('Component1.mute');
  });

  it('should support legacy componentFilter parameter', async () => {
    const mockResponse = {
      result: {
        Controls: [
          {
            Name: 'APM1.gain',
            Value: -5,
            Type: 'Float',
            Component: 'APM1',
          },
          {
            Name: 'Mixer.level',
            Value: 0,
            Type: 'Float',
            Component: 'Mixer',
          },
        ],
      },
    };

    mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

    // Using deprecated componentFilter parameter
    const params = {
      mode: 'filtered' as const,
      componentFilter: 'APM',
    };

    const result = await tool.execute(params, mockContext);

    const responseData = JSON.parse(result.content[0].text);
    expect(responseData.summary.filteredControls).toBe(1);
    expect(responseData.controls).toHaveLength(1);
    expect(responseData.controls[0].Component).toBe('APM1');
  });
});
