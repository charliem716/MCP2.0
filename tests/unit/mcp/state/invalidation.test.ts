import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  CacheInvalidationManager,
  InvalidationStrategy,
  InvalidationTrigger,
  CacheInvalidationEvent,
  type InvalidationRule,
  type InvalidationEvent,
  type InvalidationResult
} from '../../../../src/mcp/state/invalidation.js';
import { EventEmitter } from 'events';
import type { IStateRepository } from '../../../../src/mcp/state/repository.js';

// Mock IStateRepository
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

describe('CacheInvalidationManager', () => {
  let manager: CacheInvalidationManager;
  let mockRepository: MockStateRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockRepository = new MockStateRepository();
    manager = new CacheInvalidationManager(mockRepository);
  });

  afterEach(() => {
    manager.shutdown();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create invalidation manager', () => {
      expect(manager).toBeInstanceOf(CacheInvalidationManager);
      expect(manager).toBeInstanceOf(EventEmitter);
    });
  });

  describe('addRule', () => {
    it('should add invalidation rule', () => {
      const rule: InvalidationRule = {
        id: 'rule1',
        name: 'Test Rule',
        strategy: InvalidationStrategy.TTL,
        trigger: InvalidationTrigger.TimeExpired,
        ttlMs: 60000,
        enabled: true,
        priority: 1
      };

      const ruleAddedListener = jest.fn();
      manager.on(CacheInvalidationEvent.RuleAdded, ruleAddedListener);

      manager.addRule(rule);

      expect(manager.getRule('rule1')).toEqual(rule);
      expect(ruleAddedListener).toHaveBeenCalledWith({ rule });
    });

    it('should not add duplicate rule', () => {
      const rule: InvalidationRule = {
        id: 'rule1',
        name: 'Test Rule',
        strategy: InvalidationStrategy.Manual,
        trigger: InvalidationTrigger.UserAction,
        enabled: true,
        priority: 1
      };

      manager.addRule(rule);
      
      expect(() => manager.addRule(rule)).toThrow('Rule with ID rule1 already exists');
    });

    it('should start TTL timer for TTL-based rules', () => {
      const rule: InvalidationRule = {
        id: 'ttl-rule',
        name: 'TTL Rule',
        strategy: InvalidationStrategy.TTL,
        trigger: InvalidationTrigger.TimeExpired,
        ttlMs: 5000,
        enabled: true,
        priority: 1
      };

      mockRepository.getKeys.mockResolvedValue(['control1', 'control2']);

      manager.addRule(rule);

      // Fast-forward time
      jest.advanceTimersByTime(5000);

      // Should trigger invalidation
      expect(mockRepository.invalidateStates).toHaveBeenCalled();
    });

    it('should add pattern-based rule', () => {
      const rule: InvalidationRule = {
        id: 'pattern-rule',
        name: 'Pattern Rule',
        strategy: InvalidationStrategy.PatternBased,
        trigger: InvalidationTrigger.PatternMatch,
        pattern: /^mixer\./,
        enabled: true,
        priority: 2
      };

      manager.addRule(rule);
      expect(manager.getRule('pattern-rule')).toEqual(rule);
    });

    it('should add dependency-based rule', () => {
      const rule: InvalidationRule = {
        id: 'dep-rule',
        name: 'Dependency Rule',
        strategy: InvalidationStrategy.Dependency,
        trigger: InvalidationTrigger.DependencyChanged,
        dependencies: ['control1', 'control2'],
        enabled: true,
        priority: 3
      };

      manager.addRule(rule);
      expect(manager.getRule('dep-rule')).toEqual(rule);
    });
  });

  describe('removeRule', () => {
    it('should remove existing rule', () => {
      const rule: InvalidationRule = {
        id: 'rule1',
        name: 'Test Rule',
        strategy: InvalidationStrategy.Manual,
        trigger: InvalidationTrigger.UserAction,
        enabled: true,
        priority: 1
      };

      const ruleRemovedListener = jest.fn();
      manager.on(CacheInvalidationEvent.RuleRemoved, ruleRemovedListener);

      manager.addRule(rule);
      const removed = manager.removeRule('rule1');

      expect(removed).toBe(true);
      expect(manager.getRule('rule1')).toBeUndefined();
      expect(ruleRemovedListener).toHaveBeenCalledWith({ ruleId: 'rule1' });
    });

    it('should stop TTL timer when removing TTL rule', () => {
      const rule: InvalidationRule = {
        id: 'ttl-rule',
        name: 'TTL Rule',
        strategy: InvalidationStrategy.TTL,
        trigger: InvalidationTrigger.TimeExpired,
        ttlMs: 5000,
        enabled: true,
        priority: 1
      };

      manager.addRule(rule);
      manager.removeRule('ttl-rule');

      // Timer should be cleared
      jest.advanceTimersByTime(10000);
      expect(mockRepository.invalidateStates).not.toHaveBeenCalled();
    });

    it('should return false for non-existent rule', () => {
      const removed = manager.removeRule('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('triggerRule', () => {
    it('should trigger manual invalidation rule', async () => {
      const rule: InvalidationRule = {
        id: 'manual-rule',
        name: 'Manual Rule',
        strategy: InvalidationStrategy.Manual,
        trigger: InvalidationTrigger.UserAction,
        enabled: true,
        priority: 1
      };

      const triggeredListener = jest.fn();
      const invalidatedListener = jest.fn();
      
      manager.on(CacheInvalidationEvent.RuleTriggered, triggeredListener);
      manager.on(CacheInvalidationEvent.Invalidated, invalidatedListener);

      manager.addRule(rule);
      
      const controlNames = ['control1', 'control2'];
      const result = await manager.triggerRule('manual-rule', controlNames, 'User requested');

      expect(result).toBeDefined();
      expect(result.ruleId).toBe('manual-rule');
      expect(result.controlsInvalidated).toEqual(controlNames);
      expect(result.successCount).toBe(2);
      
      expect(mockRepository.invalidateStates).toHaveBeenCalledWith(controlNames);
      expect(triggeredListener).toHaveBeenCalled();
      expect(invalidatedListener).toHaveBeenCalled();
    });

    it('should apply pattern matching for pattern-based rules', async () => {
      const rule: InvalidationRule = {
        id: 'pattern-rule',
        name: 'Pattern Rule',
        strategy: InvalidationStrategy.PatternBased,
        trigger: InvalidationTrigger.PatternMatch,
        pattern: /^mixer\./,
        enabled: true,
        priority: 1
      };

      manager.addRule(rule);
      
      mockRepository.getKeys.mockResolvedValue([
        'mixer.gain',
        'mixer.mute',
        'speaker.volume',
        'mixer.pan'
      ]);

      const result = await manager.triggerRule('pattern-rule', [], 'Pattern match');

      expect(mockRepository.invalidateStates).toHaveBeenCalledWith([
        'mixer.gain',
        'mixer.mute',
        'mixer.pan'
      ]);
      expect(result.controlsInvalidated).toHaveLength(3);
    });

    it('should not trigger disabled rule', async () => {
      const rule: InvalidationRule = {
        id: 'disabled-rule',
        name: 'Disabled Rule',
        strategy: InvalidationStrategy.Manual,
        trigger: InvalidationTrigger.UserAction,
        enabled: false,
        priority: 1
      };

      manager.addRule(rule);
      
      await expect(manager.triggerRule('disabled-rule', ['control1'], 'Test'))
        .rejects.toThrow('Rule disabled-rule is not enabled');
      
      expect(mockRepository.invalidateStates).not.toHaveBeenCalled();
    });

    it('should handle invalidation errors', async () => {
      const rule: InvalidationRule = {
        id: 'error-rule',
        name: 'Error Rule',
        strategy: InvalidationStrategy.Manual,
        trigger: InvalidationTrigger.UserAction,
        enabled: true,
        priority: 1
      };

      const errorListener = jest.fn();
      manager.on(CacheInvalidationEvent.Error, errorListener);

      manager.addRule(rule);
      
      mockRepository.invalidateStates.mockRejectedValueOnce(new Error('Invalidation failed'));

      const result = await manager.triggerRule('error-rule', ['control1'], 'Test');

      expect(result.errorCount).toBe(1);
      expect(result.errors).toContain('Invalidation failed');
      expect(errorListener).toHaveBeenCalled();
    });
  });

  describe('invalidateByDependency', () => {
    it('should invalidate dependent controls', async () => {
      const rule1: InvalidationRule = {
        id: 'dep-rule-1',
        name: 'Dependency Rule 1',
        strategy: InvalidationStrategy.Dependency,
        trigger: InvalidationTrigger.DependencyChanged,
        dependencies: ['master.gain'],
        enabled: true,
        priority: 1
      };

      const rule2: InvalidationRule = {
        id: 'dep-rule-2',
        name: 'Dependency Rule 2',
        strategy: InvalidationStrategy.Dependency,
        trigger: InvalidationTrigger.DependencyChanged,
        dependencies: ['master.gain', 'master.mute'],
        enabled: true,
        priority: 1
      };

      mockRepository.getKeys.mockResolvedValue(['channel1.gain', 'channel2.gain']);

      manager.addRule(rule1);
      manager.addRule(rule2);

      const results = await manager.invalidateByDependency('master.gain');

      expect(results).toHaveLength(2);
      expect(mockRepository.invalidateStates).toHaveBeenCalledTimes(2);
    });

    it('should handle circular dependencies gracefully', async () => {
      const rule1: InvalidationRule = {
        id: 'circular-1',
        name: 'Circular 1',
        strategy: InvalidationStrategy.Dependency,
        trigger: InvalidationTrigger.DependencyChanged,
        dependencies: ['control2'],
        enabled: true,
        priority: 1
      };

      const rule2: InvalidationRule = {
        id: 'circular-2',
        name: 'Circular 2',
        strategy: InvalidationStrategy.Dependency,
        trigger: InvalidationTrigger.DependencyChanged,
        dependencies: ['control1'],
        enabled: true,
        priority: 1
      };

      mockRepository.getKeys.mockResolvedValue(['control1', 'control2']);

      manager.addRule(rule1);
      manager.addRule(rule2);

      // Should not cause infinite loop
      const results = await manager.invalidateByDependency('control1');

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('getAllRules', () => {
    it('should return all rules', () => {
      const rules: InvalidationRule[] = [
        {
          id: 'rule1',
          name: 'Rule 1',
          strategy: InvalidationStrategy.Manual,
          trigger: InvalidationTrigger.UserAction,
          enabled: true,
          priority: 1
        },
        {
          id: 'rule2',
          name: 'Rule 2',
          strategy: InvalidationStrategy.TTL,
          trigger: InvalidationTrigger.TimeExpired,
          ttlMs: 5000,
          enabled: true,
          priority: 2
        }
      ];

      rules.forEach(rule => manager.addRule(rule));

      const allRules = manager.getAllRules();
      expect(allRules).toHaveLength(2);
      expect(allRules).toEqual(expect.arrayContaining(rules));
    });

    it('should return rules sorted by priority', () => {
      const lowPriority: InvalidationRule = {
        id: 'low',
        name: 'Low Priority',
        strategy: InvalidationStrategy.Manual,
        trigger: InvalidationTrigger.UserAction,
        enabled: true,
        priority: 1
      };

      const highPriority: InvalidationRule = {
        id: 'high',
        name: 'High Priority',
        strategy: InvalidationStrategy.Manual,
        trigger: InvalidationTrigger.UserAction,
        enabled: true,
        priority: 10
      };

      manager.addRule(lowPriority);
      manager.addRule(highPriority);

      const rules = manager.getAllRules();
      expect(rules[0].priority).toBe(10);
      expect(rules[1].priority).toBe(1);
    });
  });

  describe('getStatistics', () => {
    it('should return invalidation statistics', async () => {
      const rule: InvalidationRule = {
        id: 'test-rule',
        name: 'Test Rule',
        strategy: InvalidationStrategy.Manual,
        trigger: InvalidationTrigger.UserAction,
        enabled: true,
        priority: 1
      };

      manager.addRule(rule);
      
      await manager.triggerRule('test-rule', ['control1'], 'Test');
      await manager.triggerRule('test-rule', ['control2', 'control3'], 'Test');

      const stats = manager.getStatistics();
      
      expect(stats.totalInvalidations).toBe(2);
      expect(stats.totalControlsInvalidated).toBe(3);
      expect(stats.ruleCount).toBe(1);
      expect(stats.uptime).toBeGreaterThan(0);
    });
  });

  describe('shutdown', () => {
    it('should clear all timers on shutdown', () => {
      const ttlRule: InvalidationRule = {
        id: 'ttl-rule',
        name: 'TTL Rule',
        strategy: InvalidationStrategy.TTL,
        trigger: InvalidationTrigger.TimeExpired,
        ttlMs: 5000,
        enabled: true,
        priority: 1
      };

      manager.addRule(ttlRule);
      manager.shutdown();

      // Timers should be cleared
      jest.advanceTimersByTime(10000);
      expect(mockRepository.invalidateStates).not.toHaveBeenCalled();
    });

    it('should clear all rules on shutdown', () => {
      const rule: InvalidationRule = {
        id: 'test-rule',
        name: 'Test Rule',
        strategy: InvalidationStrategy.Manual,
        trigger: InvalidationTrigger.UserAction,
        enabled: true,
        priority: 1
      };

      manager.addRule(rule);
      manager.shutdown();

      expect(manager.getAllRules()).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty control list', async () => {
      const rule: InvalidationRule = {
        id: 'empty-rule',
        name: 'Empty Rule',
        strategy: InvalidationStrategy.Manual,
        trigger: InvalidationTrigger.UserAction,
        enabled: true,
        priority: 1
      };

      manager.addRule(rule);
      
      const result = await manager.triggerRule('empty-rule', [], 'Empty test');
      
      expect(result.controlsInvalidated).toHaveLength(0);
      expect(result.successCount).toBe(0);
    });

    it('should handle very large control lists', async () => {
      const rule: InvalidationRule = {
        id: 'large-rule',
        name: 'Large Rule',
        strategy: InvalidationStrategy.Manual,
        trigger: InvalidationTrigger.UserAction,
        enabled: true,
        priority: 1
      };

      manager.addRule(rule);
      
      const largeControlList = Array.from({ length: 1000 }, (_, i) => `control${i}`);
      const result = await manager.triggerRule('large-rule', largeControlList, 'Large test');
      
      expect(result.controlsInvalidated).toHaveLength(1000);
      expect(mockRepository.invalidateStates).toHaveBeenCalledWith(largeControlList);
    });
  });
});