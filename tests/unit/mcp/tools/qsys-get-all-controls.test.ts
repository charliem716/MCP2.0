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
      isConnected: jest.fn().mockReturnValue(true)
    };

    // Mock context
    mockContext = {
      userId: 'test-user',
      timestamp: new Date().toISOString()
    };

    tool = new GetAllControlsTool(mockQrwcClient);
  });

  it('should have correct tool name and description', () => {
    expect(tool.name).toBe('qsys_get_all_controls');
    expect(tool.description).toBe('Get all controls from all components in the Q-SYS system');
  });

  it('should successfully get all controls', async () => {
    // Mock successful response
    const mockResponse = {
      result: [
        {
          Name: 'Component1.gain',
          Value: -10.5,
          String: '-10.5dB',
          Type: 'gain',
          Component: 'Component1'
        },
        {
          Name: 'Component1.mute',
          Value: false,
          String: 'false',
          Type: 'boolean',
          Component: 'Component1'
        },
        {
          Name: 'Component2.level',
          Value: 0,
          String: '0dB',
          Type: 'level',
          Component: 'Component2'
        }
      ]
    };

    mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

    const params = {
      includeValues: true
    };

    const result = await tool.execute(params, mockContext);

    expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Component.GetAllControls');
    expect(result.isError).toBe(false);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    
    const responseData = JSON.parse(result.content[0].text);
    expect(responseData.totalControls).toBe(3);
    expect(responseData.componentCount).toBe(2);
    expect(responseData.components).toHaveLength(2);
    expect(responseData.components[0].name).toBe('Component1');
    expect(responseData.components[0].controlCount).toBe(2);
    expect(responseData.components[0].controls).toHaveLength(2);
  });

  it('should filter components by regex pattern', async () => {
    const mockResponse = {
      result: [
        {
          Name: 'APM1.gain',
          Value: -5,
          String: '-5dB',
          Type: 'gain',
          Component: 'APM1'
        },
        {
          Name: 'Mixer.level',
          Value: 0,
          String: '0dB',
          Type: 'level',
          Component: 'Mixer'
        },
        {
          Name: 'APM2.mute',
          Value: true,
          String: 'true',
          Type: 'boolean',
          Component: 'APM2'
        }
      ]
    };

    mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

    const params = {
      includeValues: true,
      componentFilter: 'APM'
    };

    const result = await tool.execute(params, mockContext);

    const responseData = JSON.parse(result.content[0].text);
    expect(responseData.totalControls).toBe(2); // Only APM components
    expect(responseData.componentCount).toBe(2);
    expect(responseData.components.every((c: any) => c.name.includes('APM'))).toBe(true);
  });

  it('should handle includeValues=false', async () => {
    const mockResponse = {
      result: [
        {
          Name: 'Component1.gain',
          Value: -10.5,
          String: '-10.5dB',
          Type: 'gain',
          Component: 'Component1'
        }
      ]
    };

    mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

    const params = {
      includeValues: false
    };

    const result = await tool.execute(params, mockContext);

    const responseData = JSON.parse(result.content[0].text);
    expect(responseData.components[0].controls[0]).toHaveProperty('name');
    expect(responseData.components[0].controls[0]).not.toHaveProperty('value');
    expect(responseData.components[0].controls[0]).not.toHaveProperty('string');
  });

  it('should handle empty response', async () => {
    const mockResponse = {
      result: []
    };

    mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

    const params = {};

    const result = await tool.execute(params, mockContext);

    expect(result.isError).toBe(false);
    const responseData = JSON.parse(result.content[0].text);
    expect(responseData.totalControls).toBe(0);
    expect(responseData.componentCount).toBe(0);
    expect(responseData.components).toHaveLength(0);
  });

  it('should handle invalid response format', async () => {
    const mockResponse = {
      result: "not an array"
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
      new Error("Connection failed")
    );

    const params = {};

    const result = await tool.execute(params, mockContext);

    expect(result.isError).toBe(true);
    const errorResponse = JSON.parse(result.content[0].text);
    expect(errorResponse.message).toContain('Connection failed');
  });

  it('should validate parameters', async () => {
    // Test invalid includeValues type
    let result = await tool.execute({ includeValues: 'not-boolean' } as any, mockContext);
    expect(result.isError).toBe(true);
    let errorResponse = JSON.parse(result.content[0].text);
    expect(errorResponse.message).toContain('Expected boolean');

    // Test invalid componentFilter type
    result = await tool.execute({ componentFilter: 123 } as any, mockContext);
    expect(result.isError).toBe(true);
    errorResponse = JSON.parse(result.content[0].text);
    expect(errorResponse.message).toContain('Expected string');
  });
});