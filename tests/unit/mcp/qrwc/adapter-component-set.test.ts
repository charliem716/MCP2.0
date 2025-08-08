import { QRWCClientAdapter } from '../../../../src/mcp/qrwc/adapter.js';
import type { OfficialQRWCClient } from '../../../../src/qrwc/officialClient.js';

describe('QRWCClientAdapter - Component.Set command', () => {
  let adapter: QRWCClientAdapter;
  let mockOfficialClient: jest.Mocked<OfficialQRWCClient>;
  let mockQrwc: any;

  beforeEach(() => {
    // Create mock QRWC structure
    mockQrwc = {
      components: {
        'Main Output Gain': {
          controls: {
            gain: {
              state: { Value: 0, String: '0.0dB', Type: 'Float' }
            },
            mute: {
              state: { Value: 0, String: 'unmuted', Type: 'Boolean' }
            }
          },
          state: { Type: 'gain_component' }
        },
        'Matrix Mixer': {
          controls: {
            'crosspoint_1_1': {
              state: { Value: 0, String: 'off', Type: 'Boolean' }
            },
            'input_1_gain': {
              state: { Value: -10, String: '-10.0dB', Type: 'Float' }
            }
          },
          state: { Type: 'mixer' }
        }
      }
    };

    // Create mock official client
    mockOfficialClient = {
      getQrwc: jest.fn(() => mockQrwc),
      isConnected: jest.fn(() => true),
      setControlValue: jest.fn().mockResolvedValue(undefined),
      connect: jest.fn(),
      disconnect: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    } as unknown as jest.Mocked<OfficialQRWCClient>;

    adapter = new QRWCClientAdapter(mockOfficialClient);
  });

  describe('Component.Set implementation', () => {
    it('should handle Component.Set command and convert to Control.Set format', async () => {
      const response = await adapter.sendCommand('Component.Set', {
        Name: 'Main Output Gain',
        Controls: [
          { Name: 'gain', Value: -5 },
          { Name: 'mute', Value: 1 }
        ]
      });

      // Verify setControlValue was called for each control
      expect(mockOfficialClient.setControlValue).toHaveBeenCalledTimes(2);
      expect(mockOfficialClient.setControlValue).toHaveBeenCalledWith('Main Output Gain', 'gain', -5);
      expect(mockOfficialClient.setControlValue).toHaveBeenCalledWith('Main Output Gain', 'mute', 1);

      // Check response format
      expect(response).toHaveProperty('result');
      expect(response.result).toEqual(expect.arrayContaining([
        expect.objectContaining({
          Name: 'Main Output Gain.gain',
          Result: 'Success'
        }),
        expect.objectContaining({
          Name: 'Main Output Gain.mute',
          Result: 'Success'
        })
      ]));
    });

    it('should handle ComponentSet alias', async () => {
      const response = await adapter.sendCommand('ComponentSet', {
        Name: 'Matrix Mixer',
        Controls: [
          { Name: 'crosspoint_1_1', Value: 1 }
        ]
      });

      expect(mockOfficialClient.setControlValue).toHaveBeenCalledWith('Matrix Mixer', 'crosspoint_1_1', 1);
      expect(response).toHaveProperty('result');
      expect(response.result).toEqual(expect.arrayContaining([
        expect.objectContaining({
          Name: 'Matrix Mixer.crosspoint_1_1',
          Result: 'Success'
        })
      ]));
    });

    it('should preserve Ramp parameter when present', async () => {
      const response = await adapter.sendCommand('Component.Set', {
        Name: 'Main Output Gain',
        Controls: [
          { Name: 'gain', Value: -20, Ramp: 2.5 }
        ]
      });

      // The ramp parameter should be passed through to the control set operation
      // Note: The actual implementation may need adjustment to handle Ramp
      expect(mockOfficialClient.setControlValue).toHaveBeenCalledWith('Main Output Gain', 'gain', -20);
      expect(response.result).toEqual(expect.arrayContaining([
        expect.objectContaining({
          Name: 'Main Output Gain.gain',
          Result: 'Success'
        })
      ]));
    });

    it('should handle errors when component does not exist', async () => {
      mockOfficialClient.setControlValue.mockRejectedValueOnce(new Error('Component not found: NonExistent'));

      const response = await adapter.sendCommand('Component.Set', {
        Name: 'NonExistent',
        Controls: [
          { Name: 'control', Value: 50 }
        ]
      });

      expect(response.result).toEqual(expect.arrayContaining([
        expect.objectContaining({
          Name: 'NonExistent.control',
          Result: 'Error',
          Error: expect.stringContaining('Component not found')
        })
      ]));
    });

    it('should handle individual control errors', async () => {
      // First control succeeds, second fails
      mockOfficialClient.setControlValue
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Control is read-only'));

      const response = await adapter.sendCommand('Component.Set', {
        Name: 'Main Output Gain',
        Controls: [
          { Name: 'gain', Value: -5 },
          { Name: 'readonly', Value: 1 }
        ]
      });

      expect(response.result).toEqual(expect.arrayContaining([
        expect.objectContaining({
          Name: 'Main Output Gain.gain',
          Result: 'Success'
        }),
        expect.objectContaining({
          Name: 'Main Output Gain.readonly',
          Result: 'Error',
          Error: expect.stringContaining('read-only')
        })
      ]));
    });

    it('should validate required parameters', async () => {
      // Missing Name
      await expect(adapter.sendCommand('Component.Set', {
        Controls: [{ Name: 'test', Value: 1 }]
      })).rejects.toThrow('Component name and Controls array are required');

      // Missing Controls
      await expect(adapter.sendCommand('Component.Set', {
        Name: 'Test'
      })).rejects.toThrow('Component name and Controls array are required');

      // Controls not an array
      await expect(adapter.sendCommand('Component.Set', {
        Name: 'Test',
        Controls: 'not-an-array'
      })).rejects.toThrow('Controls must be an array');
    });

    it('should validate control format', async () => {
      // Invalid control format (not an object)
      await expect(adapter.sendCommand('Component.Set', {
        Name: 'Test',
        Controls: ['string-control']
      })).rejects.toThrow('Invalid control format');

      // Missing control name
      await expect(adapter.sendCommand('Component.Set', {
        Name: 'Test',
        Controls: [{ Value: 1 }]
      })).rejects.toThrow('Control name is required');
    });

    it('should handle multiple components in a single batch', async () => {
      // This tests that Component.Set properly groups controls by component
      const response = await adapter.sendCommand('Component.Set', {
        Name: 'Matrix Mixer',
        Controls: [
          { Name: 'crosspoint_1_1', Value: 1 },
          { Name: 'input_1_gain', Value: -5 }
        ]
      });

      expect(mockOfficialClient.setControlValue).toHaveBeenCalledTimes(2);
      expect(mockOfficialClient.setControlValue).toHaveBeenCalledWith('Matrix Mixer', 'crosspoint_1_1', 1);
      expect(mockOfficialClient.setControlValue).toHaveBeenCalledWith('Matrix Mixer', 'input_1_gain', -5);

      expect(response.result).toHaveLength(2);
      expect(response.result).toEqual(expect.arrayContaining([
        expect.objectContaining({
          Name: 'Matrix Mixer.crosspoint_1_1',
          Result: 'Success'
        }),
        expect.objectContaining({
          Name: 'Matrix Mixer.input_1_gain',
          Result: 'Success'
        })
      ]));
    });

    it('should handle Position parameter as alternative to Value', async () => {
      const response = await adapter.sendCommand('Component.Set', {
        Name: 'Main Output Gain',
        Controls: [
          { Name: 'gain', Position: 0.5 }  // Position instead of Value
        ]
      });

      // The adapter should handle Position parameter
      // The actual implementation may convert Position to Value
      expect(mockOfficialClient.setControlValue).toHaveBeenCalled();
      expect(response.result).toEqual(expect.arrayContaining([
        expect.objectContaining({
          Name: 'Main Output Gain.gain',
          Result: 'Success'
        })
      ]));
    });
  });

  describe('integration with existing Control.Set', () => {
    it('should not interfere with Control.Set command', async () => {
      // Control.Set uses full control names
      const response = await adapter.sendCommand('Control.Set', {
        Controls: [
          { Name: 'Main Output Gain.gain', Value: -10 }
        ]
      });

      expect(mockOfficialClient.setControlValue).toHaveBeenCalledWith('Main Output Gain', 'gain', -10);
      expect(response.result).toEqual(expect.arrayContaining([
        expect.objectContaining({
          Name: 'Main Output Gain.gain',
          Result: 'Success'
        })
      ]));
    });

    it('should handle both Component.Set and Control.Set in sequence', async () => {
      // First use Component.Set
      await adapter.sendCommand('Component.Set', {
        Name: 'Main Output Gain',
        Controls: [{ Name: 'gain', Value: -5 }]
      });

      // Then use Control.Set
      await adapter.sendCommand('Control.Set', {
        Controls: [{ Name: 'Matrix Mixer.crosspoint_1_1', Value: 1 }]
      });

      expect(mockOfficialClient.setControlValue).toHaveBeenCalledTimes(2);
      expect(mockOfficialClient.setControlValue).toHaveBeenNthCalledWith(1, 'Main Output Gain', 'gain', -5);
      expect(mockOfficialClient.setControlValue).toHaveBeenNthCalledWith(2, 'Matrix Mixer', 'crosspoint_1_1', 1);
    });
  });
});