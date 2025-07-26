import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ChangeGroupManager } from '../../../../src/mcp/state/change-group-manager.js';
import { ChangeGroupEvent } from '../../../../src/mcp/state/change-group/types.js';
import type { QRWCClientInterface } from '../../../../src/mcp/qrwc/adapter.js';
import type { ChangeGroup } from '../../../../src/mcp/state/repository.js';
import { v4 as uuidv4 } from 'uuid';

// Mock the QRWCClientInterface
const createMockQrwcClient = (): jest.Mocked<QRWCClientInterface> => {
  return {
    connect: jest.fn(),
    disconnect: jest.fn(),
    sendCommand: jest.fn(),
    sendLogon: jest.fn(),
    isConnected: jest.fn(),
    getInstance: jest.fn(),
    getAllComponents: jest.fn(),
    getComponent: jest.fn(),
    getControlValue: jest.fn(),
    setControlValue: jest.fn(),
    addControlHandler: jest.fn(),
    removeControlHandler: jest.fn(),
    on: jest.fn(),
    removeAllListeners: jest.fn(),
  } as unknown as jest.Mocked<QRWCClientInterface>;
};

// Helper to create a test change group
const createTestChangeGroup = (controls: number = 3): ChangeGroup => {
  const controlList = [];
  for (let i = 0; i < controls; i++) {
    controlList.push({
      name: `control${i}`,
      value: i * 10,
      ramp: i === 0 ? 1.5 : undefined, // Add ramp to first control
    });
  }

  return {
    id: uuidv4(),
    controls: controlList,
    timestamp: new Date(),
    status: 'pending',
    source: 'test',
  };
};

describe('ChangeGroupManager', () => {
  let manager: ChangeGroupManager;
  let mockQrwcClient: jest.Mocked<QRWCClientInterface>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQrwcClient = createMockQrwcClient();
    manager = new ChangeGroupManager(mockQrwcClient);
  });

  describe('constructor', () => {
    it('should create manager instance', () => {
      expect(manager).toBeInstanceOf(ChangeGroupManager);
      expect(manager.getActiveChangeGroups().size).toBe(0);
      expect(manager.getStatistics().totalExecutions).toBe(0);
    });
  });

  describe('executeChangeGroup', () => {
    it('should execute change group successfully', async () => {
      const changeGroup = createTestChangeGroup(2);

      // Mock successful control changes
      mockQrwcClient.sendCommand
        .mockResolvedValueOnce({ controls: [{ Value: 0 }] }) // Get value for control0
        .mockResolvedValueOnce({ Result: 'OK' }) // Set value for control0
        .mockResolvedValueOnce({ controls: [{ Value: 0 }] }) // Get value for control1
        .mockResolvedValueOnce({ Result: 'OK' }); // Set value for control1

      const startedListener = jest.fn();
      const completedListener = jest.fn();

      manager.on(ChangeGroupEvent.Started, startedListener);
      manager.on(ChangeGroupEvent.Completed, completedListener);

      const result = await manager.executeChangeGroup(changeGroup);

      expect(result.changeGroupId).toBe(changeGroup.id);
      expect(result.totalControls).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
      expect(result.rollbackPerformed).toBe(false);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);

      expect(startedListener).toHaveBeenCalledWith({
        changeGroupId: changeGroup.id,
        controlCount: 2,
        timestamp: expect.any(Date),
      });

      expect(completedListener).toHaveBeenCalledWith(result);

      // Verify control changes were made
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledTimes(4); // 2 gets + 2 sets
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'Control.GetValues',
        { Names: ['control0'] }
      );
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'Control.SetRamp',
        {
          Name: 'control0',
          Value: 0,
          Ramp: 1.5,
        }
      );
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'Control.GetValues',
        { Names: ['control1'] }
      );
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'Control.SetValues',
        {
          Controls: [{ Name: 'control1', Value: 10 }],
        }
      );
    });

    it('should handle partial failures with rollback', async () => {
      const changeGroup = createTestChangeGroup(3);

      // Mock mixed results - operations run in parallel so all Gets happen first
      mockQrwcClient.sendCommand
        .mockResolvedValueOnce({ controls: [{ Value: 0 }] }) // Get control0
        .mockResolvedValueOnce({ controls: [{ Value: 10 }] }) // Get control1
        .mockResolvedValueOnce({ controls: [{ Value: 20 }] }) // Get control2
        .mockResolvedValueOnce({ Result: 'OK' }) // Set control0 - Success
        .mockRejectedValueOnce(new Error('Control error')) // Set control1 - Failure
        .mockResolvedValueOnce({ Result: 'OK' }); // Set control2 - Won't be called due to failure

      const errorListener = jest.fn();
      manager.on(ChangeGroupEvent.Error, errorListener);

      await expect(
        manager.executeChangeGroup(changeGroup, {
          rollbackOnFailure: true,
          continueOnError: false,
        })
      ).rejects.toThrow();

      expect(errorListener).toHaveBeenCalledWith({
        changeGroupId: changeGroup.id,
        error: expect.any(String),
      });

      // Verify rollback was attempted for successful control
      const result = manager.getExecutionResult(changeGroup.id);
      expect(result).toBeDefined();
      expect(result?.rollbackPerformed).toBe(true);
    });

    it('should continue on error when configured', async () => {
      const changeGroup = createTestChangeGroup(3);

      // Mock mixed results
      mockQrwcClient.sendCommand
        .mockResolvedValueOnce({ controls: [{ Value: 0 }] }) // Get control0
        .mockResolvedValueOnce({ Result: 'OK' }) // Set control0 - Success
        .mockResolvedValueOnce({ controls: [{ Value: 10 }] }) // Get control1
        .mockRejectedValueOnce(new Error('Control error')) // Set control1 - Failure
        .mockResolvedValueOnce({ controls: [{ Value: 20 }] }) // Get control2
        .mockResolvedValueOnce({ Result: 'OK' }); // Set control2 - Success

      const result = await manager.executeChangeGroup(changeGroup, {
        rollbackOnFailure: false,
        continueOnError: true,
      });

      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);
      expect(result.rollbackPerformed).toBe(false);
    });

    it('should respect timeout option', async () => {
      const changeGroup = createTestChangeGroup(1);

      // Mock a slow operation for both get and set commands
      mockQrwcClient.sendCommand.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ controls: [{ Value: 0 }] }), 1000))
      );

      await expect(
        manager.executeChangeGroup(changeGroup, {
          timeoutMs: 10, // Very short timeout to ensure it fires first
        })
      ).rejects.toThrow('timed out');
    });

    it('should handle concurrent execution limits', async () => {
      const changeGroup = createTestChangeGroup(20); // Many controls

      let concurrentCalls = 0;
      let maxConcurrent = 0;

      mockQrwcClient.sendCommand.mockImplementation(async cmd => {
        if (cmd === 'Control.GetValues') {
          return { controls: [{ Value: 0 }] };
        }
        concurrentCalls++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
        await new Promise(resolve => setTimeout(resolve, 10));
        concurrentCalls--;
        return { Result: 'OK' };
      });

      await manager.executeChangeGroup(changeGroup, {
        maxConcurrentChanges: 5,
      });

      expect(maxConcurrent).toBeLessThanOrEqual(5);
      expect(mockQrwcClient.sendCommand).toHaveBeenCalled();
    });

    it('should validate change group before execution', async () => {
      const changeGroup = createTestChangeGroup(1);
      changeGroup.controls[0].name = ''; // Invalid control name

      await expect(
        manager.executeChangeGroup(changeGroup, {
          validateBeforeExecution: true,
        })
      ).rejects.toThrow();
    });

    it('should skip validation when disabled', async () => {
      const changeGroup = createTestChangeGroup(1);
      changeGroup.controls[0].name = ''; // Invalid control name

      mockQrwcClient.sendCommand
        .mockResolvedValueOnce({ controls: [{ Value: 0 }] })
        .mockResolvedValueOnce({ Result: 'OK' });

      // Should not throw validation error
      await manager.executeChangeGroup(changeGroup, {
        validateBeforeExecution: false,
      });

      expect(mockQrwcClient.sendCommand).toHaveBeenCalled();
    });

    it('should track active change groups during execution', async () => {
      const changeGroup = createTestChangeGroup(1);

      let activeCount = 0;
      mockQrwcClient.sendCommand.mockImplementation(async cmd => {
        if (cmd === 'Control.GetValues') {
          return { controls: [{ Value: 0 }] };
        }
        activeCount = manager.getActiveChangeGroups().size;
        await new Promise(resolve => setTimeout(resolve, 10));
        return { Result: 'OK' };
      });

      await manager.executeChangeGroup(changeGroup);

      expect(activeCount).toBe(1);
      expect(manager.getActiveChangeGroups().size).toBe(0);
    });

    it('should store execution history', async () => {
      const changeGroup1 = createTestChangeGroup(1);
      const changeGroup2 = createTestChangeGroup(1);

      mockQrwcClient.sendCommand
        .mockResolvedValueOnce({ controls: [{ Value: 0 }] })
        .mockResolvedValueOnce({ Result: 'OK' })
        .mockResolvedValueOnce({ controls: [{ Value: 0 }] })
        .mockResolvedValueOnce({ Result: 'OK' });

      await manager.executeChangeGroup(changeGroup1);
      await manager.executeChangeGroup(changeGroup2);

      const result1 = manager.getExecutionResult(changeGroup1.id);
      const result2 = manager.getExecutionResult(changeGroup2.id);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(manager.getStatistics().totalExecutions).toBe(2);
    });

    it('should limit execution history size', async () => {
      mockQrwcClient.sendCommand.mockImplementation(cmd => {
        if (cmd === 'Control.GetValues') {
          return Promise.resolve({ controls: [{ Value: 0 }] });
        }
        return Promise.resolve({ Result: 'OK' });
      });

      // Execute many change groups to exceed history limit
      const changeGroups = [];
      for (let i = 0; i < 1010; i++) {
        const cg = createTestChangeGroup(1);
        changeGroups.push(cg);
        await manager.executeChangeGroup(cg);
      }

      // First few should be evicted
      expect(manager.getExecutionResult(changeGroups[0].id)).toBeNull();
      // Recent ones should be present
      expect(manager.getExecutionResult(changeGroups[1009].id)).toBeDefined();

      // History should be capped at 1000
      expect(manager.getStatistics().totalExecutions).toBe(1000);
    });
  });

  describe('cancelChangeGroup', () => {
    it('should return false for non-existent change group', () => {
      const result = manager.cancelChangeGroup('non-existent');
      expect(result).toBe(false);
    });

    it('should return false for active change group (not implemented)', async () => {
      const changeGroup = createTestChangeGroup(1);

      mockQrwcClient.sendCommand.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      const executionPromise = manager.executeChangeGroup(changeGroup);

      // Try to cancel while executing
      const result = manager.cancelChangeGroup(changeGroup.id);
      expect(result).toBe(false); // Not implemented

      await executionPromise;
    });
  });

  describe('clearHistory', () => {
    it('should clear execution history', async () => {
      const changeGroup = createTestChangeGroup(1);
      mockQrwcClient.sendCommand
        .mockResolvedValueOnce({ controls: [{ Value: 0 }] })
        .mockResolvedValueOnce({ Result: 'OK' });

      await manager.executeChangeGroup(changeGroup);
      expect(manager.getExecutionResult(changeGroup.id)).toBeDefined();

      manager.clearHistory();

      expect(manager.getExecutionResult(changeGroup.id)).toBeNull();
      expect(manager.getStatistics().totalExecutions).toBe(0);
    });
  });

  describe('getStatistics', () => {
    it('should return empty statistics initially', () => {
      const stats = manager.getStatistics();

      expect(stats).toEqual({
        totalExecutions: 0,
        activeCount: 0,
        averageExecutionTime: 0,
        successRate: 0,
      });
    });

    it('should calculate statistics correctly', async () => {
      // Parallel execution: Gets happen first, then Sets
      mockQrwcClient.sendCommand.mockImplementation(async (cmd) => {
        // Add small delay to ensure execution time > 0
        await new Promise(resolve => setTimeout(resolve, 1));
        
        // Return different values based on command type
        if (cmd === 'Control.GetValues') {
          return { controls: [{ Value: 0 }] };
        }
        
        // Keep track of Set commands
        if (!mockQrwcClient.sendCommand._setCount) {
          mockQrwcClient.sendCommand._setCount = 0;
        }
        mockQrwcClient.sendCommand._setCount++;
        
        // 5th Set command (first Set in second change group) should fail
        if (mockQrwcClient.sendCommand._setCount === 3) {
          throw new Error('Fail');
        }
        
        return { Result: 'OK' };
      });

      // Execute two change groups with different results
      const cg1 = createTestChangeGroup(2);
      const cg2 = createTestChangeGroup(2);

      await manager.executeChangeGroup(cg1); // 2/2 success
      await manager.executeChangeGroup(cg2, { continueOnError: true }); // 1/2 success

      const stats = manager.getStatistics();

      expect(stats.totalExecutions).toBe(2);
      expect(stats.activeCount).toBe(0);
      expect(stats.averageExecutionTime).toBeGreaterThan(0);
      expect(stats.successRate).toBe(0.75); // 3/4 controls succeeded
    });

    it('should handle active change groups in statistics', async () => {
      const changeGroup = createTestChangeGroup(1);

      let statsCapture: any = null;
      mockQrwcClient.sendCommand.mockImplementation(async cmd => {
        if (cmd === 'Control.GetValues') {
          return { controls: [{ Value: 0 }] };
        }
        // Capture stats while executing
        if (!statsCapture) {
          statsCapture = manager.getStatistics();
        }
        await new Promise(resolve => setTimeout(resolve, 10));
        return { Result: 'OK' };
      });

      await manager.executeChangeGroup(changeGroup);

      expect(statsCapture).not.toBeNull();
      expect(statsCapture.activeCount).toBe(1);
    });
  });

  describe('event emissions', () => {
    // Progress events are not implemented in ChangeGroupExecutor
    // Removed skipped test for unimplemented feature

    it('should emit rollback events when rollback occurs', async () => {
      const changeGroup = createTestChangeGroup(2);

      // Mock for parallel execution - all Gets happen first, then Sets
      mockQrwcClient.sendCommand
        .mockResolvedValueOnce({ controls: [{ Value: 0 }] })  // Get control0
        .mockResolvedValueOnce({ controls: [{ Value: 10 }] }) // Get control1
        .mockResolvedValueOnce({ Result: 'OK' })              // Set control0 - Success
        .mockRejectedValueOnce(new Error('Fail'))             // Set control1 - Fail (triggers rollback)
        .mockResolvedValueOnce({ Result: 'OK' });             // Rollback control0

      const rollbackStartedListener = jest.fn();
      const rollbackCompletedListener = jest.fn();

      manager.on(ChangeGroupEvent.RollbackStarted, rollbackStartedListener);
      manager.on(ChangeGroupEvent.RollbackCompleted, rollbackCompletedListener);

      try {
        await manager.executeChangeGroup(changeGroup, {
          rollbackOnFailure: true,
          continueOnError: false,
        });
      } catch {
        // Expected to throw
      }

      expect(rollbackStartedListener).toHaveBeenCalled();
      expect(rollbackCompletedListener).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle validation errors', async () => {
      const changeGroup = createTestChangeGroup(1);
      changeGroup.controls = []; // Empty controls

      await expect(manager.executeChangeGroup(changeGroup)).rejects.toThrow();
    });

    it('should handle client errors gracefully', async () => {
      const changeGroup = createTestChangeGroup(1);
      const error = new Error('Q-SYS connection lost');

      mockQrwcClient.sendCommand.mockRejectedValue(error);

      await expect(manager.executeChangeGroup(changeGroup)).rejects.toThrow();

      const result = manager.getExecutionResult(changeGroup.id);
      expect(result).toBeDefined();
      expect(result?.failureCount).toBe(1);
      expect(result?.successCount).toBe(0);
    });

    it('should handle rollback errors', async () => {
      const changeGroup = createTestChangeGroup(2);

      // Parallel execution: all Gets first, then Sets, then rollback attempt
      mockQrwcClient.sendCommand
        .mockResolvedValueOnce({ controls: [{ Value: 0 }] })  // Get control0
        .mockResolvedValueOnce({ controls: [{ Value: 10 }] }) // Get control1
        .mockResolvedValueOnce({ Result: 'OK' })              // Set control0 - Success
        .mockRejectedValueOnce(new Error('Control error'))    // Set control1 - Fails
        // Rollback control0 also fails
        .mockRejectedValueOnce(new Error('Rollback error'));

      const rollbackErrorListener = jest.fn();
      manager.on(ChangeGroupEvent.Error, rollbackErrorListener);

      await expect(
        manager.executeChangeGroup(changeGroup, {
          rollbackOnFailure: true,
          continueOnError: false,
        })
      ).rejects.toThrow();

      expect(rollbackErrorListener).toHaveBeenCalled();
      expect(rollbackErrorListener).toHaveBeenCalledWith(
        expect.objectContaining({
          context: 'rollback',
          error: expect.any(String)
        })
      );
    });
  });
});
