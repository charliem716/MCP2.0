import { globalLogger as logger } from '../../../shared/utils/logger.js';
import { StateRepositoryError, StateRepositoryEvent, type ControlState } from '../repository.js';
import type { CoreCache } from './core-cache.js';
import type { StatePersistenceManager } from '../persistence/manager.js';
import type { CacheInvalidationManager } from '../invalidation.js';
import type { StateSynchronizer } from '../synchronizer.js';

/**
 * Cache Synchronization and Persistence
 *
 * Handles cache synchronization, persistence, and invalidation operations
 */
export class CacheSyncManager {
  private invalidationManager: CacheInvalidationManager | undefined;
  private persistenceManager: StatePersistenceManager | undefined;
  private synchronizer: StateSynchronizer | undefined;

  constructor(private coreCache: CoreCache) {}

  /**
   * Set the invalidation manager
   */
  setInvalidationManager(manager: CacheInvalidationManager): void {
    this.invalidationManager = manager;
  }

  /**
   * Set the persistence manager
   */
  setPersistenceManager(manager: StatePersistenceManager): void {
    this.persistenceManager = manager;
  }

  /**
   * Set the synchronizer
   */
  setSynchronizer(synchronizer: StateSynchronizer): void {
    this.synchronizer = synchronizer;
  }

  /**
   * Invalidate specific control states
   */
  async invalidateStates(controlNames: string[]): Promise<void> {
    if (!this.invalidationManager) {
      logger.warn('Invalidation manager not configured');
      return Promise.resolve();
    }

    const invalidated: string[] = [];

    for (const name of controlNames) {
      if (this.coreCache.removeControl(name)) {
        invalidated.push(name);
      }
    }

    if (invalidated.length > 0) {
      logger.info('States invalidated', {
        requested: controlNames.length,
        invalidated: invalidated.length,
      });

      this.coreCache.emit(StateRepositoryEvent.StateInvalidated, {
        controlNames: invalidated,
        timestamp: new Date(),
      });
    }
    
    return Promise.resolve();
  }

  /**
   * Invalidate states matching a pattern
   */
  async invalidatePattern(pattern: string | RegExp): Promise<void> {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    const keys = this.coreCache.getKeys();
    const toInvalidate = keys.filter((key: string) => regex.test(key));

    await this.invalidateStates(toInvalidate);
  }

  /**
   * Synchronize cache with external source
   */
  async synchronize(source: 'qsys' | 'persistence'): Promise<void> {
    if (!this.synchronizer) {
      throw new StateRepositoryError(
        'Synchronizer not configured',
        'NOT_CONFIGURED'
      );
    }

    logger.info('Starting cache synchronization', { source });

    try {
      const startTime = Date.now();

      // Get current cache state
      const cacheStates = new Map<string, ControlState>();
      const keys = this.coreCache.getKeys();

      for (const key of keys) {
        const state = this.coreCache.getState(key);
        if (state) {
          cacheStates.set(key, state);
        }
      }

      // Perform synchronization
      const result = await this.synchronizer.synchronize(cacheStates, source);

      // Update cache with synchronized states
      if (result.updates.size > 0) {
        this.coreCache.setStates(result.updates);
      }

      const duration = Date.now() - startTime;
      logger.info('Cache synchronization completed', {
        source,
        duration,
        updates: result.updates.size,
        conflicts: result.conflicts.length,
      });
    } catch (error) {
      logger.error('Cache synchronization failed', { source, error });
      throw error;
    }
  }

  /**
   * Persist cache state
   */
  async persist(): Promise<void> {
    if (!this.persistenceManager) {
      logger.warn('Persistence not enabled');
      return;
    }

    try {
      const states = new Map<string, ControlState>();
      const keys = this.coreCache.getKeys();

      for (const key of keys) {
        const state = this.coreCache.getState(key);
        if (state) {
          states.set(key, state);
        }
      }

      await this.persistenceManager.saveState(states, {
        cacheConfig: this.coreCache.getCacheConfig(),
        timestamp: new Date(),
      });

      logger.info('Cache persisted', { stateCount: states.size });
    } catch (error) {
      logger.error('Cache persistence failed', { error });
      throw error;
    }
  }

  /**
   * Restore cache from persistence
   */
  async restore(): Promise<void> {
    if (!this.persistenceManager) {
      logger.warn('Persistence not enabled');
      return;
    }

    try {
      const states = await this.persistenceManager.loadState();

      if (states && states.size > 0) {
        this.coreCache.setStates(states);
        logger.info('Cache restored from persistence', {
          stateCount: states.size,
        });
      } else {
        logger.info('No persisted state to restore');
      }
    } catch (error) {
      logger.error('Cache restoration failed', { error });
      // Don't throw - cache can operate without restored state
    }
  }

  /**
   * Cleanup sync manager
   */
  cleanup(): void {
    this.invalidationManager = undefined;
    this.persistenceManager = undefined;
    this.synchronizer = undefined;
  }
}
