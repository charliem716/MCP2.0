import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import type { QRWCClientInterface } from '../../src/mcp/qrwc/adapter.js';
import { SetChangeGroupAutoPollTool } from '../../src/mcp/tools/change-groups.js';

describe('BUG-065: Auto-poll disable functionality', () => {
  let mockAdapter: jest.Mocked<QRWCClientInterface>;
  let tool: SetChangeGroupAutoPollTool;
  let clearIntervalSpy: jest.SpyInstance;

  beforeEach(() => {
    // Create mock adapter with autoPollTimers Map
    mockAdapter = {
      isConnected: jest.fn().mockReturnValue(true),
      sendCommand: jest.fn(),
      autoPollTimers: new Map(),
      autoPollFailureCounts: new Map(),
    } as any;

    tool = new SetChangeGroupAutoPollTool(mockAdapter);
    clearIntervalSpy = jest.spyOn(global, 'clearInterval');
  });

  afterEach(() => {
    clearIntervalSpy.mockRestore();
  });

  it('should stop polling when enabled:false is set', async () => {
    const groupId = 'test-bug065';

    // First, create a mock timer as if auto-poll was enabled
    const mockTimer = setInterval(() => {}, 1000) as any;
    mockAdapter.autoPollTimers.set(groupId, mockTimer);
    mockAdapter.autoPollFailureCounts.set(groupId, 2);

    // Verify timer exists
    expect(mockAdapter.autoPollTimers.has(groupId)).toBe(true);
    expect(mockAdapter.autoPollFailureCounts.has(groupId)).toBe(true);

    // Execute disable auto-poll
    const result = await tool.execute({
      groupId,
      enabled: false,
    });

    // Verify timer was cleared
    expect(clearIntervalSpy).toHaveBeenCalledWith(mockTimer);
    expect(mockAdapter.autoPollTimers.has(groupId)).toBe(false);
    expect(mockAdapter.autoPollFailureCounts.has(groupId)).toBe(false);

    // Verify response
    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(true);
    expect(response.autoPollEnabled).toBe(false);
    expect(response.message).toContain('Auto-poll disabled');

    // Clean up the timer we created
    clearInterval(mockTimer);
  });

  it('should handle multiple enable/disable cycles correctly', async () => {
    const groupId = 'test-cycles';

    // First cycle - enable
    const timer1 = setInterval(() => {}, 1000) as any;
    mockAdapter.autoPollTimers.set(groupId, timer1);

    // Disable
    await tool.execute({ groupId, enabled: false });
    expect(mockAdapter.autoPollTimers.has(groupId)).toBe(false);

    // Second cycle - enable again
    const timer2 = setInterval(() => {}, 1000) as any;
    mockAdapter.autoPollTimers.set(groupId, timer2);

    // Disable again
    await tool.execute({ groupId, enabled: false });
    expect(mockAdapter.autoPollTimers.has(groupId)).toBe(false);

    // Verify both timers were cleared
    expect(clearIntervalSpy).toHaveBeenCalledWith(timer1);
    expect(clearIntervalSpy).toHaveBeenCalledWith(timer2);

    // Clean up
    clearInterval(timer1);
    clearInterval(timer2);
  });

  it('should not fail when disabling non-existent auto-poll', async () => {
    const groupId = 'non-existent-poll';

    // No timer exists for this group
    expect(mockAdapter.autoPollTimers.has(groupId)).toBe(false);

    // Should not throw and should return success
    const result = await tool.execute({
      groupId,
      enabled: false,
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(true);
    expect(response.autoPollEnabled).toBe(false);
  });
});
