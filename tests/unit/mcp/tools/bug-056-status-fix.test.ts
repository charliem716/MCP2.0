import { QRWCClientAdapter } from '../../../../src/mcp/qrwc/adapter.js';
import { OfficialQRWCClient } from '../../../../src/qrwc/officialClient.js';
import { createLogger } from '../../../../src/shared/utils/logger.js';
import type { QSysStatusGetResponse } from '../../../../src/mcp/types/qsys-api-responses.js';

// Mock the logger
jest.mock('../../../../src/shared/utils/logger.js', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })),
  globalLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('BUG-056: Status.Get returns actual Q-SYS Core data', () => {
  let adapter: QRWCClientAdapter;
  let mockClient: Partial<OfficialQRWCClient>;
  let mockSendRawCommand: jest.Mock;

  beforeEach(() => {
    mockSendRawCommand = jest.fn();
    
    mockClient = {
      isConnected: jest.fn().mockReturnValue(true),
      sendRawCommand: mockSendRawCommand,
      getQrwc: jest.fn().mockReturnValue({
        components: {}
      })
    };

    adapter = new QRWCClientAdapter(mockClient as OfficialQRWCClient);
  });

  it('should return actual Q-SYS Core status data when available', async () => {
    // Mock actual Q-SYS Status.Get response
    const mockStatusResponse: QSysStatusGetResponse = {
      Platform: "Core 510i",
      State: "Active",
      DesignName: "Conference Room Audio",
      DesignCode: "qALFilm6IcAz",
      IsRedundant: false,
      IsEmulator: false,
      Status: {
        Code: 0,
        String: "OK"
      },
      Version: "9.4.1",
      IsConnected: true
    };

    mockSendRawCommand.mockResolvedValue(mockStatusResponse);

    // Execute Status.Get command
    const result = await adapter.sendCommand("Status.Get", {});

    // Verify raw command was called
    expect(mockSendRawCommand).toHaveBeenCalledWith("Status.Get", {});

    // Verify actual data is returned
    expect(result).toEqual({ result: mockStatusResponse });
    expect(result.result).toMatchObject({
      Platform: "Core 510i",
      Version: "9.4.1",
      DesignName: "Conference Room Audio",
      DesignCode: "qALFilm6IcAz",
      State: "Active",
      Status: {
        Code: 0,
        String: "OK"
      }
    });
  });

  it('should handle different Q-SYS Core models correctly', async () => {
    const mockStatusResponse: QSysStatusGetResponse = {
      Platform: "Core Nano",
      State: "Active",
      DesignName: "Small Meeting Room",
      DesignCode: "xyz123",
      IsRedundant: true,
      IsEmulator: false,
      Status: {
        Code: 0,
        String: "OK"
      },
      Version: "9.5.0"
    };

    mockSendRawCommand.mockResolvedValue(mockStatusResponse);

    const result = await adapter.sendCommand("Status.Get", {});

    expect(result.result).toMatchObject({
      Platform: "Core Nano",
      Version: "9.5.0",
      IsRedundant: true
    });
  });

  it('should throw error when raw command fails', async () => {
    // Mock raw command failure
    mockSendRawCommand.mockRejectedValue(new Error('Raw command not supported'));

    // Execute Status.Get command and expect it to throw
    await expect(adapter.sendCommand("Status.Get", {})).rejects.toThrow(
      'Unable to retrieve Q-SYS Core status: Raw command not supported. The Status.Get command may not be supported by your Q-SYS Core firmware version.'
    );
  });

  it('should handle StatusGet alias correctly', async () => {
    const mockStatusResponse: QSysStatusGetResponse = {
      Platform: "Core 110f",
      State: "Active",
      DesignName: "Theater System",
      DesignCode: "abc789",
      IsRedundant: false,
      IsEmulator: false,
      Status: {
        Code: 0,
        String: "OK"
      }
    };

    mockSendRawCommand.mockResolvedValue(mockStatusResponse);

    // Test with StatusGet alias
    const result = await adapter.sendCommand("StatusGet", {});

    expect(mockSendRawCommand).toHaveBeenCalledWith("Status.Get", {});
    expect(result.result).toMatchObject({
      Platform: "Core 110f",
      DesignName: "Theater System"
    });
  });

  it('should throw error when disconnected', async () => {
    mockSendRawCommand.mockRejectedValue(new Error('Not connected'));
    (mockClient.isConnected as jest.Mock).mockReturnValue(false);

    await expect(adapter.sendCommand("Status.Get", {})).rejects.toThrow(
      'Unable to retrieve Q-SYS Core status: Not connected'
    );
  });
});