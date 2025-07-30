import { QueryCoreStatusTool } from '../../../../src/mcp/tools/status';
import { MCPError, MCPErrorCode } from '../../../../src/shared/types/errors.js';

describe('QueryCoreStatusTool - Edge Cases for 80% Coverage', () => {
  let mockQrwcClient: any;
  let tool: QueryCoreStatusTool;

  beforeEach(() => {
    mockQrwcClient = {
      sendCommand: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
    };
    tool = new QueryCoreStatusTool(mockQrwcClient);
    // @ts-expect-error - accessing private property for testing
    tool.logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
  });

  describe('formatStatusResponse', () => {
    it('should format status response with all options', async () => {
      const status = {
        coreInfo: {
          name: 'Q-SYS Core',
          version: '9.0.0',
          model: 'Core 110f',
          platform: 'Core 110f',
          serialNumber: 'QSC123456',
          firmwareVersion: '9.0.0',
          buildTime: '2023-01-01',
          designName: 'Conference Room'
        },
        connectionStatus: {
          connected: true,
          uptime: '5 days',
          lastSeen: new Date().toISOString()
        },
        systemHealth: {
          status: 'OK',
          temperature: 45,
          fanSpeed: 2000,
          powerSupplyStatus: 'Normal'
        },
        designInfo: {
          designCompiled: true,
          compileTime: '2023-01-01',
          processingLoad: 35,
          componentCount: 42,
          snapshotCount: 5,
          activeServices: ['Audio', 'Control']
        },
        networkInfo: {
          ipAddress: '192.168.1.100',
          macAddress: '00:11:22:33:44:55',
          gateway: '192.168.1.1',
          dnsServers: ['8.8.8.8'],
          ntpServer: 'time.nist.gov',
          networkMode: 'Static'
        },
        performanceMetrics: {
          cpuUsage: 25,
          memoryUsage: 60,
          memoryUsedMB: 1024,
          memoryTotalMB: 2048,
          audioLatency: 5,
          networkLatency: 1,
          fanSpeed: 2000
        },
        Platform: 'Core 110f',
        Version: '9.0.0',
        DesignName: 'Conference Room',
        DesignCode: 'abc123',
        Status: {
          Name: 'OK',
          Code: 0,
          PercentCPU: 25
        },
        IsConnected: true
      };

      // @ts-expect-error - accessing private method for testing
      const formatted = tool.formatStatusResponse(status, {
        includeNetworkInfo: true,
        includePerformance: true
      });

      expect(formatted).toContain('Q-SYS Core Status');
      expect(formatted).toContain('Design: Conference Room');
      expect(formatted).toContain('Platform: Core 110f');
      expect(formatted).toContain('Model: Core 110f');
      expect(formatted).toContain('Connection: Connected');
      expect(formatted).toContain('System Status: OK');
      expect(formatted).toContain('Network Information:');
      expect(formatted).toContain('IP Address: 192.168.1.100');
      expect(formatted).toContain('Performance:');
      expect(formatted).toContain('CPU Usage: 25%');
      expect(formatted).toContain('Memory Usage: 60%');
    });

    it('should format status without optional sections', async () => {
      const status = {
        coreInfo: {
          name: 'Q-SYS Core',
          version: '9.0.0',
          model: '',
          platform: 'Core 110f',
          serialNumber: 'QSC123456',
          firmwareVersion: '9.0.0',
          buildTime: '2023-01-01',
          designName: 'Test'
        },
        connectionStatus: {
          connected: false,
          uptime: '0 days',
          lastSeen: new Date().toISOString()
        },
        systemHealth: {
          status: 'Error',
          temperature: 0,
          fanSpeed: 0,
          powerSupplyStatus: 'Unknown'
        },
        designInfo: {
          designCompiled: false,
          compileTime: 'Unknown',
          processingLoad: 0,
          componentCount: 0,
          snapshotCount: 0,
          activeServices: []
        },
        networkInfo: {
          ipAddress: 'Unknown',
          macAddress: 'Unknown',
          gateway: 'Unknown',
          dnsServers: [],
          ntpServer: 'Unknown',
          networkMode: 'Unknown'
        },
        performanceMetrics: {
          cpuUsage: 0,
          memoryUsage: 0,
          memoryUsedMB: 0,
          memoryTotalMB: 0,
          audioLatency: 0,
          networkLatency: 0,
          fanSpeed: 0
        },
        Platform: 'Core 110f',
        Version: '9.0.0',
        DesignName: 'Test',
        DesignCode: 'test123',
        Status: {
          Name: 'Error',
          Code: 1,
          PercentCPU: 0
        },
        IsConnected: false
      };

      // @ts-expect-error - accessing private method for testing
      const formatted = tool.formatStatusResponse(status, {
        includeNetworkInfo: true,
        includePerformance: true
      });

      expect(formatted).toContain('Connection: Disconnected');
      expect(formatted).toContain('System Status: Error');
      expect(formatted).not.toContain('Model:'); // Empty model should not be shown
      expect(formatted).not.toContain('IP Address:'); // Unknown IP should not be shown
      expect(formatted).not.toContain('CPU Usage: 0%'); // 0% CPU should not be shown
      expect(formatted).not.toContain('Memory Usage: 0%'); // 0% memory should not be shown
    });
  });

  describe('formatValue', () => {
    it('should handle various value types', async () => {
      // @ts-expect-error - accessing private method for testing
      expect(tool.formatValue(null)).toBe(null);
      // @ts-expect-error - accessing private method for testing
      expect(tool.formatValue(undefined)).toBe(null);
      // @ts-expect-error - accessing private method for testing
      expect(tool.formatValue('test')).toBe('test');
      // @ts-expect-error - accessing private method for testing
      expect(tool.formatValue(123)).toBe('123');
      // @ts-expect-error - accessing private method for testing
      expect(tool.formatValue(true)).toBe('true');
      // @ts-expect-error - accessing private method for testing
      expect(tool.formatValue({ address: '192.168.1.1' })).toBe('192.168.1.1');
      // @ts-expect-error - accessing private method for testing
      expect(tool.formatValue({ value: 'test-value' })).toBe('test-value');
      // @ts-expect-error - accessing private method for testing
      expect(tool.formatValue({})).toBe(null); // Empty object returns null
      // @ts-expect-error - accessing private method for testing
      expect(tool.formatValue({ data: 'test' })).toBe('{"data":"test"}'); // Other objects stringified
      
      // Test circular reference handling
      const circular: any = { a: 1 };
      circular.self = circular;
      // @ts-expect-error - accessing private method for testing
      expect(tool.formatValue(circular)).toBe(null); // Circular reference returns null
    });
  });

  describe('getNestedValue', () => {
    it('should get nested values correctly', async () => {
      const obj = {
        level1: {
          level2: {
            level3: 'value'
          },
          array: [1, 2, 3]
        },
        simple: 'direct'
      };

      // @ts-expect-error - accessing private method for testing
      expect(tool.getNestedValue(obj, 'simple')).toBe('direct');
      // @ts-expect-error - accessing private method for testing
      expect(tool.getNestedValue(obj, 'level1.level2.level3')).toBe('value');
      // @ts-expect-error - accessing private method for testing
      expect(tool.getNestedValue(obj, 'level1.array')).toEqual([1, 2, 3]);
      // @ts-expect-error - accessing private method for testing
      expect(tool.getNestedValue(obj, 'level1.missing')).toBe(undefined);
      // @ts-expect-error - accessing private method for testing
      expect(tool.getNestedValue(obj, 'missing.path')).toBe(undefined);
      // @ts-expect-error - accessing private method for testing
      expect(tool.getNestedValue(null, 'any.path')).toBe(undefined);
      // @ts-expect-error - accessing private method for testing
      expect(tool.getNestedValue('string', 'any.path')).toBe(undefined);
    });
  });

  describe('normalizeControlName', () => {
    it('should normalize control names correctly', async () => {
      // @ts-expect-error - accessing private method for testing
      expect(tool.normalizeControlName('status_cpu_usage')).toBe('Cpu Usage');
      // @ts-expect-error - accessing private method for testing
      expect(tool.normalizeControlName('health_temperature_state')).toBe('Temperature');
      // @ts-expect-error - accessing private method for testing
      expect(tool.normalizeControlName('state_active')).toBe('Active');
      // @ts-expect-error - accessing private method for testing
      expect(tool.normalizeControlName('system_health_status')).toBe('System Health');
      // @ts-expect-error - accessing private method for testing
      expect(tool.normalizeControlName('simple')).toBe('Simple');
    });
  });

  describe('categorizeComponent', () => {
    it('should categorize components correctly', async () => {
      // @ts-expect-error - accessing private method for testing
      expect(tool.categorizeComponent('Core_Status')).toBe('CoreStatus');
      // @ts-expect-error - accessing private method for testing
      expect(tool.categorizeComponent('System_Health')).toBe('CoreStatus');
      // @ts-expect-error - accessing private method for testing
      expect(tool.categorizeComponent('network_monitor')).toBe('NetworkStatus');
      // @ts-expect-error - accessing private method for testing
      expect(tool.categorizeComponent('ethernet_status')).toBe('NetworkStatus');
      // @ts-expect-error - accessing private method for testing
      expect(tool.categorizeComponent('touchpanel_1')).toBe('PeripheralStatus');
      // @ts-expect-error - accessing private method for testing
      expect(tool.categorizeComponent('mic_array')).toBe('PeripheralStatus');
      // @ts-expect-error - accessing private method for testing
      expect(tool.categorizeComponent('camera_ptz')).toBe('PeripheralStatus');
      // @ts-expect-error - accessing private method for testing
      expect(tool.categorizeComponent('display_hdmi')).toBe('PeripheralStatus');
      // @ts-expect-error - accessing private method for testing
      expect(tool.categorizeComponent('other_device')).toBe('GeneralStatus');
    });
  });

  describe('getStatusScore', () => {
    it('should calculate status scores correctly', async () => {
      // High score - status component
      const statusComp = {
        Name: 'system_status_monitor',
        Type: 'Status Combiner',
        Properties: [
          { Name: 'status', Value: 'OK' },
          { Name: 'health', Value: 'Good' }
        ]
      };
      // @ts-expect-error - accessing private method for testing
      expect(tool.getStatusScore(statusComp)).toBeGreaterThanOrEqual(10);

      // Medium score - has status in name
      const mediumComp = {
        Name: 'device_status',
        Type: 'Generic',
        Properties: []
      };
      // @ts-expect-error - accessing private method for testing
      expect(tool.getStatusScore(mediumComp)).toBeGreaterThanOrEqual(3);

      // Low/negative score - audio component
      const audioComp = {
        Name: 'main_mixer',
        Type: 'Mixer',
        Properties: []
      };
      // @ts-expect-error - accessing private method for testing
      expect(tool.getStatusScore(audioComp)).toBeLessThan(0);

      // Test with no properties
      const noPropsComp = {
        Name: 'status_device',
        Type: 'Device Monitor',
        Properties: null as any
      };
      // @ts-expect-error - accessing private method for testing
      expect(tool.getStatusScore(noPropsComp)).toBeGreaterThan(0);
    });
  });

  describe('error response handling', () => {
    it('should handle API error response', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({
        error: {
          code: -32602,
          message: 'Invalid params'
        }
        // No result property
      });

      const result = await tool.execute({});
      expect(result.isError).toBe(false); // Falls back to component-based status
      const status = JSON.parse(result.content[0].text);
      expect(status).toBeDefined();
    });

    it('should handle response without Platform in fallback', async () => {
      // Mock the fallback behavior when Platform causes issues
      mockQrwcClient.sendCommand
        .mockRejectedValueOnce(new Error('Invalid Platform')) // StatusGet fails
        .mockResolvedValueOnce({ // Component.GetComponents for fallback
          result: []
        });

      const result = await tool.execute({});
      expect(result.isError).toBe(false);
      const status = JSON.parse(result.content[0].text);
      
      // Fallback returns different structure
      expect(status).toBeDefined();
      expect(status.message).toBe('No status components detected');
      expect(status.componentCount).toBe(0);
    });

    it('should extract status from direct object format', async () => {
      const mockResponse = {
        result: {
          Platform: 'Core 110f',
          Version: '9.0.0',
          DesignName: 'Test',
          Status: { String: 'OK', Code: 0 },
          State: 'Active',
          IsConnected: true,
          DesignCode: 'test123'
        }
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute({});
      expect(result.isError).toBe(false);
      const status = JSON.parse(result.content[0].text);
      expect(status.coreInfo.platform).toBe('Core 110f');
    });
  });

  describe('buildNetworkInfo edge cases', () => {
    it('should handle nested network data', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({
        result: {
          Platform: 'Core 110f',
          DesignName: 'Test',
          Status: { String: 'OK', Code: 0 },
          Network: {
            LAN_A: {
              IP: '192.168.1.100',
              Gateway: '192.168.1.1'
            }
          }
        }
      });

      const result = await tool.execute({ includeNetworkInfo: true });
      const status = JSON.parse(result.content[0].text);
      expect(status.networkInfo.ipAddress).toBe('192.168.1.100');
      expect(status.networkInfo.gateway).toBe('192.168.1.1');
    });

    it('should handle legacy network fields', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({
        result: {
          Platform: 'Core 110f',
          DesignName: 'Test',
          Status: { String: 'OK', Code: 0 },
          ipAddress: '10.0.0.100',
          gateway: '10.0.0.1',
          macAddress: 'AA:BB:CC:DD:EE:FF'
        }
      });

      const result = await tool.execute({ includeNetworkInfo: true });
      const status = JSON.parse(result.content[0].text);
      expect(status.networkInfo.ipAddress).toBe('10.0.0.100');
      expect(status.networkInfo.gateway).toBe('10.0.0.1');
      expect(status.networkInfo.macAddress).toBe('AA:BB:CC:DD:EE:FF');
    });
  });

  describe('organizeStatusData', () => {
    it('should organize status data with metadata', async () => {
      const statusData = {
        CoreStatus: {
          'System_Health': {
            'CPU Usage': { value: 25, string: '25%' },
            'Temperature': { value: 45, string: '45°C' }
          }
        },
        NetworkStatus: {},
        PeripheralStatus: {
          'Mic_1': {
            'Connected': { value: true, string: 'Yes' }
          }
        }
      };

      // @ts-expect-error - accessing private method for testing
      const organized = tool.organizeStatusData(statusData);
      
      expect(organized).toHaveProperty('CoreStatus');
      expect(organized).toHaveProperty('PeripheralStatus');
      expect(organized).not.toHaveProperty('NetworkStatus'); // Empty category excluded
      expect(organized).toHaveProperty('_metadata');
      expect(organized._metadata).toMatchObject({
        source: 'status_components',
        method: 'component_scan'
      });
    });
  });

  describe('component control retrieval error handling', () => {
    it('should handle invalid controls response format', async () => {
      mockQrwcClient.sendCommand
        .mockRejectedValueOnce(new Error('StatusGet failed'))
        .mockResolvedValueOnce({
          result: [{ Name: 'Status_Device', Type: 'Status Combiner' }]
        })
        .mockResolvedValueOnce({
          // Invalid response - no result property
          Controls: []
        });

      const result = await tool.execute({});
      expect(result.isError).toBe(false);
      const status = JSON.parse(result.content[0].text);
      expect(status._metadata.source).toBe('status_components');
    });

    it('should handle controls array without result wrapper', async () => {
      mockQrwcClient.sendCommand
        .mockRejectedValueOnce(new Error('StatusGet failed'))
        .mockResolvedValueOnce({
          result: [{ Name: 'Status_Device', Type: 'Status Combiner' }]
        })
        .mockResolvedValueOnce({
          result: {
            // Missing Controls array
            Name: 'Status_Device'
          }
        });

      const result = await tool.execute({});
      expect(result.isError).toBe(false);
      const status = JSON.parse(result.content[0].text);
      // Device gets categorized under GeneralStatus with empty controls
      expect(status.GeneralStatus).toBeDefined();
      expect(status.GeneralStatus.Status_Device).toBeDefined();
      expect(Object.keys(status.GeneralStatus.Status_Device)).toHaveLength(0);
    });
  });
});