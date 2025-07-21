import { globalLogger as logger } from "../../../shared/utils/logger.js";
import type { 
  IStateRepository, 
  ControlState, 
  ChangeGroup,
  CacheConfig,
  CacheStatistics
} from "../repository.js";
import { CoreCache } from "./core-cache.js";
import { CacheChangeGroupManager } from "./change-groups.js";
import { CacheSyncManager } from "./cache-sync.js";
import type { CacheInvalidationManager } from "../invalidation.js";
import type { StatePersistenceManager } from "../persistence/index.js";
import type { StateSynchronizer } from "../synchronizer.js";

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
export class ControlStateCache extends CoreCache implements IStateRepository {
  private changeGroupManager: CacheChangeGroupManager;
  private cacheSyncManager: CacheSyncManager;

  constructor() {
    super();
    this.changeGroupManager = new CacheChangeGroupManager(this);
    this.cacheSyncManager = new CacheSyncManager(this);
    logger.debug('ControlStateCache created');
  }

  /**
   * Initialize the cache with configuration
   */
  override async initialize(config: CacheConfig): Promise<void> {
    await super.initialize(config);
    
    // Start change group cleanup
    this.changeGroupManager.startChangeGroupCleanup();

    // Load persisted state if enabled
    if (this.config.persistenceEnabled) {
      await this.restore();
    }
  }

  /**
   * Change Group Management Methods
   */
  async createChangeGroup(
    controls: Array<{ name: string; value: number | string | boolean; ramp?: number | undefined }>,
    source: string
  ): Promise<ChangeGroup> {
    // Convert undefined ramp to missing property for strict typing
    const strictControls = controls.map(c => {
      const control: { name: string; value: number | string | boolean; ramp?: number } = {
        name: c.name,
        value: c.value
      };
      if (c.ramp !== undefined) {
        control.ramp = c.ramp;
      }
      return control;
    });
    
    return this.changeGroupManager.createChangeGroup(strictControls, source);
  }

  async getChangeGroup(groupId: string): Promise<ChangeGroup | null> {
    return this.changeGroupManager.getChangeGroup(groupId);
  }

  async updateChangeGroupStatus(
    groupId: string, 
    status: 'pending' | 'applying' | 'completed' | 'failed'
  ): Promise<boolean> {
    return this.changeGroupManager.updateChangeGroupStatus(groupId, status);
  }

  async cleanupChangeGroups(): Promise<number> {
    return this.changeGroupManager.cleanupChangeGroups();
  }

  /**
   * Synchronization and Persistence Methods
   */
  async invalidateStates(controlNames: string[]): Promise<void> {
    return this.cacheSyncManager.invalidateStates(controlNames);
  }

  async invalidatePattern(pattern: RegExp): Promise<void> {
    return this.cacheSyncManager.invalidatePattern(pattern);
  }

  async synchronize(forceRefresh?: boolean): Promise<void> {
    return this.cacheSyncManager.synchronize(forceRefresh ? 'qsys' : 'persistence');
  }

  async persist(): Promise<void> {
    return this.cacheSyncManager.persist();
  }

  async restore(): Promise<void> {
    return this.cacheSyncManager.restore();
  }

  /**
   * Set external managers
   */
  setInvalidationManager(manager: CacheInvalidationManager): void {
    this.cacheSyncManager.setInvalidationManager(manager);
  }

  setPersistenceManager(manager: StatePersistenceManager): void {
    this.cacheSyncManager.setPersistenceManager(manager);
  }

  setSynchronizer(synchronizer: StateSynchronizer): void {
    this.cacheSyncManager.setSynchronizer(synchronizer);
  }

  /**
   * Lifecycle Management
   */
  async cleanup(): Promise<void> {
    logger.info('Starting cache cleanup');
    
    // Stop timers
    this.changeGroupManager.stopChangeGroupCleanup();
    
    // Clear change groups
    this.changeGroupManager.clearChangeGroups();
    
    // Cleanup sync manager
    this.cacheSyncManager.cleanup();
    
    logger.info('Cache cleanup completed');
  }

  async shutdown(): Promise<void> {
    logger.info('Starting cache shutdown');
    
    try {
      // Persist state if enabled
      if (this.config.persistenceEnabled) {
        await this.persist();
      }
      
      // Cleanup resources
      await this.cleanup();
      
      // Shutdown cache
      await this.shutdownCache();
      
      this.initialized = false;
      
      logger.info('Cache shutdown completed');
    } catch (error) {
      logger.error('Error during cache shutdown', { error });
      throw error;
    }
  }
}