import {
  describe,
  it,
  expect,
  beforeEach,
  jest,
  afterEach,
} from '@jest/globals';
import { QRWCClientAdapter } from '../../../../src/mcp/qrwc/adapter';
import type { OfficialQRWCClient } from '../../../../src/qrwc/officialClient';

describe('QRWCClientAdapter - Change Groups', () => {
  let adapter: QRWCClientAdapter;
  let mockOfficialClient: jest.Mocked<OfficialQRWCClient>;
  let mockQrwc: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock QRWC structure
    mockQrwc = {
      components: {
        Gain1: {
          controls: {
            gain: { state: { Value: -10, String: '-10dB' } },
            mute: { state: { Value: false, String: 'false' } },
          },
        },
        Mixer1: {
          controls: {
            level: { state: { Value: 0, String: '0dB' } },
          },
        },
      },
    };

    // Create mock official client
    mockOfficialClient = {
      isConnected: jest.fn().mockReturnValue(true),
      getQrwc: jest.fn().mockReturnValue(mockQrwc),
      executeCommand: jest.fn(),
      getComponent: jest.fn(),
    } as any;

    adapter = new QRWCClientAdapter(mockOfficialClient);
  });

  afterEach(() => {
    // Clear any timers
    jest.clearAllTimers();
  });

  describe('ChangeGroup.AddControl', () => {
    it('should create a new change group and add controls', async () => {
      const result = await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: 'test-group',
        Controls: ['Gain1.gain', 'Gain1.mute'],
      });

      expect(result).toEqual({ result: { addedCount: 2 } });
    });

    it('should add controls to existing group', async () => {
      // Create group
      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: 'test-group',
        Controls: ['Gain1.gain'],
      });

      // Add more controls
      const result = await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: 'test-group',
        Controls: ['Gain1.mute'],
      });

      expect(result).toEqual({ result: { addedCount: 1 } });
    });

    it('should require group ID', async () => {
      await expect(
        adapter.sendCommand('ChangeGroup.AddControl', {
          Controls: ['Gain1.gain'],
        })
      ).rejects.toThrow('Change group ID required');
    });

    it('should add all controls with valid format', async () => {
      const result = await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: 'test-group',
        Controls: ['Gain1.gain', 'InvalidControl.foo', 'Gain1.mute'],
      });

      // Adds all controls with valid component.control format (doesn't validate existence)
      expect(result).toEqual({ result: { addedCount: 3 } });
    });
  });

  describe('ChangeGroup.Poll', () => {
    it('should return current control values from SDK', async () => {
      // Mock QRWC structure with control values
      mockOfficialClient.getQrwc = jest.fn().mockReturnValue({
        components: {
          Gain1: {
            controls: {
              gain: {
                state: {
                  Value: -5,
                  String: '-5dB',
                },
              },
            },
          },
        },
      });
      
      // Create group and add control
      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: 'test-group',
        Controls: ['Gain1.gain'],
      });

      // Poll returns current values from SDK
      const result = await adapter.sendCommand('ChangeGroup.Poll', {
        Id: 'test-group',
      });

      expect(result).toEqual({
        result: {
          Id: 'test-group',
          Changes: [
            {
              Name: 'Gain1.gain',
              Value: -5,
              String: '-5dB',
            },
          ],
        },
      });
    });

    it('should return current values on every poll', async () => {
      mockOfficialClient.getQrwc = jest.fn().mockReturnValue({
        components: {
          Gain1: {
            controls: {
              gain: {
                state: {
                  Value: -10,
                  String: '-10dB',
                },
              },
            },
          },
        },
      });

      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: 'test-group',
        Controls: ['Gain1.gain'],
      });

      // Poll always returns current values (no change detection)
      const result = await adapter.sendCommand('ChangeGroup.Poll', {
        Id: 'test-group',
      });

      expect(result).toEqual({
        result: {
          Id: 'test-group',
          Changes: [
            {
              Name: 'Gain1.gain',
              Value: -10,
              String: '-10dB',
            },
          ],
        },
      });
    });
  });

  describe('ChangeGroup.AutoPoll', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should set up automatic polling', async () => {
      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: 'test-group',
        Controls: ['Gain1.gain'],
      });

      const sendCommandSpy = jest.spyOn(adapter, 'sendCommand');

      await adapter.sendCommand('ChangeGroup.AutoPoll', {
        Id: 'test-group',
        Rate: 2, // 2 seconds
      });

      // Fast forward 2 seconds
      jest.advanceTimersByTime(2000);

      // Should have called Poll
      expect(sendCommandSpy).toHaveBeenCalledWith('ChangeGroup.Poll', {
        Id: 'test-group',
      });
    });
  });

  describe('ChangeGroup.Destroy', () => {
    it('should destroy group and clear timers', async () => {
      jest.useFakeTimers();

      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: 'test-group',
        Controls: ['Gain1.gain'],
      });

      await adapter.sendCommand('ChangeGroup.AutoPoll', {
        Id: 'test-group',
        Rate: 1,
      });

      const result = await adapter.sendCommand('ChangeGroup.Destroy', {
        Id: 'test-group',
      });

      expect(result).toEqual({ result: true });

      // Should not be able to poll destroyed group
      await expect(
        adapter.sendCommand('ChangeGroup.Poll', {
          Id: 'test-group',
        })
      ).rejects.toThrow('Change group not found');

      jest.useRealTimers();
    });
  });

  describe('clearAllCaches', () => {
    it('should clear all change groups and timers', async () => {
      jest.useFakeTimers();

      // Create groups with timers
      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: 'group1',
        Controls: ['Gain1.gain'],
      });
      await adapter.sendCommand('ChangeGroup.AutoPoll', {
        Id: 'group1',
        Rate: 1,
      });

      // Clear all caches
      adapter.clearAllCaches();

      // Groups should be gone
      await expect(
        adapter.sendCommand('ChangeGroup.Poll', {
          Id: 'group1',
        })
      ).rejects.toThrow('Change group not found');

      jest.useRealTimers();
    });
  });


  describe('ChangeGroup.Remove', () => {
    it('should remove specific controls from a change group', async () => {
      // Create group with controls
      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: 'test-group',
        Controls: ['Gain1.gain', 'Gain1.mute', 'Mixer1.level'],
      });

      // Remove one control
      const result = await adapter.sendCommand('ChangeGroup.Remove', {
        Id: 'test-group',
        Controls: ['Gain1.mute'],
      });

      expect(result.result).toEqual({
        Success: true,
        RemainingControls: 2,
        RemovedCount: 1,
      });

      // Verify group still has the other controls
      const groups = adapter.listChangeGroups();
      expect(groups).toContainEqual({
        id: 'test-group',
        controlCount: 2,
        hasAutoPoll: false,
      });
    });

    it('should remove multiple controls at once', async () => {
      // Create group with controls
      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: 'test-group',
        Controls: ['Gain1.gain', 'Gain1.mute', 'Mixer1.level'],
      });

      // Remove multiple controls
      const result = await adapter.sendCommand('ChangeGroup.Remove', {
        Id: 'test-group',
        Controls: ['Gain1.gain', 'Mixer1.level'],
      });

      expect(result.result).toEqual({
        Success: true,
        RemainingControls: 1,
        RemovedCount: 2,
      });
    });

    it('should handle removing non-existent controls', async () => {
      // Create group with controls
      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: 'test-group',
        Controls: ['Gain1.gain', 'Gain1.mute'],
      });

      // Try to remove non-existent control
      const result = await adapter.sendCommand('ChangeGroup.Remove', {
        Id: 'test-group',
        Controls: ['NonExistent.control'],
      });

      expect(result.result).toEqual({
        Success: true,
        RemainingControls: 2,
        RemovedCount: 0,
      });
    });

    it('should require group ID', async () => {
      await expect(
        adapter.sendCommand('ChangeGroup.Remove', {
          Controls: ['Gain1.gain'],
        })
      ).rejects.toThrow('Change group ID required');
    });

    it('should require controls array', async () => {
      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: 'test-group',
        Controls: ['Gain1.gain'],
      });

      await expect(
        adapter.sendCommand('ChangeGroup.Remove', {
          Id: 'test-group',
        })
      ).rejects.toThrow('Controls array required');
    });

    it('should require non-empty controls array', async () => {
      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: 'test-group',
        Controls: ['Gain1.gain'],
      });

      await expect(
        adapter.sendCommand('ChangeGroup.Remove', {
          Id: 'test-group',
          Controls: [],
        })
      ).rejects.toThrow('must not be empty');
    });

    it('should throw error if group does not exist', async () => {
      await expect(
        adapter.sendCommand('ChangeGroup.Remove', {
          Id: 'non-existent-group',
          Controls: ['Gain1.gain'],
        })
      ).rejects.toThrow("Change group 'non-existent-group' not found");
    });
  });

  describe('ChangeGroup.Clear', () => {
    it('should clear all controls from a change group', async () => {
      // Create group with controls
      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: 'test-group',
        Controls: ['Gain1.gain', 'Gain1.mute', 'Mixer1.level'],
      });

      // Clear all controls
      const result = await adapter.sendCommand('ChangeGroup.Clear', {
        Id: 'test-group',
      });

      expect(result.result).toEqual({
        Success: true,
        ClearedCount: 3,
      });

      // Verify group still exists but has no controls
      const groups = adapter.listChangeGroups();
      expect(groups).toContainEqual({
        id: 'test-group',
        controlCount: 0,
        hasAutoPoll: false,
      });
    });

    it('should handle clearing an already empty group', async () => {
      // Create empty group
      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: 'test-group',
        Controls: [],
      });

      // Clear the empty group
      const result = await adapter.sendCommand('ChangeGroup.Clear', {
        Id: 'test-group',
      });

      expect(result.result).toEqual({
        Success: true,
        ClearedCount: 0,
      });
    });

    it('should require group ID', async () => {
      await expect(
        adapter.sendCommand('ChangeGroup.Clear', {})
      ).rejects.toThrow('Change group ID required');
    });

    it('should throw error if group does not exist', async () => {
      await expect(
        adapter.sendCommand('ChangeGroup.Clear', {
          Id: 'non-existent-group',
        })
      ).rejects.toThrow("Change group 'non-existent-group' not found");
    });

    it('should maintain auto-poll after clearing', async () => {
      jest.useFakeTimers();

      // Create group with controls and auto-poll
      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: 'test-group',
        Controls: ['Gain1.gain'],
      });

      await adapter.sendCommand('ChangeGroup.AutoPoll', {
        Id: 'test-group',
        Rate: 1,
      });

      // Clear the group
      await adapter.sendCommand('ChangeGroup.Clear', {
        Id: 'test-group',
      });

      // Verify auto-poll is still active
      const groups = adapter.listChangeGroups();
      expect(groups).toContainEqual({
        id: 'test-group',
        controlCount: 0,
        hasAutoPoll: true,
      });

      jest.useRealTimers();
    });
  });
});
