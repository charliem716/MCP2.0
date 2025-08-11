import { describe, it, expect, beforeEach } from '@jest/globals';
import type { Mock } from 'jest-mock';
import { SetControlValuesTool } from '../../../../src/mcp/tools/controls.js';
import type { IControlSystem } from '../../../../src/mcp/interfaces/control-system.js';
import type { ToolExecutionContext } from '../../../../src/mcp/tools/base.js';

describe('SetControlValuesTool - Validation Fixes', () => {
  let tool: SetControlValuesTool;
  let mockControlSystem: IControlSystem;
  let mockContext: ToolExecutionContext;

  beforeEach(() => {
    mockControlSystem = {
      sendCommand: jest.fn() as Mock,
      isConnected: jest.fn(() => true) as Mock,
      disconnect: jest.fn() as Mock,
      on: jest.fn() as Mock,
      off: jest.fn() as Mock,
    } as unknown as IControlSystem;

    tool = new SetControlValuesTool(mockControlSystem);
    mockContext = {} as ToolExecutionContext;
  });

  describe('Q-SYS response handling behavior', () => {
    it('should detect actual Q-SYS errors', async () => {
      // Q-SYS returns explicit error responses for failures
      (mockControlSystem.sendCommand as Mock).mockResolvedValue({
        result: [
          { Name: 'control1', Result: 'OK' },
          { Name: 'control2', Result: 'Error', Error: 'Control is read-only' }
        ]
      });

      const result = await tool.execute({
        controls: [
          { name: 'Component.control1', value: 10 },
          { name: 'Component.control2', value: 20 }
        ],
        validate: false
      }, mockContext);

      const response = JSON.parse(result.content[0].text);
      
      expect(response).toHaveLength(2);
      expect(response[0]).toMatchObject({
        name: 'Component.control1',
        success: true
      });
      expect(response[1]).toMatchObject({
        name: 'Component.control2',
        success: false,
        error: 'Control is read-only'
      });
    });

    it('should treat empty response as success (Q-SYS standard behavior)', async () => {
      // Q-SYS returns empty array when all controls succeed
      (mockControlSystem.sendCommand as Mock).mockResolvedValue({
        result: []  // Empty result is normal for successful operations
      });

      const result = await tool.execute({
        controls: [
          { name: 'Component.control', value: 10 }
        ],
        validate: false
      }, mockContext);

      const response = JSON.parse(result.content[0].text);
      
      // Empty response means success in Q-SYS
      expect(response).toHaveLength(1);
      expect(response[0]).toMatchObject({
        name: 'Component.control',
        value: 10,
        success: true  // Empty response = success
      });
    });

    it('should handle mixed explicit success and implicit success responses', async () => {
      // Q-SYS only returns controls that need explicit confirmation
      (mockControlSystem.sendCommand as Mock).mockImplementation((cmd, params) => {
        if (cmd === 'Component.Set') {
          if (params.Name === 'RealComponent') {
            return Promise.resolve({
              result: [
                { Name: 'realControl', Result: 'OK' }
                // otherControl not in response = implicitly succeeded
              ]
            });
          }
        }
        return Promise.resolve({ result: [] });
      });

      const result = await tool.execute({
        controls: [
          { name: 'RealComponent.realControl', value: 5 },
          { name: 'RealComponent.otherControl', value: 10 }
        ],
        validate: false
      }, mockContext);

      const response = JSON.parse(result.content[0].text);
      
      expect(response).toHaveLength(2);
      // Explicitly confirmed control
      expect(response[0]).toMatchObject({
        name: 'RealComponent.realControl',
        success: true
      });
      // Implicitly succeeded control (not in response)
      expect(response[1]).toMatchObject({
        name: 'RealComponent.otherControl',
        success: true  // Missing from response = success
      });
    });
  });

  describe('BUG FIX: Automatic trimming of control names', () => {
    it('should trim spaces from control names', async () => {
      (mockControlSystem.sendCommand as Mock).mockResolvedValue({
        result: [{ Name: 'gain', Result: 'OK' }]
      });

      const result = await tool.execute({
        controls: [
          { name: '  Matrix.gain  ', value: -10 }  // Spaces around name
        ],
        validate: false
      }, mockContext);

      // Should call with trimmed name
      expect(mockControlSystem.sendCommand).toHaveBeenCalledWith('Component.Set', {
        Name: 'Matrix',
        Controls: [{ Name: 'gain', Value: -10 }]
      });

      const response = JSON.parse(result.content[0].text);
      expect(response[0]).toMatchObject({
        name: 'Matrix.gain',  // Trimmed in response
        success: true
      });
    });

    it('should handle multiple spaces consistently', async () => {
      (mockControlSystem.sendCommand as Mock).mockImplementation((cmd) => {
        if (cmd === 'Component.GetControls') {
          return Promise.resolve({
            result: {
              Controls: [{ Name: 'mute' }]
            }
          });
        }
        if (cmd === 'Component.Set') {
          return Promise.resolve({
            result: [{ Name: 'mute', Result: 'OK' }]
          });
        }
        return Promise.resolve({ result: [] });
      });

      const result = await tool.execute({
        controls: [
          { name: '\t Audio Mixer.mute \n', value: true }  // Tabs and newlines
        ],
        validate: true  // With validation
      }, mockContext);

      const response = JSON.parse(result.content[0].text);
      expect(response[0]).toMatchObject({
        name: 'Audio Mixer.mute',
        success: true
      });
    });
  });

  describe('BUG FIX: Improved error messages for format issues', () => {
    it('should provide clear error for empty component name', async () => {
      (mockControlSystem.sendCommand as Mock).mockResolvedValue({
        result: []
      });

      const result = await tool.execute({
        controls: [
          { name: '.controlName', value: 1 }  // Missing component
        ],
        validate: true
      }, mockContext);

      const response = JSON.parse(result.content[0].text);
      expect(response[0]).toMatchObject({
        success: false,
        error: expect.stringContaining('Invalid control name format')
      });
      expect(response[0].error).toContain('ComponentName.controlName');
    });

    it('should provide clear error for empty control name', async () => {
      (mockControlSystem.sendCommand as Mock).mockResolvedValue({
        result: []
      });

      const result = await tool.execute({
        controls: [
          { name: 'Component.', value: 1 }  // Missing control name
        ],
        validate: true
      }, mockContext);

      const response = JSON.parse(result.content[0].text);
      expect(response[0]).toMatchObject({
        success: false,
        error: expect.stringContaining('Invalid control name format')
      });
    });

    it('should provide specific error messages for validation failures', async () => {
      (mockControlSystem.sendCommand as Mock).mockImplementation((cmd, params) => {
        console.log('Mock received command:', cmd, 'with params:', params);
        if (cmd === 'Component.GetControls') {
          if (params.Name === 'RealComponent') {
            const response = {
              result: {
                Controls: [{ Name: 'existingControl' }]
              }
            };
            console.log('Returning controls for RealComponent:', response);
            return Promise.resolve(response);
          }
          // Component doesn't exist
          const errorResponse = {
            error: { code: -1, message: 'Component not found' }
          };
          console.log('Returning error for unknown component:', errorResponse);
          return Promise.resolve(errorResponse);
        }
        console.log('Returning empty result for command:', cmd);
        return Promise.resolve({ result: [] });
      });

      const result = await tool.execute({
        controls: [
          { name: 'FakeComponent.anyControl', value: 1 },
          { name: 'RealComponent.fakeControl', value: 2 }
        ],
        validate: true
      }, mockContext);

      const response = JSON.parse(result.content[0].text);
      console.log('Test response:', JSON.stringify(response, null, 2));
      
      // Component not found error
      expect(response[0]).toMatchObject({
        name: 'FakeComponent.anyControl',
        success: false,
        error: expect.stringContaining('Component not found')
      });
      
      // Control not found error  
      expect(response[1]).toMatchObject({
        name: 'RealComponent.fakeControl',
        success: false,
        error: expect.stringContaining("Control 'fakeControl' not found on component 'RealComponent'")
      });
    });
  });

  describe('Edge cases and combined scenarios', () => {
    it('should handle mixed component and named controls with validate:false', async () => {
      // Q-SYS behavior: controls not in response are assumed successful
      (mockControlSystem.sendCommand as Mock).mockImplementation((cmd, params) => {
        if (cmd === 'Component.Set') {
          return Promise.resolve({
            result: params.Controls
              .filter((c: any) => c.Name === 'validControl')
              .map((c: any) => ({ Name: c.Name, Result: 'OK' }))
          });
        }
        if (cmd === 'Control.Set') {
          return Promise.resolve({
            result: params.Controls
              .filter((c: any) => c.Name === 'NamedControl')
              .map((c: any) => ({ Name: c.Name, Result: 'OK' }))
          });
        }
        return Promise.resolve({ result: [] });
      });

      const result = await tool.execute({
        controls: [
          { name: 'Component.validControl', value: 1 },
          { name: 'Component.otherControl', value: 2 },
          { name: 'NamedControl', value: 3 },
          { name: 'OtherNamed', value: 4 }
        ],
        validate: false
      }, mockContext);

      const response = JSON.parse(result.content[0].text);
      
      expect(response).toHaveLength(4);
      // All controls succeed per Q-SYS behavior
      expect(response[0].success).toBe(true);  // Explicit OK response
      expect(response[1].success).toBe(true);  // Not in response = success
      expect(response[2].success).toBe(true);  // Explicit OK response  
      expect(response[3].success).toBe(true);  // Not in response = success
    });

    it('should preserve ramp parameter in responses', async () => {
      (mockControlSystem.sendCommand as Mock).mockResolvedValue({
        result: [{ Name: 'gain', Result: 'OK' }]
      });

      const result = await tool.execute({
        controls: [
          { name: 'Mixer.gain', value: -6, ramp: 2.5 }
        ],
        validate: false
      }, mockContext);

      const response = JSON.parse(result.content[0].text);
      expect(response[0]).toMatchObject({
        name: 'Mixer.gain',
        value: -6,
        success: true,
        rampTime: 2.5
      });
    });
  });
});