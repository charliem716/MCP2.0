import { ListComponentsTool, GetComponentControlsTool } from '../../../../src/mcp/tools/components';
import { QSysError, MCPError, QSysErrorCode, MCPErrorCode } from '../../../../src/shared/types/errors.js';
import { discoveryCache } from '../../../../src/mcp/state/discovery-cache';

describe('ListComponentsTool - Edge Cases for 80% Coverage', () => {
  let mockQrwcClient: any;
  let tool: ListComponentsTool;

  beforeEach(() => {
    mockQrwcClient = {
      sendCommand: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
    };
    tool = new ListComponentsTool(mockQrwcClient);
    // @ts-expect-error - accessing private property for testing
    tool.logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
    // Clear cache for test isolation
    jest.clearAllMocks();
    discoveryCache.clear();
  });

  describe('formatComponentsResponse', () => {
    it('should format components response correctly', async () => {
      // Test the formatComponentsResponse method by accessing it directly
      // @ts-expect-error - accessing private method for testing
      const formatted = tool.formatComponentsResponse(
        [
          { Name: 'Mixer1', Type: 'mixer', Properties: { channels: 8 } },
          { Name: 'Gain1', Type: 'gain', Properties: { min: -100, max: 20 } }
        ],
        { includeProperties: true }
      );

      expect(formatted).toContain('Found 2 components');
      expect(formatted).toContain('Mixer1 (mixer)');
      expect(formatted).toContain('Properties:');
      expect(formatted).toContain('channels: 8');
      expect(formatted).toContain('Gain1 (gain)');
      expect(formatted).toContain('min: -100');
      expect(formatted).toContain('max: 20');
    });

    it('should handle empty components array', async () => {
      // @ts-expect-error - accessing private method for testing
      const formatted = tool.formatComponentsResponse([], {});
      expect(formatted).toBe('No components found');
    });

    it('should format without properties when not requested', async () => {
      // @ts-expect-error - accessing private method for testing
      const formatted = tool.formatComponentsResponse(
        [{ Name: 'Mixer1', Type: 'mixer', Properties: { channels: 8 } }],
        { includeProperties: false }
      );

      expect(formatted).toContain('Mixer1 (mixer)');
      expect(formatted).not.toContain('Properties:');
      expect(formatted).not.toContain('channels:');
    });
  });

  describe('error handling', () => {
    it('should handle invalid response', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue('invalid string response');

      const result = await tool.execute({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('error');
    });

    it('should handle and log errors from sendCommand', async () => {
      const error = new Error('Network failure');
      mockQrwcClient.sendCommand.mockRejectedValue(error);

      const result = await tool.execute({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('error');
      expect(tool.logger.error).toHaveBeenCalledWith('Failed to list components', expect.any(Object));
    });
  });

  describe('parseComponentsResponse edge cases', () => {
    it('should handle response with result.Components format', async () => {
      const mockResponse = {
        result: {
          Components: [
            {
              Name: 'Device1',
              Type: 'type1',
              Properties: [
                { Name: 'prop1', Value: 'val1' }
              ]
            }
          ]
        }
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({});
      const components = JSON.parse(result.content[0].text);
      expect(components).toHaveLength(1);
      expect(components[0].Name).toBe('Device1');
      expect(components[0].Properties.prop1).toBe('val1');
    });

    it('should handle components without Properties array', async () => {
      const mockResponse = {
        result: [
          {
            Name: 'Device1',
            Type: 'type1',
            Properties: []  // Empty array instead of null
          },
          {
            Name: 'Device2',
            Type: 'type2',
            Properties: []  // Empty array
          }
        ]
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({});
      expect(result.isError).toBe(false);
      const components = JSON.parse(result.content[0].text);
      expect(components).toHaveLength(2);
    });

    it('should filter by Type when filter matches type', async () => {
      const mockResponse = {
        result: [
          { Name: 'MixerDevice', Type: 'mixer', Properties: [] },
          { Name: 'GainDevice', Type: 'gain', Properties: [] },
          { Name: 'OtherMixer', Type: 'mixer', Properties: [] },
          { Name: 'AudioMixerControl', Type: 'control', Properties: [] }
        ]
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({ filter: 'mixer' });
      const components = JSON.parse(result.content[0].text);
      expect(components).toHaveLength(3); // 3 match 'mixer': MixerDevice (name+type), OtherMixer (name+type), AudioMixerControl (name)
    });
  });
});

describe('GetComponentControlsTool - Full Coverage', () => {
  let mockQrwcClient: any;
  let tool: GetComponentControlsTool;

  beforeEach(() => {
    mockQrwcClient = {
      sendCommand: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
    };
    tool = new GetComponentControlsTool(mockQrwcClient);
    // @ts-expect-error - accessing private property for testing
    tool.logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
  });

  describe('executeInternal', () => {
    it('should get component controls successfully', async () => {
      const mockResponse = {
        result: {
          Name: 'Main Mixer',
          Controls: [
            {
              Name: 'gain',
              Value: -10,
              String: '-10 dB',
              Position: 0.5
            },
            {
              Name: 'mute',
              Value: false,
              String: 'Off',
              Position: 0
            }
          ]
        }
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({
        component: 'Main Mixer',
        controls: ['gain', 'mute']
      });

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Component.GetControls', {
        Name: 'Main Mixer'
      });
      expect(result.isError).toBe(false);

      const data = JSON.parse(result.content[0].text);
      expect(data.component).toBe('Main Mixer');
      expect(data.controls).toHaveLength(2);
      expect(data.controls[0]).toEqual({
        name: 'gain',
        value: -10,
        string: '-10 dB',
        position: 0.5,
        error: undefined
      });
      expect(data.controls[1]).toEqual({
        name: 'mute',
        value: false,
        string: 'Off',
        position: 0,
        error: undefined
      });
    });

    it('should handle invalid response without result', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({});

      const result = await tool.execute({
        component: 'Test',
        controls: ['control1']
      });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('error');
      expect(result.content[0].text).toContain('Invalid response from Component.Get');
    });

    it('should handle response without Controls array', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({
        result: {
          Name: 'Test'
          // No Controls array
        }
      });

      const result = await tool.execute({
        component: 'Test',
        controls: ['control1']
      });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('error');
      expect(result.content[0].text).toContain('Invalid response format: missing Controls array');
    });

    it('should handle non-object response', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue('string response');

      const result = await tool.execute({
        component: 'Test',
        controls: ['control1']
      });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('error');
    });

    it('should handle null response', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue(null);

      const result = await tool.execute({
        component: 'Test',
        controls: ['control1']
      });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('error');
    });

    it('should handle sendCommand errors', async () => {
      const error = new Error('Connection failed');
      mockQrwcClient.sendCommand.mockRejectedValue(error);

      const result = await tool.execute({
        component: 'Test',
        controls: ['control1']
      });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('error');
      expect(result.content[0].text).toContain('Connection failed');
      
      expect(tool.logger.error).toHaveBeenCalledWith(
        'Failed to get component controls',
        expect.objectContaining({
          error,
          component: 'Test',
          controls: ['control1']
        })
      );
    });

    it('should handle non-Error exceptions', async () => {
      mockQrwcClient.sendCommand.mockRejectedValue('String error');

      const result = await tool.execute({
        component: 'Test',
        controls: ['control1']
      });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('error');
      expect(result.content[0].text).toContain('Failed to get component controls: String error');
    });

    it('should handle empty Controls array', async () => {
      const mockResponse = {
        result: {
          Name: 'Test',
          Controls: []
        }
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({
        component: 'Test',
        controls: ['control1']
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.controls).toHaveLength(0);
    });

    it('should handle controls with undefined values', async () => {
      const mockResponse = {
        result: {
          Name: 'Test',
          Controls: [
            {
              Name: 'control1',
              Value: undefined,
              String: undefined,
              Position: undefined
            }
          ]
        }
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({
        component: 'Test',
        controls: ['control1']
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.controls[0]).toEqual({
        name: 'control1',
        value: undefined,
        string: undefined,
        position: undefined,
        error: undefined
      });
    });
  });

  describe('isConnected check', () => {
    it('should check connection before executing', async () => {
      mockQrwcClient.isConnected.mockReturnValue(false);

      const result = await tool.execute({
        component: 'Test',
        controls: ['control1']
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Q-SYS Core not connected');
    });
  });
});