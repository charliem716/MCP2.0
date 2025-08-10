import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { SetControlValuesTool } from '../../../../src/mcp/tools/controls.js';
import type { IControlSystem } from '../../../../src/mcp/interfaces/control-system.js';
import type { ToolExecutionContext } from '../../../../src/mcp/tools/base.js';

/**
 * Test suite to verify the actual validation behavior discovered in TEST 3:
 * - validate:true provides honest error reporting (tells you what exists/doesn't exist)
 * - validate:false provides optimistic reporting (claims everything works)
 * - In BOTH cases, only real controls actually change in Q-SYS (fake controls always fail at core level)
 */
describe('SetControlValuesTool - Validation Behavior', () => {
  let mockControlSystem: jest.Mocked<IControlSystem>;
  let tool: SetControlValuesTool;
  const mockContext: ToolExecutionContext = { 
    sessionId: 'test-session',
    userId: 'test-user',
    timestamp: Date.now()
  };

  beforeEach(() => {
    mockControlSystem = {
      sendCommand: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),  // Mock as connected
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    } as unknown as jest.Mocked<IControlSystem>;

    tool = new SetControlValuesTool(mockControlSystem);
  });

  describe('Validation Mode: validate:true (default)', () => {
    it('should reject fake controls with detailed error messages', async () => {
      // Mock validation check - fake control doesn't exist
      mockControlSystem.sendCommand
        .mockResolvedValueOnce({
          // Component.GetControls for validation - component doesn't exist
          error: {
            code: -32602,
            message: "Component 'FakeComponent' not found"
          }
        });

      const result = await tool.execute(
        {
          controls: [
            { name: 'FakeComponent.fakeControl', value: 50 }
          ],
          validate: true
        },
        mockContext
      );

      const response = JSON.parse(result.content[0].text);
      
      // With validate:true, fake controls are rejected with error messages
      expect(response).toHaveLength(1);
      expect(response[0]).toMatchObject({
        name: 'FakeComponent.fakeControl',
        value: 50,
        success: false,
        error: expect.stringContaining('not found')
      });
      
      // Validation prevents the control from being sent to Q-SYS
      expect(mockControlSystem.sendCommand).not.toHaveBeenCalledWith(
        'Component.Set',
        expect.anything()
      );
    });

    it('should process real controls successfully while rejecting fake ones', async () => {
      // Mock validation checks
      mockControlSystem.sendCommand
        .mockResolvedValueOnce({
          // Component.GetControls for RealComponent
          Controls: [
            { Name: 'realControl', Value: 0, Type: 'Float' }
          ]
        })
        .mockResolvedValueOnce({
          // Component.GetControls for FakeComponent - doesn't exist
          error: {
            code: -32602,
            message: "Component 'FakeComponent' not found"
          }
        })
        .mockResolvedValueOnce({
          // Component.Set for real control
          result: [
            { Name: 'realControl', Result: 'Success' }
          ]
        });

      const result = await tool.execute(
        {
          controls: [
            { name: 'RealComponent.realControl', value: 75 },
            { name: 'FakeComponent.fakeControl', value: 50 }
          ],
          validate: true
        },
        mockContext
      );

      const response = JSON.parse(result.content[0].text);
      
      expect(response).toHaveLength(2);
      
      // Fake control rejected with error
      expect(response.find((r: any) => r.name === 'FakeComponent.fakeControl')).toMatchObject({
        success: false,
        error: expect.stringContaining('validation prevented attempt')
      });
      
      // Real control processed successfully
      expect(response.find((r: any) => r.name === 'RealComponent.realControl')).toMatchObject({
        success: true,
        value: 75
      });
    });
  });

  describe('Validation Mode: validate:false', () => {
    it('should report success for ALL controls (even fake ones)', async () => {
      // With validate:false, no validation checks are made
      // Q-SYS response doesn't include fake controls (they were silently ignored)
      mockControlSystem.sendCommand.mockResolvedValueOnce({
        // Component.Set response - Q-SYS silently ignored the fake control
        result: []
      });

      const result = await tool.execute(
        {
          controls: [
            { name: 'FakeComponent.fakeControl', value: 50 }
          ],
          validate: false
        },
        mockContext
      );

      const response = JSON.parse(result.content[0].text);
      
      // With validate:false, even fake controls report "success"
      expect(response).toHaveLength(1);
      expect(response[0]).toMatchObject({
        name: 'FakeComponent.fakeControl',
        value: 50,
        success: true  // Optimistic reporting!
      });
      
      // Control WAS sent to Q-SYS (validation was skipped)
      expect(mockControlSystem.sendCommand).toHaveBeenCalledWith(
        'Component.Set',
        expect.objectContaining({
          Name: 'FakeComponent',
          Controls: expect.arrayContaining([
            expect.objectContaining({ Name: 'fakeControl', Value: 50 })
          ])
        })
      );
    });

    it('should process mixed real/fake controls with all reporting success', async () => {
      // With validate:false, no validation checks
      // Q-SYS only returns results for real controls
      mockControlSystem.sendCommand
        .mockResolvedValueOnce({
          // Component.Set for RealComponent
          result: [
            { Name: 'realControl', Result: 'Success' }
          ]
        })
        .mockResolvedValueOnce({
          // Component.Set for FakeComponent - no results (silently ignored)
          result: []
        });

      const result = await tool.execute(
        {
          controls: [
            { name: 'RealComponent.realControl', value: 75 },
            { name: 'FakeComponent.fakeControl', value: 50 }
          ],
          validate: false
        },
        mockContext
      );

      const response = JSON.parse(result.content[0].text);
      
      expect(response).toHaveLength(2);
      
      // BOTH controls report success with validate:false
      expect(response.find((r: any) => r.name === 'RealComponent.realControl')).toMatchObject({
        success: true,
        value: 75
      });
      
      expect(response.find((r: any) => r.name === 'FakeComponent.fakeControl')).toMatchObject({
        success: true,  // Reports success even though Q-SYS ignored it!
        value: 50
      });
    });

    it('should still report Q-SYS level errors when they occur', async () => {
      // Even with validate:false, if Q-SYS explicitly returns an error, we report it
      mockControlSystem.sendCommand.mockResolvedValueOnce({
        result: [
          { Name: 'problematicControl', Result: 'Error', Error: 'Value out of range' }
        ]
      });

      const result = await tool.execute(
        {
          controls: [
            { name: 'Component.problematicControl', value: 999 }
          ],
          validate: false
        },
        mockContext
      );

      const response = JSON.parse(result.content[0].text);
      
      // Even with validate:false, explicit Q-SYS errors are reported
      expect(response[0]).toMatchObject({
        name: 'Component.problematicControl',
        value: 999,
        success: false,
        error: 'Value out of range'
      });
    });
  });

  describe('Use Case Recommendations', () => {
    it('validate:true should be used for debugging to get accurate feedback', async () => {
      // Setup mixed valid/invalid controls
      mockControlSystem.sendCommand
        .mockResolvedValueOnce({ 
          // Invalid component  
          error: {
            code: -32602,
            message: "Component 'Invalid' not found"
          }
        })  
        .mockResolvedValueOnce({ 
          // Valid component
          Controls: [{ Name: 'gain', Value: 0, Type: 'Float' }] 
        })
        .mockResolvedValueOnce({ 
          // Component.Set for valid control
          result: [{ Name: 'gain', Result: 'Success' }] 
        });

      const result = await tool.execute(
        {
          controls: [
            { name: 'Invalid.control', value: 1 },
            { name: 'Valid.gain', value: -10 }
          ],
          validate: true
        },
        mockContext
      );

      const response = JSON.parse(result.content[0].text);
      
      // Accurate feedback about what exists and what doesn't
      const invalid = response.find((r: any) => r.name === 'Invalid.control');
      const valid = response.find((r: any) => r.name === 'Valid.gain');
      
      expect(invalid?.success).toBe(false);
      expect(invalid?.error).toContain('not found');
      expect(valid?.success).toBe(true);
    });

    it('validate:false should be used for bulk operations to avoid partial failures', async () => {
      // Simulate bulk operation with 10 controls
      const bulkControls = Array.from({ length: 10 }, (_, i) => ({
        name: `Component.control${i}`,
        value: i * 10
      }));

      // Q-SYS response - some controls might not exist but we don't care
      mockControlSystem.sendCommand.mockResolvedValueOnce({
        result: bulkControls.slice(0, 7).map(c => ({
          Name: c.name.split('.')[1],
          Result: 'Success'
        }))
      });

      const result = await tool.execute(
        {
          controls: bulkControls,
          validate: false  // Skip validation for bulk operation
        },
        mockContext
      );

      const response = JSON.parse(result.content[0].text);
      
      // All controls report success (optimistic reporting)
      expect(response).toHaveLength(10);
      expect(response.every((r: any) => r.success)).toBe(true);
      
      // No validation calls were made
      expect(mockControlSystem.sendCommand).toHaveBeenCalledTimes(1);
      expect(mockControlSystem.sendCommand).toHaveBeenCalledWith('Component.Set', expect.anything());
    });
  });

  describe('Critical Discovery Summary', () => {
    it('should demonstrate that validation only affects reporting, not Q-SYS behavior', async () => {
      const testControl = { name: 'Test.control', value: 50 };
      
      // Test with validate:true
      mockControlSystem.sendCommand
        .mockResolvedValueOnce({ 
          // Validation fails - component doesn't exist
          error: {
            code: -32602,
            message: "Component 'Test' not found"
          }
        });
      
      const resultWithValidation = await tool.execute(
        { controls: [testControl], validate: true },
        mockContext
      );
      
      const responseWithValidation = JSON.parse(resultWithValidation.content[0].text);
      
      // Reset for validate:false test
      mockControlSystem.sendCommand.mockReset();
      mockControlSystem.isConnected = jest.fn().mockReturnValue(true);
      mockControlSystem.sendCommand.mockResolvedValueOnce({ 
        // Q-SYS response when control doesn't exist - empty result array
        result: []  // No control results returned = silently ignored
      });
      
      // Test with validate:false
      const resultWithoutValidation = await tool.execute(
        { controls: [testControl], validate: false },
        mockContext
      );
      
      const responseWithoutValidation = JSON.parse(resultWithoutValidation.content[0].text);
      
      // Summary of behavior difference:
      expect(responseWithValidation[0].success).toBe(false);  // Honest reporting
      expect(responseWithValidation[0].error).toBeDefined();   // Tells you why
      
      expect(responseWithoutValidation[0].success).toBe(true); // Optimistic reporting
      expect(responseWithoutValidation[0].error).toBeUndefined(); // No error reported
      
      // But in BOTH cases, if the control doesn't exist in Q-SYS, it won't actually change!
      // The validation parameter only controls the error handling strategy, not the actual behavior
    });
  });
});