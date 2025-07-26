import { EventEmitter } from 'events';
import { globalLogger as logger } from '../../../shared/utils/logger.js';
import { config as envConfig } from '../../../shared/utils/env.js';
import { LRUCache, EvictionPolicy } from '../lru-cache.js';
import type {
  IStateRepository,
  ControlState,
  ChangeGroup,
  CacheConfig,
  CacheStatistics,
  StateRepositoryEventData,
} from '../repository.js';
import {
  StateRepositoryEvent,
  StateRepositoryError,
  StateUtils,
} from '../repository.js';

/**
 * Core Control State Cache
 *
 * Provides basic cache operations and management for Q-SYS control states.
 * This is the core module that other cache modules extend.
 */
export class CoreCache extends EventEmitter {
  protected cache: LRUCache<string, ControlState>;
  protected changeGroups = new Map<string, ChangeGroup>();
  protected initialized = false;
  protected config: CacheConfig;
  protected readonly startTime = Date.now();

  constructor() {
    super();

    // Initialize with default config - will be overridden in initialize()
    this.config = {
      maxEntries: envConfig.cache.maxEntries,
      ttlMs: envConfig.cache.ttlMs,
      cleanupIntervalMs: envConfig.timeouts.cacheCleanupIntervalMs,
      enableMetrics: true,
      persistenceEnabled: false,
    };

    this.cache = new LRUCache<string, ControlState>(this.config.maxEntries);

    this.setupCacheEventHandlers();
    logger.debug('CoreCache created');
  }

  /**
   * Initialize the cache with configuration
   */
  async initialize(config: CacheConfig): Promise<void> {
    if (this.initialized) {
      logger.warn('CoreCache already initialized');
      return;
    }

    this.config = { ...this.config, ...config };

    // Recreate cache with new configuration
    await this.shutdownCache();
    this.cache = new LRUCache<string, ControlState>(this.config.maxEntries);

    this.setupCacheEventHandlers();

    this.initialized = true;
    logger.info('CoreCache initialized', {
      config: this.config,
    });
  }

  /**
   * Get control state by name
   */
  async getState(controlName: string): Promise<ControlState | null> {
    this.ensureInitialized();

    const state = this.cache.get(controlName);

    if (state) {
      logger.debug('Cache hit', { controlName });
    } else {
      logger.debug('Cache miss', { controlName });
    }

    return state ?? null;
  }

  /**
   * Get multiple control states
   */
  async getStates(controlNames: string[]): Promise<Map<string, ControlState>> {
    this.ensureInitialized();

    const results = new Map<string, ControlState>();
    let hits = 0;

    for (const name of controlNames) {
      const state = this.cache.get(name);
      if (state) {
        results.set(name, state);
        hits++;
      }
    }

    logger.debug('Batch get completed', {
      requested: controlNames.length,
      hits,
      misses: controlNames.length - hits,
    });

    return results;
  }

  /**
   * Set control state
   */
  async setState(controlName: string, state: ControlState): Promise<void> {
    this.ensureInitialized();

    const oldState = this.cache.get(controlName);
    this.cache.set(controlName, state);

    logger.debug('State updated', { controlName });

    // Emit update event
    this.emit(StateRepositoryEvent.StateChanged, {
      controlName,
      oldState,
      newState: state,
    } as StateRepositoryEventData[StateRepositoryEvent.StateChanged]);
  }

  /**
   * Set multiple control states
   */
  async setStates(states: Map<string, ControlState>): Promise<void> {
    this.ensureInitialized();

    for (const [name, state] of states) {
      const oldState = this.cache.get(name);
      this.cache.set(name, state);

      // Emit individual state change events
      this.emit(StateRepositoryEvent.StateChanged, {
        controlName: name,
        oldState,
        newState: state,
      } as StateRepositoryEventData[StateRepositoryEvent.StateChanged]);
    }

    logger.debug('Batch update completed', { count: states.size });
  }

  /**
   * Remove control state
   */
  async removeState(controlName: string): Promise<boolean> {
    this.ensureInitialized();

    const removed = this.cache.delete(controlName);

    if (removed) {
      logger.debug('State removed', { controlName });
    }

    return removed;
  }

  /**
   * Remove multiple control states
   */
  async removeStates(controlNames: string[]): Promise<number> {
    this.ensureInitialized();

    let removed = 0;

    for (const name of controlNames) {
      if (this.cache.delete(name)) {
        removed++;
      }
    }

    logger.debug('Batch remove completed', {
      requested: controlNames.length,
      removed,
    });

    return removed;
  }

  /**
   * Clear all states
   */
  async clear(): Promise<void> {
    this.ensureInitialized();

    const size = this.cache.size;
    this.cache.clear();

    logger.info('Cache cleared', { removedEntries: size });
  }

  /**
   * Check if state exists
   */
  async hasState(controlName: string): Promise<boolean> {
    this.ensureInitialized();
    return this.cache.has(controlName);
  }

  /**
   * Remove a specific control from cache
   * @internal For use by CacheSyncManager
   */
  async removeControl(controlName: string): Promise<boolean> {
    this.ensureInitialized();
    return this.cache.delete(controlName);
  }

  /**
   * Get the current cache configuration
   * @internal For use by CacheSyncManager
   */
  getCacheConfig(): CacheConfig {
    return this.config;
  }

  /**
   * Get all control names
   */
  async getKeys(): Promise<string[]> {
    this.ensureInitialized();
    return this.cache.keys();
  }

  /**
   * Get cache statistics
   */
  async getStatistics(): Promise<CacheStatistics> {
    return this.cache.getStatistics();
  }

  /**
   * Ensure cache is initialized
   */
  protected ensureInitialized(): void {
    if (!this.initialized) {
      throw new StateRepositoryError(
        'Cache not initialized. Call initialize() first.',
        'NOT_INITIALIZED'
      );
    }
  }

  /**
   * Shutdown cache cleanly
   */
  protected async shutdownCache(): Promise<void> {
    if (this.cache) {
      this.cache.shutdown();
    }
  }

  /**
   * Setup cache event handlers
   */
  protected setupCacheEventHandlers(): void {
    this.cache.on('eviction', (key: string, value: ControlState) => {
      logger.debug('Control evicted from cache', { controlName: key });
      this.emit(StateRepositoryEvent.CacheEvicted, {
        controlName: key,
        state: value,
        timestamp: new Date(),
      });
    });

    this.cache.on('expiration', (key: string, value: ControlState) => {
      logger.debug('Control expired in cache', { controlName: key });
      // Handle expiration if needed
    });
  }
}
