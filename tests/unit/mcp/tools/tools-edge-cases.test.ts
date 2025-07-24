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
          { Name: 'Component1' }, // No Type property
          { Name: 'Component2', Type: 'gain' },
        ],
      });

      const result = await tool.execute({});
      expect(result.content[0].text).toContain('Component1 (unknown)');
      expect(result.content[0].text).toContain('Component2 (gain)');
    });

    it('should handle includeProperties:false branch', async () => {
      const tool = new ListComponentsTool(mockQrwcClient);
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: [{ Name: 'Component1', Type: 'gain', Properties: { gain: 0 } }],
      });

      const result = await tool.execute({ includeProperties: false });
      expect(result.content[0].text).not.toContain('Properties:');
    });
  });

  describe('QueryCoreStatusTool - branch coverage', () => {
    it('should handle missing Status.String', async () => {
      const tool = new QueryCoreStatusTool(mockQrwcClient);
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: {
          Status: { Code: 0 }, // No String property
          DesignName: 'Test',
        },
      });

      const result = await tool.execute({});
      expect(result.content[0].text).toContain('System Health: Connected');
    });

    it('should handle all include flags as false', async () => {
      const tool = new QueryCoreStatusTool(mockQrwcClient);
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: {
          Status: { Code: 0, String: 'OK' },
          DesignName: 'Test',
        },
      });

      const result = await tool.execute({
        includeDetails: false,
        includeNetworkInfo: false,
        includePerformance: false,
      });

      expect(result.content[0].text).not.toContain(
        'Detailed System Information'
      );
      expect(result.content[0].text).not.toContain('Network Configuration');
      expect(result.content[0].text).not.toContain('Performance Metrics');
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
      });

      expect(result.content[0].text).toContain('Failed - String error');
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
      expect(result.content[0].text).toContain('Control1');
    });

    it('should handle includeMetadata:false branch', async () => {
      const tool = new ListControlsTool(mockQrwcClient);
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: [{ Name: 'Control1', Value: 0, ValueMin: -100, ValueMax: 10 }],
      });

      const result = await tool.execute({ includeMetadata: false });
      expect(result.content[0].text).not.toContain('Min:');
      expect(result.content[0].text).not.toContain('Max:');
    });

    it('should handle unknown control type', async () => {
      const tool = new ListControlsTool(mockQrwcClient);
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: [{ Name: 'UnknownControl', Value: 0 }],
      });

      const result = await tool.execute({ controlType: 'all' });
      expect(result.content[0].text).toContain('(unknown)');
    });
  });
});
