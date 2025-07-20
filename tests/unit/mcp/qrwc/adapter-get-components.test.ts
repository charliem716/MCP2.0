/**
 * Unit tests for Component.GetComponents method in QRWC adapter
 * Tests for BUG-036 - ensuring proper component type and properties are returned
 */

import { QRWCClientAdapter } from '../../../../src/mcp/qrwc/adapter.js';
import type { OfficialQRWCClient } from '../../../../src/qrwc/officialClient.js';

describe('QRWCClientAdapter - Component.GetComponents', () => {
  let adapter: QRWCClientAdapter;
  let mockOfficialClient: Partial<OfficialQRWCClient>;
  let mockQrwc: any;

  beforeEach(() => {
    // Create mock QRWC instance with various component types
    mockQrwc = {
      components: {
        'APM ABC': {
          name: 'APM ABC',
          state: {
            ID: 'APM ABC',
            Name: 'APM ABC',
            Type: 'apm',
            Properties: [],
            ControlSource: 2
          },
          controls: {}
        },
        'My Delay Mixer': {
          name: 'My Delay Mixer',
          state: {
            ID: 'My Delay Mixer',
            Name: 'My Delay Mixer',
            Type: 'delay_matrix',
            Properties: [
              {
                Name: 'n_inputs',
                Value: '8',
                PrettyName: 'Input Count'
              },
              {
                Name: 'n_outputs',
                Value: '8',
                PrettyName: 'Output Count'
              },
              {
                Name: 'max_delay',
                Value: '0.5',
                PrettyName: 'Maximum Delay'
              },
              {
                Name: 'delay_type',
                Value: '0',
                PrettyName: 'Delay Type'
              },
              {
                Name: 'linear_gain',
                Value: 'False',
                PrettyName: 'Linear Gain'
              },
              {
                Name: 'multi_channel_type',
                Value: '1',
                PrettyName: 'Multi-Channel Type'
              },
              {
                Name: 'multi_channel_count',
                Value: '8',
                PrettyName: 'Multi-Channel Count'
              }
            ],
            ControlSource: 2
          },
          controls: {
            'input.1.gain': {},
            'output.1.gain': {}
          }
        },
        'Text Box': {
          name: 'Text Box',
          state: {
            ID: 'Text Box',
            Name: 'Text Box',
            Type: 'custom_controls',
            Properties: [
              {
                Name: 'type_1',
                Value: '13',
                PrettyName: 'Type'
              }
            ],
            ControlSource: 2
          },
          controls: {
            'text.1': {}
          }
        },
        'Legacy Component': {
          // Component without state property (legacy format)
          name: 'Legacy Component',
          controls: {
            'control1': {}
          }
        }
      }
    };

    // Create mock official client
    mockOfficialClient = {
      isConnected: jest.fn().mockReturnValue(true),
      getQrwc: jest.fn().mockReturnValue(mockQrwc)
    };

    adapter = new QRWCClientAdapter(mockOfficialClient as OfficialQRWCClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Component.GetComponents response format', () => {
    it('should return components with correct Type and Properties from state', async () => {
      const result = await adapter.sendCommand('Component.GetComponents');

      expect(result).toEqual({
        result: [
          {
            Name: 'APM ABC',
            Type: 'apm',
            Properties: []
          },
          {
            Name: 'My Delay Mixer',
            Type: 'delay_matrix',
            Properties: [
              {
                Name: 'n_inputs',
                Value: '8',
                PrettyName: 'Input Count'
              },
              {
                Name: 'n_outputs',
                Value: '8',
                PrettyName: 'Output Count'
              },
              {
                Name: 'max_delay',
                Value: '0.5',
                PrettyName: 'Maximum Delay'
              },
              {
                Name: 'delay_type',
                Value: '0',
                PrettyName: 'Delay Type'
              },
              {
                Name: 'linear_gain',
                Value: 'False',
                PrettyName: 'Linear Gain'
              },
              {
                Name: 'multi_channel_type',
                Value: '1',
                PrettyName: 'Multi-Channel Type'
              },
              {
                Name: 'multi_channel_count',
                Value: '8',
                PrettyName: 'Multi-Channel Count'
              }
            ]
          },
          {
            Name: 'Text Box',
            Type: 'custom_controls',
            Properties: [
              {
                Name: 'type_1',
                Value: '13',
                PrettyName: 'Type'
              }
            ]
          },
          {
            Name: 'Legacy Component',
            Type: 'Component', // Fallback type when state is missing
            Properties: [] // Empty array when properties are missing
          }
        ]
      });
    });

    it('should handle alternative command name ComponentGetComponents', async () => {
      const result = await adapter.sendCommand('ComponentGetComponents');
      
      expect(result).toBeDefined();
      expect((result as any).result).toBeInstanceOf(Array);
      expect((result as any).result).toHaveLength(4);
    });

    it('should handle components with missing state gracefully', async () => {
      // Test with only legacy components
      mockQrwc.components = {
        'Component1': {
          name: 'Component1',
          controls: {}
        },
        'Component2': {
          name: 'Component2',
          // No state property at all
        }
      };

      const result = await adapter.sendCommand('Component.GetComponents');

      expect(result).toEqual({
        result: [
          {
            Name: 'Component1',
            Type: 'Component',
            Properties: []
          },
          {
            Name: 'Component2',
            Type: 'Component',
            Properties: []
          }
        ]
      });
    });

    it('should handle empty components object', async () => {
      mockQrwc.components = {};

      const result = await adapter.sendCommand('Component.GetComponents');

      expect(result).toEqual({
        result: []
      });
    });

    it('should throw error when QRWC instance is not available', async () => {
      mockOfficialClient.getQrwc = jest.fn().mockReturnValue(null);

      await expect(adapter.sendCommand('Component.GetComponents'))
        .rejects.toThrow('QRWC instance not available');
    });

    it('should match Q-SYS API specification format exactly', async () => {
      // This test verifies the response format matches the Q-SYS QRC specification
      const result = await adapter.sendCommand('Component.GetComponents');

      // Verify structure matches spec
      expect(result).toHaveProperty('result');
      expect((result as any).result).toBeInstanceOf(Array);
      
      // Check each component has required fields
      (result as any).result.forEach((component: any) => {
        expect(component).toHaveProperty('Name');
        expect(component).toHaveProperty('Type');
        expect(component).toHaveProperty('Properties');
        expect(component.Properties).toBeInstanceOf(Array);
        
        // Properties should have Name and Value fields
        component.Properties.forEach((prop: any) => {
          expect(prop).toHaveProperty('Name');
          expect(prop).toHaveProperty('Value');
          // PrettyName is optional but included when available
        });
      });
    });

    it('should include PrettyName in properties when available', async () => {
      const result = await adapter.sendCommand('Component.GetComponents');
      const delayMixer = (result as any).result.find((c: any) => c.Name === 'My Delay Mixer');
      
      expect(delayMixer).toBeDefined();
      expect(delayMixer.Properties).toHaveLength(7);
      
      // Verify PrettyName is preserved
      const maxDelayProp = delayMixer.Properties.find((p: any) => p.Name === 'max_delay');
      expect(maxDelayProp).toEqual({
        Name: 'max_delay',
        Value: '0.5',
        PrettyName: 'Maximum Delay'
      });
    });
  });
});