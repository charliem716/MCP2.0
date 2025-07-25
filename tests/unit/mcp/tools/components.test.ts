import { ListComponentsTool } from '../../../../src/mcp/tools/components.js';

describe('ListComponentsTool', () => {
  let mockQrwcClient: any;
  let tool: ListComponentsTool;

  beforeEach(() => {
    mockQrwcClient = {
      sendCommand: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
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
            Properties: [
              { Name: 'controls', Value: '24' },
              { Name: 'location', Value: 'Rack 1' },
            ],
          },
          {
            Name: 'ZoneAmpControl',
            Type: 'amplifier',
            Properties: [
              { Name: 'controls', Value: '8' },
              { Name: 'location', Value: 'Rack 2' },
            ],
          },
        ],
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({});

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'Component.GetComponents'
      );
      expect(result.isError).toBe(false);
      
      const components = JSON.parse(result.content[0].text);
      expect(components).toHaveLength(2);
      expect(components[0].Name).toBe('MainMixer');
      expect(components[0].Type).toBe('mixer');
      expect(components[0].Properties.controls).toBe('24');
      expect(components[0].Properties.location).toBe('Rack 1');
      expect(components[1].Name).toBe('ZoneAmpControl');
      expect(components[1].Type).toBe('amplifier');
      expect(components[1].Properties.controls).toBe('8');
      expect(components[1].Properties.location).toBe('Rack 2');
    });

    it('should filter components by name pattern', async () => {
      const mockResponse = {
        result: [
          { Name: 'MainMixer', Type: 'mixer', Properties: [] },
          { Name: 'SubMixer', Type: 'mixer', Properties: [] },
          { Name: 'Amplifier1', Type: 'amplifier', Properties: [] },
        ],
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({ filter: 'Mixer' });

      const components = JSON.parse(result.content[0].text);
      expect(components).toHaveLength(2);
      expect(components[0].Name).toBe('MainMixer');
      expect(components[1].Name).toBe('SubMixer');
      expect(components.some((c: any) => c.Name === 'Amplifier1')).toBe(false);
    });

    it('should include properties when requested', async () => {
      const mockResponse = {
        result: [
          {
            Name: 'MainMixer',
            Type: 'mixer',
            Properties: [
              { Name: 'controls', Value: '24' },
              { Name: 'location', Value: 'Rack 1' },
            ],
          },
        ],
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({ includeProperties: true });

      const parsed = JSON.parse(result.content[0].text);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].Properties.controls).toBe('24');
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
      const parsed = JSON.parse(result.content[0].text);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(0);
    });

    it('should handle alternative response formats', async () => {
      // Test array response format
      const arrayResponse = [{ Name: 'Component1', Type: 'type1', Properties: [] }];
      mockQrwcClient.sendCommand.mockResolvedValue(arrayResponse);

      let result = await tool.execute({});
      let components = JSON.parse(result.content[0].text);
      expect(components).toHaveLength(1);
      expect(components[0].Name).toBe('Component1');
      expect(components[0].Type).toBe('type1');

      // Test components property format - this will return empty array as it doesn't match expected format
      const componentsResponse = {
        components: [{ Name: 'Component2', Type: 'type2', Properties: [] }],
      };
      mockQrwcClient.sendCommand.mockResolvedValue(componentsResponse);

      result = await tool.execute({});
      components = JSON.parse(result.content[0].text);
      expect(components).toHaveLength(0); // No result property, so returns empty array
    });
  });
});
