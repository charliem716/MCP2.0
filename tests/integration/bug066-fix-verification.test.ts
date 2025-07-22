import { describe, it, expect, beforeEach } from '@jest/globals';
import { QRWCClientAdapter } from '../../src/mcp/qrwc/adapter.js';
import { 
  CreateChangeGroupTool,
  AddControlsToChangeGroupTool,
  PollChangeGroupTool 
} from '../../src/mcp/tools/change-groups.js';

describe('BUG-066 Fix Verification: Duplicate group handling', () => {
  let adapter: QRWCClientAdapter;
  let createTool: CreateChangeGroupTool;
  let addControlsTool: AddControlsToChangeGroupTool;
  let pollTool: PollChangeGroupTool;

  beforeEach(() => {
    adapter = new QRWCClientAdapter();
    createTool = new CreateChangeGroupTool(adapter);
    addControlsTool = new AddControlsToChangeGroupTool(adapter);
    pollTool = new PollChangeGroupTool(adapter);
    
    // Mock the official client connection
    (adapter as any).officialClient = {
      isConnected: () => true,
      components: () => ({ Components: [] })
    };
  });

  it('should preserve existing controls when attempting to recreate a group', async () => {
    const groupId = 'test-preserve-controls';
    
    // Step 1: Create a new group
    const createResult1 = await createTool.execute({ groupId });
    const response1 = JSON.parse(createResult1.content[0].text);
    expect(response1.success).toBe(true);
    expect(response1.message).toContain('created successfully');
    
    // Step 2: Add controls to the group
    const controls = ['TestGain.gain', 'TestGain.mute'];
    // Mock the control index to accept our test controls
    (adapter as any).controlIndex = new Map(controls.map(c => [c, { Name: c }]));
    
    await addControlsTool.execute({ groupId, controlNames: controls });
    
    // Verify controls were added
    const group = (adapter as any).changeGroups.get(groupId);
    expect(group.controls).toEqual(controls);
    
    // Step 3: Attempt to create the same group again
    const createResult2 = await createTool.execute({ groupId });
    const response2 = JSON.parse(createResult2.content[0].text);
    
    // Step 4: Verify the fix - should warn but preserve controls
    expect(response2.success).toBe(true);
    expect(response2.warning).toBeDefined();
    expect(response2.warning).toContain('already exists');
    expect(response2.warning).toContain('2 controls');
    
    // Step 5: Verify controls are preserved (not overwritten)
    const groupAfter = (adapter as any).changeGroups.get(groupId);
    expect(groupAfter.controls).toEqual(controls);
    expect(groupAfter.controls.length).toBe(2);
  });

  it('should handle multiple duplicate attempts gracefully', async () => {
    const groupId = 'test-multiple-duplicates';
    
    // Create group
    await createTool.execute({ groupId });
    
    // Add a control
    (adapter as any).controlIndex = new Map([['Test.control', { Name: 'Test.control' }]]);
    await addControlsTool.execute({ groupId, controlNames: ['Test.control'] });
    
    // Try to create multiple times
    for (let i = 0; i < 3; i++) {
      const result = await createTool.execute({ groupId });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.warning).toContain('already exists');
      expect(response.warning).toContain('1 controls');
    }
    
    // Verify control is still there
    const group = (adapter as any).changeGroups.get(groupId);
    expect(group.controls).toEqual(['Test.control']);
  });

  it('should still create new groups normally', async () => {
    const groupId = 'brand-new-group';
    
    // Verify group doesn't exist
    expect((adapter as any).changeGroups.has(groupId)).toBe(false);
    
    // Create new group
    const result = await createTool.execute({ groupId });
    const response = JSON.parse(result.content[0].text);
    
    // Should create without warnings
    expect(response.success).toBe(true);
    expect(response.warning).toBeUndefined();
    expect(response.message).toContain('created successfully');
    
    // Verify group was created
    expect((adapter as any).changeGroups.has(groupId)).toBe(true);
  });

  afterEach(() => {
    adapter.dispose();
  });
});