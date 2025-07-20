import { QRWCClientAdapter } from '../../../../src/mcp/qrwc/adapter.js';
import { OfficialQRWCClient } from '../../../../src/qrwc/officialClient.js';

describe('QRWCClientAdapter - Status.Get', () => {
  let mockOfficialClient: jest.Mocked<OfficialQRWCClient>;
  let adapter: QRWCClientAdapter;

  beforeEach(() => {
    mockOfficialClient = {
      isConnected: jest.fn().mockReturnValue(true),
      sendRawCommand: jest.fn(),
      getQrwc: jest.fn(),
      getComponent: jest.fn(),
      setControlValue: jest.fn()
    } as any;

    adapter = new QRWCClientAdapter(mockOfficialClient);
  });

  describe('Status.Get command', () => {
    it('should query actual Core status and return formatted response', async () => {
      const mockStatusResponse = {
        result: {
          Platform: "Core 510i",
          Version: "9.5.0",
          State: "Active",
          DesignName: "Conference_Room_v2",
          DesignCode: "ABCD1234",
          IsRedundant: false,
          IsEmulator: false,
          Status: {
            String: "OK",
            Code: 0,
            PercentCPU: 23.5,
            PercentMemory: 45.2
          },
          Uptime: 864000,
          Network: {
            IP: "192.168.50.150",
            MAC: "00:11:22:33:44:55"
          }
        }
      };

      mockOfficialClient.sendRawCommand.mockResolvedValue(mockStatusResponse);

      const result = await adapter.sendCommand('Status.Get');

      // Verify sendRawCommand was called correctly
      expect(mockOfficialClient.sendRawCommand).toHaveBeenCalledWith('StatusGet', {});

      // Verify the response structure
      expect(result).toEqual({
        result: {
          Platform: "Core 510i",
          Version: "9.5.0",
          DesignName: "Conference_Room_v2",
          DesignCode: "ABCD1234",
          Status: {
            Name: "OK",
            Code: 0,
            PercentCPU: 23.5,
            PercentMemory: 45.2
          },
          IsConnected: true,
          IsRedundant: false,
          IsEmulator: false,
          State: "Active",
          name: "Q-SYS-Core-Connected",
          version: "9.5.0",
          uptime: 864000,
          status: "OK",
          connected: true,
          client: "official-qrwc",
          Network: {
            IP: "192.168.50.150",
            MAC: "00:11:22:33:44:55"
          }
        }
      });
    });

    it('should handle StatusGet alias', async () => {
      const mockStatusResponse = {
        result: {
          Platform: "Core 110f",
          Version: "9.8.0",
          State: "Active",
          Status: {
            String: "OK",
            Code: 0
          }
        }
      };

      mockOfficialClient.sendRawCommand.mockResolvedValue(mockStatusResponse);

      const result = await adapter.sendCommand('StatusGet');

      expect(mockOfficialClient.sendRawCommand).toHaveBeenCalledWith('StatusGet', {});
      expect(result).toHaveProperty('result.Platform', 'Core 110f');
      expect(result).toHaveProperty('result.Status.Name', 'OK');
    });

    it('should handle missing fields gracefully', async () => {
      const mockStatusResponse = {
        result: {}
      };

      mockOfficialClient.sendRawCommand.mockResolvedValue(mockStatusResponse);

      const result = await adapter.sendCommand('Status.Get');

      expect(result).toHaveProperty('result.Platform', 'Unknown');
      expect(result).toHaveProperty('result.Version', 'Unknown');
      expect(result).toHaveProperty('result.DesignName', 'No Design Loaded');
      expect(result).toHaveProperty('result.Status.Name', 'Unknown');
      expect(result).toHaveProperty('result.Status.Code', 0);
      expect(result).toHaveProperty('result.IsConnected', true);
    });

    it('should handle errors and return fallback response', async () => {
      mockOfficialClient.sendRawCommand.mockRejectedValue(new Error('Connection failed'));

      const result = await adapter.sendCommand('Status.Get');

      expect(result).toHaveProperty('result.Platform', 'Unknown');
      expect(result).toHaveProperty('result.Status.Name', 'Error');
      expect(result).toHaveProperty('result.Status.Code', -1);
      expect(result).toHaveProperty('result.error', 'Connection failed');
    });

    it('should reflect disconnected state', async () => {
      mockOfficialClient.isConnected.mockReturnValue(false);
      mockOfficialClient.sendRawCommand.mockRejectedValue(new Error('Not connected'));

      const result = await adapter.sendCommand('Status.Get');

      expect(result).toHaveProperty('result.IsConnected', false);
      expect(result).toHaveProperty('result.name', 'Q-SYS-Core-Disconnected');
    });
  });
});