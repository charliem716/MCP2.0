import { SimpleStateManager, StateManagerEvent } from '../../../../src/mcp/state/simple-state-manager';
import type { ControlState, CacheConfig } from '../../../../src/mcp/state/repository';

describe('SimpleStateManager', () => {
  let manager: SimpleStateManager;

  beforeEach(() => {
    manager = new SimpleStateManager();
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', async () => {
      const config: CacheConfig = {
        maxEntries: 500,
        ttlMs: 1800000,
        cleanupIntervalMs: 30000,
        enableMetrics: true,
        persistenceEnabled: false,
      };

      await manager.initialize(config);

      const stats = await manager.getStatistics();
      expect(stats.totalEntries).toBe(0);
    });
  });

  describe('state management', () => {
    beforeEach(async () => {
      await manager.initialize({
        maxEntries: 100,
        ttlMs: 3600000,
        cleanupIntervalMs: 60000,
        enableMetrics: true,
        persistenceEnabled: false,
      });
    });

    it('should set and get control state', async () => {
      const state: ControlState = {
        name: 'TestControl',
        value: 42,
        timestamp: new Date(),
        source: 'test',
      };

      await manager.setState('TestControl', state);
      const retrieved = await manager.getState('TestControl');

      expect(retrieved).toEqual(state);
    });

    it('should return null for non-existent state', async () => {
      const state = await manager.getState('NonExistent');
      expect(state).toBeNull();
    });

    it('should update existing state', async () => {
      const initialState: ControlState = {
        name: 'TestControl',
        value: 42,
        timestamp: new Date(),
        source: 'test',
      };

      await manager.setState('TestControl', initialState);

      const updatedState: ControlState = {
        name: 'TestControl',
        value: 100,
        timestamp: new Date(),
        source: 'test',
      };

      await manager.setState('TestControl', updatedState);
      const retrieved = await manager.getState('TestControl');

      expect(retrieved?.value).toBe(100);
    });

    it('should emit state change events', async () => {
      const stateChangeHandler = jest.fn();
      manager.on(StateManagerEvent.StateChanged, stateChangeHandler);

      const state: ControlState = {
        name: 'TestControl',
        value: 42,
        timestamp: new Date(),
        source: 'test',
      };

      await manager.setState('TestControl', state);

      expect(stateChangeHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          controlName: 'TestControl',
          newState: state,
          oldState: null,
        })
      );
    });

    it('should handle batch state updates', async () => {
      const states = new Map<string, ControlState>([
        ['Control1', { name: 'Control1', value: 1, timestamp: new Date(), source: 'test' }],
        ['Control2', { name: 'Control2', value: 2, timestamp: new Date(), source: 'test' }],
        ['Control3', { name: 'Control3', value: 3, timestamp: new Date(), source: 'test' }],
      ]);

      await manager.setStates(states);

      const retrieved1 = await manager.getState('Control1');
      const retrieved2 = await manager.getState('Control2');
      const retrieved3 = await manager.getState('Control3');

      expect(retrieved1?.value).toBe(1);
      expect(retrieved2?.value).toBe(2);
      expect(retrieved3?.value).toBe(3);
    });

    it('should emit batch update events', async () => {
      const batchUpdateHandler = jest.fn();
      manager.on(StateManagerEvent.BatchUpdate, batchUpdateHandler);

      const states = new Map<string, ControlState>([
        ['Control1', { name: 'Control1', value: 1, timestamp: new Date(), source: 'test' }],
        ['Control2', { name: 'Control2', value: 2, timestamp: new Date(), source: 'test' }],
      ]);

      await manager.setStates(states);

      expect(batchUpdateHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          changes: expect.arrayContaining([
            expect.objectContaining({ name: 'Control1' }),
            expect.objectContaining({ name: 'Control2' }),
          ]),
        })
      );
    });

    it('should get multiple states', async () => {
      await manager.setState('Control1', { name: 'Control1', value: 1, timestamp: new Date(), source: 'test' });
      await manager.setState('Control2', { name: 'Control2', value: 2, timestamp: new Date(), source: 'test' });
      await manager.setState('Control3', { name: 'Control3', value: 3, timestamp: new Date(), source: 'test' });

      const states = await manager.getStates(['Control1', 'Control3', 'NonExistent']);

      expect(states.size).toBe(2);
      expect(states.get('Control1')?.value).toBe(1);
      expect(states.get('Control3')?.value).toBe(3);
      expect(states.has('NonExistent')).toBe(false);
    });

    it('should remove state', async () => {
      await manager.setState('TestControl', { name: 'TestControl', value: 42, timestamp: new Date(), source: 'test' });
      
      const removed = await manager.removeState('TestControl');
      expect(removed).toBe(true);

      const state = await manager.getState('TestControl');
      expect(state).toBeNull();
    });

    it('should remove multiple states', async () => {
      await manager.setState('Control1', { name: 'Control1', value: 1, timestamp: new Date(), source: 'test' });
      await manager.setState('Control2', { name: 'Control2', value: 2, timestamp: new Date(), source: 'test' });
      await manager.setState('Control3', { name: 'Control3', value: 3, timestamp: new Date(), source: 'test' });

      const removedCount = await manager.removeStates(['Control1', 'Control3', 'NonExistent']);
      expect(removedCount).toBe(2);

      expect(await manager.hasState('Control1')).toBe(false);
      expect(await manager.hasState('Control2')).toBe(true);
      expect(await manager.hasState('Control3')).toBe(false);
    });

    it('should check if state exists', async () => {
      await manager.setState('TestControl', { name: 'TestControl', value: 42, timestamp: new Date(), source: 'test' });

      expect(await manager.hasState('TestControl')).toBe(true);
      expect(await manager.hasState('NonExistent')).toBe(false);
    });

    it('should get all keys', async () => {
      await manager.setState('Control1', { name: 'Control1', value: 1, timestamp: new Date(), source: 'test' });
      await manager.setState('Control2', { name: 'Control2', value: 2, timestamp: new Date(), source: 'test' });
      await manager.setState('Control3', { name: 'Control3', value: 3, timestamp: new Date(), source: 'test' });

      const keys = await manager.getKeys();
      expect(keys).toEqual(expect.arrayContaining(['Control1', 'Control2', 'Control3']));
      expect(keys.length).toBe(3);
    });

    it('should invalidate state', async () => {
      const invalidateHandler = jest.fn();
      manager.on(StateManagerEvent.Invalidated, invalidateHandler);

      await manager.setState('TestControl', { name: 'TestControl', value: 42, timestamp: new Date(), source: 'test' });
      
      const existed = await manager.invalidateState('TestControl');
      expect(existed).toBe(true);

      const state = await manager.getState('TestControl');
      expect(state).toBeNull();

      expect(invalidateHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          controlName: 'TestControl',
        })
      );
    });

    it('should invalidate states matching pattern', async () => {
      await manager.setState('GainControl1', { name: 'GainControl1', value: 1, timestamp: new Date(), source: 'test' });
      await manager.setState('GainControl2', { name: 'GainControl2', value: 2, timestamp: new Date(), source: 'test' });
      await manager.setState('MuteControl1', { name: 'MuteControl1', value: false, timestamp: new Date(), source: 'test' });

      await manager.invalidatePattern(/^Gain/);

      expect(await manager.hasState('GainControl1')).toBe(false);
      expect(await manager.hasState('GainControl2')).toBe(false);
      expect(await manager.hasState('MuteControl1')).toBe(true);
    });

    it('should clear all states', async () => {
      await manager.setState('Control1', { name: 'Control1', value: 1, timestamp: new Date(), source: 'test' });
      await manager.setState('Control2', { name: 'Control2', value: 2, timestamp: new Date(), source: 'test' });

      await manager.clear();

      const keys = await manager.getKeys();
      expect(keys.length).toBe(0);
    });
  });

  describe('change groups', () => {
    beforeEach(async () => {
      await manager.initialize({
        maxEntries: 100,
        ttlMs: 3600000,
        cleanupIntervalMs: 60000,
        enableMetrics: true,
        persistenceEnabled: false,
      });
    });

    it('should create change group', async () => {
      const controls = [
        { name: 'Control1', value: 1 },
        { name: 'Control2', value: 2 },
      ];

      const changeGroup = await manager.createChangeGroup(controls, 'test');

      expect(changeGroup.id).toBeTruthy();
      expect(changeGroup.controls).toEqual(controls);
      expect(changeGroup.source).toBe('test');
      expect(changeGroup.status).toBe('pending');
    });

    it('should apply change group', async () => {
      const controls = [
        { name: 'Control1', value: 1 },
        { name: 'Control2', value: 2 },
      ];

      const changeGroup = await manager.createChangeGroup(controls, 'test');
      await manager.applyChangeGroup(changeGroup.id);

      const state1 = await manager.getState('Control1');
      const state2 = await manager.getState('Control2');

      expect(state1?.value).toBe(1);
      expect(state2?.value).toBe(2);

      const updatedGroup = await manager.getChangeGroup(changeGroup.id);
      expect(updatedGroup?.status).toBe('completed');
    });

    it('should handle change group application errors', async () => {
      const controls = [
        { name: 'Control1', value: 1 },
      ];

      const changeGroup = await manager.createChangeGroup(controls, 'test');
      
      // Simulate an error by clearing the change group map
      await manager['changeGroups'].clear();

      await expect(manager.applyChangeGroup(changeGroup.id)).rejects.toThrow();
    });

    it('should update change group status', async () => {
      const controls = [{ name: 'Control1', value: 1 }];
      const changeGroup = await manager.createChangeGroup(controls, 'test');

      const updated = await manager.updateChangeGroupStatus(changeGroup.id, 'applying');
      expect(updated).toBe(true);

      const group = await manager.getChangeGroup(changeGroup.id);
      expect(group?.status).toBe('applying');
    });

    it('should clean up old change groups', async () => {
      // Initialize with short TTL for testing
      await manager.initialize({
        maxEntries: 100,
        ttlMs: 100, // 100ms TTL
        cleanupIntervalMs: 60000,
        enableMetrics: true,
        persistenceEnabled: false,
      });

      const controls = [{ name: 'Control1', value: 1 }];
      const changeGroup = await manager.createChangeGroup(controls, 'test');
      await manager.applyChangeGroup(changeGroup.id);

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      const cleaned = await manager.cleanupChangeGroups();
      expect(cleaned).toBe(1);

      const group = await manager.getChangeGroup(changeGroup.id);
      expect(group).toBeNull();
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      await manager.initialize({
        maxEntries: 100,
        ttlMs: 3600000,
        cleanupIntervalMs: 60000,
        enableMetrics: true,
        persistenceEnabled: false,
      });
    });

    it('should track cache statistics', async () => {
      // Wait a tiny bit to ensure uptime > 0
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Generate some hits and misses
      await manager.setState('Control1', { name: 'Control1', value: 1, timestamp: new Date(), source: 'test' });
      
      await manager.getState('Control1'); // Hit
      await manager.getState('Control1'); // Hit
      await manager.getState('NonExistent'); // Miss
      await manager.getState('NonExistent2'); // Miss

      const stats = await manager.getStatistics();

      expect(stats.totalEntries).toBe(1);
      expect(stats.hitCount).toBe(2);
      expect(stats.missCount).toBe(2);
      expect(stats.hitRatio).toBe(0.5);
      expect(stats.evictionCount).toBe(0);
      expect(stats.uptime).toBeGreaterThan(0);
    });

    it('should track evictions', async () => {
      // Initialize with very small cache
      await manager.initialize({
        maxEntries: 2,
        ttlMs: 3600000,
        cleanupIntervalMs: 60000,
        enableMetrics: true,
        persistenceEnabled: false,
      });

      await manager.setState('Control1', { name: 'Control1', value: 1, timestamp: new Date(), source: 'test' });
      await manager.setState('Control2', { name: 'Control2', value: 2, timestamp: new Date(), source: 'test' });
      await manager.setState('Control3', { name: 'Control3', value: 3, timestamp: new Date(), source: 'test' });

      const stats = await manager.getStatistics();
      expect(stats.evictionCount).toBe(1);
      expect(stats.totalEntries).toBe(2);
    });
  });

  describe('persistence (no-op)', () => {
    it('should handle persist calls gracefully', async () => {
      await manager.initialize({
        maxEntries: 100,
        ttlMs: 3600000,
        cleanupIntervalMs: 60000,
        enableMetrics: true,
        persistenceEnabled: true,
      });

      await expect(manager.persist()).resolves.not.toThrow();
    });

    it('should handle restore calls gracefully', async () => {
      await manager.initialize({
        maxEntries: 100,
        ttlMs: 3600000,
        cleanupIntervalMs: 60000,
        enableMetrics: true,
        persistenceEnabled: true,
      });

      await expect(manager.restore()).resolves.not.toThrow();
    });
  });

  describe('shutdown', () => {
    it('should clean up resources on shutdown', async () => {
      await manager.initialize({
        maxEntries: 100,
        ttlMs: 3600000,
        cleanupIntervalMs: 60000,
        enableMetrics: true,
        persistenceEnabled: false,
      });

      await manager.setState('Control1', { name: 'Control1', value: 1, timestamp: new Date(), source: 'test' });

      await manager.shutdown();

      const stats = await manager.getStatistics();
      expect(stats.totalEntries).toBe(0);
    });
  });
});