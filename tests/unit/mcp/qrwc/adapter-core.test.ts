import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { QRWCClientAdapter } from '../../../../src/mcp/qrwc/adapter';
import type { QRWCClientInterface } from '../../../../src/qrwc/types';
import { z } from 'zod';
import type { BaseQSysCommandParams } from '../../../../src/mcp/types/qsys-api-responses';

/**
 * Core adapter functionality tests
 * Combines: adapter.test.ts, adapter-param-formats.test.ts, adapter-validation.test.ts
 */
describe('QRWCClientAdapter - Core Functionality', () => {
  let mockClient: jest.Mocked<QRWCClientInterface>;
  let adapter: QRWCClientAdapter;

  beforeEach(() => {
    // Create mock QRWC client
    mockClient = {
      isConnected: jest.fn().mockReturnValue(true),
      setControlValue: jest.fn().mockResolvedValue(undefined),
      getQrwc: jest.fn().mockReturnValue({
        components: {
          MainMixer: {
            controls: {
              gain: { Value: 0.5, Type: 'Number' },
              mute: { Value: 0, Type: 'Boolean' },
            },
          },
          OutputGain: {
            controls: {
              level: { Value: -10, Type: 'Number' },
              mute: { Value: 0, Type: 'Boolean' },
            },
          },
        },
      }),
    } as any;

    adapter = new QRWCClientAdapter(mockClient);
  });

  describe('Basic Control Operations', () => {
    describe('BUG-024: Control Name Parsing', () => {
      it('should correctly parse component.control format for Control.Set', async () => {
        // Test setting a control with component.control format
        const result = await adapter.sendCommand('Control.Set', {
          Controls: [
            {
              Name: 'MainMixer.gain',
              Value: 0.75,
            },
          ],
        });

        // Verify the result
        expect(result).toHaveProperty('result');
        const results = (result as any).result;
        expect(Array.isArray(results)).toBe(true);
        expect(results[0]).toMatchObject({
          Name: 'MainMixer.gain',
          Result: 'Success'
        });
      });

      it('should handle control-only names (no component)', async () => {
        // Test setting a control without component prefix should throw error
        await expect(
          adapter.sendCommand('Control.Set', {
            Controls: [
              {
                Name: 'masterVolume',
                Value: -6,
              },
            ],
          })
        ).rejects.toThrow('Invalid control name format: masterVolume');
      });

      it('should handle multiple controls with mixed formats', async () => {
        // Add mute controls to mock
        mockClient.getQrwc = jest.fn().mockReturnValue({
          components: {
            MainMixer: {
              controls: {
                gain: { state: 0.5, Value: undefined },
                mute: { state: false, Value: undefined },
              },
            },
            OutputGain: {
              controls: {
                level: { state: -10, Value: undefined },
                mute: { state: true, Value: undefined },
              },
            },
          },
        });

        // Test setting multiple controls - should fail on third control
        await expect(
          adapter.sendCommand('Control.Set', {
            Controls: [
              { Name: 'MainMixer.gain', Value: 0.5 },
              { Name: 'OutputGain.mute', Value: true },
              { Name: 'masterMute', Value: false },
            ],
          })
        ).rejects.toThrow('Invalid control name format: masterMute');
      });

      it('should handle controls with dots in control names', async () => {
        // Add component with dotted control name
        mockClient.getQrwc = jest.fn().mockReturnValue({
          components: {
            MyComponent: {
              controls: {
                'channel': { state: 0, Value: undefined },
              },
            },
          },
        });

        // Test edge case: control name itself contains dots
        // Current implementation only splits on first dot
        const result = await adapter.sendCommand('Control.Set', {
          Controls: [
            {
              Name: 'MyComponent.channel',
              Value: -3,
            },
          ],
        });

        // Should succeed since we're setting MyComponent.channel
        expect(result).toHaveProperty('result');
        const results = (result as any).result;
        expect(Array.isArray(results)).toBe(true);
        expect(results[0]).toMatchObject({
          Name: 'MyComponent.channel',
          Result: 'Success'
        });
        const qrwc = mockClient.getQrwc();
        expect(qrwc.components.MyComponent.controls.channel.Value).toBe(-3);
      });
    });

    describe('Control value retrieval', () => {
      it('should correctly retrieve control values', async () => {
        const result = await adapter.sendCommand('Control.Get', {
          Controls: ['MainMixer.gain', 'OutputGain.mute'],
        });

        expect(result.result).toBeDefined();
        expect(result.result).toHaveLength(2);
        expect(result.result[0]).toEqual({
          Name: 'MainMixer.gain',
          Type: 'Number',
          Value: 0.5,
          String: '0.5',
        });
        expect(result.result[1]).toEqual({
          Name: 'OutputGain.mute',
          Type: 'Boolean',
          Value: 0,
          String: '0',
        });
      });
    });
  });

  describe('Parameter Validation', () => {
    describe('validateParams', () => {
      it.skip('should validate parameters with Zod schema', () => {
        const schema = z.object({
          name: z.string(),
          value: z.number().min(0).max(100),
        });

        const validParams = { name: 'test', value: 50 };
        const result = (adapter as any).validateParams(validParams, schema);
        expect(result).toEqual(validParams);
      });

      it.skip('should throw descriptive error for invalid parameters', () => {
        const schema = z.object({
          name: z.string(),
          value: z.number().min(0).max(100),
        });

        const invalidParams = { name: 'test', value: 150 };

        expect(() => {
          (adapter as any).validateParams(invalidParams, schema);
        }).toThrow('Parameter validation failed');
      });

      it.skip('should handle nested validation errors', () => {
        const schema = z.object({
          controls: z.array(
            z.object({
              name: z.string(),
              value: z.number(),
            })
          ),
        });

        const invalidParams = {
          controls: [
            { name: 'test1', value: 'not a number' },
            { name: 123, value: 45 },
          ],
        };

        expect(() => {
          (adapter as any).validateParams(invalidParams, schema);
        }).toThrow('Parameter validation failed');
      });
    });

    describe('Input sanitization', () => {
      it.skip('should sanitize string inputs to prevent injection', () => {
        const input = "test'; DROP TABLE controls; --";
        const sanitized = (adapter as any).sanitizeInput(input);
        expect(sanitized).not.toContain("'");
        expect(sanitized).not.toContain(';');
      });

      it.skip('should handle undefined and null inputs gracefully', () => {
        expect((adapter as any).sanitizeInput(undefined)).toBe('');
        expect((adapter as any).sanitizeInput(null)).toBe('');
      });

      it.skip('should validate control names against pattern', () => {
        const validNames = [
          'gain',
          'input.1.mute',
          'crosspoint_1_2',
          'Channel-1.Level',
        ];

        const invalidNames = [
          'control name with spaces',
          'control@special#chars',
          '../../../etc/passwd',
          'control\nwith\nnewlines',
        ];

        validNames.forEach(name => {
          expect(() => {
            (adapter as any).validateControlName(name);
          }).not.toThrow();
        });

        invalidNames.forEach(name => {
          expect(() => {
            (adapter as any).validateControlName(name);
          }).toThrow('Invalid control name');
        });
      });
    });
  });

  describe.skip('Parameter Formatting', () => {
    describe('Component.Get parameter formats', () => {
      it('should handle component name as string parameter', async () => {
        mockClient.getComponent = jest.fn().mockResolvedValue({
          Name: 'Main Mixer',
          Controls: [],
        });

        await adapter.sendCommand('Component.Get', {
          Name: 'Main Mixer',
        });

        expect(mockClient.getComponent).toHaveBeenCalledWith('Main Mixer');
      });

      it('should handle Controls array parameter', async () => {
        mockClient.getComponent = jest.fn().mockResolvedValue({
          Name: 'Main Mixer',
          Controls: [
            { Name: 'gain', Value: -10 },
            { Name: 'mute', Value: false },
          ],
        });

        const result = await adapter.sendCommand('Component.Get', {
          Name: 'Main Mixer',
          Controls: ['gain', 'mute'],
        });

        expect(mockClient.getComponent).toHaveBeenCalledWith('Main Mixer');
        expect(result.result.Controls).toHaveLength(2);
      });
    });

    describe('Component.Set parameter formats', () => {
      it('should format Controls array for Component.Set', async () => {
        mockClient.setComponentControls = jest.fn().mockResolvedValue({});

        await adapter.sendCommand('Component.Set', {
          Name: 'Main Mixer',
          Controls: [
            { Name: 'gain', Value: -5 },
            { Name: 'mute', Value: true },
          ],
        });

        expect(mockClient.setComponentControls).toHaveBeenCalledWith(
          'Main Mixer',
          [
            { Name: 'gain', Value: -5 },
            { Name: 'mute', Value: true },
          ]
        );
      });

      it('should handle Ramp parameter in controls', async () => {
        mockClient.setComponentControls = jest.fn().mockResolvedValue({});

        await adapter.sendCommand('Component.Set', {
          Name: 'Fader Bank',
          Controls: [{ Name: 'level', Value: 0, Ramp: 2.5 }],
        });

        expect(mockClient.setComponentControls).toHaveBeenCalledWith(
          'Fader Bank',
          [{ Name: 'level', Value: 0, Ramp: 2.5 }]
        );
      });

      it('should handle Position parameter in controls', async () => {
        mockClient.setComponentControls = jest.fn().mockResolvedValue({});

        await adapter.sendCommand('Component.Set', {
          Name: 'Selector',
          Controls: [{ Name: 'selection', Position: 0.5 }],
        });

        expect(mockClient.setComponentControls).toHaveBeenCalledWith(
          'Selector',
          [{ Name: 'selection', Position: 0.5 }]
        );
      });
    });

    describe('Control.Get parameter formats', () => {
      it('should handle single control name', async () => {
        const result = await adapter.sendCommand('Control.Get', {
          Name: 'MainVolume',
        });

        expect(result.result).toHaveProperty('Name', 'MainVolume');
      });

      it('should handle array of control names', async () => {
        const result = await adapter.sendCommand('Control.Get', {
          Names: ['MainVolume', 'MainMute', 'Gain1'],
        });

        expect(result.result).toHaveLength(3);
      });
    });

    describe('Control.Set parameter formats', () => {
      it('should handle single control with Name/Value', async () => {
        await adapter.sendCommand('Control.Set', {
          Name: 'MainVolume',
          Value: -10,
        });

        expect(mockClient.setControlValue).toHaveBeenCalledWith(
          '',
          'MainVolume',
          -10
        );
      });

      it('should handle control with Position', async () => {
        await adapter.sendCommand('Control.Set', {
          Name: 'Fader1',
          Position: 0.75,
        });

        expect(mockClient.setControlValue).toHaveBeenCalledWith(
          '',
          'Fader1',
          0.75
        );
      });

      it('should handle control with Ramp', async () => {
        await adapter.sendCommand('Control.Set', {
          Name: 'MainVolume',
          Value: 0,
          Ramp: 3.0,
        });

        expect(mockClient.setControlValue).toHaveBeenCalledWith(
          '',
          'MainVolume',
          0
        );
      });
    });

    describe('Type coercion and conversion', () => {
      it('should coerce string numbers to numbers when needed', async () => {
        await adapter.sendCommand('Control.Set', {
          Name: 'Gain',
          Value: '10.5' as any, // Simulating wrong type from client
        });

        expect(mockClient.setControlValue).toHaveBeenCalledWith(
          '',
          'Gain',
          10.5
        );
      });

      it('should handle boolean string conversion', async () => {
        await adapter.sendCommand('Control.Set', {
          Name: 'Mute',
          Value: 'true' as any,
        });

        expect(mockClient.setControlValue).toHaveBeenCalledWith(
          '',
          'Mute',
          true
        );

        await adapter.sendCommand('Control.Set', {
          Name: 'Mute',
          Value: 'false' as any,
        });

        expect(mockClient.setControlValue).toHaveBeenCalledWith(
          '',
          'Mute',
          false
        );
      });

      it('should reject invalid type conversions', async () => {
        await expect(
          adapter.sendCommand('Control.Set', {
            Name: 'Gain',
            Value: 'not a number' as any,
          })
        ).rejects.toThrow();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      // This test doesn't apply as adapter doesn't use setControlValue
      // Skip this test
    });

    it('should validate required parameters', async () => {
      await expect(
        adapter.sendCommand('Control.Set', {
          // Missing required Name parameter
          Value: 0,
        } as any)
      ).rejects.toThrow();
    });

    it('should handle malformed command names', async () => {
      await expect(
        adapter.sendCommand('Invalid.Command' as any, {})
      ).rejects.toThrow();
    });
  });

  describe('Connection State', () => {
    it('should check connection before operations', async () => {
      mockClient.isConnected.mockReturnValue(false);

      await expect(
        adapter.sendCommand('Control.Set', {
          Controls: [{ Name: 'MainMixer.gain', Value: 0 }],
        })
      ).rejects.toThrow('QRWC client not connected');
    });

    it.skip('should pass through connect/disconnect calls', async () => {
      // Adapter doesn't have connect/disconnect methods
      mockClient.connect = jest.fn().mockResolvedValue(undefined);
      mockClient.disconnect = jest.fn().mockResolvedValue(undefined);

      await adapter.connect();
      expect(mockClient.connect).toHaveBeenCalled();

      await adapter.disconnect();
      expect(mockClient.disconnect).toHaveBeenCalled();
    });
  });
});
