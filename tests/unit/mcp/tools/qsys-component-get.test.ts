/**
 * Tests for GetComponentControlsTool (BUG-039)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { GetComponentControlsTool } from '../../../../src/mcp/tools/components.js';
import type { ToolExecutionContext } from '../../../../src/mcp/tools/base.js';

describe('GetComponentControlsTool', () => {
  let tool: GetComponentControlsTool;
  let mockQrwcClient: any;
  let mockContext: ToolExecutionContext;

  beforeEach(() => {
    // Mock QRWC client
    mockQrwcClient = {
      sendCommand: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true)
    };

    // Mock context
    mockContext = {
      userId: 'test-user',
      timestamp: new Date().toISOString()
    };

    tool = new GetComponentControlsTool(mockQrwcClient);
  });

  it('should have correct tool name and description', () => {
    expect(tool.name).toBe('qsys_component_get');
    expect(tool.description).toBe('Get specific control values from a named component');
  });

  it('should successfully get component controls', async () => {
    // Mock successful response
    const mockResponse = {
      result: {
        Name: 'My APM',
        Controls: [
          {
            Name: 'ent.xfade.gain',
            Value: -10.5,
            String: '-10.5dB',
            Position: 0.5
          },
          {
            Name: 'bgm.xfade.gain',
            Value: -5.0,
            String: '-5.0dB',
            Position: 0.75
          }
        ]
      }
    };

    mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

    const params = {
      component: 'My APM',
      controls: ['ent.xfade.gain', 'bgm.xfade.gain']
    };

    const result = await tool.execute(params, mockContext);

    expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Component.Get', {
      Name: 'My APM',
      Controls: [
        { Name: 'ent.xfade.gain' },
        { Name: 'bgm.xfade.gain' }
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    
    const responseData = JSON.parse(result.content[0].text);
    expect(responseData.component).toBe('My APM');
    expect(responseData.controls).toHaveLength(2);
    expect(responseData.controls[0]).toEqual({
      name: 'ent.xfade.gain',
      value: -10.5,
      string: '-10.5dB',
      position: 0.5,
      error: undefined
    });
  });

  it('should handle control not found errors', async () => {
    // Mock response with error control
    const mockResponse = {
      result: {
        Name: 'My APM',
        Controls: [
          {
            Name: 'valid.control',
            Value: 0,
            String: '0dB',
            Position: 0.5
          },
          {
            Name: 'invalid.control',
            Value: null,
            String: 'N/A',
            Position: 0,
            Error: 'Control not found'
          }
        ]
      }
    };

    mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

    const params = {
      component: 'My APM',
      controls: ['valid.control', 'invalid.control']
    };

    const result = await tool.execute(params, mockContext);

    expect(result.isError).toBe(false);
    const responseData = JSON.parse(result.content[0].text);
    expect(responseData.controls[1].error).toBe('Control not found');
  });

  it('should handle component not found error', async () => {
    mockQrwcClient.sendCommand.mockRejectedValue(
      new Error("Component 'NonExistent' not found")
    );

    const params = {
      component: 'NonExistent',
      controls: ['some.control']
    };

    const result = await tool.execute(params, mockContext);
    
    expect(result.isError).toBe(true);
    expect(result.content[0].type).toBe('text');
    const errorResponse = JSON.parse(result.content[0].text);
    expect(errorResponse.error).toBe(true);
    expect(errorResponse.message).toContain("Component 'NonExistent' not found");
  });

  it('should handle invalid response format', async () => {
    // Mock invalid response (missing Controls)
    const mockResponse = {
      result: {
        Name: 'My APM'
        // Missing Controls array
      }
    };

    mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

    const params = {
      component: 'My APM',
      controls: ['some.control']
    };

    const result = await tool.execute(params, mockContext);
    
    expect(result.isError).toBe(true);
    const errorResponse = JSON.parse(result.content[0].text);
    expect(errorResponse.message).toContain('missing Controls array');
  });

  it('should handle empty controls array', async () => {
    const mockResponse = {
      result: {
        Name: 'My APM',
        Controls: []
      }
    };

    mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

    const params = {
      component: 'My APM',
      controls: []
    };

    const result = await tool.execute(params, mockContext);

    expect(result.isError).toBe(false);
    const responseData = JSON.parse(result.content[0].text);
    expect(responseData.controls).toHaveLength(0);
  });

  it('should validate parameters', async () => {
    // Test missing component
    let result = await tool.execute({ controls: ['test'] } as any, mockContext);
    expect(result.isError).toBe(true);
    let errorResponse = JSON.parse(result.content[0].text);
    expect(errorResponse.message).toContain('component: Required');

    // Test missing controls
    result = await tool.execute({ component: 'Test' } as any, mockContext);
    expect(result.isError).toBe(true);
    errorResponse = JSON.parse(result.content[0].text);
    expect(errorResponse.message).toContain('controls: Required');

    // Test invalid controls type
    result = await tool.execute({ component: 'Test', controls: 'not-array' } as any, mockContext);
    expect(result.isError).toBe(true);
    errorResponse = JSON.parse(result.content[0].text);
    expect(errorResponse.message).toContain('Expected array');
  });
});