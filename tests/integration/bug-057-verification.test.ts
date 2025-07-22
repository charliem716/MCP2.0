/**
 * BUG-057 Verification Test
 * 
 * This integration test verifies that the query_core_status tool properly
 * falls back to reading status components when StatusGet fails.
 */

import { QueryCoreStatusTool } from '../../src/mcp/tools/status.js';
import type { QRWCClientInterface } from '../../src/mcp/qrwc/adapter.js';

describe('BUG-057: query_core_status fallback behavior', () => {
  let mockQrwcClient: QRWCClientInterface;
  let tool: QueryCoreStatusTool;

  beforeEach(() => {
    mockQrwcClient = {
      isConnected: jest.fn().mockReturnValue(true),
      sendCommand: jest.fn()
    };
    tool = new QueryCoreStatusTool(mockQrwcClient);
  });

  it('should return real status data from components when StatusGet fails', async () => {
    // Mock the expected behavior:
    // 1. StatusGet fails
    // 2. Component.GetComponents returns status components
    // 3. Component.GetControls returns real control values
    
    (mockQrwcClient.sendCommand as jest.Mock)
      .mockRejectedValueOnce(new Error('StatusGet not supported'))
      .mockResolvedValueOnce({
        // Simulating real Q-SYS components from bug report examples
        result: [
          { Name: 'Status_Table Mic', Type: 'Status Combiner' },
          { Name: 'Status_Soundbar', Type: 'Device Monitor' },
          { Name: 'Status_NV32_Core', Type: 'Core Status' },
          { Name: 'Gain_1', Type: 'Gain' }, // Should be ignored
        ]
      })
      .mockResolvedValueOnce({
        // Status_Table Mic controls
        result: {
          Name: 'Status_Table Mic',
          Controls: [
            { Name: 'Connected', Value: true, String: 'true', Type: 'Boolean', Direction: 'Read' },
            { Name: 'Battery_Level', Value: 85, String: '85%', Type: 'Float', Direction: 'Read' },
            { Name: 'Signal_Strength', Value: 'Excellent', String: 'Excellent', Type: 'String', Direction: 'Read' }
          ]
        }
      })
      .mockResolvedValueOnce({
        // Status_Soundbar controls
        result: {
          Name: 'Status_Soundbar',
          Controls: [
            { Name: 'Online', Value: true, String: 'true', Type: 'Boolean', Direction: 'Read' },
            { Name: 'IP_Address', Value: '192.168.1.101', String: '192.168.1.101', Type: 'String', Direction: 'Read' },
            { Name: 'Last_Seen', Value: '2 seconds ago', String: '2 seconds ago', Type: 'String', Direction: 'Read' }
          ]
        }
      })
      .mockResolvedValueOnce({
        // Status_NV32_Core controls
        result: {
          Name: 'Status_NV32_Core',
          Controls: [
            { Name: 'CPU_Usage', Value: 15, String: '15%', Type: 'Float', Direction: 'Read' },
            { Name: 'Temperature', Value: 45, String: '45°C', Type: 'Float', Direction: 'Read' },
            { Name: 'Uptime', Value: '5 days 3:24:15', String: '5 days 3:24:15', Type: 'String', Direction: 'Read' }
          ]
        }
      });

    const result = await tool.execute({});
    
    expect(result.isError).toBe(false);
    
    const statusData = JSON.parse(result.content[0].text);
    
    // Verify the structure has status components grouped by category
    expect(statusData).toHaveProperty('_metadata');
    expect(statusData._metadata.source).toBe('status_components');
    expect(statusData._metadata.method).toBe('component_scan');
    
    // Verify we got real status data (components can be in different categories)
    // Status_Table Mic should be in PeripheralStatus (has 'mic' in name)
    expect(statusData.PeripheralStatus).toBeDefined();
    expect(statusData.PeripheralStatus['Status_Table Mic']).toMatchObject({
      'Connected': { value: true, string: 'true', type: 'Boolean' },
      'Battery Level': { value: 85, string: '85%', type: 'Float' },
      'Signal Strength': { value: 'Excellent', string: 'Excellent', type: 'String' }
    });
    
    // Status_Soundbar goes to GeneralStatus (doesn't match peripheral keywords)
    expect(statusData.GeneralStatus).toBeDefined();
    expect(statusData.GeneralStatus['Status_Soundbar']).toMatchObject({
      'Online': { value: true, string: 'true', type: 'Boolean' },
      'Ip Address': { value: '192.168.1.101', string: '192.168.1.101', type: 'String' },
      'Last Seen': { value: '2 seconds ago', string: '2 seconds ago', type: 'String' }
    });
    
    // Verify core status data
    expect(statusData.CoreStatus['Status_NV32_Core']).toMatchObject({
      'Cpu Usage': { value: 15, string: '15%', type: 'Float' },
      'Temperature': { value: 45, string: '45°C', type: 'Float' },
      'Uptime': { value: '5 days 3:24:15', string: '5 days 3:24:15', type: 'String' }
    });
    
    
    // Verify it tried StatusGet first then fell back
    expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Status.Get');
    expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Component.GetComponents');
    expect(mockQrwcClient.sendCommand).toHaveBeenCalledTimes(5); // StatusGet + GetComponents + 3x GetControls
  });

  it('should handle no status components scenario', async () => {
    (mockQrwcClient.sendCommand as jest.Mock)
      .mockRejectedValueOnce(new Error('StatusGet not supported'))
      .mockResolvedValueOnce({
        result: [
          { Name: 'Gain_1', Type: 'Gain' },
          { Name: 'Mixer_1', Type: 'Mixer' },
          { Name: 'EQ_1', Type: 'EQ' }
        ]
      });

    const result = await tool.execute({});
    
    expect(result.isError).toBe(false);
    
    const response = JSON.parse(result.content[0].text);
    
    // Should return the "no components" message as specified in bug report
    expect(response).toMatchObject({
      message: 'No status components detected',
      componentCount: 3,
      suggestion: 'Status components typically have \'Status\' in their name'
    });
  });
});