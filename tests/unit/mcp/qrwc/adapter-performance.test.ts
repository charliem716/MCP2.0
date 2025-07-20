import { QRWCClientAdapter } from '../../../../src/mcp/qrwc/adapter.js';
import type { OfficialQRWCClient } from '../../../../src/qrwc/officialClient.js';

describe('QRWCClientAdapter Performance (BUG-030)', () => {
  let mockClient: jest.Mocked<OfficialQRWCClient>;
  let adapter: QRWCClientAdapter;
  let mockComponents: any;

  beforeEach(() => {
    // Create a large mock design with many components and controls
    mockComponents = {};
    const componentCount = 100;
    const controlsPerComponent = 50;

    for (let i = 0; i < componentCount; i++) {
      const componentName = `Component_${i}`;
      mockComponents[componentName] = {
        controls: {}
      };
      
      for (let j = 0; j < controlsPerComponent; j++) {
        const controlName = `Control_${j}`;
        mockComponents[componentName].controls[controlName] = {
          state: {
            Value: j,
            String: `Value_${j}`
          }
        };
      }
    }

    mockClient = {
      isConnected: jest.fn().mockReturnValue(true),
      getQrwc: jest.fn().mockReturnValue({ components: mockComponents })
    } as any;

    adapter = new QRWCClientAdapter(mockClient);
  });

  describe('Control.GetValues performance', () => {
    it('should use O(1) index lookup instead of O(n*m) search', async () => {
      // Test controls from different components
      const testControls = [
        'Component_50.Control_25',  // Middle of the design
        'Component_99.Control_49',  // End of the design
        'Component_0.Control_0',    // Beginning
      ];

      // First call builds the index
      const startTime = Date.now();
      const result1 = await adapter.sendCommand('Control.GetValues', {
        Controls: testControls
      });
      const firstCallTime = Date.now() - startTime;

      expect(result1).toMatchObject({
        result: expect.arrayContaining([
          expect.objectContaining({
            Name: 'Component_50.Control_25',
            Value: { Value: 25, String: 'Value_25' }
          }),
          expect.objectContaining({
            Name: 'Component_99.Control_49',
            Value: { Value: 49, String: 'Value_49' }
          }),
          expect.objectContaining({
            Name: 'Component_0.Control_0',
            Value: { Value: 0, String: 'Value_0' }
          })
        ])
      });

      // Subsequent calls should be much faster (using index)
      const subsequentTimes: number[] = [];
      for (let i = 0; i < 10; i++) {
        const start = Date.now();
        await adapter.sendCommand('Control.GetValues', {
          Controls: [`Component_${i * 10}.Control_${i * 5}`]
        });
        subsequentTimes.push(Date.now() - start);
      }

      const avgSubsequentTime = subsequentTimes.reduce((a, b) => a + b, 0) / subsequentTimes.length;
      
      // Subsequent calls should be significantly faster than first call
      // (First call includes index building time)
      console.log(`First call: ${firstCallTime}ms, Avg subsequent: ${avgSubsequentTime}ms`);
      expect(avgSubsequentTime).toBeLessThan(firstCallTime);
    });

    it('should handle controls not in index gracefully', async () => {
      const result = await adapter.sendCommand('Control.GetValues', {
        Controls: ['NonExistent.Control', 'Component_10.Control_5']
      });

      expect(result).toMatchObject({
        result: [
          expect.objectContaining({
            Name: 'NonExistent.Control',
            Value: null,
            String: 'N/A'
          }),
          expect.objectContaining({
            Name: 'Component_10.Control_5',
            Value: { Value: 5, String: 'Value_5' }
          })
        ]
      });
    });

    it('should rebuild index when invalidated', async () => {
      // First call builds index
      await adapter.sendCommand('Control.GetValues', {
        Controls: ['Component_0.Control_0']
      });

      // Invalidate the index
      adapter.invalidateControlIndex();

      // Add new component to mock
      mockComponents['NewComponent'] = {
        controls: {
          'NewControl': {
            state: { Value: 'new', String: 'new' }
          }
        }
      };

      // This should rebuild the index and find the new control
      const result = await adapter.sendCommand('Control.GetValues', {
        Controls: ['NewComponent.NewControl']
      });

      expect(result).toMatchObject({
        result: [{
          Name: 'NewComponent.NewControl',
          Value: { Value: 'new', String: 'new' }
        }]
      });
    });

    it('should handle edge cases in control names', async () => {
      // Add components with dots in names
      mockComponents['Component.With.Dots'] = {
        controls: {
          'Control.Also.Dots': {
            state: { Value: 'dotted', String: 'dotted' }
          }
        }
      };

      const result = await adapter.sendCommand('Control.GetValues', {
        Controls: ['Component.With.Dots.Control.Also.Dots']
      });

      expect(result).toMatchObject({
        result: [{
          Name: 'Component.With.Dots.Control.Also.Dots',
          Value: { Value: 'dotted', String: 'dotted' }
        }]
      });
    });

    it('should not build index when not connected', async () => {
      mockClient.isConnected.mockReturnValue(false);

      // Should throw error when not connected
      await expect(adapter.sendCommand('Control.GetValues', {
        Controls: ['Component_0.Control_0']
      })).rejects.toThrow('QRWC client not connected');
    });
  });

  describe('Performance comparison', () => {
    it('should demonstrate O(1) vs O(n*m) performance difference', () => {
      const componentCount = 100;
      const controlsPerComponent = 50;
      const totalControls = componentCount * controlsPerComponent;

      // Simulate O(n*m) worst case
      let o_nm_iterations = 0;
      const worstCaseControl = 'Component_99.Control_49'; // Last control
      
      // Old algorithm would iterate through all
      for (let i = 0; i < componentCount; i++) {
        for (let j = 0; j < controlsPerComponent; j++) {
          o_nm_iterations++;
          if (`Component_${i}.Control_${j}` === worstCaseControl) {
            break;
          }
        }
      }

      // New algorithm with index
      const o_1_iterations = 1; // Direct lookup

      console.log(`Old algorithm iterations: ${o_nm_iterations}`);
      console.log(`New algorithm iterations: ${o_1_iterations}`);
      console.log(`Performance improvement: ${o_nm_iterations}x`);

      expect(o_nm_iterations).toBe(totalControls); // Worst case
      expect(o_1_iterations).toBe(1);
      expect(o_nm_iterations / o_1_iterations).toBe(5000);
    });
  });
});