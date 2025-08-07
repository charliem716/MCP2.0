import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import type { QRWCClientAdapter } from '../../src/mcp/qrwc/adapter.js';

describe('Event Monitoring 33Hz Polling', () => {
  let adapter: QRWCClientAdapter;
  let mockClient: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Mock official QRWC client
    mockClient = {
      on: jest.fn(),
      once: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
      connect: jest.fn().mockResolvedValue(true),
      disconnect: jest.fn().mockResolvedValue(undefined),
      isConnected: jest.fn().mockReturnValue(true),
      sendCommand: jest.fn().mockResolvedValue({}),
      getAllComponents: jest.fn().mockResolvedValue([]),
      getAllControls: jest.fn().mockResolvedValue([]),
      getComponent: jest.fn(),
      setControlValue: jest.fn().mockResolvedValue({}),
      setControlValues: jest.fn().mockResolvedValue({}),
      getCoreStatus: jest.fn().mockResolvedValue({}),
      createChangeGroup: jest.fn().mockResolvedValue({ Id: 'test-group' }),
      addControlsToChangeGroup: jest.fn().mockResolvedValue({}),
      pollChangeGroup: jest.fn().mockResolvedValue({ Changes: [] }),
      destroyChangeGroup: jest.fn().mockResolvedValue({}),
      clearChangeGroup: jest.fn().mockResolvedValue({}),
      removeControlsFromChangeGroup: jest.fn().mockResolvedValue({}),
      setChangeGroupAutoPoll: jest.fn().mockResolvedValue({}),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('33Hz Auto-polling', () => {
    it('should support 33Hz polling rate (30ms intervals)', async () => {
      // Dynamic import to get fresh module
      const { QRWCClientAdapter } = await import('../../src/mcp/qrwc/adapter.js');
      adapter = new QRWCClientAdapter(mockClient);
      
      // Spy on the adapter's sendCommand to track internal polling
      const sendCommandSpy = jest.spyOn(adapter, 'sendCommand');
      
      // Create a change group
      const groupId = 'high-freq-group';
      await adapter.sendCommand('ChangeGroup.Create', { Id: groupId });
      
      // Add a control to the group so polling has something to check
      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: groupId,
        Controls: ['TestComponent.control1']
      });
      
      // Clear previous calls
      sendCommandSpy.mockClear();
      
      // Set auto-poll to 33Hz (0.03 seconds = 30ms)
      const result = await adapter.sendCommand('ChangeGroup.AutoPoll', {
        Id: groupId,
        Rate: 0.03, // 30ms for 33Hz
      });
      
      // Verify the rate was accepted
      expect(result).toEqual({
        result: {
          Id: groupId,
          Rate: 0.03,
        },
      });
      
      // Clear calls from setup
      sendCommandSpy.mockClear();
      
      // Advance 1 second
      jest.advanceTimersByTime(1000);
      await Promise.resolve(); // Allow async callbacks to execute
      
      // Count ChangeGroup.Poll calls
      const pollCalls = sendCommandSpy.mock.calls.filter(
        call => call[0] === 'ChangeGroup.Poll'
      );
      
      // Should have ~33 polls in 1 second (allowing for some variance)
      expect(pollCalls.length).toBeGreaterThanOrEqual(30);
      expect(pollCalls.length).toBeLessThanOrEqual(36);
    });

    it('should validate minimum polling rate of 30ms', async () => {
      const { QRWCClientAdapter } = await import('../../src/mcp/qrwc/adapter.js');
      adapter = new QRWCClientAdapter(mockClient);
      
      const groupId = 'test-group';
      await adapter.sendCommand('ChangeGroup.Create', { Id: groupId });
      
      // Try to set rate below minimum (less than 30ms)
      await expect(
        adapter.sendCommand('ChangeGroup.AutoPoll', {
          Id: groupId,
          Rate: 0.02, // 20ms - below minimum
        })
      ).rejects.toThrow('Invalid poll rate');
    });

    it('should validate maximum polling rate', async () => {
      const { QRWCClientAdapter } = await import('../../src/mcp/qrwc/adapter.js');
      adapter = new QRWCClientAdapter(mockClient);
      
      const groupId = 'test-group';
      await adapter.sendCommand('ChangeGroup.Create', { Id: groupId });
      
      // Try to set rate above maximum (more than 1 hour)
      await expect(
        adapter.sendCommand('ChangeGroup.AutoPoll', {
          Id: groupId,
          Rate: 3601, // Over 1 hour
        })
      ).rejects.toThrow('Invalid poll rate');
    });

    it('should handle fractional second rates correctly', async () => {
      const { QRWCClientAdapter } = await import('../../src/mcp/qrwc/adapter.js');
      adapter = new QRWCClientAdapter(mockClient);
      
      const groupId = 'test-group';
      await adapter.sendCommand('ChangeGroup.Create', { Id: groupId });
      
      // Add a control to the group
      await adapter.sendCommand('ChangeGroup.AddControl', {
        Id: groupId,
        Controls: ['TestComponent.control1']
      });
      
      // Spy on adapter's sendCommand
      const sendCommandSpy = jest.spyOn(adapter, 'sendCommand');
      
      // Test various fractional rates
      const testRates = [
        { rate: 0.05, expectedHz: 20 },   // 50ms = 20Hz
        { rate: 0.1, expectedHz: 10 },    // 100ms = 10Hz
        { rate: 0.5, expectedHz: 2 },     // 500ms = 2Hz
        { rate: 1.0, expectedHz: 1 },     // 1000ms = 1Hz
      ];
      
      for (const { rate, expectedHz } of testRates) {
        // Clear previous calls
        sendCommandSpy.mockClear();
        
        // Set new rate
        await adapter.sendCommand('ChangeGroup.AutoPoll', {
          Id: groupId,
          Rate: rate,
        });
        
        // Clear setup calls
        sendCommandSpy.mockClear();
        
        // Advance 1 second
        jest.advanceTimersByTime(1000);
        await Promise.resolve(); // Allow async callbacks
        
        const pollCount = sendCommandSpy.mock.calls.filter(
          call => call[0] === 'ChangeGroup.Poll'
        ).length;
        
        // Allow 10% variance
        const minExpected = Math.floor(expectedHz * 0.9);
        const maxExpected = Math.ceil(expectedHz * 1.1);
        
        expect(pollCount).toBeGreaterThanOrEqual(minExpected);
        expect(pollCount).toBeLessThanOrEqual(maxExpected);
      }
    });

    it('should stop polling after repeated failures', async () => {
      const { QRWCClientAdapter } = await import('../../src/mcp/qrwc/adapter.js');
      adapter = new QRWCClientAdapter(mockClient);
      
      const groupId = 'failing-group';
      await adapter.sendCommand('ChangeGroup.Create', { Id: groupId });
      
      // Make polling fail
      mockClient.sendCommand.mockImplementation((cmd: string) => {
        if (cmd === 'ChangeGroup.Poll') {
          return Promise.reject(new Error('Poll failed'));
        }
        return Promise.resolve({});
      });
      
      // Set auto-poll to 33Hz
      await adapter.sendCommand('ChangeGroup.AutoPoll', {
        Id: groupId,
        Rate: 0.03,
      });
      
      // Advance time to trigger failures
      jest.advanceTimersByTime(1000); // Should trigger ~33 attempts
      
      // Count failed poll attempts
      const failedPolls = mockClient.sendCommand.mock.calls.filter(
        (call: any) => call[0] === 'ChangeGroup.Poll'
      ).length;
      
      // Should stop after MAX_AUTOPOLL_FAILURES (10)
      expect(failedPolls).toBeLessThanOrEqual(10);
    });
  });

  describe('Event Monitor Integration', () => {
    it('should record events at 33Hz when configured', async () => {
      // Use real timers for this test since SQLite needs real time
      jest.useRealTimers();
      
      // This test verifies that the event monitor can handle 33Hz event rate
      const { SQLiteEventMonitor } = await import('../../src/mcp/state/event-monitor/sqlite-event-monitor.js');
      
      const changeGroupEmitter = new EventEmitter();
      
      const mockAdapter = {
        on: changeGroupEmitter.on.bind(changeGroupEmitter),
        emit: changeGroupEmitter.emit.bind(changeGroupEmitter),
        once: jest.fn(),
        off: jest.fn(),
        sendCommand: jest.fn().mockResolvedValue({ result: true }),
      } as any;
      
      const monitor = new SQLiteEventMonitor(mockAdapter, {
        enabled: true,
        dbPath: ':memory:',
        retentionDays: 30,
        bufferSize: 1000,
        flushInterval: 100,
      });
      
      await monitor.initialize();
      
      // Simulate 33Hz polling events for 1 second
      const groupId = 'high-freq-group';
      const baseTime = Date.now();
      
      for (let i = 0; i < 33; i++) {
        const timestamp = baseTime + i * 30; // 30ms intervals
        const event = {
          groupId,
          controls: [
            {
              Name: `TestComponent.control${i}`,
              Value: i,
              String: `${i}`,
            },
          ],
          timestamp,
        };
        changeGroupEmitter.emit('changeGroup:poll', event);
      }
      
      // Wait for flush (real time)
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Query events
      const recordedEvents = await monitor.queryEvents({
        changeGroupId: groupId,
      });
      
      // Should have recorded all 33 events
      expect(recordedEvents.length).toBe(33);
      
      // Verify we can handle high frequency
      // (timestamps will be close together)
      const timestamps = recordedEvents.map(e => e.timestamp);
      const timeSpan = Math.max(...timestamps) - Math.min(...timestamps);
      
      // Should span approximately 990ms (33 events * 30ms)
      expect(timeSpan).toBeGreaterThanOrEqual(900);
      expect(timeSpan).toBeLessThanOrEqual(1100);
      
      await monitor.close();
      
      // Restore fake timers for other tests
      jest.useFakeTimers();
    });

    it('should verify 30-day retention configuration', async () => {
      // Set the environment variable for this test
      process.env['EVENT_MONITORING_RETENTION_DAYS'] = '30';
      
      const { SQLiteEventMonitor } = await import('../../src/mcp/state/event-monitor/sqlite-event-monitor.js');
      
      const mockAdapter = {
        on: jest.fn(),
        emit: jest.fn(),
        once: jest.fn(),
        off: jest.fn(),
        sendCommand: jest.fn().mockResolvedValue({ result: true }),
      } as any;
      
      // Test with default configuration (should be 30 days now)
      const monitor = new SQLiteEventMonitor(mockAdapter, {
        enabled: true,
        dbPath: ':memory:',
      });
      
      await monitor.initialize();
      
      const stats = await monitor.getStatistics();
      
      // Verify configuration through the monitor's internal state
      // The default should now be 30 days
      expect(monitor['config'].retentionDays).toBe(30);
      
      await monitor.close();
      
      // Clean up
      delete process.env['EVENT_MONITORING_RETENTION_DAYS'];
    });
  });
});