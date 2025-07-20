/**
 * Unit tests for Component.Get and Component.Set methods in QRWC adapter
 * Tests for BUG-032
 */

import { QRWCClientAdapter } from '../../../../src/mcp/qrwc/adapter.js';
import type { OfficialQRWCClient } from '../../../../src/qrwc/officialClient.js';

describe('QRWCClientAdapter - Component Methods', () => {
  let adapter: QRWCClientAdapter;
  let mockOfficialClient: Partial<OfficialQRWCClient>;
  let mockQrwc: any;
  let mockComponent: any;

  beforeEach(() => {
    // Create mock controls
    const mockControls = {
      'gain': {
        state: {
          Value: -10.5,
          String: '-10.5dB',
          Position: 0.25
        }
      },
      'mute': {
        state: {
          Value: 0,
          String: 'unmuted',
          Position: 0
        }
      },
      'bypass': {
        state: {
          Value: 1,
          String: 'bypassed',
          Position: 1
        }
      }
    };

    // Create mock component
    mockComponent = {
      controls: mockControls
    };

    // Create mock QRWC instance
    mockQrwc = {
      components: {
        'MyGain': mockComponent,
        'MyAPM': {
          controls: {
            'ent.xfade.gain': {
              state: {
                Value: -100.0,
                String: '-100.0dB',
                Position: 0
              }
            },
            'bgm.xfade.gain': {
              state: {
                Value: -50.0,
                String: '-50.0dB',
                Position: 0.5
              }
            }
          }
        }
      }
    };

    // Create mock official client
    mockOfficialClient = {
      isConnected: jest.fn().mockReturnValue(true),
      getQrwc: jest.fn().mockReturnValue(mockQrwc),
      getComponent: jest.fn((name: string) => mockQrwc.components[name]),
      setControlValue: jest.fn().mockResolvedValue(undefined)
    };

    adapter = new QRWCClientAdapter(mockOfficialClient as OfficialQRWCClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Component.Get', () => {
    it('should get specified controls from a component', async () => {
      const result = await adapter.sendCommand('Component.Get', {
        Name: 'MyGain',
        Controls: [
          { Name: 'gain' },
          { Name: 'mute' }
        ]
      });

      expect(result).toEqual({
        result: {
          Name: 'MyGain',
          Controls: [
            {
              Name: 'gain',
              Value: -10.5,
              String: '-10.5dB',
              Position: 0.25
            },
            {
              Name: 'mute',
              Value: 0,
              String: 'unmuted',
              Position: 0
            }
          ]
        }
      });
    });

    it('should handle non-existent controls gracefully', async () => {
      const result = await adapter.sendCommand('Component.Get', {
        Name: 'MyGain',
        Controls: [
          { Name: 'gain' },
          { Name: 'nonexistent' }
        ]
      });

      expect(result).toEqual({
        result: {
          Name: 'MyGain',
          Controls: [
            {
              Name: 'gain',
              Value: -10.5,
              String: '-10.5dB',
              Position: 0.25
            },
            {
              Name: 'nonexistent',
              Value: null,
              String: 'N/A',
              Position: 0,
              Error: 'Control not found'
            }
          ]
        }
      });
    });

    it('should handle controls with simple state values', async () => {
      // Mock a control with simple numeric state (not an object)
      mockComponent.controls['simpleControl'] = {
        state: 42
      };

      const result = await adapter.sendCommand('Component.Get', {
        Name: 'MyGain',
        Controls: [{ Name: 'simpleControl' }]
      });

      expect(result).toEqual({
        result: {
          Name: 'MyGain',
          Controls: [
            {
              Name: 'simpleControl',
              Value: 42,
              String: '42',
              Position: 0
            }
          ]
        }
      });
    });

    it('should throw error when component name is missing', async () => {
      await expect(
        adapter.sendCommand('Component.Get', {
          Controls: [{ Name: 'gain' }]
        })
      ).rejects.toThrow('Component name is required');
    });

    it('should throw error when component does not exist', async () => {
      mockOfficialClient.getComponent = jest.fn().mockReturnValue(null);

      await expect(
        adapter.sendCommand('Component.Get', {
          Name: 'NonExistent',
          Controls: [{ Name: 'gain' }]
        })
      ).rejects.toThrow("Component 'NonExistent' not found or has no controls");
    });
  });

  describe('Component.Set', () => {
    it('should set control values on a component', async () => {
      const result = await adapter.sendCommand('Component.Set', {
        Name: 'MyGain',
        Controls: [
          {
            Name: 'gain',
            Value: -20.0
          },
          {
            Name: 'mute',
            Value: 1
          }
        ]
      });

      expect(result).toEqual({
        result: true,
        details: [
          { Name: 'gain', Result: 'Success' },
          { Name: 'mute', Result: 'Success' }
        ]
      });

      expect(mockOfficialClient.setControlValue).toHaveBeenCalledWith('MyGain', 'gain', -20.0);
      expect(mockOfficialClient.setControlValue).toHaveBeenCalledWith('MyGain', 'mute', 1);
    });

    it('should log warning when ramp parameter is specified', async () => {
      // Import logger module to spy on it
      const loggerModule = await import('../../../../src/shared/utils/logger.js');
      const warnSpy = jest.spyOn(loggerModule.globalLogger, 'warn').mockImplementation(() => {});

      await adapter.sendCommand('Component.Set', {
        Name: 'MyGain',
        Controls: [
          {
            Name: 'gain',
            Value: -30.0,
            Ramp: 2.0
          }
        ]
      });

      // Check that warning was logged about ramp not being supported
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Ramp parameter specified but not supported'),
        expect.objectContaining({
          component: 'MyGain',
          control: 'gain',
          ramp: 2.0
        })
      );
      
      // But the control should still be set
      expect(mockOfficialClient.setControlValue).toHaveBeenCalledWith('MyGain', 'gain', -30.0);

      warnSpy.mockRestore();
    });

    it('should handle errors for individual controls', async () => {
      // Make setControlValue fail for 'mute' control
      mockOfficialClient.setControlValue = jest.fn()
        .mockImplementation(async (comp: string, ctrl: string) => {
          if (ctrl === 'mute') {
            throw new Error('Control is read-only');
          }
        });

      const result = await adapter.sendCommand('Component.Set', {
        Name: 'MyGain',
        Controls: [
          { Name: 'gain', Value: -25.0 },
          { Name: 'mute', Value: 1 },
          { Name: 'bypass', Value: 0 }
        ]
      });

      expect(result).toEqual({
        result: true,
        details: [
          { Name: 'gain', Result: 'Success' },
          { Name: 'mute', Result: 'Error', Error: 'Control is read-only' },
          { Name: 'bypass', Result: 'Success' }
        ]
      });
    });

    it('should throw error when component name is missing', async () => {
      await expect(
        adapter.sendCommand('Component.Set', {
          Controls: [{ Name: 'gain', Value: 0 }]
        })
      ).rejects.toThrow('Component name is required');
    });

    it('should handle non-existent component', async () => {
      mockOfficialClient.getComponent = jest.fn().mockReturnValue(null);

      const result = await adapter.sendCommand('Component.Set', {
        Name: 'NonExistent',
        Controls: [{ Name: 'gain', Value: 0 }]
      });

      expect((result as any).details[0]).toEqual({
        Name: 'gain',
        Result: 'Error',
        Error: "Component 'NonExistent' not found"
      });
    });

    it('should handle non-existent control', async () => {
      const result = await adapter.sendCommand('Component.Set', {
        Name: 'MyGain',
        Controls: [{ Name: 'nonexistent', Value: 0 }]
      });

      expect((result as any).details[0]).toEqual({
        Name: 'nonexistent',
        Result: 'Error',
        Error: "Control 'nonexistent' not found on component 'MyGain'"
      });
    });

    it('should validate boolean control values', async () => {
      // Add type information to bypass control
      mockComponent.controls.bypass.type = 'Boolean';

      const result = await adapter.sendCommand('Component.Set', {
        Name: 'MyGain',
        Controls: [
          { Name: 'bypass', Value: true }  // boolean true should be converted to 1
        ]
      });

      expect(mockOfficialClient.setControlValue).toHaveBeenCalledWith('MyGain', 'bypass', 1);
      expect((result as any).details[0]).toEqual({ Name: 'bypass', Result: 'Success' });
    });
  });

  describe('Component.Get and Component.Set integration', () => {
    it('should handle Q-SYS APM component example from spec', async () => {
      // Test Component.Get with APM example
      const getResult = await adapter.sendCommand('Component.Get', {
        Name: 'MyAPM',
        Controls: [
          { Name: 'ent.xfade.gain' }
        ]
      });

      expect(getResult).toEqual({
        result: {
          Name: 'MyAPM',
          Controls: [
            {
              Name: 'ent.xfade.gain',
              Value: -100.0,
              String: '-100.0dB',
              Position: 0
            }
          ]
        }
      });

      // Test Component.Set with APM example
      const setResult = await adapter.sendCommand('Component.Set', {
        Name: 'MyAPM',
        Controls: [
          {
            Name: 'ent.xfade.gain',
            Value: -100.0,
            Ramp: 2.0
          },
          {
            Name: 'bgm.xfade.gain',
            Value: 0.0,
            Ramp: 1.0
          }
        ]
      });

      expect((setResult as any).result).toBe(true);
      expect((setResult as any).details).toHaveLength(2);
      expect((setResult as any).details[0]).toEqual({ Name: 'ent.xfade.gain', Result: 'Success' });
      expect((setResult as any).details[1]).toEqual({ Name: 'bgm.xfade.gain', Result: 'Success' });
    });
  });
});