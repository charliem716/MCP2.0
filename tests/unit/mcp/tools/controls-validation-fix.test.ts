/**
 * Test for BUG-200: Validation fails silently for valid controls when mixed with invalid
 * 
 * This test verifies that the validation system now correctly:
 * 1. Processes valid controls even when invalid controls are present
 * 2. Returns appropriate error messages for invalid controls
 * 3. Provides clear indication of partial success
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { SetControlValuesTool } from '../../../../src/mcp/tools/controls.js';
import type { IControlSystem } from '../../../../src/mcp/interfaces/control-system.js';

describe('BUG-200: SetControlValuesTool validation fix', () => {
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

  describe('Mixed valid and invalid controls with validation', () => {
    it('should process valid controls and reject invalid ones when validate:true', async () => {
      // Setup validation responses
      // Component.GetControls for valid component
      mockControlSystem.sendCommand.mockImplementation(async (cmd, params) => {
        if (cmd === 'Component.GetControls' && params.Name === 'ValidComponent') {
          return {
            result: {
              Name: 'ValidComponent',
              Controls: [
                { Name: 'gain', Value: -10, Type: 'Float' },
                { Name: 'mute', Value: false, Type: 'Boolean' }
              ]
            }
          };
        }
        
        if (cmd === 'Component.GetControls' && params.Name === 'InvalidComponent') {
          return {
            error: {
              code: -1,
              message: 'Component not found: InvalidComponent'
            }
          };
        }

        if (cmd === 'Control.Get') {
          if (params.Name === 'SystemGain') {
            return {
              result: { Name: 'SystemGain', Value: -5 }
            };
          }
          if (params.Name === 'NonExistentControl') {
            return {
              error: { code: -1, message: 'Control not found: NonExistentControl' }
            };
          }
          return {
            error: { code: -1, message: `Control not found: ${params.Name}` }
          };
        }

        if (cmd === 'Component.Set' && params.Name === 'ValidComponent') {
          return {
            result: params.Controls.map((c: any) => ({
              Name: c.Name,
              Result: 'Success'
            }))
          };
        }

        if (cmd === 'Control.Set') {
          return {
            result: params.Controls.map((c: any) => ({
              Name: c.Name,
              Result: 'Success'
            }))
          };
        }

        return { error: { code: -1, message: 'Unknown command' } };
      });

      // Test mixed valid and invalid controls
      const params = {
        controls: [
          { name: 'ValidComponent.gain', value: -15 },
          { name: 'ValidComponent.mute', value: true },
          { name: 'InvalidComponent.gain', value: -10 },
          { name: 'NonExistentControl', value: 0 },
          { name: 'SystemGain', value: -8 }
        ],
        validate: true
      };

      const result = await tool.execute(params);
      
      expect(result.isError).toBe(false); // Should not be an error when some succeed
      
      const response = JSON.parse(result.content[0].text);
      
      // Should have results for all controls
      expect(response).toHaveLength(5);
      
      // Check valid controls succeeded
      const validComponentGain = response.find((r: any) => r.name === 'ValidComponent.gain');
      expect(validComponentGain).toMatchObject({
        name: 'ValidComponent.gain',
        value: -15,
        success: true
      });
      
      const validComponentMute = response.find((r: any) => r.name === 'ValidComponent.mute');
      expect(validComponentMute).toMatchObject({
        name: 'ValidComponent.mute',
        value: true,
        success: true
      });
      
      const systemGain = response.find((r: any) => r.name === 'SystemGain');
      expect(systemGain).toMatchObject({
        name: 'SystemGain',
        value: -8,
        success: true
      });
      
      // Check invalid controls failed with appropriate errors
      const invalidComponentGain = response.find((r: any) => r.name === 'InvalidComponent.gain');
      expect(invalidComponentGain).toMatchObject({
        name: 'InvalidComponent.gain',
        value: -10,
        success: false,
        error: expect.stringContaining('Component not found')
      });
      
      const nonExistentControl = response.find((r: any) => r.name === 'NonExistentControl');
      expect(nonExistentControl).toMatchObject({
        name: 'NonExistentControl',
        value: 0,
        success: false,
        error: expect.stringContaining('not found')
      });

      // Verify that valid controls were actually sent to the system
      const componentSetCalls = mockControlSystem.sendCommand.mock.calls.filter(
        call => call[0] === 'Component.Set'
      );
      expect(componentSetCalls).toHaveLength(1);
      expect(componentSetCalls[0][1]).toMatchObject({
        Name: 'ValidComponent',
        Controls: expect.arrayContaining([
          expect.objectContaining({ Name: 'gain', Value: -15 }),
          expect.objectContaining({ Name: 'mute', Value: 1 }) // Boolean converted to 1
        ])
      });

      const controlSetCalls = mockControlSystem.sendCommand.mock.calls.filter(
        call => call[0] === 'Control.Set'
      );
      expect(controlSetCalls).toHaveLength(1);
      expect(controlSetCalls[0][1]).toMatchObject({
        Controls: expect.arrayContaining([
          expect.objectContaining({ Name: 'SystemGain', Value: -8 })
        ])
      });
    });

    it('should return isError:true only when ALL controls fail', async () => {
      // Setup all controls to fail validation
      mockControlSystem.sendCommand.mockImplementation(async (cmd) => {
        if (cmd === 'Component.GetControls' || cmd === 'Control.Get') {
          return {
            error: { code: -1, message: 'Not found' }
          };
        }
        return { error: { code: -1, message: 'Unknown command' } };
      });

      const params = {
        controls: [
          { name: 'InvalidComponent1.gain', value: -10 },
          { name: 'InvalidComponent2.mute', value: true },
          { name: 'NonExistent.control', value: 0 }
        ],
        validate: true
      };

      const result = await tool.execute(params);
      
      expect(result.isError).toBe(true); // Should be error when ALL fail
      
      const response = JSON.parse(result.content[0].text);
      
      // All should have failed
      expect(response).toHaveLength(3);
      expect(response.every((r: any) => !r.success)).toBe(true);
    });

    it('should handle all valid controls correctly', async () => {
      // Setup all controls to pass validation
      mockControlSystem.sendCommand.mockImplementation(async (cmd, params) => {
        if (cmd === 'Component.GetControls') {
          return {
            result: {
              Name: params.Name,
              Controls: [
                { Name: 'gain', Value: -10, Type: 'Float' },
                { Name: 'mute', Value: false, Type: 'Boolean' }
              ]
            }
          };
        }
        
        if (cmd === 'Component.Set') {
          return {
            result: params.Controls.map((c: any) => ({
              Name: c.Name,
              Result: 'Success'
            }))
          };
        }

        return { error: { code: -1, message: 'Unknown command' } };
      });

      const params = {
        controls: [
          { name: 'Component1.gain', value: -15 },
          { name: 'Component1.mute', value: true },
          { name: 'Component2.gain', value: -20 }
        ],
        validate: true
      };

      const result = await tool.execute(params);
      
      expect(result.isError).toBe(false);
      
      const response = JSON.parse(result.content[0].text);
      
      // All should succeed
      expect(response).toHaveLength(3);
      expect(response.every((r: any) => r.success)).toBe(true);
    });
  });

  describe('Validation disabled behavior', () => {
    it('should process all controls without validation when validate:false', async () => {
      // Setup responses for actual control setting (no validation calls)
      mockControlSystem.sendCommand.mockImplementation(async (cmd, params) => {
        if (cmd === 'Component.Set') {
          // Q-SYS will ignore invalid components but return success
          return {
            result: params.Controls.map((c: any) => ({
              Name: c.Name,
              Result: 'Success'
            }))
          };
        }

        if (cmd === 'Control.Set') {
          return {
            result: params.Controls.map((c: any) => ({
              Name: c.Name,
              Result: 'Success'
            }))
          };
        }

        return { error: { code: -1, message: 'Unknown command' } };
      });

      const params = {
        controls: [
          { name: 'ValidComponent.gain', value: -15 },
          { name: 'InvalidComponent.gain', value: -10 }, // Will "succeed" but have no effect
          { name: 'SystemGain', value: -8 }
        ],
        validate: false
      };

      const result = await tool.execute(params);
      
      expect(result.isError).toBe(false);
      
      const response = JSON.parse(result.content[0].text);
      
      // All should report success (even invalid ones)
      expect(response).toHaveLength(3);
      expect(response.every((r: any) => r.success)).toBe(true);
      
      // Verify no validation calls were made
      const validationCalls = mockControlSystem.sendCommand.mock.calls.filter(
        call => call[0] === 'Component.GetControls' || call[0] === 'Control.Get'
      );
      expect(validationCalls).toHaveLength(0);
    });
  });
});