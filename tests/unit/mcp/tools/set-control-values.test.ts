import { SetControlValuesTool } from '../../../../src/mcp/tools/controls.js';
import type { IControlSystem } from '../../../../src/mcp/interfaces/control-system.js';
import type { ToolExecutionContext } from '../../../../src/mcp/tools/base.js';

describe('SetControlValuesTool', () => {
  let mockControlSystem: jest.Mocked<IControlSystem>;
  let tool: SetControlValuesTool;
  let mockContext: ToolExecutionContext;

  beforeEach(() => {
    mockControlSystem = {
      sendCommand: jest.fn(),
    } as unknown as jest.Mocked<IControlSystem>;

    tool = new SetControlValuesTool(mockControlSystem);
    
    mockContext = {
      requestId: 'test-123',
      sessionId: 'session-456',
      timestamp: new Date(),
    };
  });

  describe('Component.Set command', () => {
    it('should successfully set control values using Component.Set', async () => {
      // Mock validation response
      mockControlSystem.sendCommand.mockImplementation(async (command, params) => {
        if (command === 'Component.GetControls') {
          return {
            jsonrpc: '2.0',
            id: 1,
            result: {
              Name: 'Main Output Gain',
              Controls: [
                { Name: 'gain', Type: 'Float', Value: 0, String: '0.0dB' },
                { Name: 'mute', Type: 'Boolean', Value: 0, String: 'unmuted' }
              ]
            }
          };
        }
        if (command === 'Component.Set') {
          // Verify correct format is sent
          expect(params).toEqual({
            Name: 'Main Output Gain',
            Controls: [
              { Name: 'gain', Value: -10 },
              { Name: 'mute', Value: 1 }
            ]
          });
          
          return {
            jsonrpc: '2.0',
            id: 2,
            result: [
              { Name: 'Main Output Gain.gain', Result: 'Success' },
              { Name: 'Main Output Gain.mute', Result: 'Success' }
            ]
          };
        }
        return { error: { code: -1, message: 'Unknown command' } };
      });

      const result = await tool['executeInternal']({
        controls: [
          { name: 'Main Output Gain.gain', value: -10 },
          { name: 'Main Output Gain.mute', value: true }
        ],
        validate: true
      }, mockContext);

      expect(result.isError).toBe(false);
      expect(mockControlSystem.sendCommand).toHaveBeenCalledWith(
        'Component.Set',
        expect.objectContaining({
          Name: 'Main Output Gain',
          Controls: expect.arrayContaining([
            expect.objectContaining({ Name: 'gain', Value: -10 }),
            expect.objectContaining({ Name: 'mute', Value: 1 })
          ])
        })
      );
      
      // Parse the JSON response
      const response = JSON.parse(result.content[0].text);
      expect(response).toEqual([
        { name: 'Main Output Gain.gain', value: -10, success: true },
        { name: 'Main Output Gain.mute', value: true, success: true }
      ]);
    });

    it('should handle mixed named and component controls', async () => {
      mockControlSystem.sendCommand.mockImplementation(async (command, params) => {
        if (command === 'Component.GetControls') {
          return {
            jsonrpc: '2.0',
            id: 1,
            result: {
              Name: params.Name,
              Controls: [
                { Name: 'gain', Type: 'Float', Value: 0, String: '0.0dB' }
              ]
            }
          };
        }
        if (command === 'Control.Get') {
          return {
            jsonrpc: '2.0',
            id: 2,
            result: {
              Name: params.Name,
              Value: 0,
              String: '0.0'
            }
          };
        }
        if (command === 'Control.Set') {
          return {
            jsonrpc: '2.0',
            id: 3,
            result: { success: true }
          };
        }
        if (command === 'Component.Set') {
          return {
            jsonrpc: '2.0',
            id: 4,
            result: [
              { Name: `${params.Name}.gain`, Result: 'Success' }
            ]
          };
        }
        return { error: { code: -1, message: 'Unknown command' } };
      });

      const result = await tool['executeInternal']({
        controls: [
          { name: 'Main.gain', value: -5 },  // Component control
          { name: 'GlobalMute', value: false } // Named control
        ],
        validate: true
      }, mockContext);

      expect(result.isError).toBe(false);
      
      // Should call Component.Set for component control
      expect(mockControlSystem.sendCommand).toHaveBeenCalledWith(
        'Component.Set',
        expect.objectContaining({
          Name: 'Main',
          Controls: expect.arrayContaining([
            expect.objectContaining({ Name: 'gain', Value: -5 })
          ])
        })
      );
      
      // Should call Control.Set for named control
      expect(mockControlSystem.sendCommand).toHaveBeenCalledWith(
        'Control.Set',
        expect.objectContaining({
          Name: 'GlobalMute',
          Value: 0
        })
      );
    });

    it('should handle errors from Component.Set', async () => {
      mockControlSystem.sendCommand.mockImplementation(async (command) => {
        if (command === 'Component.GetControls') {
          return {
            jsonrpc: '2.0',
            id: 1,
            result: {
              Name: 'TestComponent',
              Controls: [
                { Name: 'test', Type: 'Float', Value: 0, String: '0' }
              ]
            }
          };
        }
        if (command === 'Component.Set') {
          return {
            jsonrpc: '2.0',
            id: 2,
            result: [
              { Name: 'TestComponent.test', Result: 'Error', Error: 'Control is read-only' }
            ]
          };
        }
        return { error: { code: -1, message: 'Unknown command' } };
      });

      const result = await tool['executeInternal']({
        controls: [
          { name: 'TestComponent.test', value: 42 }
        ],
        validate: true
      }, mockContext);

      // Should report the error but not throw
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response[0]).toEqual({
        name: 'TestComponent.test',
        value: 42,
        success: false,
        error: 'Control is read-only'
      });
    });

    it('should skip validation when validate is false', async () => {
      mockControlSystem.sendCommand.mockImplementation(async (command) => {
        if (command === 'Component.Set') {
          return {
            jsonrpc: '2.0',
            id: 1,
            result: [
              { Name: 'Quick.control', Result: 'Success' }
            ]
          };
        }
        throw new Error('Should not call validation commands');
      });

      const result = await tool['executeInternal']({
        controls: [
          { name: 'Quick.control', value: 100 }
        ],
        validate: false // Skip validation
      }, mockContext);

      expect(result.isError).toBe(false);
      // Should NOT call Component.GetControls for validation
      expect(mockControlSystem.sendCommand).not.toHaveBeenCalledWith(
        'Component.GetControls',
        expect.anything()
      );
      // Should call Component.Set directly
      expect(mockControlSystem.sendCommand).toHaveBeenCalledWith(
        'Component.Set',
        expect.anything()
      );
    });

    it('should handle ramp time parameter', async () => {
      mockControlSystem.sendCommand.mockImplementation(async (command, params) => {
        if (command === 'Component.GetControls') {
          return {
            jsonrpc: '2.0',
            id: 1,
            result: {
              Name: 'Fader',
              Controls: [
                { Name: 'level', Type: 'Float', Value: 0, String: '0.0dB' }
              ]
            }
          };
        }
        if (command === 'Component.Set') {
          // Verify ramp time is included
          expect(params.Controls[0]).toHaveProperty('Ramp', 2.5);
          
          return {
            jsonrpc: '2.0',
            id: 2,
            result: [
              { Name: 'Fader.level', Result: 'Success' }
            ]
          };
        }
        return { error: { code: -1, message: 'Unknown command' } };
      });

      const result = await tool['executeInternal']({
        controls: [
          { name: 'Fader.level', value: -20, ramp: 2.5 }
        ],
        validate: true
      }, mockContext);

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response[0]).toEqual({
        name: 'Fader.level',
        value: -20,
        success: true,
        rampTime: 2.5
      });
    });
  });

  describe('boolean value conversion', () => {
    it('should convert boolean true to 1 and false to 0', async () => {
      mockControlSystem.sendCommand.mockImplementation(async (command, params) => {
        if (command === 'Component.GetControls') {
          return {
            jsonrpc: '2.0',
            id: 1,
            result: {
              Name: 'Mixer',
              Controls: [
                { Name: 'mute1', Type: 'Boolean', Value: 0, String: 'unmuted' },
                { Name: 'mute2', Type: 'Boolean', Value: 0, String: 'unmuted' }
              ]
            }
          };
        }
        if (command === 'Component.Set') {
          // Verify booleans are converted to numbers
          expect(params.Controls).toEqual([
            { Name: 'mute1', Value: 1 }, // true -> 1
            { Name: 'mute2', Value: 0 }  // false -> 0
          ]);
          
          return {
            jsonrpc: '2.0',
            id: 2,
            result: [
              { Name: 'Mixer.mute1', Result: 'Success' },
              { Name: 'Mixer.mute2', Result: 'Success' }
            ]
          };
        }
        return { error: { code: -1, message: 'Unknown command' } };
      });

      const result = await tool['executeInternal']({
        controls: [
          { name: 'Mixer.mute1', value: true },
          { name: 'Mixer.mute2', value: false }
        ],
        validate: true
      }, mockContext);

      expect(result.isError).toBe(false);
    });

    it('should convert string boolean values', async () => {
      mockControlSystem.sendCommand.mockImplementation(async (command, params) => {
        if (command === 'Component.GetControls') {
          return {
            jsonrpc: '2.0',
            id: 1,
            result: {
              Name: 'Switch',
              Controls: [
                { Name: 'state', Type: 'Boolean', Value: 0, String: 'off' }
              ]
            }
          };
        }
        if (command === 'Component.Set') {
          // Verify string "true" is converted to 1
          expect(params.Controls[0].Value).toBe(1);
          
          return {
            jsonrpc: '2.0',
            id: 2,
            result: [
              { Name: 'Switch.state', Result: 'Success' }
            ]
          };
        }
        return { error: { code: -1, message: 'Unknown command' } };
      });

      const result = await tool['executeInternal']({
        controls: [
          { name: 'Switch.state', value: 'true' }
        ],
        validate: true
      }, mockContext);

      expect(result.isError).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle component not found error', async () => {
      mockControlSystem.sendCommand.mockImplementation(async (command) => {
        if (command === 'Component.GetControls') {
          throw new Error('Component not found: NonExistent');
        }
        return { error: { code: -1, message: 'Unknown command' } };
      });

      const result = await tool['executeInternal']({
        controls: [
          { name: 'NonExistent.control', value: 50 }
        ],
        validate: true
      }, mockContext);

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response[0]).toMatchObject({
        name: 'NonExistent.control',
        success: false,
        error: expect.stringContaining('Component not found')
      });
    });

    it('should handle control not found in component', async () => {
      mockControlSystem.sendCommand.mockImplementation(async (command) => {
        if (command === 'Component.GetControls') {
          return {
            jsonrpc: '2.0',
            id: 1,
            result: {
              Name: 'Existing',
              Controls: [
                { Name: 'valid', Type: 'Float', Value: 0, String: '0' }
              ]
            }
          };
        }
        return { error: { code: -1, message: 'Unknown command' } };
      });

      const result = await tool['executeInternal']({
        controls: [
          { name: 'Existing.invalid', value: 50 }
        ],
        validate: true
      }, mockContext);

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response[0]).toMatchObject({
        name: 'Existing.invalid',
        success: false,
        error: expect.stringContaining("Control 'invalid' not found")
      });
    });
  });
});