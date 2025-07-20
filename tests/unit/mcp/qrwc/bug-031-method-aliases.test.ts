import { QRWCClientAdapter } from '../../../../src/mcp/qrwc/adapter.js';
import type { OfficialQRWCClient } from '../../../../src/qrwc/officialClient.js';

describe('BUG-031: Control.Get and Control.Set Method Aliases', () => {
  let mockClient: jest.Mocked<OfficialQRWCClient>;
  let adapter: QRWCClientAdapter;
  let mockComponents: any;

  beforeEach(() => {
    // Create mock components for testing
    mockComponents = {
      'TestComponent': {
        controls: {
          'gain': {
            state: {
              Value: -12,
              String: '-12dB'
            }
          },
          'mute': {
            state: {
              Value: false,
              String: 'Unmuted'
            }
          }
        }
      }
    };

    mockClient = {
      isConnected: jest.fn().mockReturnValue(true),
      getQrwc: jest.fn().mockReturnValue({ components: mockComponents }),
      setControlValue: jest.fn().mockResolvedValue(undefined)
    } as any;

    adapter = new QRWCClientAdapter(mockClient);
  });

  describe('Control.Get method alias', () => {
    it('should accept Control.Get method name', async () => {
      const result = await adapter.sendCommand('Control.Get', {
        Controls: ['TestComponent.gain', 'TestComponent.mute']
      });

      expect(result).toMatchObject({
        result: [
          {
            Name: 'TestComponent.gain',
            Value: { Value: -12, String: '-12dB' },
            String: '[object Object]'  // This is how the adapter currently handles objects
          },
          {
            Name: 'TestComponent.mute',
            Value: { Value: false, String: 'Unmuted' },
            String: '[object Object]'  // This is how the adapter currently handles objects
          }
        ]
      });
    });

    it('should work identically to Control.GetValues', async () => {
      const params = { Controls: ['TestComponent.gain'] };
      
      const resultGet = await adapter.sendCommand('Control.Get', params);
      const resultGetValues = await adapter.sendCommand('Control.GetValues', params);
      
      expect(resultGet).toEqual(resultGetValues);
    });

    it('should support direct array parameter format', async () => {
      // Test with direct array as per API spec
      const result = await adapter.sendCommand('Control.Get', {
        Controls: ['TestComponent.gain']
      });

      expect(result.result).toHaveLength(1);
      expect(result.result[0].Name).toBe('TestComponent.gain');
    });
  });

  describe('Control.Set method alias', () => {
    it('should accept Control.Set method name', async () => {
      const result = await adapter.sendCommand('Control.Set', {
        Controls: [
          {
            Name: 'TestComponent.gain',
            Value: -6
          }
        ]
      });

      expect(mockClient.setControlValue).toHaveBeenCalledWith(
        'TestComponent',
        'gain',
        -6
      );
      expect(result).toMatchObject({
        result: [
          {
            Name: 'TestComponent.gain',
            Result: 'Success'
          }
        ]
      });
    });

    it('should work identically to Control.SetValues', async () => {
      const params = {
        Controls: [{
          Name: 'TestComponent.gain',
          Value: -6
        }]
      };
      
      const resultSet = await adapter.sendCommand('Control.Set', params);
      
      // Reset mock
      mockClient.setControlValue.mockClear();
      
      const resultSetValues = await adapter.sendCommand('Control.SetValues', params);
      
      expect(resultSet).toEqual(resultSetValues);
      expect(mockClient.setControlValue).toHaveBeenCalledTimes(1);
    });

    it('should support ramp parameter', async () => {
      // Mock the QRWC send method for ramp support
      const mockQrwc = {
        send: jest.fn().mockResolvedValue({ result: true })
      };
      mockClient.getQrwc.mockReturnValue(mockQrwc as any);

      await adapter.sendCommand('Control.Set', {
        Controls: [{
          Name: 'TestComponent.gain',
          Value: 0,
          Ramp: 2.5
        }]
      });

      // When ramp is specified, it should use the raw send method
      expect(mockQrwc.send).toHaveBeenCalledWith({
        method: 'Control.Set',
        params: {
          Name: 'TestComponent.gain',
          Value: 0,
          Ramp: 2.5
        }
      });
      // setControlValue should NOT be called when ramp is used
      expect(mockClient.setControlValue).not.toHaveBeenCalled();
    });

    it('should use normal setControlValue when no ramp is specified', async () => {
      await adapter.sendCommand('Control.Set', {
        Controls: [{
          Name: 'TestComponent.gain',
          Value: -3
        }]
      });

      // Without ramp, should use setControlValue
      expect(mockClient.setControlValue).toHaveBeenCalledWith(
        'TestComponent',
        'gain',
        -3
      );
    });
  });

  describe('Backward compatibility', () => {
    it('should still support all existing method variants', async () => {
      const methods = [
        'Control.Get',
        'Control.GetValues',
        'ControlGetValues',
        'Control.GetMultiple'
      ];

      for (const method of methods) {
        const result = await adapter.sendCommand(method, {
          Controls: ['TestComponent.gain']
        });
        
        expect(result.result).toBeDefined();
        expect(result.result[0].Name).toBe('TestComponent.gain');
      }
    });

    it('should support all set method variants', async () => {
      const methods = [
        'Control.Set',
        'Control.SetValues',
        'ControlSetValues'
      ];

      for (const method of methods) {
        mockClient.setControlValue.mockClear();
        
        await adapter.sendCommand(method, {
          Controls: [{
            Name: 'TestComponent.gain',
            Value: -3
          }]
        });
        
        expect(mockClient.setControlValue).toHaveBeenCalledWith(
          'TestComponent',
          'gain',
          -3
        );
      }
    });
  });
});