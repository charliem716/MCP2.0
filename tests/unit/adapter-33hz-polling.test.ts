import { jest } from '@jest/globals';
import { QRWCClientAdapter } from '../../src/mcp/qrwc/adapter.js';
import { QSysError } from '../../src/mcp/errors/index.js';

describe('Adapter 33Hz Polling Support', () => {
  let adapter: QRWCClientAdapter;
  let mockClient: any;
  let setIntervalSpy: jest.SpiedFunction<typeof setInterval>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Spy on setInterval to verify the interval value
    setIntervalSpy = jest.spyOn(global, 'setInterval');
    
    // Mock the official QRWC client
    mockClient = {
      on: jest.fn(),
      once: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
      sendCommand: jest.fn().mockResolvedValue({}),
    };
    
    adapter = new QRWCClientAdapter(mockClient);
  });

  afterEach(() => {
    jest.useRealTimers();
    setIntervalSpy.mockRestore();
  });

  describe('ChangeGroup.AutoPoll command', () => {
    it('should accept 33Hz polling rate (0.03 seconds)', () => {
      // Create a change group first
      const groupId = 'test-group-33hz';
      adapter['changeGroups'].set(groupId, {
        id: groupId,
        controls: ['TestComponent.control1'],
      } as any);
      
      // Set auto-poll to 33Hz
      const result = adapter['handleChangeGroupAutoPoll']({
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
      
      // Verify setInterval was called with 30ms
      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        30 // 30ms interval
      );
    });

    it('should default to 33Hz when no rate specified', () => {
      const groupId = 'test-group-default';
      adapter['changeGroups'].set(groupId, {
        id: groupId,
        controls: ['TestComponent.control1'],
      } as any);
      
      // Set auto-poll without specifying rate
      const result = adapter['handleChangeGroupAutoPoll']({
        Id: groupId,
      });
      
      // Verify default rate is 0.03 (33Hz)
      expect(result).toEqual({
        result: {
          Id: groupId,
          Rate: 0.03,
        },
      });
      
      // Verify setInterval was called with 30ms
      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        30
      );
    });

    it('should reject rates below 30ms', () => {
      const groupId = 'test-group-too-fast';
      adapter['changeGroups'].set(groupId, {
        id: groupId,
        controls: ['TestComponent.control1'],
      } as any);
      
      // Try to set rate below minimum (20ms = 0.02 seconds)
      expect(() => {
        adapter['handleChangeGroupAutoPoll']({
          Id: groupId,
          Rate: 0.02,
        });
      }).toThrow('Invalid poll rate');
    });

    it('should reject rates above 1 hour', () => {
      const groupId = 'test-group-too-slow';
      adapter['changeGroups'].set(groupId, {
        id: groupId,
        controls: ['TestComponent.control1'],
      } as any);
      
      // Try to set rate above maximum
      expect(() => {
        adapter['handleChangeGroupAutoPoll']({
          Id: groupId,
          Rate: 3601, // Over 1 hour
        });
      }).toThrow('Invalid poll rate');
    });

    it('should handle fractional second rates correctly', () => {
      const testCases = [
        { rate: 0.03, expectedMs: 30 },   // 33Hz
        { rate: 0.05, expectedMs: 50 },   // 20Hz
        { rate: 0.1, expectedMs: 100 },   // 10Hz
        { rate: 0.5, expectedMs: 500 },   // 2Hz
        { rate: 1.0, expectedMs: 1000 },  // 1Hz
        { rate: 2.5, expectedMs: 2500 },  // 0.4Hz
      ];
      
      testCases.forEach(({ rate, expectedMs }) => {
        const groupId = `test-group-${rate}`;
        adapter['changeGroups'].set(groupId, {
          id: groupId,
          controls: ['TestComponent.control1'],
        } as any);
        
        setIntervalSpy.mockClear();
        
        const result = adapter['handleChangeGroupAutoPoll']({
          Id: groupId,
          Rate: rate,
        });
        
        expect(result).toEqual({
          result: {
            Id: groupId,
            Rate: rate,
          },
        });
        
        expect(setIntervalSpy).toHaveBeenCalledWith(
          expect.any(Function),
          expectedMs
        );
      });
    });

    it('should clear existing timer when updating rate', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      const groupId = 'test-group-update';
      adapter['changeGroups'].set(groupId, {
        id: groupId,
        controls: ['TestComponent.control1'],
      } as any);
      
      // Set initial rate
      adapter['handleChangeGroupAutoPoll']({
        Id: groupId,
        Rate: 1.0, // 1Hz
      });
      
      // Update to 33Hz
      adapter['handleChangeGroupAutoPoll']({
        Id: groupId,
        Rate: 0.03, // 33Hz
      });
      
      // Verify old timer was cleared
      expect(clearIntervalSpy).toHaveBeenCalled();
      
      // Verify new timer uses 30ms
      expect(setIntervalSpy).toHaveBeenLastCalledWith(
        expect.any(Function),
        30
      );
      
      clearIntervalSpy.mockRestore();
    });

    it('should execute polling at correct frequency', async () => {
      const groupId = 'test-group-freq';
      adapter['changeGroups'].set(groupId, {
        id: groupId,
        controls: ['TestComponent.control1'],
      } as any);
      
      // Mock sendCommand to track polling calls
      const sendCommandSpy = jest.spyOn(adapter, 'sendCommand').mockResolvedValue({
        Changes: []
      });
      
      // Set to 33Hz
      adapter['handleChangeGroupAutoPoll']({
        Id: groupId,
        Rate: 0.03,
      });
      
      // Clear previous calls from setup
      sendCommandSpy.mockClear();
      
      // Advance time by 1 second and flush promises
      jest.advanceTimersByTime(1000);
      await Promise.resolve(); // Allow async callbacks to execute
      
      // The timer should have triggered ~33 times
      // Filter for only ChangeGroup.Poll calls
      const pollCalls = sendCommandSpy.mock.calls.filter(
        call => call[0] === 'ChangeGroup.Poll'
      );
      
      // Should have ~33 poll calls (allowing for some variance)
      expect(pollCalls.length).toBeGreaterThanOrEqual(32);
      expect(pollCalls.length).toBeLessThanOrEqual(34);
      
      // Verify each call has the correct groupId
      pollCalls.forEach(call => {
        expect(call[1]).toEqual({ Id: groupId });
      });
      
      sendCommandSpy.mockRestore();
    });
  });
});