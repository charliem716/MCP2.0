import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { QRWCClientAdapter } from '../../../../src/mcp/qrwc/adapter.js';
import type { QRWCClientInterface } from '../../../../src/qrwc/types.js';

describe('QRWCClientAdapter', () => {
  let mockClient: jest.Mocked<QRWCClientInterface>;
  let adapter: QRWCClientAdapter;

  beforeEach(() => {
    // Create mock QRWC client
    mockClient = {
      isConnected: jest.fn().mockReturnValue(true),
      setControlValue: jest.fn().mockResolvedValue(undefined),
      getQrwc: jest.fn().mockReturnValue({
        components: {
          'MainMixer': {
            controls: {
              'gain': { state: 0.5 },
              'mute': { state: false }
            }
          },
          'OutputGain': {
            controls: {
              'level': { state: -10 },
              'mute': { state: true }
            }
          }
        }
      })
    } as any;

    adapter = new QRWCClientAdapter(mockClient);
  });

  describe('BUG-024: Control Name Parsing', () => {
    it('should correctly parse component.control format for Control.Set', async () => {
      // Test setting a control with component.control format
      const result = await adapter.sendCommand('Control.SetValues', {
        Controls: [{
          Name: 'MainMixer.gain',
          Value: 0.75
        }]
      });

      // Verify the mock was called with correct component and control names
      expect(mockClient.setControlValue).toHaveBeenCalledWith(
        'MainMixer',  // component name should be first
        'gain',       // control name should be second
        0.75
      );
    });

    it('should handle control-only names (no component)', async () => {
      // Test setting a control without component prefix
      const result = await adapter.sendCommand('Control.SetValues', {
        Controls: [{
          Name: 'masterVolume',
          Value: -6
        }]
      });

      // Verify the mock was called with empty component name
      expect(mockClient.setControlValue).toHaveBeenCalledWith(
        '',             // empty component name
        'masterVolume', // control name
        -6
      );
    });

    it('should handle multiple controls with mixed formats', async () => {
      // Test setting multiple controls
      const result = await adapter.sendCommand('Control.SetValues', {
        Controls: [
          { Name: 'MainMixer.gain', Value: 0.5 },
          { Name: 'OutputGain.mute', Value: true },
          { Name: 'masterMute', Value: false }
        ]
      });

      // Verify all calls were made correctly
      expect(mockClient.setControlValue).toHaveBeenCalledTimes(3);
      expect(mockClient.setControlValue).toHaveBeenNthCalledWith(1, 'MainMixer', 'gain', 0.5);
      expect(mockClient.setControlValue).toHaveBeenNthCalledWith(2, 'OutputGain', 'mute', true);
      expect(mockClient.setControlValue).toHaveBeenNthCalledWith(3, '', 'masterMute', false);
    });

    it('should handle controls with dots in control names', async () => {
      // Test edge case: control name itself contains dots
      const result = await adapter.sendCommand('Control.SetValues', {
        Controls: [{
          Name: 'MyComponent.channel.1.gain',
          Value: -3
        }]
      });

      // Should only split on first dot
      expect(mockClient.setControlValue).toHaveBeenCalledWith(
        'MyComponent',      // component name
        'channel.1.gain',   // rest is control name
        -3
      );
    });
  });

  describe('Control value retrieval', () => {
    it('should correctly retrieve control values', async () => {
      const result = await adapter.sendCommand('Control.GetMultiple', {
        Controls: ['MainMixer.gain', 'OutputGain.mute']
      });

      expect(result.result).toBeDefined();
      expect(result.result).toHaveLength(2);
      expect(result.result[0]).toEqual({
        Name: 'MainMixer.gain',
        Value: 0.5,
        String: '0.5'
      });
      expect(result.result[1]).toEqual({
        Name: 'OutputGain.mute', 
        Value: true,
        String: 'true'
      });
    });
  });
});