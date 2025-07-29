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

    it('should skip invalid controls and return correct count', async () => {
      const result = await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: 'test-group',
        Controls: ['Gain1.gain', 'InvalidControl.foo', 'Gain1.mute'],
      });

      // Should only add the 2 valid controls, skipping InvalidControl.foo
      expect(result).toEqual({ result: { addedCount: 2 } });
    });
  });

  describe('ChangeGroup.Poll', () => {
    it('should return changed controls', async () => {
      // Update the mock QRWC structure to simulate control value changes
      let callCount = 0;
      mockOfficialClient.getQrwc = jest.fn().mockImplementation(() => {
        callCount++;
        return {
          components: {
            Gain1: {
              controls: {
                gain: {
                  state: {
                    Value: callCount <= 2 ? -10 : -5,
                    String: callCount <= 2 ? '-10dB' : '-5dB',
                  },
                },
              },
            },
          },
        };
      });
      // Create group and add control
      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: 'test-group',
        Controls: ['Gain1.gain'],
      });

      // First poll establishes baseline
      await adapter.sendCommand('ChangeGroup.Poll', { Id: 'test-group' });

      // Second poll should detect change
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
              String: '-5',
            },
          ],
        },
      });
    });

    it('should return empty array when no changes', async () => {
      mockOfficialClient.executeCommand = jest
        .fn()
        .mockResolvedValue([
          { Name: 'Gain1.gain', Value: -10, String: '-10dB' },
        ]);

      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: 'test-group',
        Controls: ['Gain1.gain'],
      });

      // Poll twice with same value
      await adapter.sendCommand('ChangeGroup.Poll', { Id: 'test-group' });
      const result = await adapter.sendCommand('ChangeGroup.Poll', {
        Id: 'test-group',
      });

      expect(result).toEqual({
        result: {
          Id: 'test-group',
          Changes: [],
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

  describe('Event Emission', () => {
    it('should emit changeGroup:changes event when polling detects changes', async () => {
      // Create a change group
      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: 'event-test-group',
        Controls: ['Gain1.gain', 'Gain1.mute'],
      });

      // Set up event listener
      const eventHandler = jest.fn();
      adapter.on('changeGroup:changes', eventHandler);

      // First poll - should emit event with all controls as changes
      await adapter.sendCommand('ChangeGroup.Poll', {
        Id: 'event-test-group',
      });

      expect(eventHandler).toHaveBeenCalledTimes(1);
      expect(eventHandler).toHaveBeenCalledWith({
        groupId: 'event-test-group',
        changes: [
          { Name: 'Gain1.gain', Value: -10, String: '-10' },
          { Name: 'Gain1.mute', Value: false, String: 'false' },
        ],
        timestamp: expect.any(BigInt),
        timestampMs: expect.any(Number),
        sequenceNumber: 0,
      });

      // Clear the mock
      eventHandler.mockClear();

      // Second poll without changes - should not emit event
      await adapter.sendCommand('ChangeGroup.Poll', {
        Id: 'event-test-group',
      });

      expect(eventHandler).not.toHaveBeenCalled();

      // Change a value
      mockQrwc.components['Gain1'].controls['gain'].state.Value = -5;
      mockQrwc.components['Gain1'].controls['gain'].state.String = '-5dB';

      // Third poll with changes - should emit event
      await adapter.sendCommand('ChangeGroup.Poll', {
        Id: 'event-test-group',
      });

      expect(eventHandler).toHaveBeenCalledTimes(1);
      expect(eventHandler).toHaveBeenCalledWith({
        groupId: 'event-test-group',
        changes: [{ Name: 'Gain1.gain', Value: -5, String: '-5' }],
        timestamp: expect.any(BigInt),
        timestampMs: expect.any(Number),
        sequenceNumber: 1,
      });
    });

    it('should increment sequence numbers across multiple events', async () => {
      // Create two change groups
      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: 'group1',
        Controls: ['Gain1.gain'],
      });
      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: 'group2',
        Controls: ['Mixer1.level'],
      });

      const events: any[] = [];
      adapter.on('changeGroup:changes', event => events.push(event));

      // Poll both groups
      await adapter.sendCommand('ChangeGroup.Poll', { Id: 'group1' });
      await adapter.sendCommand('ChangeGroup.Poll', { Id: 'group2' });

      expect(events).toHaveLength(2);
      expect(events[0].sequenceNumber).toBe(0);
      expect(events[1].sequenceNumber).toBe(1);
    });

    it('should include nanosecond precision timestamps', async () => {
      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: 'timestamp-test',
        Controls: ['Gain1.gain'],
      });

      let capturedEvent: any;
      adapter.on('changeGroup:changes', event => {
        capturedEvent = event;
      });

      await adapter.sendCommand('ChangeGroup.Poll', { Id: 'timestamp-test' });

      expect(capturedEvent).toBeDefined();
      expect(typeof capturedEvent.timestamp).toBe('bigint');
      expect(capturedEvent.timestampMs).toBeGreaterThan(0);
      expect(capturedEvent.timestampMs).toBeLessThanOrEqual(Date.now());
    });

    it('should emit events during auto-polling', async () => {
      jest.useFakeTimers();

      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: 'auto-poll-test',
        Controls: ['Gain1.gain'],
      });

      const eventHandler = jest.fn();
      adapter.on('changeGroup:changes', eventHandler);

      // Enable auto-polling
      await adapter.sendCommand('ChangeGroup.AutoPoll', {
        Id: 'auto-poll-test',
        Rate: 1, // 1 second
      });

      // Wait for timer and flush promises
      await jest.advanceTimersByTimeAsync(1000);

      expect(eventHandler).toHaveBeenCalledTimes(1);

      // Change value and wait for next poll
      mockQrwc.components['Gain1'].controls['gain'].state.Value = -15;
      mockQrwc.components['Gain1'].controls['gain'].state.String = '-15dB';
      eventHandler.mockClear();

      await jest.advanceTimersByTimeAsync(1000);

      expect(eventHandler).toHaveBeenCalledTimes(1);
      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          groupId: 'auto-poll-test',
          changes: [{ Name: 'Gain1.gain', Value: -15, String: '-15' }],
        })
      );

      jest.useRealTimers();
    });
  });
});
