import { ListComponentsTool } from '../../../../src/mcp/tools/components.js';
import { QueryCoreStatusTool } from '../../../../src/mcp/tools/status.js';
import {
  SetControlValuesTool,
  ListControlsTool,
} from '../../../../src/mcp/tools/controls.js';

describe('MCP Tools - Edge Cases for 100% Coverage', () => {
  let mockQrwcClient: any;

  beforeEach(() => {
    mockQrwcClient = {
      isConnected: jest.fn().mockReturnValue(true),
      sendCommand: jest.fn(),
    };
  });

  describe('ListComponentsTool - branch coverage', () => {
    it('should handle components without Type property', async () => {
      const tool = new ListComponentsTool(mockQrwcClient);
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: [
          { Name: 'Component1', Properties: [] }, // No Type property but Properties array is required
          { Name: 'Component2', Type: 'gain', Properties: [] },
        ],
      });

      const result = await tool.execute({});
      const components = JSON.parse(result.content[0].text);
      expect(components).toHaveLength(2);
      expect(components[0].Name).toBe('Component1');
      expect(components[0].Type).toBeUndefined();
      expect(components[1].Name).toBe('Component2');
      expect(components[1].Type).toBe('gain');
    });

    it('should handle includeProperties:false branch', async () => {
      const tool = new ListComponentsTool(mockQrwcClient);
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: [{ Name: 'Component1', Type: 'gain', Properties: [{ Name: 'gain', Value: '0' }] }],
      });

      const result = await tool.execute({ includeProperties: false });
      const components = JSON.parse(result.content[0].text);
      expect(components).toHaveLength(1);
      expect(components[0].Name).toBe('Component1');
      expect(components[0].Type).toBe('gain');
      expect(components[0].Properties).toEqual({ gain: '0' });
    });
  });

  describe('QueryCoreStatusTool - branch coverage', () => {
    it('should handle missing Status.String', async () => {
      const tool = new QueryCoreStatusTool(mockQrwcClient);
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: {
          Status: { Code: 0 }, // No String property
          DesignName: 'Test',
          Platform: 'Test Platform',
          State: 'Active',
          DesignCode: 'test123',
          IsRedundant: false,
          IsEmulator: false,
        },
      });

      const result = await tool.execute({});
      const status = JSON.parse(result.content[0].text);
      expect(status.coreInfo).toBeDefined();
      expect(status.coreInfo.name).toBe('Test Platform');
      expect(status.systemHealth.status).toBe('unknown'); // Default when Status.String is missing
      expect(status.Status.Code).toBe(0); // Status.Code is preserved in the Status object
    });

    it('should handle all include flags as false', async () => {
      const tool = new QueryCoreStatusTool(mockQrwcClient);
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: {
          Status: { Code: 0, String: 'OK' },
          DesignName: 'Test',
          Platform: 'Test Platform',
          State: 'Active',
          DesignCode: 'test123',
          IsRedundant: false,
          IsEmulator: false,
        },
      });

      const result = await tool.execute({
        includeDetails: false,
        includeNetworkInfo: false,
        includePerformance: false,
      });

      const status = JSON.parse(result.content[0].text);
      expect(status.coreInfo).toBeDefined();
      expect(status.systemHealth).toBeDefined();
      // The tool always includes these sections in the response, regardless of flags
      // The flags only control what data is fetched, not what fields are in the JSON
      expect(status.networkInfo).toBeDefined();
      expect(status.performanceMetrics).toBeDefined();
      // When flags are false, these fields have default/empty values
      expect(status.networkInfo.ipAddress).toBe('Unknown');
      expect(status.performanceMetrics.cpuUsage).toBe(0);
    });
  });

  describe('SetControlValuesTool - branch coverage', () => {
    it('should handle controls without ramp parameter', async () => {
      const tool = new SetControlValuesTool(mockQrwcClient);
      mockQrwcClient.sendCommand.mockResolvedValueOnce({ id: '123' });

      const result = await tool.execute({
        controls: [
          { name: 'TestControl', value: 1 }, // No ramp
        ],
      });

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'Control.Set',
        expect.not.objectContaining({ Ramp: expect.anything() })
      );
    });

    it('should handle string error from QRWC', async () => {
      const tool = new SetControlValuesTool(mockQrwcClient);
      mockQrwcClient.sendCommand.mockRejectedValueOnce('String error');

      const result = await tool.execute({
        controls: [{ name: 'TestControl', value: 1 }],
        validate: false, // Disable validation to see the actual QRWC error
      });

      const results = JSON.parse(result.content[0].text);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('TestControl');
      expect(results[0].value).toBe(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('String error');
    });
  });

  describe('ListControlsTool - branch coverage', () => {
    it('should handle controls with missing Value property', async () => {
      const tool = new ListControlsTool(mockQrwcClient);
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: [
          { Name: 'Control1' }, // Missing Value
          { Name: 'Control2', Value: 0 },
        ],
      });

      const result = await tool.execute({});
      const controls = JSON.parse(result.content[0].text);
      expect(controls).toHaveLength(2);
      expect(controls[0].name).toBe('Control1');
      expect(controls[0].value).toBe(''); // Default when Value is missing
      expect(controls[1].name).toBe('Control2');
      expect(controls[1].value).toBe(0);
    });

    it('should handle includeMetadata:false branch', async () => {
      const tool = new ListControlsTool(mockQrwcClient);
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: [{ Name: 'Control1', Value: 0, ValueMin: -100, ValueMax: 10 }],
      });

      const result = await tool.execute({ includeMetadata: false });
      const controls = JSON.parse(result.content[0].text);
      expect(controls).toHaveLength(1);
      expect(controls[0].name).toBe('Control1');
      expect(controls[0].value).toBe(0);
      // When includeMetadata is false, metadata is still collected but may not be displayed
      expect(controls[0].metadata).toBeDefined();
      expect(controls[0].metadata.min).toBe(-100);
      expect(controls[0].metadata.max).toBe(10);
    });

    it('should handle unknown control type', async () => {
      const tool = new ListControlsTool(mockQrwcClient);
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: [{ Name: 'UnknownControl', Value: 0 }],
      });

      const result = await tool.execute({ controlType: 'all' });
      const controls = JSON.parse(result.content[0].text);
      expect(controls).toHaveLength(1);
      expect(controls[0].name).toBe('UnknownControl');
      expect(controls[0].type).toBe('unknown');
    });
  });
});
