/**
 * Test for BUG-057: Verify status tool detects adapter fallback data
 */

import { QueryCoreStatusTool } from '../../../../src/mcp/tools/status.js';
import type { QRWCClientInterface } from '../../../../src/mcp/qrwc/adapter.js';

describe('Status tool fallback detection', () => {
  let mockQrwcClient: QRWCClientInterface;
  let tool: QueryCoreStatusTool;

  beforeEach(() => {
    mockQrwcClient = {
      isConnected: jest.fn().mockReturnValue(true),
      sendCommand: jest.fn(),
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

  it('should detect adapter fallback data and trigger component scanning', async () => {
    // Mock adapter returning fallback data (not throwing error)
    (mockQrwcClient.sendCommand as jest.Mock)
      .mockResolvedValueOnce({
        // This is what adapter returns when StatusGet fails
        Platform: 'Q-SYS Core (API: StatusGet not supported)',
        State: 'Active',
        DesignName: 'Design with 43 components',
        DesignCode: '43_components',
        IsRedundant: false,
        IsEmulator: false,
        Status: {
          Code: 0,
          String: 'OK',
        },
        Version: 'QRWC Connection Active',
        IsConnected: true,
        ComponentCount: 43,
        ControlCount: 156,
      })
      .mockResolvedValueOnce({
        // Component.GetComponents response
        result: [
          { Name: 'Status_Device', Type: 'Status Combiner' },
          { Name: 'Gain_1', Type: 'Gain' },
        ],
      })
      .mockResolvedValueOnce({
        // Component.GetControls for Status_Device
        result: {
          Name: 'Status_Device',
          Controls: [
            {
              Name: 'Health',
              Value: 'Good',
              String: 'Good',
              Type: 'String',
              Direction: 'Read',
            },
          ],
        },
      });

    const result = await tool.execute({});

    expect(result.isError).toBe(false);

    // Parse the response
    const statusData = JSON.parse(result.content[0].text);

    // Should have used component scanning
    expect(statusData._metadata).toBeDefined();
    expect(statusData._metadata.source).toBe('status_components');
    expect(statusData._metadata.method).toBe('component_scan');

    // Should have found the status component
    expect(statusData.GeneralStatus).toBeDefined();
    expect(statusData.GeneralStatus['Status_Device']).toBeDefined();
    expect(statusData.GeneralStatus['Status_Device']['Health'].value).toBe(
      'Good'
    );

    // Verify it detected fallback and scanned components
    expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Status.Get');
    expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
      'Component.GetComponents'
    );

    // Check logger was called about fallback detection
    expect(tool.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('StatusGet command failed'),
      expect.any(Object)
    );
  });

  it('should use real StatusGet data when available', async () => {
    // Mock real StatusGet response (no fallback indicator)
    (mockQrwcClient.sendCommand as jest.Mock).mockResolvedValueOnce({
      Platform: 'Core 110f',
      State: 'Active',
      DesignName: 'Conference Room',
      DesignCode: 'abc123',
      IsRedundant: false,
      IsEmulator: false,
      Status: {
        Code: 0,
        String: 'OK',
      },
      Version: '9.8.1',
      IsConnected: true,
    });

    const result = await tool.execute({});

    expect(result.isError).toBe(false);

    const statusData = JSON.parse(result.content[0].text);

    // Should NOT have component scan metadata
    expect(statusData._metadata).toBeUndefined();

    // Should have real platform data
    expect(statusData.Platform).toBe('Core 110f');
    expect(statusData.DesignName).toBe('Conference Room');

    // Should only call StatusGet, not component scanning
    expect(mockQrwcClient.sendCommand).toHaveBeenCalledTimes(1);
    expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Status.Get');
  });
});
