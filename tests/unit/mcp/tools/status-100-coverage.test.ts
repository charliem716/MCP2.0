import { QueryCoreStatusTool } from '../../../../src/mcp/tools/status.js';

describe('QueryCoreStatusTool - 100% Coverage', () => {
  let mockQrwcClient: any;

  beforeEach(() => {
    mockQrwcClient = {
      isConnected: jest.fn().mockReturnValue(true),
      sendCommand: jest.fn()
    };
  });

  describe('edge cases for full coverage', () => {
    it('should handle response with only Status.Code', async () => {
      const tool = new QueryCoreStatusTool(mockQrwcClient);
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: {
          Status: { Code: 5 } // No String property
        }
      });

      const result = await tool.execute({});
      expect(result.content[0].text).toContain('System Health: Code 5');
    });

    it('should handle error status codes', async () => {
      const tool = new QueryCoreStatusTool(mockQrwcClient);
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: {
          Status: { Code: 1, String: 'Warning' },
          DesignName: 'Test'
        }
      });

      const result = await tool.execute({});
      expect(result.content[0].text).toContain('⚠️');
      expect(result.content[0].text).toContain('Warning');
    });

    it('should handle critical status', async () => {
      const tool = new QueryCoreStatusTool(mockQrwcClient);
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: {
          Status: { Code: 2, String: 'Critical' },
          DesignName: 'Test'
        }
      });

      const result = await tool.execute({});
      expect(result.content[0].text).toContain('❌');
      expect(result.content[0].text).toContain('Critical');
    });

    it('should handle performance data edge cases', async () => {
      const tool = new QueryCoreStatusTool(mockQrwcClient);
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: {
          Status: { Code: 0, String: 'OK' },
          Performance: {
            CPU: null,
            Memory: undefined,
            Temperature: 0
          }
        }
      });

      const result = await tool.execute({ includePerformance: true });
      expect(result.content[0].text).toContain('CPU Usage: 0%');
      expect(result.content[0].text).toContain('Memory Usage: 0%');
      expect(result.content[0].text).toContain('Temperature: 0°C');
    });
  });
});