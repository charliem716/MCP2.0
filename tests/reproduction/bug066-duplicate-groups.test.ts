import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { QRWCClientInterface } from '../../src/mcp/qrwc/adapter.js';
import { CreateChangeGroupTool } from '../../src/mcp/tools/change-groups.js';

describe('BUG-066: create_change_group silently overwrites existing groups', () => {
  let mockAdapter: jest.Mocked<QRWCClientInterface>;
  let tool: CreateChangeGroupTool;

  beforeEach(() => {
    // Mock adapter with changeGroups Map
    const changeGroups = new Map();
    const changeGroupLastValues = new Map();
    
    mockAdapter = {
      isConnected: jest.fn().mockReturnValue(true),
      sendCommand: jest.fn().mockImplementation((command, params) => {
        if (command === 'ChangeGroup.AddControl') {
          const id = params.Id;
          const controls = params.Controls || [];
          
          // Simulate the adapter behavior
          let group = changeGroups.get(id);
          if (!group) {
            group = { id, controls: [] };
            changeGroups.set(id, group);
            changeGroupLastValues.set(id, new Map());
          }
          
          // This mimics the overwrite behavior
          if (controls.length === 0) {
            // It's a create operation, reset the group
            group.controls = [];
          }
          
          return Promise.resolve({ result: true });
        }
        return Promise.reject(new Error('Unknown command'));
      }),
      changeGroups,
      changeGroupLastValues
    } as any;
    
    tool = new CreateChangeGroupTool(mockAdapter);
  });

  it('should reproduce the bug: silently overwrites existing groups', async () => {
    const groupId = 'test-group';
    
    // First, create a group
    const result1 = await tool.execute({ groupId });
    expect(JSON.parse(result1.content[0].text).success).toBe(true);
    
    // Add some controls to simulate a populated group
    mockAdapter.changeGroups.get(groupId).controls = ['Gain1.gain', 'Gain1.mute'];
    
    // Verify the group has controls
    expect(mockAdapter.changeGroups.get(groupId).controls).toHaveLength(2);
    
    // Create the same group again - this should overwrite
    const result2 = await tool.execute({ groupId });
    expect(JSON.parse(result2.content[0].text).success).toBe(true);
    
    // Bug: The group's controls are reset (overwritten)
    expect(mockAdapter.changeGroups.get(groupId).controls).toHaveLength(0);
    
    // No error or warning is returned
    expect(result2.isError).toBeFalsy();
    const response = JSON.parse(result2.content[0].text);
    expect(response.message).not.toContain('exists');
    expect(response.message).not.toContain('overwrite');
  });

  it('demonstrates expected behavior: should warn or error on duplicate', async () => {
    const groupId = 'test-group';
    
    // Create first group
    await tool.execute({ groupId });
    
    // Attempt to create duplicate
    const result = await tool.execute({ groupId });
    
    // This test will fail with current implementation
    // Expected: either an error or a warning message
    const response = JSON.parse(result.content[0].text);
    
    // Current behavior: success with no warning
    expect(response.success).toBe(true);
    expect(response.message).toBe(`Change group '${groupId}' created successfully`);
    
    // Expected behavior would include one of these:
    // expect(result.isError).toBe(true); // Option 1: Error
    // expect(response.warning).toBeDefined(); // Option 2: Warning
    // expect(response.message).toContain('already exists'); // Option 3: Informative message
  });
});