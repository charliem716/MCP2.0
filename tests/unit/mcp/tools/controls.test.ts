import { 
  ListControlsTool, 
  GetControlValuesTool, 
  SetControlValuesTool 
} from '../../../../src/mcp/tools/controls.js';
import { globalLogger } from '../../../../src/shared/utils/logger.js';

jest.mock('../../../../src/shared/utils/logger.js', () => ({
  globalLogger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }
}));

describe('ListControlsTool', () => {
  let mockQrwcClient: any;
  let tool: ListControlsTool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQrwcClient = {
      sendCommand: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true)
    };
    tool = new ListControlsTool(mockQrwcClient);
    // @ts-ignore - accessing private property for testing
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
        result: [
          {
            Name: 'MainMixer.input.1.gain',
            Component: 'MainMixer',
            Value: -12.5,
            Properties: {
              MinValue: -100,
              MaxValue: 20,
              Units: 'dB',
              Step: 0.1
            }
          },
          {
            Name: 'MainMixer.input.1.mute',
            Component: 'MainMixer',
            Value: false,
            Properties: {
              ValueType: 'Boolean'
            }
          },
          {
            Name: 'ZoneAmpControl.output.1.gain',
            Value: -6.0,
            Properties: {
              MinValue: -80,
              MaxValue: 12,
              Units: 'dB',
              Step: 0.5
            }
          }
        ]
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({});
      
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Component.GetAllControls', {});
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('Found 3 controls');
      expect(result.content[0].text).toContain('MainMixer.input.1.gain (gain): -12.5');
      expect(result.content[0].text).toContain('MainMixer.input.1.mute (mute): false');
      expect(result.content[0].text).toContain('ZoneAmpControl.output.1.gain (gain): -6');
    });

    it('should handle empty response gracefully', async () => {
      const mockResponse = {
        result: []
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({});
      
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('No controls found');
    });

    it('should handle missing result property', async () => {
      const mockResponse = {};

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({});
      
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('No controls found');
    });

    it('should apply component filter correctly', async () => {
      const mockResponse = {
        result: [
          {
            Name: 'MainMixer.input.1.gain',
            Component: 'MainMixer',
            Value: -12.5
          },
          {
            Name: 'ZoneAmpControl.output.1.gain',
            Component: 'ZoneAmpControl',
            Value: -6.0
          }
        ]
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({ component: 'MainMixer' });
      
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Component.GetControls', { Name: 'MainMixer' });
      expect(result.content[0].text).toContain('Found 1 control');
      expect(result.content[0].text).toContain('MainMixer.input.1.gain');
      expect(result.content[0].text).not.toContain('ZoneAmpControl');
    });

    it('should apply control type filter correctly', async () => {
      const mockResponse = {
        result: [
          {
            Name: 'MainMixer.input.1.gain',
            Component: 'MainMixer',
            Value: -12.5,
            Properties: { Units: 'dB' }
          },
          {
            Name: 'MainMixer.input.1.mute',
            Component: 'MainMixer',
            Value: false,
            Properties: { ValueType: 'Boolean' }
          }
        ]
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({ controlType: 'gain' });
      
      expect(result.content[0].text).toContain('Found 1 control');
      expect(result.content[0].text).toContain('gain');
      expect(result.content[0].text).not.toContain('mute');
    });

    it('should include metadata when requested', async () => {
      const mockResponse = {
        result: [
          {
            Name: 'MainMixer.input.1.gain',
            Component: 'MainMixer',
            Value: -12.5,
            Properties: {
              MinValue: -100,
              MaxValue: 20,
              Units: 'dB',
              Step: 0.1
            }
          }
        ]
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({ includeMetadata: true });
      
      expect(result.content[0].text).toContain('Metadata:');
      expect(result.content[0].text).toContain('min: -100');
      expect(result.content[0].text).toContain('max: 20');
      expect(result.content[0].text).toContain('units: dB');
      expect(result.content[0].text).toContain('step: 0.1');
    });

    it('should infer control type from name patterns', async () => {
      const mockResponse = {
        result: [
          { Name: 'Device.some_gain_control', Value: 0 },
          { Name: 'Device.mute_button', Value: false },
          { Name: 'Device.input_select', Value: 1 },
          { Name: 'Device.output_select', Value: 2 },
          { Name: 'Device.unknown_control', Value: 'test' }
        ]
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({});
      
      expect(result.content[0].text).toContain('some_gain_control (gain)');
      expect(result.content[0].text).toContain('mute_button (mute)');
      expect(result.content[0].text).toContain('input_select (input_select)');
      expect(result.content[0].text).toContain('output_select (output_select)');
      expect(result.content[0].text).toContain('unknown_control (unknown)');
    });

    it('should extract component name from control name when not provided', async () => {
      const mockResponse = {
        result: [
          { Name: 'DeviceA.control1', Value: 0 },
          { Name: 'DeviceB.sub.control2', Value: 1 }
        ]
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({});
      
      // Check that component names were extracted correctly
      expect(result.content[0].text).toContain('DeviceA.control1');
      expect(result.content[0].text).toContain('DeviceB.sub.control2');
    });
  });

  // Edge cases for 100% coverage
  describe('error paths and edge cases', () => {
    it('should log and throw error when sendCommand fails', async () => {
      const error = new Error('Network failure');
      mockQrwcClient.sendCommand.mockRejectedValueOnce(error);

      const result = await tool.execute({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Network failure');
    });

    it('should handle control without component prefix', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: [
          { Name: 'SimpleControl', Value: 1 } // No dot in name
        ]
      });

      const result = await tool.execute({ component: 'TestComponent' });
      expect(result.content[0].text).toContain('Found 1 control'); // Not filtered when no dot
    });

    it('should handle Position property edge cases', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: [
          { Name: 'Control1', Value: 0, Position: null },
          { Name: 'Control2', Value: 1, Position: undefined },
          { Name: 'Control3', Value: 2 } // No Position property
        ]
      });

      const result = await tool.execute({});
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('Found 3 controls');
    });
  });
});

describe('GetControlValuesTool', () => {
  let mockQrwcClient: any;
  let tool: GetControlValuesTool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQrwcClient = {
      sendCommand: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true)
    };
    tool = new GetControlValuesTool(mockQrwcClient);
    // @ts-ignore - accessing private property for testing
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
        { Name: 'MainMixer.mute', Value: false, String: 'Off' }
      ]
    };

    mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

    const result = await tool.execute({ controls: ['MainMixer.gain', 'MainMixer.mute'] });
    
    expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Control.GetValues', {
      Names: ['MainMixer.gain', 'MainMixer.mute']
    });
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('MainMixer.gain: -12.5');
    expect(result.content[0].text).toContain('MainMixer.mute: false');
  });

  it('should handle missing controls gracefully', async () => {
    const mockResponse = {
      result: [
        { Name: 'MainMixer.gain', Value: -12.5 }
      ]
    };

    mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

    const result = await tool.execute({ 
      controls: ['MainMixer.gain', 'NonExistent.control'] 
    });
    
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('MainMixer.gain: -12.5');
    expect(result.content[0].text).toContain('NonExistent.control: N/A');
  });

  // Edge cases for 100% coverage
  describe('edge cases', () => {
    it('should handle undefined/null in response', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: [
          { Name: 'Control1', Value: null, String: null },
          { Name: 'Control2' } // Missing Value and String
        ]
      });

      const result = await tool.execute({ controls: ['Control1', 'Control2'] });
      expect(result.content[0].text).toContain('Control1: null');
      expect(result.content[0].text).toContain('Control2:');
    });
  });
});

describe('SetControlValuesTool', () => {
  let mockQrwcClient: any;
  let tool: SetControlValuesTool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQrwcClient = {
      sendCommand: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true)
    };
    tool = new SetControlValuesTool(mockQrwcClient);
    // @ts-ignore - accessing private property for testing
    tool.logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
  });

  it('should set named control values successfully', async () => {
    mockQrwcClient.sendCommand.mockResolvedValue({ success: true });

    const result = await tool.execute({ 
      controls: [
        { name: 'MainGain', value: -10 },
        { name: 'MainMute', value: true }
      ]
    });
    
    expect(mockQrwcClient.sendCommand).toHaveBeenCalledTimes(2);
    expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Control.Set', {
      Name: 'MainGain',
      Value: -10
    });
    expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Control.Set', {
      Name: 'MainMute',
      Value: true
    });
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('✓ MainGain: -10');
    expect(result.content[0].text).toContain('✓ MainMute: true');
    expect(result.content[0].text).toContain('Set 2/2 controls successfully');
  });

  it('should set component control values successfully', async () => {
    mockQrwcClient.sendCommand.mockResolvedValue({ success: true });

    const result = await tool.execute({ 
      controls: [
        { name: 'Main Output Gain.gain', value: -10 },
        { name: 'Main Output Gain.mute', value: true }
      ]
    });
    
    // Should batch controls by component
    expect(mockQrwcClient.sendCommand).toHaveBeenCalledTimes(1);
    expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Component.Set', {
      Name: 'Main Output Gain',
      Controls: [
        { Name: 'gain', Value: -10 },
        { Name: 'mute', Value: true }
      ]
    });
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('✓ Main Output Gain.gain: -10');
    expect(result.content[0].text).toContain('✓ Main Output Gain.mute: true');
    expect(result.content[0].text).toContain('Set 2/2 controls successfully');
  });

  it('should handle ramp parameter for component controls', async () => {
    mockQrwcClient.sendCommand.mockResolvedValue({ success: true });

    const result = await tool.execute({ 
      controls: [
        { name: 'Main Output Gain.gain', value: -5, ramp: 2.5 }
      ]
    });
    
    expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Component.Set', {
      Name: 'Main Output Gain',
      Controls: [
        { Name: 'gain', Value: -5, Ramp: 2.5 }
      ]
    });
    expect(result.content[0].text).toContain('✓ Main Output Gain.gain: -5 (ramped over 2.5s)');
  });

  it('should handle mixed named and component controls', async () => {
    mockQrwcClient.sendCommand.mockResolvedValue({ success: true });

    const result = await tool.execute({ 
      controls: [
        { name: 'MainGain', value: -10 },  // Named control
        { name: 'Main Output Gain.gain', value: -5 },  // Component control
        { name: 'Main Output Gain.mute', value: true }  // Component control
      ]
    });
    
    // Should make 2 calls: 1 for named control, 1 for component controls
    expect(mockQrwcClient.sendCommand).toHaveBeenCalledTimes(2);
    
    // Named control call
    expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Control.Set', {
      Name: 'MainGain',
      Value: -10
    });
    
    // Component controls batched together
    expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Component.Set', {
      Name: 'Main Output Gain',
      Controls: [
        { Name: 'gain', Value: -5 },
        { Name: 'mute', Value: true }
      ]
    });
    
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('Set 3/3 controls successfully');
  });

  it('should handle partial failures', async () => {
    mockQrwcClient.sendCommand
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('Control not found'));

    const result = await tool.execute({ 
      controls: [
        { name: 'Main Output Gain.gain', value: -10 },
        { name: 'Invalid.control', value: 0 }
      ]
    });
    
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('✓ Main Output Gain.gain: -10');
    expect(result.content[0].text).toContain('✗ Invalid.control: Failed');
    expect(result.content[0].text).toContain('Set 1/2 controls successfully');
  });

  // BUG-025 regression tests
  describe('BUG-025: Command type selection', () => {
    it('should use Control.Set for named controls', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({ success: true });

      await tool.execute({ 
        controls: [{ name: 'TestControl', value: 50 }]
      });
      
      // Verify the correct command for named controls
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'Control.Set',
        {
          Name: 'TestControl',
          Value: 50
        }
      );
    });

    it('should use Component.Set for component controls', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({ success: true });

      await tool.execute({ 
        controls: [{ name: 'TestComponent.testControl', value: 50 }]
      });
      
      // Verify the correct command for component controls
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'Component.Set',
        {
          Name: 'TestComponent',
          Controls: [
            { Name: 'testControl', Value: 50 }
          ]
        }
      );
    });

    it('should pass ramp parameter correctly for both control types', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({ success: true });

      await tool.execute({ 
        controls: [
          { name: 'FaderControl', value: -6, ramp: 1.5 },
          { name: 'Mixer.fader', value: -3, ramp: 2.0 }
        ]
      });
      
      // Named control with ramp
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'Control.Set',
        {
          Name: 'FaderControl',
          Value: -6,
          Ramp: 1.5
        }
      );
      
      // Component control with ramp
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'Component.Set',
        {
          Name: 'Mixer',
          Controls: [
            { Name: 'fader', Value: -3, Ramp: 2.0 }
          ]
        }
      );
    });
  });

  // Edge cases for 100% coverage
  describe('error handling and edge cases', () => {
    it('should handle error during command preparation', async () => {
      // Pass invalid control structure to trigger error in prepareCommand
      const result = await tool.execute({
        controls: [
          { name: null as any, value: 1 } // Invalid name
        ]
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Parameter validation failed');
    });

    it('should handle component controls with dot notation edge case', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({ id: '123' });

      await tool.execute({
        controls: [
          { name: 'Comp.Sub.control', value: 1 } // Multiple dots
        ]
      });

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'Component.Set',
        expect.objectContaining({
          Name: 'Comp',
          Controls: expect.arrayContaining([
            expect.objectContaining({ Name: 'Sub.control' })
          ])
        })
      );
    });

    it('should catch and format non-Error exceptions', async () => {
      mockQrwcClient.sendCommand.mockImplementationOnce(() => {
        throw 'String exception'; // Non-Error throw
      });

      const result = await tool.execute({
        controls: [{ name: 'Test', value: 1 }]
      });

      expect(result.content[0].text).toContain('Failed - String exception');
    });
  });
});

// BUG-055 regression tests for ListControlsTool
describe('ListControlsTool - BUG-055 regression', () => {
  let mockQrwcClient: any;
  let tool: ListControlsTool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQrwcClient = {
      sendCommand: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true)
    };
    tool = new ListControlsTool(mockQrwcClient);
  });

  it('should handle undefined result gracefully', async () => {
    // Mock response with undefined result
    mockQrwcClient.sendCommand.mockResolvedValueOnce({
      result: undefined
    });

    const result = await tool.execute({ component: 'test' });
    
    expect(result.isError).toBe(false);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('[]');
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
            Type: 'float'
          }
        ]
      }
    });

    const result = await tool.execute({ component: 'TestComponent' });
    
    expect(result.isError).toBe(false);
    const responseText = result.content[0].text;
    expect(responseText).toContain('TestComponent');
    expect(responseText).toContain('Volume');
  });
});