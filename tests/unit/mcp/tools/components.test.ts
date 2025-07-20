import { ListComponentsTool } from '../../../../src/mcp/tools/components.js';

describe('ListComponentsTool', () => {
  let mockQrwcClient: any;
  let tool: ListComponentsTool;

  beforeEach(() => {
    mockQrwcClient = {
      sendCommand: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true)
    };
    tool = new ListComponentsTool(mockQrwcClient);
    // @ts-ignore - accessing private property for testing
    tool.logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
  });

  describe('executeInternal', () => {
    it('should list components from Q-SYS Core', async () => {
      const mockResponse = {
        result: [
          {
            Name: 'MainMixer',
            Type: 'mixer',
            Properties: {
              controls: 24,
              location: 'Rack 1'
            }
          },
          {
            Name: 'ZoneAmpControl',
            Type: 'amplifier',
            Properties: {
              controls: 8,
              location: 'Rack 2'
            }
          }
        ]
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({});
      
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Component.GetComponents');
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('Found 2 components');
      expect(result.content[0].text).toContain('MainMixer (mixer)');
      expect(result.content[0].text).toContain('ZoneAmpControl (amplifier)');
    });

    it('should filter components by name pattern', async () => {
      const mockResponse = {
        result: [
          { Name: 'MainMixer', Type: 'mixer' },
          { Name: 'SubMixer', Type: 'mixer' },
          { Name: 'Amplifier1', Type: 'amplifier' }
        ]
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({ filter: 'Mixer' });
      
      expect(result.content[0].text).toContain('Found 2 components');
      expect(result.content[0].text).toContain('MainMixer');
      expect(result.content[0].text).toContain('SubMixer');
      expect(result.content[0].text).not.toContain('Amplifier1');
    });

    it('should include properties when requested', async () => {
      const mockResponse = {
        result: [
          {
            Name: 'MainMixer',
            Type: 'mixer',
            Properties: {
              controls: 24,
              location: 'Rack 1'
            }
          }
        ]
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({ includeProperties: true });
      
      const parsed = JSON.parse(result.content[0].text);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].Properties.controls).toBe(24);
      expect(parsed[0].Properties.location).toBe('Rack 1');
    });

    it('should handle empty response', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({ result: [] });

      const result = await tool.execute({});
      
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(0);
    });

    it('should handle missing result property', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({});

      const result = await tool.execute({});
      
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toBe('No components found');
    });

    it('should handle alternative response formats', async () => {
      // Test array response format
      const arrayResponse = [
        { Name: 'Component1', Type: 'type1' }
      ];
      mockQrwcClient.sendCommand.mockResolvedValue(arrayResponse);

      let result = await tool.execute({});
      expect(result.content[0].text).toContain('Found 1 component');

      // Test components property format
      const componentsResponse = {
        components: [
          { Name: 'Component2', Type: 'type2' }
        ]
      };
      mockQrwcClient.sendCommand.mockResolvedValue(componentsResponse);

      result = await tool.execute({});
      expect(result.content[0].text).toContain('Found 1 component');
    });
  });
});