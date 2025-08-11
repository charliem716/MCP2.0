/**
 * Unit test for BUG-203: set_control_values with validate:true fails with "Control not found in Q-SYS response"
 * 
 * The issue was that when validate:true, if a control wasn't in the Q-SYS response,
 * it was marked as failed even though Q-SYS often doesn't return successful controls.
 */

import { SetControlValuesTool } from '../../../../src/mcp/tools/controls';
import { IControlSystem } from '../../../../src/shared/interfaces/control-system';
import { ToolExecutionContext } from '../../../../src/mcp/tools/base';

describe('BUG-203: set_control_values validation fix', () => {
  let mockClient: jest.Mocked<IControlSystem>;
  let tool: SetControlValuesTool;
  const context: ToolExecutionContext = { requestId: 'test-123' };

  beforeEach(() => {
    mockClient = {
      sendCommand: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
      getComponents: jest.fn(),
      getControls: jest.fn(),
      getControlValues: jest.fn(),
      setControlValue: jest.fn(),
      getCoreStatus: jest.fn(),
      createChangeGroup: jest.fn(),
      pollChangeGroup: jest.fn(),
      destroyChangeGroup: jest.fn(),
    } as unknown as jest.Mocked<IControlSystem>;

    tool = new SetControlValuesTool(mockClient);
  });

  describe('Component.Set response handling with validate:true', () => {
    it('should treat missing controls in response as success when validate:true', async () => {
      // Mock validation - controls exist
      mockClient.sendCommand
        .mockResolvedValueOnce({
          // Component.GetControls for validation
          result: {
            Controls: [
              { Name: 'input.1.gain', Type: 'Float', Value: 0 },
              { Name: 'input.2.gain', Type: 'Float', Value: 0 }
            ]
          }
        })
        .mockResolvedValueOnce({
          // Component.Set response - Q-SYS doesn't return anything for successful controls
          // This is the critical test case - empty result array
          result: []
        });

      const result = await tool.execute(
        {
          controls: [
            { name: 'TestComponent.input.1.gain', value: -6 },
            { name: 'TestComponent.input.2.gain', value: -3 }
          ],
          validate: true  // Critical: with validation enabled
        },
        context
      );

      const content = JSON.parse(result.content[0].text);
      
      // Both controls should be marked as successful
      expect(content).toHaveLength(2);
      expect(content[0]).toEqual({
        name: 'TestComponent.input.1.gain',
        value: -6,
        success: true  // Should be true, not false with "Control not found in Q-SYS response"
      });
      expect(content[1]).toEqual({
        name: 'TestComponent.input.2.gain',
        value: -3,
        success: true  // Should be true, not false with "Control not found in Q-SYS response"
      });
      
      // Should NOT have the old error message
      const hasOldError = content.some((r: any) => 
        r.error && r.error.includes('Control not found in Q-SYS response')
      );
      expect(hasOldError).toBe(false);
    });

    it('should still report actual errors from Q-SYS when validate:true', async () => {
      // Mock validation - controls exist
      mockClient.sendCommand
        .mockResolvedValueOnce({
          // Component.GetControls for validation
          result: {
            Controls: [
              { Name: 'input.1.gain', Type: 'Float', Value: 0 },
              { Name: 'readonly', Type: 'Float', Value: 0 }
            ]
          }
        })
        .mockResolvedValueOnce({
          // Component.Set response - one control has an error
          result: [
            // First control succeeded (not in response)
            // Second control failed
            { Name: 'readonly', Result: 'Error', Error: 'Control is read-only' }
          ]
        });

      const result = await tool.execute(
        {
          controls: [
            { name: 'TestComponent.input.1.gain', value: -6 },
            { name: 'TestComponent.readonly', value: 10 }
          ],
          validate: true
        },
        context
      );

      const content = JSON.parse(result.content[0].text);
      
      expect(content).toHaveLength(2);
      
      // First control should succeed (not in response = success)
      expect(content[0]).toEqual({
        name: 'TestComponent.input.1.gain',
        value: -6,
        success: true
      });
      
      // Second control should have the actual error
      expect(content[1]).toEqual({
        name: 'TestComponent.readonly',
        value: 10,
        success: false,
        error: 'Control is read-only'
      });
    });

    it('should handle mixed success/absent controls with validate:true', async () => {
      // Mock validation - all controls exist
      mockClient.sendCommand
        .mockResolvedValueOnce({
          // Component.GetControls for validation
          result: {
            Controls: [
              { Name: 'input.1.gain', Type: 'Float', Value: 0 },
              { Name: 'input.2.gain', Type: 'Float', Value: 0 },
              { Name: 'input.3.gain', Type: 'Float', Value: 0 }
            ]
          }
        })
        .mockResolvedValueOnce({
          // Component.Set response - Q-SYS explicitly returns success for one
          result: [
            { Name: 'input.2.gain', Result: 'Success' }
            // input.1.gain and input.3.gain not in response (implicitly successful)
          ]
        });

      const result = await tool.execute(
        {
          controls: [
            { name: 'TestComponent.input.1.gain', value: -6 },
            { name: 'TestComponent.input.2.gain', value: -3 },
            { name: 'TestComponent.input.3.gain', value: -9 }
          ],
          validate: true
        },
        context
      );

      const content = JSON.parse(result.content[0].text);
      
      // All three should be successful
      expect(content).toHaveLength(3);
      expect(content.every((c: any) => c.success)).toBe(true);
      
      // No "Control not found in Q-SYS response" errors
      const hasOldError = content.some((r: any) => 
        r.error && r.error.includes('Control not found in Q-SYS response')
      );
      expect(hasOldError).toBe(false);
    });

    it('should work correctly with validate:false (unchanged behavior)', async () => {
      // With validate:false, controls not in response are assumed successful
      mockClient.sendCommand.mockResolvedValueOnce({
        // Component.Set response - empty (all successful)
        result: []
      });

      const result = await tool.execute(
        {
          controls: [
            { name: 'TestComponent.input.1.gain', value: -6 },
            { name: 'TestComponent.input.2.gain', value: -3 }
          ],
          validate: false  // Validation disabled
        },
        context
      );

      const content = JSON.parse(result.content[0].text);
      
      // Both should be successful (unchanged behavior)
      expect(content).toHaveLength(2);
      expect(content.every((c: any) => c.success)).toBe(true);
    });
  });

  describe('Named controls (Control.Set) with validate:true', () => {
    it('should handle named controls correctly when absent from response', async () => {
      // Mock validation for named controls
      mockClient.sendCommand
        .mockResolvedValueOnce({
          // Control.GetValues for validation
          result: [
            { Name: 'NamedGain', Value: 0, Type: 'Float' }
          ]
        })
        .mockResolvedValueOnce({
          // Control.Set response - empty (successful)
          result: []
        });

      const result = await tool.execute(
        {
          controls: [
            { name: 'NamedGain', value: -10 }  // Named control (no dot)
          ],
          validate: true
        },
        context
      );

      const content = JSON.parse(result.content[0].text);
      
      // Should be successful
      expect(content).toHaveLength(1);
      expect(content[0]).toEqual({
        name: 'NamedGain',
        value: -10,
        success: true
      });
      
      // Should NOT have the old error
      expect(content[0].error).toBeUndefined();
    });
  });
});