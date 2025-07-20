import { 
  ListControlsTool, 
  GetControlValuesTool, 
  SetControlValuesTool 
} from '../../../../src/mcp/tools/controls.js';

describe('ListControlsTool', () => {
  let mockQrwcClient: any;
  let tool: ListControlsTool;

  beforeEach(() => {
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
});

describe('GetControlValuesTool', () => {
  let mockQrwcClient: any;
  let tool: GetControlValuesTool;

  beforeEach(() => {
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
});

describe('SetControlValuesTool', () => {
  let mockQrwcClient: any;
  let tool: SetControlValuesTool;

  beforeEach(() => {
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
});