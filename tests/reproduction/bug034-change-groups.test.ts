import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { QRWCClientAdapter } from '../../src/mcp/qrwc/adapter.js';
import { OfficialQRWCClient } from '../../src/qrwc/officialClient.js';
import { readFileSync, existsSync } from 'fs';

/**
 * Reproduction test for BUG-034: Change Group Methods Not Implemented
 * 
 * This test verifies that all 8 Change Group JSON-RPC methods are properly
 * implemented in the QRWC adapter and work correctly.
 */
describe('BUG-034: Change Group Methods Implementation', () => {
  let officialClient: OfficialQRWCClient;
  let adapter: QRWCClientAdapter;
  let config: any;

  beforeEach(() => {
    // Load test configuration
    const configPath = './qsys-core.config.json';
    if (existsSync(configPath)) {
      config = JSON.parse(readFileSync(configPath, 'utf-8'));
    } else {
      // Skip tests if no config
      console.log('Skipping BUG-034 reproduction test - no Q-SYS Core config');
      return;
    }

    // Create official client with mock mode for testing
    officialClient = new OfficialQRWCClient({
      ...config,
      mockMode: true // Use mock mode for testing
    });

    // Create adapter
    adapter = new QRWCClientAdapter(officialClient);
  });

  afterEach(() => {
    adapter.clearAllCaches();
  });

  it('should implement all 8 Change Group methods', async () => {
    const groupId = 'test-group-bug034';

    // 1. ChangeGroup.AddControl - Create a new group
    const createResult = await adapter.sendCommand('ChangeGroup.AddControl', {
      Id: groupId,
      Controls: []
    });
    expect(createResult).toHaveProperty('result', true);

    // 2. ChangeGroup.AddControl - Add controls to group
    const addResult = await adapter.sendCommand('ChangeGroup.AddControl', {
      Id: groupId,
      Controls: ['Gain1.gain', 'Gain1.mute']
    });
    expect(addResult).toHaveProperty('result', true);

    // 3. ChangeGroup.AddComponentControl - Add component controls
    const addCompResult = await adapter.sendCommand('ChangeGroup.AddComponentControl', {
      Id: groupId,
      Component: {
        Name: 'Gain2',
        Controls: [{ Name: 'gain' }, { Name: 'mute' }]
      }
    });
    expect(addCompResult).toHaveProperty('result', true);

    // 4. ChangeGroup.Poll - Poll for changes
    const pollResult = await adapter.sendCommand('ChangeGroup.Poll', {
      Id: groupId
    }) as any;
    expect(pollResult).toHaveProperty('result');
    expect(pollResult.result).toHaveProperty('Id', groupId);
    expect(pollResult.result).toHaveProperty('Changes');
    expect(Array.isArray(pollResult.result.Changes)).toBe(true);

    // 5. ChangeGroup.Remove - Remove controls
    const removeResult = await adapter.sendCommand('ChangeGroup.Remove', {
      Id: groupId,
      Controls: ['Gain1.mute']
    });
    expect(removeResult).toHaveProperty('result', true);

    // 6. ChangeGroup.Invalidate - Invalidate cached values
    const invalidateResult = await adapter.sendCommand('ChangeGroup.Invalidate', {
      Id: groupId
    });
    expect(invalidateResult).toHaveProperty('result', true);

    // 7. ChangeGroup.Clear - Clear all controls
    const clearResult = await adapter.sendCommand('ChangeGroup.Clear', {
      Id: groupId
    });
    expect(clearResult).toHaveProperty('result', true);

    // 8. ChangeGroup.AutoPoll - Enable auto polling
    const autoPollResult = await adapter.sendCommand('ChangeGroup.AutoPoll', {
      Id: groupId,
      Rate: 2.0
    });
    expect(autoPollResult).toHaveProperty('result', true);

    // Verify group exists in list
    const groups = adapter.listChangeGroups();
    const group = groups.find(g => g.id === groupId);
    expect(group).toBeDefined();
    expect(group?.hasAutoPoll).toBe(true);

    // 9. ChangeGroup.Destroy - Clean up
    const destroyResult = await adapter.sendCommand('ChangeGroup.Destroy', {
      Id: groupId
    });
    expect(destroyResult).toHaveProperty('result', true);

    // Verify group is gone
    const groupsAfter = adapter.listChangeGroups();
    const groupAfter = groupsAfter.find(g => g.id === groupId);
    expect(groupAfter).toBeUndefined();
  });

  it('should track control value changes in Poll', async () => {
    const groupId = 'test-group-changes';

    // Create group with controls
    await adapter.sendCommand('ChangeGroup.AddControl', {
      Id: groupId,
      Controls: ['TestGain.gain', 'TestGain.mute']
    });

    // First poll - should show current values as changes
    const poll1 = await adapter.sendCommand('ChangeGroup.Poll', {
      Id: groupId
    }) as any;
    expect(poll1.result.Changes).toHaveLength(2);

    // Second poll - no changes
    const poll2 = await adapter.sendCommand('ChangeGroup.Poll', {
      Id: groupId
    }) as any;
    expect(poll2.result.Changes).toHaveLength(0);

    // Clean up
    await adapter.sendCommand('ChangeGroup.Destroy', {
      Id: groupId
    });
  });

  it('should handle errors appropriately', async () => {
    // Poll non-existent group
    await expect(adapter.sendCommand('ChangeGroup.Poll', {
      Id: 'non-existent-group'
    })).rejects.toThrow('Change group not found');

    // Remove from non-existent group
    await expect(adapter.sendCommand('ChangeGroup.Remove', {
      Id: 'non-existent-group',
      Controls: ['Test.control']
    })).rejects.toThrow('Change group not found');
  });
});