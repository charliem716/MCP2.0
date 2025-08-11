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

  describe('BUG FIX: validate:false should report actual Q-SYS failures', () => {
    it('should report failure when Q-SYS does not return a control in response', async () => {
      // Mock Q-SYS response that doesn't include the requested control
      // This happens when the control doesn't exist
      (mockControlSystem.sendCommand as Mock).mockResolvedValue({
        result: []  // Empty result means Q-SYS didn't process the control
      });

      const result = await tool.execute({
        controls: [
          { name: 'FakeComponent.fakeControl', value: 10 }
        ],
        validate: false  // Skip pre-validation
      }, mockContext);

      const response = JSON.parse(result.content[0].text);
      
      // Should report failure even with validate:false
      expect(response).toHaveLength(1);
      expect(response[0]).toMatchObject({
        name: 'FakeComponent.fakeControl',
        value: 10,
        success: false,
        error: expect.stringContaining('not found')
      });
    });

    it('should report success only for controls actually processed by Q-SYS', async () => {
      // Mock mixed response - only RealControl is processed
      (mockControlSystem.sendCommand as Mock).mockImplementation((cmd, params) => {
        if (cmd === 'Component.Set') {
          if (params.Name === 'RealComponent') {
            return Promise.resolve({
              result: [
                { Name: 'realControl', Result: 'OK' }
                // fakeControl is not in response - Q-SYS ignored it
              ]
            });
          }
        }
        return Promise.resolve({ result: [] });
      });

      const result = await tool.execute({
        controls: [
          { name: 'RealComponent.realControl', value: 5 },
          { name: 'RealComponent.fakeControl', value: 10 }
        ],
        validate: false
      }, mockContext);

      const response = JSON.parse(result.content[0].text);
      
      expect(response).toHaveLength(2);
      // Real control succeeds
      expect(response[0]).toMatchObject({
        name: 'RealComponent.realControl',
        success: true
      });
      // Fake control fails
      expect(response[1]).toMatchObject({
        name: 'RealComponent.fakeControl',
        success: false,
        error: expect.stringContaining('not found')
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
    it('should handle mixed valid and invalid controls with validate:false', async () => {
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
          { name: 'Component.invalidControl', value: 2 },
          { name: 'NamedControl', value: 3 },
          { name: 'InvalidNamed', value: 4 }
        ],
        validate: false
      }, mockContext);

      const response = JSON.parse(result.content[0].text);
      
      expect(response).toHaveLength(4);
      expect(response[0].success).toBe(true);  // Valid component control
      expect(response[1].success).toBe(false); // Invalid component control
      expect(response[2].success).toBe(true);  // Valid named control
      expect(response[3].success).toBe(false); // Invalid named control
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