import { QueryCoreStatusTool } from '../../../../src/mcp/tools/status.js';

describe('QueryCoreStatusTool', () => {
  let mockQrwcClient: any;
  let tool: QueryCoreStatusTool;

  beforeEach(() => {
    mockQrwcClient = {
      sendCommand: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true)
    };
    tool = new QueryCoreStatusTool(mockQrwcClient);
    // @ts-ignore - accessing private property for testing
    tool.logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
  });

  describe('executeInternal', () => {
    it('should query core status successfully', async () => {
      const mockResponse = {
        result: {
          Platform: 'Q-SYS-Core-110f',
          FirmwareVersion: '9.8.0',
          DesignName: 'Main Audio System',
          Status: { String: 'OK' },
          uptime: '5 days, 3:45:22'
        }
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({});
      
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('StatusGet');
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('Q-SYS Core Status Summary');
      expect(result.content[0].text).toContain('🟢 Connection: Connected');
      expect(result.content[0].text).toContain('Q-SYS-Core-110f');
      expect(result.content[0].text).toContain('Main Audio System');
      expect(result.content[0].text).toContain('5 days, 3:45:22');
    });

    it('should include detailed info when requested', async () => {
      const mockResponse = {
        result: {
          SerialNumber: 'QSC123456',
          FirmwareVersion: '9.8.0',
          DesignVersion: '1.2.3',
          designInfo: {
            componentsCount: 42,
            controlsCount: 156
          }
        }
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({ includeDetails: true });
      
      expect(result.content[0].text).toContain('Detailed System Information');
      expect(result.content[0].text).toContain('Serial Number: QSC123456');
      expect(result.content[0].text).toContain('Firmware Version: 9.8.0');
      expect(result.content[0].text).toContain('Design Version: 1.2.3');
    });

    it('should include network info when requested', async () => {
      const mockResponse = {
        result: {
          networkInfo: {
            primaryInterface: {
              name: 'eth0',
              ipAddress: '192.168.1.100',
              subnetMask: '255.255.255.0',
              gateway: '192.168.1.1',
              macAddress: '00:11:22:33:44:55'
            },
            dnsServers: ['8.8.8.8', '8.8.4.4'],
            dhcpEnabled: true
          }
        }
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({ includeNetworkInfo: true });
      
      expect(result.content[0].text).toContain('Network Configuration');
      expect(result.content[0].text).toContain('IP Address: 192.168.1.100');
      expect(result.content[0].text).toContain('DHCP: Enabled');
      expect(result.content[0].text).toContain('8.8.8.8');
    });

    it('should include performance metrics when requested', async () => {
      const mockResponse = {
        result: {
          cpuUsage: 45,
          memoryUsage: 62,
          temperature: 55,
          designInfo: {
            processingLoad: 38
          }
        }
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({ includePerformance: true });
      
      expect(result.content[0].text).toContain('Performance Metrics');
      expect(result.content[0].text).toContain('CPU Usage: 45%');
      expect(result.content[0].text).toContain('Memory Usage: 62%');
      expect(result.content[0].text).toContain('Temperature: 55°C');
      expect(result.content[0].text).toContain('🟡 Moderate temperature');
    });

    it('should handle missing response data gracefully', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({});

      const result = await tool.execute({});
      
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('Q-SYS Core Status Summary');
      expect(result.content[0].text).toContain('Unknown');
    });

    it('should show error when not connected', async () => {
      mockQrwcClient.isConnected.mockReturnValue(false);
      mockQrwcClient.sendCommand.mockResolvedValue({});

      const result = await tool.execute({});
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Q-SYS Core not connected');
    });
  });
});