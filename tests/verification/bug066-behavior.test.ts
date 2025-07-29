import { describe, it, expect, beforeEach } from '@jest/globals';
import { QRWCClientAdapter } from '../../src/mcp/qrwc/adapter';
import {
  CreateChangeGroupTool,
  AddControlsToChangeGroupTool,
} from '../../src/mcp/tools/change-groups';

describe('BUG-066 Expected Behavior Verification', () => {
  let adapter: QRWCClientAdapter;
  let createTool: CreateChangeGroupTool;
  let addControlsTool: AddControlsToChangeGroupTool;

  beforeEach(() => {
    // Create a mock official client
    const mockOfficialClient = {
      isConnected: () => true,
      getQrwc: () => ({
        components: {
          Gain1: {
            controls: {
              gain: { Value: 0 },
              mute: { Value: false }
            }
          }
        }
      }),
    };
    
    adapter = new QRWCClientAdapter(mockOfficialClient as any);
    createTool = new CreateChangeGroupTool(adapter);
    addControlsTool = new AddControlsToChangeGroupTool(adapter);
  });

  it('should NOT silently overwrite existing groups (Expected Behavior from bug report)', async () => {
    const groupId = 'test-no-overwrite';

    // Step 1: Create a group
    const result1 = await createTool.execute({ groupId });
    expect(JSON.parse(result1.content[0].text).success).toBe(true);

    // Step 2: Add controls
    await addControlsTool.execute({
      groupId,
      controlNames: ['Gain1.gain', 'Gain1.mute'],
    });

    // Verify controls were added
    const groupBefore = (adapter as any).changeGroups.get(groupId);
    expect(groupBefore.controls).toHaveLength(2);

    // Step 3: Attempt to create the same group again
    const result2 = await createTool.execute({ groupId });
    const response = JSON.parse(result2.content[0].text);

    // Expected Behavior Verification:
    // 1. Should return success (not error) but with warning
    expect(response.success).toBe(true);

    // 2. Should include warning about existing group
    expect(response.warning).toBeDefined();
    expect(response.warning).toContain('already exists');
    expect(response.message).toContain('already exists');

    // 3. Controls should NOT be lost (not overwritten)
    const groupAfter = (adapter as any).changeGroups.get(groupId);
    expect(groupAfter.controls).toHaveLength(2);
    expect(groupAfter.controls).toContain('Gain1.gain');
    expect(groupAfter.controls).toContain('Gain1.mute');
  });

  it('should handle the exact reproduction steps from BUG-066', async () => {
    // Following exact steps from bug report

    // 1. Create a change group: create_change_group({groupId: 'mygroup'})
    const step1 = await createTool.execute({ groupId: 'mygroup' });
    expect(JSON.parse(step1.content[0].text).success).toBe(true);

    // 2. Add controls: add_controls_to_change_group({groupId: 'mygroup', controlNames: ['Gain1.gain', 'Gain1.mute']})
    const step2 = await addControlsTool.execute({
      groupId: 'mygroup',
      controlNames: ['Gain1.gain', 'Gain1.mute'],
    });
    expect(JSON.parse(step2.content[0].text).success).toBe(true);

    // 3. Create the same group again: create_change_group({groupId: 'mygroup'})
    const step3 = await createTool.execute({ groupId: 'mygroup' });
    const response3 = JSON.parse(step3.content[0].text);

    // Verify Expected Result: Error or warning about duplicate group ID
    expect(response3.warning).toBeDefined();
    expect(response3.warning).toContain('mygroup');
    expect(response3.warning).toContain('already exists');
    expect(response3.warning).toContain('2 controls'); // Should mention existing controls

    // Verify controls are NOT lost (bug is fixed)
    const finalGroup = (adapter as any).changeGroups.get('mygroup');
    expect(finalGroup.controls).toEqual(['Gain1.gain', 'Gain1.mute']);
  });

  afterEach(() => {
    adapter.dispose();
  });
});
