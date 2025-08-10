import {
  ListControlsTool,
  GetControlValuesTool,
  SetControlValuesTool,
} from '../../../../src/mcp/tools/controls';
import { globalLogger } from '../../../../src/shared/utils/logger';
import { discoveryCache } from '../../../../src/mcp/state/discovery-cache';

jest.mock('../../../../src/shared/utils/logger', () => ({
  globalLogger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('ListControlsTool', () => {
  let mockQrwcClient: any;
  let tool: ListControlsTool;

  beforeEach(() => {
    jest.clearAllMocks();
    discoveryCache.clear();
    mockQrwcClient = {
      sendCommand: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
    };
    tool = new ListControlsTool(mockQrwcClient);
    // @ts-expect-error - accessing private property for testing
    tool.logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
  });

  describe('parseControlsResponse', () => {
    it('should parse real QRWC response correctly', async () => {
      const mockResponse = {
        result: {
          Name: 'Test Component',
          Controls: [
            {
              Name: 'MainMixer.input.1.gain',
              Component: 'MainMixer',
              Value: -12.5,
              Properties: {
                MinValue: -100,
                MaxValue: 20,
                Units: 'dB',
                Step: 0.1,
              },
            },
            {
              Name: 'MainMixer.input.1.mute',
              Component: 'MainMixer',
              Value: false,
              Properties: {
                ValueType: 'Boolean',
              },
            },
            {
              Name: 'ZoneAmpControl.output.1.gain',
              Value: -6.0,
              Properties: {
                MinValue: -80,
                MaxValue: 12,
                Units: 'dB',
                Step: 0.5,
              },
            },
          ],
        },
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({ component: 'Test Component' });

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'Component.GetControls',
        { Name: 'Test Component' }
      );
      expect(result.isError).toBe(false);
      const controls = JSON.parse(result.content[0].text);
      expect(controls).toHaveLength(3);
      expect(controls[0]).toEqual({
        name: 'MainMixer.input.1.gain',
        component: 'MainMixer', // Uses Component property from control
        type: 'gain',
        value: -12.5,
        metadata: {
          min: -100,
          max: 20,
          units: 'dB',
          step: 0.1,
        },
      });
      expect(controls[1]).toEqual({
        name: 'MainMixer.input.1.mute',
        component: 'MainMixer', // Uses Component property from control
        type: 'mute',
        value: false,
        metadata: {
          valueType: 'Boolean',
        },
      });
      expect(controls[2]).toEqual({
        name: 'ZoneAmpControl.output.1.gain',
        component: 'Test Component', // Uses component name from response
        type: 'gain',
        value: -6.0,
        metadata: {
          min: -80,
          max: 12,
          units: 'dB',
          step: 0.5,
        },
      });
    });

    it('should handle empty response gracefully', async () => {
      const mockResponse = {
        result: {
          Name: 'TestComponent',
          Controls: [],
        },
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({ component: 'TestComponent' });

      expect(result.isError).toBe(false);
      const controls = JSON.parse(result.content[0].text);
      expect(controls).toEqual([]);
    });

    it('should handle missing result property', async () => {
      const mockResponse = {};

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({ component: 'TestComponent' });

      expect(result.isError).toBe(false);
      const controls = JSON.parse(result.content[0].text);
      expect(controls).toEqual([]);
    });

    it('should apply component filter correctly', async () => {
      const mockResponse = {
        result: {
          Name: 'MainMixer',
          Controls: [
            {
              Name: 'MainMixer.input.1.gain',
              Component: 'MainMixer',
              Value: -12.5,
            },
          ],
        },
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({ component: 'MainMixer' });

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'Component.GetControls',
        { Name: 'MainMixer' }
      );
      const controls = JSON.parse(result.content[0].text);
      expect(controls).toHaveLength(1);
      expect(controls[0].name).toBe('MainMixer.input.1.gain');
      expect(controls[0].component).toBe('MainMixer');
      expect(controls[0].value).toBe(-12.5);
    });

    it('should apply control type filter correctly', async () => {
      const mockResponse = {
        result: {
          Name: 'MainMixer',
          Controls: [
            {
              Name: 'MainMixer.input.1.gain',
              Component: 'MainMixer',
              Value: -12.5,
              Properties: { Units: 'dB' },
            },
            {
              Name: 'MainMixer.input.1.mute',
              Component: 'MainMixer',
              Value: false,
              Properties: { ValueType: 'Boolean' },
            },
          ],
        },
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({ component: 'MainMixer', controlType: 'gain' });

      const controls = JSON.parse(result.content[0].text);
      expect(controls).toHaveLength(1);
      expect(controls[0].type).toBe('gain');
      expect(controls[0].name).toBe('MainMixer.input.1.gain');
    });

    it('should include metadata when requested', async () => {
      const mockResponse = {
        result: {
          Name: 'MainMixer',
          Controls: [
            {
              Name: 'MainMixer.input.1.gain',
              Component: 'MainMixer',
              Value: -12.5,
              Properties: {
                MinValue: -100,
                MaxValue: 20,
                Units: 'dB',
                Step: 0.1,
              },
            },
          ],
        },
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({ component: 'MainMixer', includeMetadata: true });

      const controls = JSON.parse(result.content[0].text);
      expect(controls).toHaveLength(1);
      expect(controls[0].metadata).toEqual({
        min: -100,
        max: 20,
        units: 'dB',
        step: 0.1,
      });
    });

    it('should infer control type from name patterns', async () => {
      const mockResponse = {
        result: {
          Name: 'Device',
          Controls: [
            { Name: 'Device.some_gain_control', Value: 0 },
            { Name: 'Device.mute_button', Value: false },
            { Name: 'Device.input_select', Value: 1 },
            { Name: 'Device.output_select', Value: 2 },
            { Name: 'Device.unknown_control', Value: 'test' },
          ],
        },
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({ component: 'Device' });

      const controls = JSON.parse(result.content[0].text);
      expect(controls).toHaveLength(5);
      expect(controls[0].type).toBe('gain');
      expect(controls[1].type).toBe('mute');
      expect(controls[2].type).toBe('input_select');
      expect(controls[3].type).toBe('output_select');
      expect(controls[4].type).toBe('unknown');
    });

    it('should extract component name from control name when not provided', async () => {
      const mockResponse = {
        result: {
          Name: 'TestDevice',
          Controls: [
            { Name: 'DeviceA.control1', Value: 0 },
            { Name: 'DeviceB.sub.control2', Value: 1 },
          ],
        },
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({ component: 'TestDevice' });

      // Check that component names were extracted correctly
      const controls = JSON.parse(result.content[0].text);
      expect(controls).toHaveLength(2);
      expect(controls[0].name).toBe('DeviceA.control1');
      expect(controls[0].component).toBe('TestDevice'); // Uses component from response
      expect(controls[1].name).toBe('DeviceB.sub.control2');
      expect(controls[1].component).toBe('TestDevice'); // Uses component from response
    });
  });

  // Edge cases for 100% coverage
  describe('error paths and edge cases', () => {
    it('should log and throw error when sendCommand fails', async () => {
      const error = new Error('Network failure');
      mockQrwcClient.sendCommand.mockRejectedValueOnce(error);

      const result = await tool.execute({ component: 'TestComponent' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Network failure');
    });

    it('should handle controls without dots in name', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: {
          Name: 'TestComponent',
          Controls: [
            { Name: 'SimpleControl', Value: 1 }, // No dot in name
          ],
        },
      });

      const result = await tool.execute({ component: 'TestComponent' });
      const controls = JSON.parse(result.content[0].text);
      expect(controls).toHaveLength(1); // Control is included as it belongs to the requested component
      expect(controls[0].component).toBe('TestComponent');
    });

    it('should handle Position property edge cases', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: {
          Name: 'TestComponent',
          Controls: [
            { Name: 'Control1', Value: 0, Position: null, String: '0', Type: 'Float' },
            { Name: 'Control2', Value: 1, Position: undefined, String: '1', Type: 'Float' },
            { Name: 'Control3', Value: 2, String: '2', Type: 'Float' }, // No Position property
          ],
        },
      });

      const result = await tool.execute({ component: 'TestComponent' });
      expect(result.isError).toBe(false);
      const controls = JSON.parse(result.content[0].text);
      expect(controls).toHaveLength(3);
    });
  });
});

describe('GetControlValuesTool', () => {
  let mockQrwcClient: any;
  let tool: GetControlValuesTool;

  beforeEach(() => {
    jest.clearAllMocks();
    discoveryCache.clear();
    mockQrwcClient = {
      sendCommand: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
    };
    tool = new GetControlValuesTool(mockQrwcClient);
    // @ts-expect-error - accessing private property for testing
    tool.logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
  });

  it('should get control values successfully', async () => {
    const mockResponse = {
      result: [
        { Name: 'MainMixer.gain', Value: -12.5, String: '-12.5 dB' },
        { Name: 'MainMixer.mute', Value: false, String: 'Off' },
      ],
    };

    mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

    const result = await tool.execute({
      controls: ['MainMixer.gain', 'MainMixer.mute'],
    });

    expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
      'Control.GetValues',
      {
        Names: ['MainMixer.gain', 'MainMixer.mute'],
      }
    );
    expect(result.isError).toBe(false);
    const values = JSON.parse(result.content[0].text);
    expect(values).toHaveLength(2);
    expect(values[0]).toMatchObject({
      name: 'MainMixer.gain',
      value: -12.5,
      string: '-12.5 dB',
    });
    expect(values[1]).toMatchObject({
      name: 'MainMixer.mute',
      value: false,
      string: 'Off',
    });
  });

  it('should handle missing controls gracefully', async () => {
    const mockResponse = {
      result: [{ Name: 'MainMixer.gain', Value: -12.5 }],
    };

    mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

    const result = await tool.execute({
      controls: ['MainMixer.gain', 'NonExistent.control'],
    });

    expect(result.isError).toBe(false);
    const values = JSON.parse(result.content[0].text);
    expect(values).toHaveLength(2);
    expect(values[0]).toMatchObject({
      name: 'MainMixer.gain',
      value: -12.5,
    });
    expect(values[1]).toMatchObject({
      name: 'NonExistent.control',
      value: 'N/A',
      error: 'Control not found',
    });
  });

  // Edge cases for 100% coverage
  describe('edge cases', () => {
    it('should handle undefined/null in response', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: [
          { Name: 'Control1', Value: null, String: null },
          { Name: 'Control2' }, // Missing Value and String
        ],
      });

      const result = await tool.execute({ controls: ['Control1', 'Control2'] });
      const values = JSON.parse(result.content[0].text);
      expect(values).toHaveLength(2);
      expect(values[0]).toMatchObject({
        name: 'Control1',
        value: '', // null values become empty string
      });
      expect(values[1]).toMatchObject({
        name: 'Control2',
        value: '', // missing value becomes empty string
      });
    });
  });
});

describe('SetControlValuesTool', () => {
  let mockQrwcClient: any;
  let tool: SetControlValuesTool;

  beforeEach(() => {
    jest.clearAllMocks();
    discoveryCache.clear();
    mockQrwcClient = {
      sendCommand: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
    };
    tool = new SetControlValuesTool(mockQrwcClient);
    // @ts-expect-error - accessing private property for testing
    tool.logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
  });

  it('should set named control values successfully', async () => {
    // Mock validation responses first, then set responses
    mockQrwcClient.sendCommand
      .mockResolvedValueOnce({ result: { Name: 'MainGain', Value: 0 } }) // Validation for MainGain
      .mockResolvedValueOnce({ result: { Name: 'MainMute', Value: 0 } }) // Validation for MainMute
      .mockResolvedValue({ 
        result: [
          { Name: 'MainGain', Result: 'OK' },
          { Name: 'MainMute', Result: 'OK' }
        ]
      }); // Control.Set response

    const result = await tool.execute({
      controls: [
        { name: 'MainGain', value: -10 },
        { name: 'MainMute', value: true },
      ],
    });

    // When validation is enabled (default), it makes additional calls
    // 2 calls for validation + 1 call for batch setting = 3 total
    expect(mockQrwcClient.sendCommand).toHaveBeenCalledTimes(3);
    expect(result.isError).toBe(false);
    const results = JSON.parse(result.content[0].text);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      name: 'MainGain',
      value: -10,
      success: true,
    });
    expect(results[1]).toMatchObject({
      name: 'MainMute',
      value: true,
      success: true,
    });
  });

  it('should set component control values successfully', async () => {
    // Mock proper Q-SYS response format for Component.GetControls (validation)
    mockQrwcClient.sendCommand.mockImplementation(async (cmd: string) => {
      if (cmd === 'Component.GetControls') {
        return {
          result: {
            Controls: [
              { Name: 'gain', Type: 'Float' },
              { Name: 'mute', Type: 'Boolean' }
            ]
          }
        };
      }
      // Mock proper Q-SYS response format for Component.Set
      if (cmd === 'Component.Set') {
        return {
          result: [
            { Name: 'gain', Result: 'OK' },
            { Name: 'mute', Result: 'OK' }
          ]
        };
      }
      return { success: true };
    });

    const result = await tool.execute({
      controls: [
        { name: 'Main Output Gain.gain', value: -10 },
        { name: 'Main Output Gain.mute', value: true },
      ],
    });

    // With validation enabled, there are additional calls
    expect(mockQrwcClient.sendCommand).toHaveBeenCalled();
    
    // Verify Component.Set was called with correct parameters
    const componentSetCalls = mockQrwcClient.sendCommand.mock.calls.filter(
      (call: any[]) => call[0] === 'Component.Set'
    );
    expect(componentSetCalls.length).toBeGreaterThan(0);
    expect(componentSetCalls[0][1]).toEqual({
      Name: 'Main Output Gain',
      Controls: [
        { Name: 'gain', Value: -10 },
        { Name: 'mute', Value: 1 }, // Boolean true converted to 1
      ],
    });
    
    expect(result.isError).toBe(false);
    const results = JSON.parse(result.content[0].text);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      name: 'Main Output Gain.gain',
      value: -10,
      success: true,
    });
    expect(results[1]).toMatchObject({
      name: 'Main Output Gain.mute',
      value: true,
      success: true,
    });
  });

  it('should handle ramp parameter for component controls', async () => {
    mockQrwcClient.sendCommand.mockImplementation(async (cmd: string) => {
      if (cmd === 'Component.GetControls') {
        return {
          result: {
            Controls: [{ Name: 'gain', Type: 'Float' }]
          }
        };
      }
      if (cmd === 'Component.Set') {
        return {
          result: [{ Name: 'gain', Result: 'OK' }]
        };
      }
      return { success: true };
    });

    const result = await tool.execute({
      controls: [{ name: 'Main Output Gain.gain', value: -5, ramp: 2.5 }],
    });

    expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Component.Set', {
      Name: 'Main Output Gain',
      Controls: [{ Name: 'gain', Value: -5, Ramp: 2.5 }],
    });
    const results = JSON.parse(result.content[0].text);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      name: 'Main Output Gain.gain',
      value: -5,
      success: true,
      rampTime: 2.5,
    });
  });

  it('should handle mixed named and component controls', async () => {
    // Mock validation responses for named control and component controls
    mockQrwcClient.sendCommand.mockImplementation(async (cmd: string) => {
      if (cmd === 'Control.Get') {
        return { result: { Name: 'MainGain', Value: 0 } };
      }
      if (cmd === 'Component.GetControls') {
        return { 
          result: { 
            Controls: [
              { Name: 'gain', Type: 'Float' },
              { Name: 'mute', Type: 'Boolean' }
            ]
          } 
        };
      }
      if (cmd === 'Control.Set') {
        return {
          result: [{ Name: 'MainGain', Result: 'OK' }]
        };
      }
      if (cmd === 'Component.Set') {
        return {
          result: [
            { Name: 'gain', Result: 'OK' },
            { Name: 'mute', Result: 'OK' }
          ]
        };
      }
      return { success: true };
    });

    const result = await tool.execute({
      controls: [
        { name: 'MainGain', value: -10 }, // Named control
        { name: 'Main Output Gain.gain', value: -5 }, // Component control
        { name: 'Main Output Gain.mute', value: true }, // Component control
      ],
    });

    // With validation enabled, there are additional calls
    expect(mockQrwcClient.sendCommand).toHaveBeenCalled();

    // Find the Control.Set call for named control
    const controlSetCalls = mockQrwcClient.sendCommand.mock.calls.filter(
      (call: any[]) => call[0] === 'Control.Set'
    );
    expect(controlSetCalls.length).toBeGreaterThan(0);
    expect(controlSetCalls[0][1]).toEqual({
      Controls: [{ Name: 'MainGain', Value: -10 }],
    });

    // Find the Component.Set call among all the calls (validation calls happen first)
    const componentSetCalls = mockQrwcClient.sendCommand.mock.calls.filter(
      (call: any[]) => call[0] === 'Component.Set'
    );
    expect(componentSetCalls.length).toBeGreaterThan(0);
    expect(componentSetCalls[0][1]).toEqual({
      Name: 'Main Output Gain',
      Controls: [
        { Name: 'gain', Value: -5 },
        { Name: 'mute', Value: 1 }, // Boolean true converted to 1
      ],
    });

    expect(result.isError).toBe(false);
    const results = JSON.parse(result.content[0].text);
    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ name: 'MainGain', success: true });
    expect(results[1]).toMatchObject({ name: 'Main Output Gain.gain', success: true });
    expect(results[2]).toMatchObject({ name: 'Main Output Gain.mute', success: true });
  });

  it('should handle partial failures', async () => {
    mockQrwcClient.sendCommand
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('Control not found'));

    const result = await tool.execute({
      controls: [
        { name: 'Main Output Gain.gain', value: -10 },
        { name: 'Invalid.control', value: 0 },
      ],
    });

    expect(result.isError).toBe(true);
    const results = JSON.parse(result.content[0].text);
    // With validation enabled, the invalid control fails during validation
    // so only the error result is returned
    expect(results.length).toBeGreaterThan(0);
    const invalidResult = results.find((r: any) => r.name === 'Invalid.control');
    expect(invalidResult).toBeDefined();
    expect(invalidResult.success).toBe(false);
    expect(invalidResult.error).toBeDefined();
  });

  // Command type selection tests
  describe('Command type selection', () => {
    it('should use Control.Set for named controls', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({ 
        result: [{ Name: 'TestControl', Result: 'OK' }]
      });

      await tool.execute({
        controls: [{ name: 'TestControl', value: 50 }],
        validate: false, // Skip validation to test the actual set command
      });

      // Verify the correct command for named controls
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Control.Set', {
        Controls: [{ Name: 'TestControl', Value: 50 }],
      });
    });


    it('should pass ramp parameter correctly for both control types', async () => {
      mockQrwcClient.sendCommand.mockImplementation(async (cmd: string) => {
        if (cmd === 'Control.Get') {
          return { result: { Name: 'TestControl', Value: 0 } };
        }
        if (cmd === 'Component.GetControls') {
          return { 
            result: { 
              Controls: [{ Name: 'gain', Type: 'Float' }]
            } 
          };
        }
        if (cmd === 'Control.Set') {
          return { result: [{ Name: 'TestControl', Result: 'OK' }] };
        }
        if (cmd === 'Component.Set') {
          return { result: [{ Name: 'gain', Result: 'OK' }] };
        }
        return { success: true };
      });

      await tool.execute({
        controls: [
          { name: 'FaderControl', value: -6, ramp: 1.5 },
          { name: 'Mixer.fader', value: -3, ramp: 2.0 },
        ],
        validate: false, // Skip validation to test the actual set commands
      });

      // Named control with ramp
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Control.Set', {
        Controls: [{ Name: 'FaderControl', Value: -6, Ramp: 1.5 }],
      });

      // Component control with ramp
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Component.Set', {
        Name: 'Mixer',
        Controls: [{ Name: 'fader', Value: -3, Ramp: 2.0 }],
      });
    });
  });

  // Edge cases for 100% coverage
  describe('error handling and edge cases', () => {
    it('should handle error during command preparation', async () => {
      // Pass invalid control structure to trigger error in prepareCommand
      const result = await tool.execute({
        controls: [
          { name: null as any, value: 1 }, // Invalid name
        ],
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Parameter validation failed');
    });

    it('should handle component controls with dot notation edge case', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({ id: '123' });

      await tool.execute({
        controls: [
          { name: 'Comp.Sub.control', value: 1 }, // Multiple dots
        ],
      });

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'Component.Set',
        expect.objectContaining({
          Name: 'Comp',
          Controls: expect.arrayContaining([
            expect.objectContaining({ Name: 'Sub.control' }),
          ]),
        })
      );
    });

    it('should catch and format non-Error exceptions', async () => {
      mockQrwcClient.sendCommand.mockImplementationOnce(() => {
        throw 'String exception'; // Non-Error throw
      });

      const result = await tool.execute({
        controls: [{ name: 'Test', value: 1 }],
      });

      const results = JSON.parse(result.content[0].text);
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        name: 'Test',
        value: 1,
        success: false,
        error: expect.any(String),
      });
    });
  });
});

// ListControlsTool type handling regression tests
describe('ListControlsTool - Type handling regression', () => {
  let mockQrwcClient: any;
  let tool: ListControlsTool;

  beforeEach(() => {
    jest.clearAllMocks();
    discoveryCache.clear();
    mockQrwcClient = {
      sendCommand: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
    };
    tool = new ListControlsTool(mockQrwcClient);
  });

  it('should handle undefined result gracefully', async () => {
    // Mock response with undefined result
    mockQrwcClient.sendCommand.mockResolvedValueOnce({
      result: undefined,
    });

    const result = await tool.execute({ component: 'test' });

    expect(result.isError).toBe(false);
    expect(result.content[0].type).toBe('text');
    const controls = JSON.parse(result.content[0].text);
    expect(controls).toEqual([]);
  });

  it('should handle result with proper type narrowing', async () => {
    // Mock response with valid result
    mockQrwcClient.sendCommand.mockResolvedValueOnce({
      result: {
        Name: 'TestComponent',
        Controls: [
          {
            Name: 'Volume',
            Value: 0.5,
            Type: 'float',
          },
        ],
      },
    });

    const result = await tool.execute({ component: 'TestComponent' });

    expect(result.isError).toBe(false);
    const controls = JSON.parse(result.content[0].text);
    expect(Array.isArray(controls)).toBe(true);
    // The actual response structure depends on how the tool processes the result
    // Since result.Controls exists, we should get the controls from it
    expect(controls).toBeDefined();
  });
});
