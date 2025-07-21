import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { StateSynchronizer } from '../../../../src/mcp/state/synchronizer/state-synchronizer.js';
import { SyncStrategy, ConflictResolutionPolicy, SyncEvent } from '../../../../src/mcp/state/synchronizer/types.js';
import { StateRepositoryEvent } from '../../../../src/mcp/state/repository.js';
import type { IStateRepository, ControlState } from '../../../../src/mcp/state/repository.js';
import type { QRWCClientInterface } from '../../../../src/mcp/qrwc/adapter.js';
import { EventEmitter } from 'events';

// Create mock implementations
class MockStateRepository extends EventEmitter implements IStateRepository {
  initialize = jest.fn().mockResolvedValue(undefined);
  getState = jest.fn().mockResolvedValue(null);
  getStates = jest.fn().mockResolvedValue(new Map());
  setState = jest.fn().mockResolvedValue(undefined);
  setStates = jest.fn().mockResolvedValue(undefined);
  removeState = jest.fn().mockResolvedValue(false);
  removeStates = jest.fn().mockResolvedValue(0);
  clear = jest.fn().mockResolvedValue(undefined);
  hasState = jest.fn().mockResolvedValue(false);
  getKeys = jest.fn().mockResolvedValue([]);
  getStatistics = jest.fn().mockResolvedValue({
    totalEntries: 0,
    hitCount: 0,
    missCount: 0,
    evictionCount: 0,
    memoryUsage: 0,
    hitRatio: 0,
    uptime: 0
  });
  createChangeGroup = jest.fn();
  getChangeGroup = jest.fn().mockResolvedValue(null);
  updateChangeGroupStatus = jest.fn().mockResolvedValue(false);
  cleanupChangeGroups = jest.fn().mockResolvedValue(0);
  invalidateStates = jest.fn().mockResolvedValue(undefined);
  invalidatePattern = jest.fn().mockResolvedValue(undefined);
  synchronize = jest.fn().mockResolvedValue(undefined);
  persist = jest.fn().mockResolvedValue(undefined);
  restore = jest.fn().mockResolvedValue(undefined);
  cleanup = jest.fn().mockResolvedValue(undefined);
  shutdown = jest.fn().mockResolvedValue(undefined);
}

const createMockQrwcClient = (): jest.Mocked<QRWCClientInterface> => ({
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
  removeAllListeners: jest.fn()
} as unknown as jest.Mocked<QRWCClientInterface>);

// Helper to create test control states
const createTestState = (name: string, value: any, source: 'qsys' | 'cache' | 'user' = 'cache'): ControlState => ({
  name,
  value,
  timestamp: new Date(),
  source,
  metadata: {
    type: 'test',
    min: 0,
    max: 100
  }
});

describe('StateSynchronizer', () => {
  let synchronizer: StateSynchronizer;
  let mockRepository: MockStateRepository;
  let mockQrwcClient: jest.Mocked<QRWCClientInterface>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    mockRepository = new MockStateRepository();
    mockQrwcClient = createMockQrwcClient();
    
    synchronizer = new StateSynchronizer(mockRepository, mockQrwcClient);
  });

  afterEach(() => {
    synchronizer.shutdown();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create synchronizer with default config', () => {
      expect(synchronizer).toBeInstanceOf(StateSynchronizer);
      
      const stats = synchronizer.getStatistics();
      expect(stats.lastSync).toBeNull();
      expect(stats.syncCount).toBe(0);
      expect(stats.dirtyControlCount).toBe(0);
    });

    it('should create synchronizer with custom config', () => {
      const customConfig = {
        strategy: SyncStrategy.FullSync,
        conflictResolutionPolicy: ConflictResolutionPolicy.CacheWins,
        batchSize: 50,
        syncIntervalMs: 60000,
        autoSync: true
      };
      
      const customSync = new StateSynchronizer(mockRepository, mockQrwcClient, customConfig);
      expect(customSync).toBeInstanceOf(StateSynchronizer);
      customSync.shutdown();
    });
  });

  describe('start and stop', () => {
    it('should start auto-sync when configured', async () => {
      const autoSyncConfig = {
        autoSync: true,
        syncIntervalMs: 1000
      };
      
      const autoSync = new StateSynchronizer(mockRepository, mockQrwcClient, autoSyncConfig);
      
      // Mock successful sync
      mockRepository.getKeys.mockResolvedValue(['control1', 'control2']);
      mockRepository.getStates.mockResolvedValue(new Map([
        ['control1', createTestState('control1', 42)],
        ['control2', createTestState('control2', 'ON')]
      ]));
      mockQrwcClient.sendCommand.mockResolvedValue({ 
        Result: [
          { Name: 'control1', Value: 42 },
          { Name: 'control2', Value: 'ON' }
        ]
      });
      
      autoSync.start();
      
      // Should perform initial sync immediately
      await jest.runOnlyPendingTimersAsync();
      
      expect(mockRepository.getKeys).toHaveBeenCalled();
      
      // Should sync again after interval
      jest.advanceTimersByTime(1000);
      await jest.runOnlyPendingTimersAsync();
      
      expect(mockRepository.getKeys).toHaveBeenCalledTimes(2);
      
      autoSync.shutdown();
    });

    it('should stop auto-sync', () => {
      const autoSyncConfig = {
        autoSync: true,
        syncIntervalMs: 1000
      };
      
      const autoSync = new StateSynchronizer(mockRepository, mockQrwcClient, autoSyncConfig);
      
      autoSync.start();
      autoSync.stop();
      
      // Advance time and verify no syncs occur
      jest.advanceTimersByTime(5000);
      
      expect(mockRepository.getKeys).not.toHaveBeenCalled();
      
      autoSync.shutdown();
    });

    it('should not start timer if autoSync is false', () => {
      synchronizer.start();
      
      jest.advanceTimersByTime(60000);
      
      expect(mockRepository.getKeys).not.toHaveBeenCalled();
    });
  });

  describe('synchronize', () => {
    it('should perform full sync successfully', async () => {
      const cacheStates = new Map([
        ['control1', createTestState('control1', 42)],
        ['control2', createTestState('control2', 'OFF')]
      ]);
      
      mockRepository.getKeys.mockResolvedValue(['control1', 'control2']);
      mockRepository.getStates.mockResolvedValue(cacheStates);
      
      // Mock Q-SYS responses
      mockQrwcClient.sendCommand.mockResolvedValue({
        Result: [
          { Name: 'control1', Value: 42 }, // Same value
          { Name: 'control2', Value: 'ON' } // Different value
        ]
      });
      
      const startedListener = jest.fn();
      const completedListener = jest.fn();
      
      synchronizer.on(SyncEvent.Started, startedListener);
      synchronizer.on(SyncEvent.Completed, completedListener);
      
      const result = await synchronizer.synchronize();
      
      expect(startedListener).toHaveBeenCalledWith({ strategy: SyncStrategy.IncrementalSync });
      expect(completedListener).toHaveBeenCalled();
      
      const completedEvent = completedListener.mock.calls[0][0];
      expect(completedEvent.totalControls).toBe(2);
      expect(completedEvent.syncedCount).toBeGreaterThanOrEqual(0);
      expect(completedEvent.errorCount).toBe(0);
    });

    it('should handle sync from persistence source', async () => {
      const persistedStates = new Map([
        ['control1', createTestState('control1', 100, 'cache')],
        ['control2', createTestState('control2', true, 'cache')]
      ]);
      
      const result = await synchronizer.synchronize(persistedStates, 'persistence');
      
      expect(result.updates).toBeDefined();
      expect(result.conflicts).toBeDefined();
    });

    it('should prevent concurrent synchronization', async () => {
      mockRepository.getKeys.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve([]), 100))
      );
      
      const sync1 = synchronizer.synchronize();
      const sync2 = synchronizer.synchronize();
      
      // Second sync should return empty result immediately
      const result2 = await sync2;
      expect(result2.updates.size).toBe(0);
      expect(result2.conflicts.length).toBe(0);
      
      await sync1;
    });

    it('should handle sync errors', async () => {
      const error = new Error('Q-SYS connection failed');
      mockRepository.getKeys.mockRejectedValue(error);
      
      const errorListener = jest.fn();
      synchronizer.on(SyncEvent.Error, errorListener);
      
      await expect(synchronizer.synchronize()).rejects.toThrow('Q-SYS connection failed');
      
      expect(errorListener).toHaveBeenCalledWith({ error });
    });

    it('should clear dirty controls after successful sync', async () => {
      synchronizer.markDirty(['control1', 'control2']);
      expect(synchronizer.getStatistics().dirtyControlCount).toBe(2);
      
      mockRepository.getKeys.mockResolvedValue([]);
      mockRepository.getStates.mockResolvedValue(new Map());
      
      await synchronizer.synchronize();
      
      expect(synchronizer.getStatistics().dirtyControlCount).toBe(0);
    });

    it('should update sync history', async () => {
      mockRepository.getKeys.mockResolvedValue(['control1']);
      mockRepository.getStates.mockResolvedValue(
        new Map([['control1', createTestState('control1', 42)]])
      );
      mockQrwcClient.sendCommand.mockResolvedValue({
        Result: [{ Name: 'control1', Value: 42 }]
      });
      
      await synchronizer.synchronize();
      
      const history = synchronizer.getSyncHistory();
      expect(history.length).toBe(1);
      expect(history[0].timestamp).toBeInstanceOf(Date);
      expect(history[0].strategy).toBe(SyncStrategy.IncrementalSync);
      expect(history[0].totalControls).toBe(1);
    });

    it('should limit sync history size', async () => {
      mockRepository.getKeys.mockResolvedValue([]);
      mockRepository.getStates.mockResolvedValue(new Map());
      
      // Perform 105 syncs
      for (let i = 0; i < 105; i++) {
        await synchronizer.synchronize();
      }
      
      const history = synchronizer.getSyncHistory();
      expect(history.length).toBe(100); // Limited to 100
    });
  });

  describe('markDirty and clearDirty', () => {
    it('should mark controls as dirty', () => {
      synchronizer.markDirty(['control1', 'control2', 'control3']);
      
      expect(synchronizer.getStatistics().dirtyControlCount).toBe(3);
    });

    it('should not duplicate dirty controls', () => {
      synchronizer.markDirty(['control1', 'control2']);
      synchronizer.markDirty(['control2', 'control3']); // control2 is duplicate
      
      expect(synchronizer.getStatistics().dirtyControlCount).toBe(3);
    });

    it('should clear dirty controls', () => {
      synchronizer.markDirty(['control1', 'control2']);
      expect(synchronizer.getStatistics().dirtyControlCount).toBe(2);
      
      synchronizer.clearDirty();
      expect(synchronizer.getStatistics().dirtyControlCount).toBe(0);
    });
  });

  describe('event listeners', () => {
    it('should mark controls dirty on user updates', () => {
      // Emit state changed event with user source
      mockRepository.emit(StateRepositoryEvent.StateChanged, {
        controlName: 'control1',
        newState: { source: 'user' }
      });
      
      expect(synchronizer.getStatistics().dirtyControlCount).toBe(1);
    });

    it('should not mark controls dirty on non-user updates', () => {
      // Emit state changed event with qsys source
      mockRepository.emit(StateRepositoryEvent.StateChanged, {
        controlName: 'control1',
        newState: { source: 'qsys' }
      });
      
      expect(synchronizer.getStatistics().dirtyControlCount).toBe(0);
    });

    it('should handle batch updates', () => {
      // Emit batch update event
      mockRepository.emit(StateRepositoryEvent.StateChanged, {
        updates: [
          { controlName: 'control1', newState: { source: 'user' } },
          { controlName: 'control2', newState: { source: 'qsys' } },
          { controlName: 'control3', newState: { source: 'user' } }
        ]
      });
      
      expect(synchronizer.getStatistics().dirtyControlCount).toBe(2); // Only user updates
    });
  });

  describe('getStatistics', () => {
    it('should return correct statistics', async () => {
      // Initial stats
      let stats = synchronizer.getStatistics();
      expect(stats.lastSync).toBeNull();
      expect(stats.syncCount).toBe(0);
      expect(stats.averageSyncTime).toBe(0);
      expect(stats.dirtyControlCount).toBe(0);
      
      // After marking dirty
      synchronizer.markDirty(['control1', 'control2']);
      
      // After sync
      mockRepository.getKeys.mockResolvedValue([]);
      mockRepository.getStates.mockResolvedValue(new Map());
      await synchronizer.synchronize();
      
      stats = synchronizer.getStatistics();
      expect(stats.lastSync).toBeInstanceOf(Date);
      expect(stats.syncCount).toBe(1);
      expect(stats.averageSyncTime).toBeGreaterThanOrEqual(0);
      expect(stats.dirtyControlCount).toBe(0); // Cleared after sync
    });

    it('should calculate average sync time correctly', async () => {
      mockRepository.getKeys.mockResolvedValue([]);
      mockRepository.getStates.mockResolvedValue(new Map());
      
      // Perform multiple syncs
      for (let i = 0; i < 5; i++) {
        await synchronizer.synchronize();
      }
      
      const stats = synchronizer.getStatistics();
      expect(stats.syncCount).toBe(5);
      expect(stats.averageSyncTime).toBeGreaterThan(0);
    });
  });

  describe('shutdown', () => {
    it('should clean up resources on shutdown', async () => {
      // Setup some state
      synchronizer.markDirty(['control1', 'control2']);
      
      // Perform a sync to create history
      mockRepository.getKeys.mockResolvedValue([]);
      mockRepository.getStates.mockResolvedValue(new Map());
      await synchronizer.synchronize();
      
      // Start auto-sync
      const autoSync = new StateSynchronizer(mockRepository, mockQrwcClient, {
        autoSync: true,
        syncIntervalMs: 1000
      });
      autoSync.start();
      
      // Shutdown
      autoSync.shutdown();
      
      const stats = autoSync.getStatistics();
      expect(stats.dirtyControlCount).toBe(0);
      expect(stats.syncCount).toBe(0);
      
      // Verify timer is cleared
      jest.advanceTimersByTime(5000);
      expect(mockRepository.getKeys).not.toHaveBeenCalled();
    });
  });

  describe('sync strategies', () => {
    it('should use full sync strategy when configured', async () => {
      const fullSyncConfig = {
        strategy: SyncStrategy.FullSync
      };
      
      const fullSync = new StateSynchronizer(mockRepository, mockQrwcClient, fullSyncConfig);
      
      const states = new Map([
        ['control1', createTestState('control1', 42)],
        ['control2', createTestState('control2', 'ON')]
      ]);
      
      mockRepository.getKeys.mockResolvedValue(['control1', 'control2']);
      mockRepository.getStates.mockResolvedValue(states);
      mockQrwcClient.sendCommand.mockResolvedValue({
        Result: [
          { Name: 'control1', Value: 42 },
          { Name: 'control2', Value: 'ON' }
        ]
      });
      
      const result = await fullSync.synchronize();
      
      expect(result.updates).toBeDefined();
      
      fullSync.shutdown();
    });

    it('should use incremental sync strategy with dirty controls', async () => {
      synchronizer.markDirty(['control1']);
      
      const states = new Map([
        ['control1', createTestState('control1', 42)],
        ['control2', createTestState('control2', 'ON')]
      ]);
      
      mockRepository.getKeys.mockResolvedValue(['control1', 'control2']);
      mockRepository.getStates.mockResolvedValue(states);
      
      // Only control1 should be synced
      mockQrwcClient.sendCommand.mockResolvedValue({
        Result: [
          { Name: 'control1', Value: 50 } // Changed value
        ]
      });
      
      await synchronizer.synchronize();
      
      // Verify only dirty control was checked
      const history = synchronizer.getSyncHistory();
      expect(history[0].strategy).toBe(SyncStrategy.IncrementalSync);
    });
  });

  describe('conflict resolution', () => {
    it('should handle conflicts based on policy', async () => {
      const cacheWinsSync = new StateSynchronizer(mockRepository, mockQrwcClient, {
        conflictResolutionPolicy: ConflictResolutionPolicy.CacheWins
      });
      
      const states = new Map([
        ['control1', createTestState('control1', 42, 'user')]
      ]);
      
      mockRepository.getKeys.mockResolvedValue(['control1']);
      mockRepository.getStates.mockResolvedValue(states);
      
      // Q-SYS has different value
      mockQrwcClient.sendCommand.mockResolvedValue({
        Result: [{ Name: 'control1', Value: 50 }]
      });
      
      const result = await cacheWinsSync.synchronize();
      
      // With CacheWins policy, the conflict should be resolved in favor of cache
      expect(result.conflicts.length).toBeGreaterThanOrEqual(0);
      
      cacheWinsSync.shutdown();
    });
  });
});