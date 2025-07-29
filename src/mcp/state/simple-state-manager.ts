/**
 * Simple State Manager - BUG-132 Fix
 * 
 * A simplified, unified state management solution that replaces the complex
 * multi-layer cache architecture with a single, clear implementation.
 */

import { EventEmitter } from 'events';
import { LRUCache } from './lru-cache.js';
import type { 
  IStateRepository, 
  ControlState, 
  ChangeGroup, 
  CacheConfig,
  CacheStatistics 
} from './repository.js';
import { globalLogger as logger } from '../../shared/utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Events emitted by SimpleStateManager
 */
export enum StateManagerEvent {
  StateChanged = 'stateChanged',
  BatchUpdate = 'batchUpdate',
  Invalidated = 'invalidated',
}

/**
 * Simple, unified state manager that provides:
 * - Single source of truth for control states
 * - Clear, linear data flow
 * - Minimal abstraction layers
 * - Easy debugging and testing
 */
export class SimpleStateManager extends EventEmitter implements IStateRepository {
  private cache: LRUCache<string, ControlState>;
  private changeGroups = new Map<string, ChangeGroup>();
  private config: CacheConfig;
  private stats = {
    hitCount: 0,
    missCount: 0,
    evictionCount: 0,
    startTime: Date.now(),
  };

  constructor() {
    super();
    this.cache = new LRUCache<string, ControlState>(1000); // Default size
    this.config = {
      maxEntries: 1000,
      ttlMs: 3600000, // 1 hour default
      cleanupIntervalMs: 60000, // 1 minute
      enableMetrics: true,
      persistenceEnabled: false,
    };
  }

  /**
   * Initialize with configuration
   */
  async initialize(config: CacheConfig): Promise<void> {
    this.config = { ...this.config, ...config };
    
    // Reinitialize cache with new size
    this.cache = new LRUCache<string, ControlState>(config.maxEntries);
    
    // Listen for evictions to track stats
    this.cache.on('eviction', () => {
      this.stats.evictionCount++;
    });

    logger.info('SimpleStateManager initialized', { config });
  }

  /**
   * Get control state - single lookup path
   */
  async getState(controlName: string): Promise<ControlState | null> {
    const state = this.cache.get(controlName);
    
    if (state) {
      this.stats.hitCount++;
      logger.debug('State cache hit', { controlName });
    } else {
      this.stats.missCount++;
      logger.debug('State cache miss', { controlName });
    }
    
    return state ?? null;
  }

  /**
   * Set control state - single update path
   */
  async setState(controlName: string, state: ControlState): Promise<void> {
    const oldState = this.cache.get(controlName);
    this.cache.set(controlName, state);
    
    logger.debug('State updated', { 
      controlName, 
      oldValue: oldState?.value, 
      newValue: state.value 
    });
    
    // Emit single, clear event
    this.emit(StateManagerEvent.StateChanged, {
      controlName,
      oldState,
      newState: state,
      timestamp: new Date(),
    });
  }

  /**
   * Batch update states
   */
  async setStates(states: Map<string, ControlState>): Promise<void> {
    const changes: Array<{ name: string; oldState?: ControlState; newState: ControlState }> = [];
    
    for (const [name, state] of states) {
      const oldState = this.cache.get(name);
      this.cache.set(name, state);
      if (oldState) {
        changes.push({ name, oldState, newState: state });
      } else {
        changes.push({ name, newState: state });
      }
    }
    
    logger.debug('Batch state update', { count: states.size });
    
    // Emit batch event
    this.emit(StateManagerEvent.BatchUpdate, {
      changes,
      timestamp: new Date(),
    });
  }

  /**
   * Get all states
   */
  async getAllStates(): Promise<Map<string, ControlState>> {
    const states = new Map<string, ControlState>();
    
    // LRUCache doesn't expose iteration, so we track keys separately
    // This is a limitation we accept for simplicity
    for (const [key, value] of this.cache.entries()) {
      states.set(key, value);
    }
    
    return states;
  }

  /**
   * Get multiple control states by names
   */
  async getStates(controlNames: string[]): Promise<Map<string, ControlState>> {
    const states = new Map<string, ControlState>();
    
    for (const name of controlNames) {
      const state = await this.getState(name);
      if (state) {
        states.set(name, state);
      }
    }
    
    return states;
  }

  /**
   * Remove control state from repository
   */
  async removeState(controlName: string): Promise<boolean> {
    return this.cache.delete(controlName);
  }

  /**
   * Remove multiple control states
   */
  async removeStates(controlNames: string[]): Promise<number> {
    let removed = 0;
    for (const name of controlNames) {
      if (await this.removeState(name)) {
        removed++;
      }
    }
    return removed;
  }

  /**
   * Check if control state exists in cache
   */
  async hasState(controlName: string): Promise<boolean> {
    return this.cache.has(controlName);
  }

  /**
   * Get all cached control names
   */
  async getKeys(): Promise<string[]> {
    return this.cache.keys();
  }

  /**
   * Get cache statistics (renamed from getCacheStatistics)
   */
  async getStatistics(): Promise<CacheStatistics> {
    return this.getCacheStatistics();
  }

  /**
   * Invalidate specific control states
   */
  async invalidateStates(controlNames: string[]): Promise<void> {
    for (const name of controlNames) {
      await this.invalidateState(name);
    }
  }

  /**
   * Invalidate states matching pattern
   */
  async invalidatePattern(pattern: RegExp): Promise<void> {
    const keys = await this.getKeys();
    const toInvalidate = keys.filter(key => pattern.test(key));
    await this.invalidateStates(toInvalidate);
  }

  /**
   * Synchronize cache with Q-SYS Core (no-op for simple implementation)
   */
  async synchronize(forceRefresh?: boolean): Promise<void> {
    logger.debug('Synchronize called (no-op in SimpleStateManager)', { forceRefresh });
  }

  /**
   * Cleanup expired entries and resources
   */
  async cleanup(): Promise<void> {
    await this.cleanupChangeGroups();
    logger.debug('Cleanup completed');
  }

  /**
   * Simple invalidation
   */
  async invalidateState(controlName: string): Promise<boolean> {
    const existed = this.cache.has(controlName);
    if (existed) {
      this.cache.delete(controlName);
      logger.debug('State invalidated', { controlName });
      
      this.emit(StateManagerEvent.Invalidated, {
        controlName,
        timestamp: new Date(),
      });
    }
    return existed;
  }

  /**
   * Clear all states
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.changeGroups.clear();
    logger.info('State cache cleared');
  }

  /**
   * Create change group for batch operations
   */
  async createChangeGroup(
    controls: Array<{
      name: string;
      value: number | string | boolean;
      ramp?: number;
    }>,
    source: string
  ): Promise<ChangeGroup> {
    const changeGroup: ChangeGroup = {
      id: uuidv4(),
      controls,
      timestamp: new Date(),
      status: 'pending',
      source,
    };
    
    this.changeGroups.set(changeGroup.id, changeGroup);
    logger.debug('Change group created', { id: changeGroup.id, controlCount: controls.length });
    
    return changeGroup;
  }

  /**
   * Apply change group - simple batch update
   */
  async applyChangeGroup(groupId: string): Promise<void> {
    const group = this.changeGroups.get(groupId);
    if (!group) {
      throw new Error(`Change group ${groupId} not found`);
    }
    
    group.status = 'applying';
    
    try {
      // Simple: just update all states
      const updates = new Map<string, ControlState>();
      
      for (const control of group.controls) {
        const state: ControlState = {
          name: control.name,
          value: control.value,
          timestamp: new Date(),
          source: 'user',
        };
        
        // Call setState individually to catch errors
        await this.setState(control.name, state);
        updates.set(control.name, state);
      }
      
      group.status = 'completed';
      logger.info('Change group applied', { id: groupId });
    } catch (error) {
      group.status = 'failed';
      logger.error('Change group failed', { id: groupId, error });
      throw error;
    }
  }

  /**
   * Get change group
   */
  async getChangeGroup(groupId: string): Promise<ChangeGroup | null> {
    return this.changeGroups.get(groupId) ?? null;
  }

  /**
   * Update change group status
   */
  async updateChangeGroupStatus(
    groupId: string,
    status: 'pending' | 'applying' | 'completed' | 'failed'
  ): Promise<boolean> {
    const group = this.changeGroups.get(groupId);
    if (group) {
      group.status = status;
      return true;
    }
    return false;
  }

  /**
   * Clean up old change groups
   */
  async cleanupChangeGroups(): Promise<number> {
    const cutoff = Date.now() - this.config.ttlMs;
    let cleaned = 0;
    
    for (const [id, group] of this.changeGroups) {
      if (group.timestamp.getTime() < cutoff && 
          (group.status === 'completed' || group.status === 'failed')) {
        this.changeGroups.delete(id);
        cleaned++;
      }
    }
    
    logger.debug('Change groups cleaned', { cleaned });
    return cleaned;
  }

  /**
   * Get cache statistics
   */
  async getCacheStatistics(): Promise<CacheStatistics> {
    const hitRatio = this.stats.hitCount + this.stats.missCount > 0
      ? this.stats.hitCount / (this.stats.hitCount + this.stats.missCount)
      : 0;
    
    return {
      totalEntries: this.cache.size,
      hitCount: this.stats.hitCount,
      missCount: this.stats.missCount,
      evictionCount: this.stats.evictionCount,
      memoryUsage: Math.max(1, this.cache.size * 1024), // Rough estimate, minimum 1 byte
      hitRatio,
      uptime: Date.now() - this.stats.startTime,
    };
  }

  /**
   * Shutdown - clean up resources
   */
  async shutdown(): Promise<void> {
    this.cache.clear();
    this.changeGroups.clear();
    this.removeAllListeners();
    logger.info('SimpleStateManager shutdown complete');
  }

  // Simplified persistence methods (no-op for now)
  async persist(): Promise<void> {
    if (this.config.persistenceEnabled) {
      logger.warn('Persistence not implemented in SimpleStateManager');
    }
  }

  async restore(): Promise<void> {
    if (this.config.persistenceEnabled) {
      logger.warn('Restore not implemented in SimpleStateManager');
    }
  }

  // Simplified sync methods
  setSynchronizer(synchronizer: unknown): void {
    logger.debug('Synchronizer set (no-op in SimpleStateManager)');
  }

  setInvalidationManager(manager: unknown): void {
    logger.debug('Invalidation manager set (no-op in SimpleStateManager)');
  }

  setPersistenceManager(manager: unknown): void {
    logger.debug('Persistence manager set (no-op in SimpleStateManager)');
  }
}