import { QRWCClientAdapter } from '../../../../src/mcp/qrwc/adapter.js';
import { OfficialQRWCClient } from '../../../../src/qrwc/officialClient.js';

describe('QRWCClientAdapter - Status.Get', () => {
  let mockOfficialClient: jest.Mocked<OfficialQRWCClient>;
  let adapter: QRWCClientAdapter;

  beforeEach(() => {
    mockOfficialClient = {
      isConnected: jest.fn().mockReturnValue(true),
      getQrwc: jest.fn(),
      getComponent: jest.fn(),
      setControlValue: jest.fn()
    } as any;

    adapter = new QRWCClientAdapter(mockOfficialClient);
  });

  describe('Status.Get command', () => {
    it('should return simplified status when connected', async () => {
      mockOfficialClient.isConnected.mockReturnValue(true);

      const result = await adapter.sendCommand('Status.Get');

      // Verify the response structure
      expect(result).toEqual({
        result: {
          Platform: "Q-SYS Core",
          Version: "Unknown",
          DesignName: "Unknown",
          DesignCode: "",
          Status: {
            Name: "OK",
            Code: 0,
            PercentCPU: 0,
            PercentMemory: 0
          },
          IsConnected: true,
          IsRedundant: false,
          IsEmulator: false,
          State: "Active",
          name: "Q-SYS-Core-Connected",
          version: "Unknown",
          uptime: "Unknown",
          status: "OK",
          connected: true,
          client: "official-qrwc",
          note: "Limited status information available without raw command access"
        }
      });
    });

    it('should handle StatusGet alias', async () => {
      mockOfficialClient.isConnected.mockReturnValue(true);

      const result = await adapter.sendCommand('StatusGet');

      expect(result).toHaveProperty('result.Platform', 'Q-SYS Core');
      expect(result).toHaveProperty('result.Status.Name', 'OK');
      expect(result).toHaveProperty('result.IsConnected', true);
    });

    it('should reflect disconnected state', async () => {
      mockOfficialClient.isConnected.mockReturnValue(false);

      const result = await adapter.sendCommand('Status.Get');

      expect(result).toHaveProperty('result.IsConnected', false);
      expect(result).toHaveProperty('result.name', 'Q-SYS-Core-Disconnected');
      expect(result).toHaveProperty('result.Status.Name', 'Disconnected');
      expect(result).toHaveProperty('result.Status.Code', -1);
      expect(result).toHaveProperty('result.State', 'Disconnected');
    });
  });
});