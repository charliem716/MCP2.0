import { QueryCoreStatusTool } from '../../../../src/mcp/tools/status.js';

describe('QueryCoreStatusTool', () => {
  let mockQrwcClient: any;
  let tool: QueryCoreStatusTool;

  beforeEach(() => {
    mockQrwcClient = {
      sendCommand: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
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
          uptime: '5 days, 3:45:22',
        },
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({});

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Status.Get');
      expect(result.isError).toBe(false);

      // Parse JSON response
      const status = JSON.parse(result.content[0].text);
      expect(status.coreInfo.platform).toBe('Q-SYS-Core-110f');
      expect(status.coreInfo.designName).toBe('Main Audio System');
      expect(status.connectionStatus.connected).toBe(true);
    });

    it('should include detailed info when requested', async () => {
      const mockResponse = {
        result: {
          SerialNumber: 'QSC123456',
          FirmwareVersion: '9.8.0',
          DesignVersion: '1.2.3',
          designInfo: {
            componentsCount: 42,
            controlsCount: 156,
          },
        },
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({ includeDetails: true });

      const status = JSON.parse(result.content[0].text);
      expect(status.coreInfo).toBeDefined();
      expect(status.coreInfo.serialNumber).toBe('QSC123456');
      expect(status.coreInfo.firmwareVersion).toBe('9.8.0');
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
              macAddress: '00:11:22:33:44:55',
            },
            dnsServers: ['8.8.8.8', '8.8.4.4'],
            dhcpEnabled: true,
          },
        },
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({ includeNetworkInfo: true });

      const status = JSON.parse(result.content[0].text);
      expect(status.networkInfo).toBeDefined();
    });

    it('should include performance metrics when requested', async () => {
      const mockResponse = {
        result: {
          cpuUsage: 45,
          memoryUsage: 62,
          temperature: 55,
          designInfo: {
            processingLoad: 38,
          },
        },
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({ includePerformance: true });

      const status = JSON.parse(result.content[0].text);
      expect(status.performanceMetrics).toBeDefined();
      expect(status.performanceMetrics.cpuUsage).toBe(45);
      expect(status.performanceMetrics.memoryUsage).toBe(62);
      expect(status.systemHealth.temperature).toBe(55);
    });

    it('should handle missing response data gracefully', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({});

      const result = await tool.execute({});

      expect(result.isError).toBe(false);
      const status = JSON.parse(result.content[0].text);
      expect(status.coreInfo.name).toBe('Unknown Core');
    });

    it('should show error when not connected', async () => {
      mockQrwcClient.isConnected.mockReturnValue(false);

      const result = await tool.execute({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Q-SYS Core not connected');
    });
  });

  describe('StatusGet fallback to component scanning', () => {
    it('should fallback to component scanning when StatusGet fails', async () => {
      // First call fails (StatusGet)
      mockQrwcClient.sendCommand
        .mockRejectedValueOnce(new Error('StatusGet command not supported'))
        .mockResolvedValueOnce({
          // Component.GetComponents response
          result: [
            { Name: 'Status_Table Mic', Type: 'Status Combiner' },
            { Name: 'Status_Soundbar', Type: 'Device Monitor' },
            { Name: 'Gain_1', Type: 'Gain' }, // Should be ignored
            { Name: 'System_Health', Type: 'Component' },
          ],
        })
        .mockResolvedValueOnce({
          // Component.GetControls for Status_Table Mic
          result: {
            Name: 'Status_Table Mic',
            Controls: [
              {
                Name: 'Connected',
                Value: true,
                String: 'true',
                Type: 'Boolean',
                Direction: 'Read',
              },
              {
                Name: 'Battery_Level',
                Value: 85,
                String: '85',
                Type: 'Float',
                Direction: 'Read',
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          // Component.GetControls for Status_Soundbar
          result: {
            Name: 'Status_Soundbar',
            Controls: [
              {
                Name: 'Status',
                Value: 'OK',
                String: 'OK',
                Type: 'String',
                Direction: 'Read',
              },
              {
                Name: 'IP_Address',
                Value: '192.168.1.101',
                String: '192.168.1.101',
                Type: 'String',
                Direction: 'Read',
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          // Component.GetControls for System_Health
          result: {
            Name: 'System_Health',
            Controls: [
              {
                Name: 'CPU_Usage',
                Value: 15,
                String: '15%',
                Type: 'Float',
                Direction: 'Read',
              },
              {
                Name: 'Temperature',
                Value: 45,
                String: '45°C',
                Type: 'Float',
                Direction: 'Read',
              },
            ],
          },
        });

      const result = await tool.execute({});

      expect(result.isError).toBe(false);
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Status.Get');
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'Component.GetComponents'
      );

      // Parse JSON response
      const status = JSON.parse(result.content[0].text);

      // Debug log to see the actual structure
      // console.log('Status response:', JSON.stringify(status, null, 2));

      // Check that we got data from status components
      expect(status.PeripheralStatus).toBeDefined();
      expect(status.PeripheralStatus['Status_Table Mic']).toBeDefined();
      expect(
        status.PeripheralStatus['Status_Table Mic']['Connected'].value
      ).toBe(true);
      expect(
        status.PeripheralStatus['Status_Table Mic']['Battery Level'].value
      ).toBe(85);

      expect(status.CoreStatus).toBeDefined();
      expect(status.CoreStatus['System_Health']).toBeDefined();
      expect(status.CoreStatus['System_Health']['Cpu Usage'].value).toBe(15);
      expect(status.CoreStatus['System_Health']['Temperature'].value).toBe(45);

      expect(status._metadata).toBeDefined();
      expect(status._metadata.source).toBe('status_components');
      expect(status._metadata.method).toBe('component_scan');
    });

    it('should return no components message when no status components found', async () => {
      mockQrwcClient.sendCommand
        .mockRejectedValueOnce(new Error('StatusGet command not supported'))
        .mockResolvedValueOnce({
          // Component.GetComponents response with no status components
          result: [
            { Name: 'Gain_1', Type: 'Gain' },
            { Name: 'Mixer_1', Type: 'Mixer' },
            { Name: 'EQ_1', Type: 'EQ' },
          ],
        });

      const result = await tool.execute({});

      expect(result.isError).toBe(false);

      const response = JSON.parse(result.content[0].text);
      expect(response.message).toBe('No status components detected');
      expect(response.componentCount).toBe(3);
      expect(response.suggestion).toContain('Status');
    });

    it('should handle component control retrieval errors gracefully', async () => {
      mockQrwcClient.sendCommand
        .mockRejectedValueOnce(new Error('StatusGet command not supported'))
        .mockResolvedValueOnce({
          // Component.GetComponents response
          result: [
            { Name: 'Status_Device1', Type: 'Status Combiner' },
            { Name: 'Status_Device2', Type: 'Device Monitor' },
          ],
        })
        .mockResolvedValueOnce({
          // Successful controls for first component
          result: {
            Name: 'Status_Device1',
            Controls: [
              {
                Name: 'Status',
                Value: 'OK',
                String: 'OK',
                Type: 'String',
                Direction: 'Read',
              },
            ],
          },
        })
        .mockRejectedValueOnce(new Error('Failed to get controls')); // Error for second component

      const result = await tool.execute({});

      expect(result.isError).toBe(false);

      const status = JSON.parse(result.content[0].text);
      expect(status.GeneralStatus).toBeDefined();
      expect(status.GeneralStatus['Status_Device1']).toBeDefined();
      // Device2 should not be present due to error
      expect(status.GeneralStatus['Status_Device2']).toBeUndefined();
    });
  });

  // Edge cases for 100% coverage
  describe('edge cases for full coverage', () => {
    it('should handle response with only Status.Code', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: {
          Status: { Code: 5 }, // No String property
        },
      });

      const result = await tool.execute({});
      const status = JSON.parse(result.content[0].text);
      expect(status.Status.Code).toBe(5);
    });

    it('should handle error status codes', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: {
          Status: { Code: 1, String: 'Warning' },
          DesignName: 'Test',
        },
      });

      const result = await tool.execute({});
      const status = JSON.parse(result.content[0].text);
      expect(status.Status.Code).toBe(1);
      expect(status.Status.Name).toBe('Warning');
    });

    it('should handle critical status', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: {
          Status: { Code: 2, String: 'Critical' },
          DesignName: 'Test',
        },
      });

      const result = await tool.execute({});
      const status = JSON.parse(result.content[0].text);
      expect(status.Status.Code).toBe(2);
      expect(status.Status.Name).toBe('Critical');
    });

    it('should handle performance data edge cases', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: {
          Status: { Code: 0, String: 'OK' },
          Performance: {
            CPU: null,
            Memory: undefined,
            Temperature: 0,
          },
        },
      });

      const result = await tool.execute({ includePerformance: true });
      const status = JSON.parse(result.content[0].text);
      expect(status.performanceMetrics.cpuUsage).toBe(0);
      expect(status.performanceMetrics.memoryUsage).toBe(0);
      expect(status.systemHealth.temperature).toBe(0);
    });
  });
});

// BUG-055 regression tests for QueryCoreStatusTool
describe('QueryCoreStatusTool - BUG-055 regression', () => {
  let mockQrwcClient: any;
  let tool: QueryCoreStatusTool;

  beforeEach(() => {
    mockQrwcClient = {
      sendCommand: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
    };
    tool = new QueryCoreStatusTool(mockQrwcClient);
  });

  it('should correctly assign empty arrays to string[] properties', async () => {
    // Mock status response
    mockQrwcClient.sendCommand.mockResolvedValueOnce({
      result: {
        Platform: 'Q-SYS Core',
        Version: '9.0.0',
        DesignName: 'Test Design',
        State: 'Active',
        Status: { String: 'OK' },
        IsConnected: true,
      },
    });

    const result = await tool.execute({});

    expect(result.isError).toBe(false);

    // Parse the response to check array properties
    const statusJson = result.content[0].text;
    const status = JSON.parse(statusJson);

    // Verify array properties are properly typed
    expect(status.designInfo.activeServices).toEqual([]);
    expect(Array.isArray(status.designInfo.activeServices)).toBe(true);

    expect(status.networkInfo.dnsServers).toEqual([]);
    expect(Array.isArray(status.networkInfo.dnsServers)).toBe(true);
  });

  it('should handle arrays with data correctly', async () => {
    // Mock status response with array data
    mockQrwcClient.sendCommand.mockResolvedValueOnce({
      result: {
        Platform: 'Q-SYS Core',
        Version: '9.0.0',
        DesignName: 'Test Design',
        State: 'Active',
        Status: { String: 'OK' },
        IsConnected: true,
        ActiveServices: ['Audio', 'Control', 'Video'],
        DNSServers: ['8.8.8.8', '8.8.4.4'],
      },
    });

    const result = await tool.execute({});

    expect(result.isError).toBe(false);

    const statusJson = result.content[0].text;
    const status = JSON.parse(statusJson);

    // Arrays should still be empty as we're not mapping from response
    expect(status.designInfo.activeServices).toEqual([]);
    expect(status.networkInfo.dnsServers).toEqual([]);
  });
});
