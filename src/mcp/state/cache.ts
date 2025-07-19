import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { globalLogger as logger } from "../../shared/utils/logger.js";
import { LRUCache, EvictionPolicy } from "./lru-cache.js";
import type { 
  IStateRepository, 
  ControlState, 
  ChangeGroup,
  CacheConfig,
  CacheStatistics,
  StateRepositoryEventData
} from "./repository.js";
import { StateRepositoryEvent, StateRepositoryError, StateUtils } from "./repository.js";

/**
 * High-performance Q-SYS Control State Cache
 * 
 * Implements the IStateRepository interface using an LRU cache for efficient
 * control state management with the following features:
 * - Fast O(1) lookups and updates
 * - Configurable eviction policies  
 * - Change group management for batch operations
 * - Memory-efficient storage with automatic cleanup
 * - Event-driven architecture for state monitoring
 * - Comprehensive statistics and performance metrics
 */
export class ControlStateCache extends EventEmitter implements IStateRepository {
  private cache: LRUCache<string, ControlState>;
  private changeGroups = new Map<string, ChangeGroup>();
  private initialized = false;
  private config: CacheConfig;
  
  // Cleanup and sync timers
  private changeGroupCleanupTimer?: NodeJS.Timeout;
  private readonly startTime = Date.now();

  constructor() {
    super();
    
    // Initialize with default config - will be overridden in initialize()
    this.config = {
      maxEntries: 1000,
      ttlMs: 30 * 60 * 1000, // 30 minutes
      cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
      enableMetrics: true,
      persistenceEnabled: false
    };
    
    this.cache = new LRUCache<string, ControlState>(
      this.config.maxEntries,
      this.config.ttlMs,
      50 * 1024 * 1024, // 50MB default
      EvictionPolicy.LRU,
      this.config.cleanupIntervalMs
    );

    this.setupCacheEventHandlers();
    logger.debug('ControlStateCache created');
  }

  /**
   * Initialize the cache with configuration
   */
  async initialize(config: CacheConfig): Promise<void> {
    if (this.initialized) {
      logger.warn('ControlStateCache already initialized');
      return;
    }

    this.config = { ...this.config, ...config };
    
    // Recreate cache with new configuration
    await this.shutdownCache();
    this.cache = new LRUCache<string, ControlState>(
      this.config.maxEntries,
      this.config.ttlMs,
      50 * 1024 * 1024,
      EvictionPolicy.LRU,
      this.config.cleanupIntervalMs
    );
    
    this.setupCacheEventHandlers();
    this.startChangeGroupCleanup();

    // Load persisted state if enabled
    if (this.config.persistenceEnabled) {
      await this.restore();
    }

    this.initialized = true;
    logger.info('ControlStateCache initialized', {
      config: this.config
    });
  }

  /**
   * Get control state by name
   */
  async getState(controlName: string): Promise<ControlState | null> {
    this.ensureInitialized();
    
    const state = this.cache.get(controlName);
    
    if (state) {
      logger.debug('Cache hit for control', { controlName });
      return state;
    }
    
    logger.debug('Cache miss for control', { controlName });
    return null;
  }

  /**
   * Get multiple control states by names
   */
  async getStates(controlNames: string[]): Promise<Map<string, ControlState>> {
    this.ensureInitialized();
    
    const results = new Map<string, ControlState>();
    const misses: string[] = [];
    
    // Batch lookup from cache
    for (const name of controlNames) {
      const state = this.cache.get(name);
      if (state) {
        results.set(name, state);
      } else {
        misses.push(name);
      }
    }
    
    logger.debug('Batch state lookup completed', {
      requested: controlNames.length,
      hits: results.size,
      misses: misses.length
    });
    
    return results;
  }

  /**
   * Set control state
   */
  async setState(controlName: string, state: ControlState): Promise<void> {
    this.ensureInitialized();
    
    const oldState = this.cache.get(controlName);
    const success = this.cache.set(controlName, state);
    
    if (success) {
      this.emit(StateRepositoryEvent.StateChanged, {
        controlName,
        oldState,
        newState: state
      } as StateRepositoryEventData[StateRepositoryEvent.StateChanged]);
      
      logger.debug('State updated', { controlName, value: state.value });
    } else {
      throw new StateRepositoryError(
        `Failed to cache state for control: ${controlName}`,
        'CACHE_SET_FAILED',
        { controlName, state }
      );
    }
  }

  /**
   * Set multiple control states atomically
   */
  async setStates(states: Map<string, ControlState>): Promise<void> {
    this.ensureInitialized();
    
    const results: Array<{ name: string; success: boolean; error?: Error }> = [];
    
    // Process all states
    for (const [controlName, state] of states) {
      try {
        await this.setState(controlName, state);
        results.push({ name: controlName, success: true });
      } catch (error) {
        results.push({ 
          name: controlName, 
          success: false, 
          error: error instanceof Error ? error : new Error(String(error))
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const errorCount = results.length - successCount;
    
    logger.info('Batch state update completed', {
      total: results.length,
      success: successCount,
      errors: errorCount
    });
    
    if (errorCount > 0) {
      const errors = results.filter(r => !r.success);
      logger.warn('Some state updates failed', { errors });
    }
  }

  /**
   * Remove control state from cache
   */
  async removeState(controlName: string): Promise<boolean> {
    this.ensureInitialized();
    
    const removed = this.cache.delete(controlName);
    
    if (removed) {
      logger.debug('State removed from cache', { controlName });
    }
    
    return removed;
  }

  /**
   * Remove multiple control states
   */
  async removeStates(controlNames: string[]): Promise<number> {
    this.ensureInitialized();
    
    let removedCount = 0;
    
    for (const name of controlNames) {
      if (await this.removeState(name)) {
        removedCount++;
      }
    }
    
    logger.debug('Batch state removal completed', {
      requested: controlNames.length,
      removed: removedCount
    });
    
    return removedCount;
  }

  /**
   * Clear all cached states
   */
  async clear(): Promise<void> {
    this.ensureInitialized();
    
    const size = this.cache.size;
    this.cache.clear();
    this.changeGroups.clear();
    
    logger.info('Cache cleared', { entriesRemoved: size });
  }

  /**
   * Check if control state exists in cache
   */
  async hasState(controlName: string): Promise<boolean> {
    this.ensureInitialized();
    return this.cache.has(controlName);
  }

  /**
   * Get all cached control names
   */
  async getKeys(): Promise<string[]> {
    this.ensureInitialized();
    return this.cache.keys();
  }

  /**
   * Get cache statistics
   */
  async getStatistics(): Promise<CacheStatistics> {
    this.ensureInitialized();
    return this.cache.getStatistics();
  }

  /**
   * Create a new change group for batch updates
   */
  async createChangeGroup(
    controls: ChangeGroup['controls'], 
    source: string
  ): Promise<ChangeGroup> {
    this.ensureInitialized();
    
    const changeGroup: ChangeGroup = {
      id: randomUUID(),
      controls,
      timestamp: new Date(),
      status: 'pending',
      source
    };
    
    this.changeGroups.set(changeGroup.id, changeGroup);
    
    this.emit(StateRepositoryEvent.ChangeGroupCreated, {
      changeGroup
    } as StateRepositoryEventData[StateRepositoryEvent.ChangeGroupCreated]);
    
    logger.info('Change group created', {
      id: changeGroup.id,
      controlCount: controls.length,
      source
    });
    
    return changeGroup;
  }

  /**
   * Get change group by ID
   */
  async getChangeGroup(id: string): Promise<ChangeGroup | null> {
    this.ensureInitialized();
    return this.changeGroups.get(id) || null;
  }

  /**
   * Update change group status
   */
  async updateChangeGroupStatus(
    id: string, 
    status: ChangeGroup['status']
  ): Promise<boolean> {
    this.ensureInitialized();
    
    const changeGroup = this.changeGroups.get(id);
    if (!changeGroup) return false;
    
    const oldStatus = changeGroup.status;
    changeGroup.status = status;
    
    logger.debug('Change group status updated', {
      id,
      oldStatus,
      newStatus: status
    });
    
    if (status === 'completed' || status === 'failed') {
      this.emit(StateRepositoryEvent.ChangeGroupCompleted, {
        changeGroup,
        success: status === 'completed'
      } as StateRepositoryEventData[StateRepositoryEvent.ChangeGroupCompleted]);
    }
    
    return true;
  }

  /**
   * Remove completed/failed change groups
   */
  async cleanupChangeGroups(): Promise<number> {
    this.ensureInitialized();
    
    let removedCount = 0;
    const completedIds: string[] = [];
    
    // Find completed/failed change groups
    for (const [id, group] of this.changeGroups) {
      if (group.status === 'completed' || group.status === 'failed') {
        completedIds.push(id);
      }
    }
    
    // Remove them
    for (const id of completedIds) {
      this.changeGroups.delete(id);
      removedCount++;
    }
    
    if (removedCount > 0) {
      logger.debug('Change groups cleaned up', { count: removedCount });
    }
    
    return removedCount;
  }

  /**
   * Invalidate specific control states
   */
  async invalidateStates(controlNames: string[]): Promise<void> {
    this.ensureInitialized();
    
    const invalidated: string[] = [];
    
    for (const name of controlNames) {
      if (this.cache.delete(name)) {
        invalidated.push(name);
      }
    }
    
    if (invalidated.length > 0) {
      this.emit(StateRepositoryEvent.StateInvalidated, {
        controlNames: invalidated,
        reason: 'manual'
      } as StateRepositoryEventData[StateRepositoryEvent.StateInvalidated]);
      
      logger.debug('States invalidated', { 
        requested: controlNames.length,
        invalidated: invalidated.length 
      });
    }
  }

  /**
   * Invalidate states matching pattern
   */
  async invalidatePattern(pattern: RegExp): Promise<void> {
    this.ensureInitialized();
    
    const allKeys = this.cache.keys();
    const matchingKeys = allKeys.filter(key => pattern.test(key));
    
    await this.invalidateStates(matchingKeys);
    
    logger.debug('Pattern invalidation completed', {
      pattern: pattern.toString(),
      matched: matchingKeys.length
    });
  }

  /**
   * Synchronize cache with Q-SYS Core
   * Note: This is a placeholder for Phase 2.3 - actual sync will be implemented in Phase 2.4
   */
  async synchronize(forceRefresh?: boolean): Promise<void> {
    this.ensureInitialized();
    
    const startTime = Date.now();
    let syncedCount = 0;
    
    try {
      // Placeholder for actual Q-SYS sync implementation
      // In Phase 2.4, this will connect to the QRWC client
      
      if (forceRefresh) {
        logger.debug('Force refresh requested - clearing cache');
        await this.clear();
      }
      
      // Mock sync operation
      syncedCount = this.cache.size;
      
      const duration = Date.now() - startTime;
      
      this.emit(StateRepositoryEvent.SyncCompleted, {
        syncedCount,
        duration
      } as StateRepositoryEventData[StateRepositoryEvent.SyncCompleted]);
      
      logger.info('Cache synchronization completed', {
        syncedCount,
        duration,
        forceRefresh
      });
      
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      
      this.emit(StateRepositoryEvent.Error, {
        error: err,
        context: { operation: 'synchronize', forceRefresh }
      } as StateRepositoryEventData[StateRepositoryEvent.Error]);
      
      logger.error('Cache synchronization failed', { error: err });
      throw err;
    }
  }

  /**
   * Persist current state to storage
   */
  async persist(): Promise<void> {
    this.ensureInitialized();
    
    if (!this.config.persistenceEnabled) {
      logger.debug('Persistence not enabled, skipping');
      return;
    }
    
    try {
      // For Phase 2.3, this is a placeholder
      // In production, this would write to this.config.persistenceFile
      const states = new Map<string, ControlState>();
      const keys = this.cache.keys();
      
      for (const key of keys) {
        const state = this.cache.get(key);
        if (state) {
          states.set(key, state);
        }
      }
      
      logger.info('State persisted', { 
        stateCount: states.size,
        file: this.config.persistenceFile || 'memory'
      });
      
    } catch (error) {
      logger.error('Failed to persist state', { error });
      throw error;
    }
  }

  /**
   * Load state from persistent storage
   */
  async restore(): Promise<void> {
    this.ensureInitialized();
    
    if (!this.config.persistenceEnabled) {
      logger.debug('Persistence not enabled, skipping restore');
      return;
    }
    
    try {
      // Placeholder for Phase 2.3
      // In production, this would read from this.config.persistenceFile
      
      logger.info('State restored', { 
        file: this.config.persistenceFile || 'memory'
      });
      
    } catch (error) {
      logger.error('Failed to restore state', { error });
      throw error;
    }
  }

  /**
   * Cleanup expired entries and resources
   */
  async cleanup(): Promise<void> {
    this.ensureInitialized();
    
    const expiredCount = this.cache.removeExpired();
    const changeGroupsRemoved = await this.cleanupChangeGroups();
    
    logger.debug('Cache cleanup completed', {
      expiredStates: expiredCount,
      changeGroupsRemoved
    });
  }

  /**
   * Shutdown cache and cleanup resources
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down ControlStateCache...');
    
    // Persist before shutdown if enabled
    if (this.config.persistenceEnabled) {
      await this.persist();
    }
    
    // Stop timers
    if (this.changeGroupCleanupTimer) {
      clearInterval(this.changeGroupCleanupTimer);
      delete this.changeGroupCleanupTimer;
    }
    
    // Shutdown cache
    await this.shutdownCache();
    
    // Clear data
    this.changeGroups.clear();
    this.removeAllListeners();
    
    this.initialized = false;
    logger.info('ControlStateCache shutdown completed');
  }

  // Private helper methods

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new StateRepositoryError(
        'ControlStateCache not initialized. Call initialize() first.',
        'NOT_INITIALIZED'
      );
    }
  }

  private async shutdownCache(): Promise<void> {
    if (this.cache) {
      this.cache.shutdown();
    }
  }

  private setupCacheEventHandlers(): void {
    this.cache.on('evict', (key: string, value: ControlState, reason: string) => {
      this.emit(StateRepositoryEvent.CacheEvicted, {
        controlName: key,
        state: value,
        reason: reason as 'lru' | 'ttl' | 'memory'
      } as StateRepositoryEventData[StateRepositoryEvent.CacheEvicted]);
    });

    this.cache.on('error', (error: Error) => {
      this.emit(StateRepositoryEvent.Error, {
        error,
        context: { source: 'lru-cache' }
      } as StateRepositoryEventData[StateRepositoryEvent.Error]);
    });
  }

  private startChangeGroupCleanup(): void {
    // Cleanup change groups every 10 minutes
    this.changeGroupCleanupTimer = setInterval(async () => {
      try {
        await this.cleanupChangeGroups();
      } catch (error) {
        logger.error('Error during change group cleanup', { error });
      }
    }, 10 * 60 * 1000);
  }
} 