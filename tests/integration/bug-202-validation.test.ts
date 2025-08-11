/**
 * Integration test for BUG-202: Validation Mode Fix
 * Tests that Control.GetValues is used correctly for named control validation
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { SetControlValuesTool } from '../../src/mcp/tools/controls.js';
import type { IControlSystem } from '../../src/mcp/interfaces/control-system.js';

describe('BUG-202: set_control_values validation with Control.GetValues', () => {
  let mockControlSystem: jest.Mocked<IControlSystem>;
  let tool: SetControlValuesTool;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock control system
    mockControlSystem = {
      sendCommand: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as jest.Mocked<IControlSystem>;

    tool = new SetControlValuesTool(mockControlSystem);
  });

  it('should use Control.GetValues for named control validation', async () => {
    // Mock Control.GetValues to return valid controls
    mockControlSystem.sendCommand.mockImplementation(async (cmd, params) => {
      if (cmd === 'Control.GetValues') {
        // Verify it's using the correct format with Names array
        expect(params).toHaveProperty('Names');
        expect(Array.isArray(params.Names)).toBe(true);
        
        // Return only the controls that exist
        const validControls = ['SystemGain', 'MasterVolume'];
        const result = params.Names
          .filter((name: string) => validControls.includes(name))
          .map((name: string) => ({
            Name: name,
            Value: 0,
            String: '0',
            Position: 0.5
          }));
        
        return { result };
      }
      
      if (cmd === 'Control.Set') {
        return {
          result: params.Controls.map((c: any) => ({
            Name: c.Name,
            Result: 'Success'
          }))
        };
      }
      
      return { error: { message: 'Unknown command' } };
    });

    // Test with mixed valid and invalid controls
    const params = {
      controls: [
        { name: 'SystemGain', value: -5 },
        { name: 'InvalidControl', value: 10 },
        { name: 'MasterVolume', value: -10 }
      ],
      validate: true
    };

    const result = await tool.execute(params);
    
    // Should not be an error if some controls are valid
    expect(result.isError).toBe(false);
    
    const response = JSON.parse(result.content[0].text);
    
    // Check that Control.GetValues was called with all control names
    const getValuesCalls = mockControlSystem.sendCommand.mock.calls.filter(
      call => call[0] === 'Control.GetValues'
    );
    expect(getValuesCalls).toHaveLength(1);
    expect(getValuesCalls[0][1].Names).toEqual(['SystemGain', 'InvalidControl', 'MasterVolume']);
    
    // Valid controls should succeed
    const systemGain = response.find((r: any) => r.name === 'SystemGain');
    expect(systemGain).toMatchObject({
      name: 'SystemGain',
      value: -5,
      success: true
    });
    
    const masterVolume = response.find((r: any) => r.name === 'MasterVolume');
    expect(masterVolume).toMatchObject({
      name: 'MasterVolume',
      value: -10,
      success: true
    });
    
    // Invalid control should fail
    const invalidControl = response.find((r: any) => r.name === 'InvalidControl');
    expect(invalidControl).toMatchObject({
      name: 'InvalidControl',
      value: 10,
      success: false,
      error: expect.stringContaining('not found')
    });
    
    // Verify Control.Set was called only for valid controls
    const setControlCalls = mockControlSystem.sendCommand.mock.calls.filter(
      call => call[0] === 'Control.Set'
    );
    expect(setControlCalls).toHaveLength(1);
    expect(setControlCalls[0][1].Controls).toHaveLength(2);
    expect(setControlCalls[0][1].Controls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ Name: 'SystemGain', Value: -5 }),
        expect.objectContaining({ Name: 'MasterVolume', Value: -10 })
      ])
    );
  });

  it('should handle empty response from Control.GetValues as all controls invalid', async () => {
    mockControlSystem.sendCommand.mockImplementation(async (cmd) => {
      if (cmd === 'Control.GetValues') {
        // Return empty array - no controls found
        return { result: [] };
      }
      return { error: { message: 'Unknown command' } };
    });

    const params = {
      controls: [
        { name: 'NonExistent1', value: 1 },
        { name: 'NonExistent2', value: 2 }
      ],
      validate: true
    };

    const result = await tool.execute(params);
    
    // Should be an error when all controls fail
    expect(result.isError).toBe(true);
    
    const response = JSON.parse(result.content[0].text);
    
    // All controls should fail
    expect(response).toHaveLength(2);
    expect(response.every((r: any) => !r.success)).toBe(true);
    expect(response.every((r: any) => r.error?.includes('not found'))).toBe(true);
  });

  it('should NOT use Control.Get for named control validation', async () => {
    let controlGetCalled = false;
    
    mockControlSystem.sendCommand.mockImplementation(async (cmd, params) => {
      if (cmd === 'Control.Get') {
        controlGetCalled = true;
        throw new Error('Control.Get should not be called - use Control.GetValues instead');
      }
      
      if (cmd === 'Control.GetValues') {
        const result = params.Names.map((name: string) => ({
          Name: name,
          Value: 0,
          String: '0',
          Position: 0.5
        }));
        return { result };
      }
      
      if (cmd === 'Control.Set') {
        return {
          result: params.Controls.map((c: any) => ({
            Name: c.Name,
            Result: 'Success'
          }))
        };
      }
      
      return { error: { message: 'Unknown command' } };
    });

    const params = {
      controls: [
        { name: 'TestControl', value: 50 }
      ],
      validate: true
    };

    const result = await tool.execute(params);
    
    // Should succeed without calling Control.Get
    expect(result.isError).toBe(false);
    expect(controlGetCalled).toBe(false);
    
    // Verify Control.GetValues was used instead
    const getValuesCalls = mockControlSystem.sendCommand.mock.calls.filter(
      call => call[0] === 'Control.GetValues'
    );
    expect(getValuesCalls).toHaveLength(1);
  });
});