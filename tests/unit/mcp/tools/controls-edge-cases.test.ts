import { ListControlsTool, GetControlValuesTool, SetControlValuesTool } from '../../../../src/mcp/tools/controls';

describe('ListControlsTool - Edge Cases for 80% Coverage', () => {
  let mockQrwcClient: any;
  let tool: ListControlsTool;

  beforeEach(() => {
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

  describe('formatControlsResponse', () => {
    it('should format controls response correctly', async () => {
      const controls = [
        {
          name: 'MainMixer.gain',
          component: 'MainMixer',
          type: 'gain',
          value: -10,
          metadata: {
            min: -100,
            max: 20,
            units: 'dB',
            direction: 'Read/Write'
          }
        },
        {
          name: 'MainMixer.mute',
          component: 'MainMixer',
          type: 'mute',
          value: false,
          metadata: {
            direction: 'Read/Write'
          }
        }
      ];

      // @ts-expect-error - accessing private method for testing
      const formatted = tool.formatControlsResponse(controls, { includeMetadata: true });

      expect(formatted).toContain('Found 2 controls');
      expect(formatted).toContain('MainMixer.gain (gain)');
      expect(formatted).toContain('Component: MainMixer');
      expect(formatted).toContain('Value: -10');
      expect(formatted).toContain('Metadata:');
      expect(formatted).toContain('min: -100');
      expect(formatted).toContain('max: 20');
      expect(formatted).toContain('units: dB');
      expect(formatted).toContain('MainMixer.mute (mute)');
      expect(formatted).toContain('Value: false');
    });

    it('should handle empty controls array', async () => {
      // @ts-expect-error - accessing private method for testing
      const formatted = tool.formatControlsResponse([], {});
      expect(formatted).toBe('No controls found');
    });

    it('should format without metadata when not requested', async () => {
      const controls = [{
        name: 'MainMixer.gain',
        component: 'MainMixer',
        type: 'gain',
        value: -10,
        metadata: { min: -100, max: 20 }
      }];

      // @ts-expect-error - accessing private method for testing
      const formatted = tool.formatControlsResponse(controls, { includeMetadata: false });

      expect(formatted).toContain('MainMixer.gain (gain)');
      expect(formatted).not.toContain('Metadata:');
      expect(formatted).not.toContain('min:');
    });
  });

  describe('JSON serialization error handling', () => {
    it('should handle circular reference in controls response', async () => {
      // Create properly formatted control objects with circular references
      const control1: any = {
        name: 'Test1',
        component: 'TestComponent',
        type: 'continuous',
        value: 1,
        metadata: {}
      };
      const control2: any = {
        name: 'Test2',
        component: 'TestComponent',
        type: 'continuous', 
        value: 2,
        metadata: { ref: control1 }
      };
      control1.metadata.ref = control2;

      // Override the private parseControlsResponse to return our circular structure
      const originalParse = (tool as any).parseControlsResponse;
      (tool as any).parseControlsResponse = jest.fn(() => [control1, control2]);

      mockQrwcClient.sendCommand.mockResolvedValue({
        result: {
          Name: 'TestComponent',
          Controls: []
        }
      });

      const result = await tool.execute({ component: 'TestComponent' });

      // safeJsonStringify handles circular references gracefully
      expect(result.isError).toBe(false);
      const controls = JSON.parse(result.content[0].text);
      
      // The structure should be preserved with circular references replaced
      expect(controls).toHaveLength(2);
      expect(controls[0].name).toBe('Test1');
      expect(controls[0].component).toBe('TestComponent');
      
      // The second control becomes a circular reference marker because it was already serialized
      // as part of control1.metadata.ref
      expect(controls[1]).toBe('[Circular Reference]');
      
      // The nested control2 inside control1 is properly serialized
      expect(controls[0].metadata.ref.name).toBe('Test2');
      expect(controls[0].metadata.ref.component).toBe('TestComponent');
      expect(controls[0].metadata.ref.metadata.ref).toBe('[Circular Reference]');

      // Restore original method
      (tool as any).parseControlsResponse = originalParse;
    });
  });

  describe('error response formatting', () => {
    it('should format errors as JSON response', async () => {
      const error = new Error('Network timeout');
      mockQrwcClient.sendCommand.mockRejectedValue(error);

      const result = await tool.execute({ component: 'Test', controlType: 'gain' });

      expect(result.isError).toBe(true);
      const errorData = JSON.parse(result.content[0].text);
      expect(errorData.error).toBe('CONTROLS_LIST_ERROR');
      expect(errorData.message).toBe('Network timeout');
      expect(errorData.details.component).toBe('Test');
      expect(errorData.details.controlType).toBe('gain');
    });

    it('should handle non-Error exceptions', async () => {
      mockQrwcClient.sendCommand.mockRejectedValue('String error');

      const result = await tool.execute({ component: "TestComponent" });

      expect(result.isError).toBe(true);
      const errorData = JSON.parse(result.content[0].text);
      expect(errorData.error).toBe('CONTROLS_LIST_ERROR');
      expect(errorData.message).toBe('Unknown error occurred');
    });
  });

  describe('control type inference edge cases', () => {
    it('should infer type from control Type and String properties', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({
        result: {
          Name: "TestComponent",
          Controls: [
          {
            Name: 'volume_control',
            Type: 'Float',
            String: '-20.5 dB',
            Value: -20.5
          },
          {
            Name: 'enable_switch',
            Type: 'Boolean',
            String: 'On',
            Value: true
          },
          {
            Name: 'some_control',
            Type: 'Float',
            String: '50%', // Not dB, so won't be gain
            Value: 50
          }
        ]
      });

      const result = await tool.execute({ component: "TestComponent" });
      const controls = JSON.parse(result.content[0].text);

      expect(controls[0].type).toBe('gain'); // Float + dB in String
      expect(controls[1].type).toBe('mute'); // Boolean type
      expect(controls[2].type).toBe('unknown'); // Float but no dB
    });

    it('should handle controls with input.select pattern', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({
        result: {
          Name: "TestComponent",
          Controls: [
          { Name: 'router.input.select', Value: 1 },
          { Name: 'matrix.output.select', Value: 2 }
        ]
      });

      const result = await tool.execute({ component: "TestComponent" });
      const controls = JSON.parse(result.content[0].text);

      expect(controls[0].type).toBe('input_select');
      expect(controls[1].type).toBe('output_select');
    });
  });

  describe('metadata extraction edge cases', () => {
    it('should handle Q-SYS API format metadata', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({
        result: {
          Name: "TestComponent",
          Controls: [{
          Name: 'test',
          Value: 0,
          ValueMin: -100,
          ValueMax: 20,
          StringMin: '-100 dB',
          StringMax: '20 dB',
          Direction: 'Read/Write',
          Position: 0.5
        }]
      });

      const result = await tool.execute({ component: "TestComponent" });
      const controls = JSON.parse(result.content[0].text);

      expect(controls[0].metadata).toEqual({
        min: -100,
        max: 20,
        stringMin: '-100 dB',
        stringMax: '20 dB',
        direction: 'Read/Write',
        position: 0.5
      });
    });

    it('should handle legacy Properties format', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({
        result: {
          Name: "TestComponent",
          Controls: [{
          Name: 'test',
          Value: 0,
          Properties: {
            MinValue: -80,
            MaxValue: 12,
            Units: 'dB',
            Step: 0.5,
            ValueType: 'Float'
          }
        }]
      });

      const result = await tool.execute({ component: "TestComponent" });
      const controls = JSON.parse(result.content[0].text);

      expect(controls[0].metadata).toMatchObject({
        min: -80,
        max: 12,
        units: 'dB',
        step: 0.5,
        valueType: 'Float'
      });
    });

    it('should merge both metadata formats', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({
        result: {
          Name: "TestComponent",
          Controls: [{
          Name: 'test',
          Value: 0,
          ValueMin: -100,
          ValueMax: 20,
          Properties: {
            Units: 'dB',
            Step: 0.1
          }
        }]
      });

      const result = await tool.execute({ component: "TestComponent" });
      const controls = JSON.parse(result.content[0].text);

      expect(controls[0].metadata).toMatchObject({
        min: -100,
        max: 20,
        units: 'dB',
        step: 0.1
      });
    });
  });

  describe('component name extraction edge cases', () => {
    it('should handle control names without dots', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({
        result: {
          Name: "TestComponent",
          Controls: [
          { Name: 'SimpleControl', Value: 1 },
          { Name: 'AnotherControl', Value: 2 },
          { Name: 'Gain', Value: 3 }
        ]
      });

      const result = await tool.execute({ component: "TestComponent" });
      expect(result.isError).toBe(false);
      const controls = JSON.parse(result.content[0].text);

      expect(controls).toHaveLength(3);
      expect(controls[0].component).toBe('SimpleControl'); // No dots, so whole name is component
      expect(controls[1].component).toBe('AnotherControl'); // No dots, so whole name is component
      expect(controls[2].component).toBe('Gain'); // No dots, so whole name is component
    });
  });

  describe('value handling edge cases', () => {
    it('should handle various value types', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({
        result: {
          Name: "TestComponent",
          Controls: [
          { Name: 'ctrl1', Value: null },
          { Name: 'ctrl2', Value: undefined },
          { Name: 'ctrl3', Value: { complex: 'object' } },
          { Name: 'ctrl4', Value: [1, 2, 3] },
          { Name: 'ctrl5' } // No Value property
        ]
      });

      const result = await tool.execute({ component: "TestComponent" });
      const controls = JSON.parse(result.content[0].text);

      expect(controls[0].value).toBe('');
      expect(controls[1].value).toBe('');
      expect(controls[2].value).toBe('[object Object]');
      expect(controls[3].value).toBe('1,2,3');
      expect(controls[4].value).toBe('');
    });
  });

  describe('Component.GetControls response format', () => {
    it('should handle component-specific response without filtering', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({
        result: {
          Name: 'MainMixer',
          Controls: [
            { Name: 'gain', Value: -10 },
            { Name: 'mute', Value: false }
          ]
        }
      });

      const result = await tool.execute({ component: 'MainMixer' });
      const controls = JSON.parse(result.content[0].text);

      expect(controls).toHaveLength(2);
      expect(controls[0].component).toBe('MainMixer');
      expect(controls[1].component).toBe('MainMixer');
    });
  });

  describe('GetAllControls with component filter', () => {
    it('should filter by component when using GetAllControls', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({
        result: {
          Name: "TestComponent",
          Controls: [
          { Name: 'gain', Component: 'Mixer1', Value: -10 },
          { Name: 'gain', Component: 'Mixer2', Value: -5 },
          { Name: 'mute', Component: 'Mixer1', Value: false }
        ]
      });

      // When component is specified but response is array format (GetAllControls was used)
      const result = await tool.execute({ component: 'Mixer1' });
      const controls = JSON.parse(result.content[0].text);

      expect(controls).toHaveLength(2);
      expect(controls.every((c: any) => c.component === 'Mixer1')).toBe(true);
    });
  });

  describe('API error response', () => {
    it('should handle error in response object', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({
        error: {
          code: -32602,
          message: 'Invalid component name'
        }
      });

      const result = await tool.execute({ component: 'InvalidComponent' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Q-SYS API error: Invalid component name');
    });
  });
});

// GetControlValuesTool tests removed - formatControlValue method doesn't exist

describe('SetControlValuesTool - Additional Edge Cases', () => {
  let mockQrwcClient: any;
  let tool: SetControlValuesTool;

  beforeEach(() => {
    mockQrwcClient = {
      sendCommand: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
    };
    tool = new SetControlValuesTool(mockQrwcClient);
    // @ts-expect-error - accessing private method for testing
    tool.logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
  });

  describe('default ramp time', () => {
    it('should use default ramp time of 0 when not specified', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({ success: true });

      await tool.execute({
        controls: [{ name: 'TestGain', value: -10 }],
        validate: false
      });

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Control.Set', {
        Name: 'TestGain',
        Value: -10
        // No Ramp property means default of 0
      });
    });
  });

  describe('validate option behavior', () => {
    it('should skip validation when validate is false', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({ success: true });

      await tool.execute({
        controls: [{ name: 'TestControl', value: 50 }],
        validate: false
      });

      // Should only call Control.Set, not Control.Get for validation
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledTimes(1);
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Control.Set', {
        Name: 'TestControl',
        Value: 50
      });
    });

    it('should validate by default', async () => {
      mockQrwcClient.sendCommand
        .mockResolvedValueOnce({ result: { Name: 'TestControl', Value: 0 } }) // Validation response for Control.Get
        .mockResolvedValueOnce({ success: true }); // Set response

      await tool.execute({
        controls: [{ name: 'TestControl', value: 50 }]
        // validate not specified, defaults to true
      });

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledTimes(2);
      expect(mockQrwcClient.sendCommand).toHaveBeenNthCalledWith(1, 'Control.Get', {
        Name: 'TestControl'
      });
      expect(mockQrwcClient.sendCommand).toHaveBeenNthCalledWith(2, 'Control.Set', {
        Name: 'TestControl',
        Value: 50
      });
    });
  });
});