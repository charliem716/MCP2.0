import { createLogger } from '../shared/utils/logger.js';
import type {
  QSysChangeGroup,
  QSysChangeGroupWithMeta,
  ChangeGroupManagerConfig,
  ChangeGroupPersistence,
  ChangeGroupMetrics,
  ChangeGroupCreateOptions
} from '../shared/types/qsys.js';

/**
 * Change Group Manager with TTL, cleanup, and memory management
 * Follows QRWC patterns from Q-SYS documentation for efficient change group handling
 */
export class ChangeGroupManager {
  private readonly logger = createLogger('ChangeGroupManager');
  private readonly changeGroups = new Map<string, QSysChangeGroupWithMeta>();
  private readonly config: ChangeGroupManagerConfig;
  private cleanupTimer: NodeJS.Timeout | undefined = undefined;
  private persistence: ChangeGroupPersistence | undefined;

  constructor(
    config: Partial<ChangeGroupManagerConfig> = {},
    persistence?: ChangeGroupPersistence
  ) {
    this.config = {
      maxChangeGroups: config.maxChangeGroups ?? 1000,
      defaultTtl: config.defaultTtl ?? 3600000, // 1 hour
      cleanupInterval: config.cleanupInterval ?? 300000, // 5 minutes
      enablePersistence: config.enablePersistence ?? false
    };
    
    this.persistence = persistence;
    this.startCleanupTimer();
    
    this.logger.info('ChangeGroupManager initialized', {
      maxGroups: this.config.maxChangeGroups,
      defaultTtl: this.config.defaultTtl,
      cleanupInterval: this.config.cleanupInterval,
      persistenceEnabled: this.config.enablePersistence
    });
  }

  /**
   * Create a new change group with lifecycle management
   */
  async createChangeGroup(
    id: string,
    controls: Array<{ control: string; component?: string }>,
    options: ChangeGroupCreateOptions = {}
  ): Promise<QSysChangeGroup> {
    // Check if group already exists
    if (this.changeGroups.has(id)) {
      this.logger.warn('Change group already exists, updating', { id });
      const existing = this.changeGroups.get(id);
      if (existing) {
        existing.controls = controls;
        existing.lastAccessed = Date.now();
        existing.accessCount++;
        return this.toPublicGroup(existing);
      }
    }

    // Check memory limits and evict if necessary
    if (this.changeGroups.size >= this.config.maxChangeGroups) {
      await this.evictLeastRecentlyUsed();
    }

    const now = Date.now();
    const changeGroup: QSysChangeGroupWithMeta = {
      id,
      controls,
      autoPoll: options.autoPoll ?? false,
      createdAt: now,
      lastAccessed: now,
      ttl: options.ttl ?? this.config.defaultTtl,
      accessCount: 1,
      ...(options.pollRate !== undefined && { pollRate: options.pollRate })
    };

    this.changeGroups.set(id, changeGroup);
    
    // Persist if enabled
    if (this.config.enablePersistence && this.persistence) {
      try {
        await this.persistence.save(this.changeGroups);
      } catch (error) {
        this.logger.error('Failed to persist change groups', { error, id });
      }
    }

    this.logger.debug('Change group created', {
      id,
      controlCount: controls.length,
      ttl: changeGroup.ttl,
      totalGroups: this.changeGroups.size
    });

    return this.toPublicGroup(changeGroup);
  }

  /**
   * Get change group and update access time
   */
  getChangeGroup(id: string): QSysChangeGroup | undefined {
    const group = this.changeGroups.get(id);
    if (group) {
      group.lastAccessed = Date.now();
      group.accessCount++;
      return this.toPublicGroup(group);
    }
    return undefined;
  }

  /**
   * Delete change group
   */
  async deleteChangeGroup(id: string): Promise<boolean> {
    const deleted = this.changeGroups.delete(id);
    
    if (deleted) {
      // Persist if enabled
      if (this.config.enablePersistence && this.persistence) {
        try {
          await this.persistence.save(this.changeGroups);
        } catch (error) {
          this.logger.error('Failed to persist after delete', { error, id });
        }
      }
      
      this.logger.debug('Change group deleted', { id, remainingGroups: this.changeGroups.size });
    }
    
    return deleted;
  }

  /**
   * Get all change groups
   */
  getAllChangeGroups(): QSysChangeGroup[] {
    return Array.from(this.changeGroups.values()).map(group => {
      group.lastAccessed = Date.now();
      group.accessCount++;
      return this.toPublicGroup(group);
    });
  }

  /**
   * Get change group count
   */
  getChangeGroupCount(): number {
    return this.changeGroups.size;
  }

  /**
   * Get change group metrics
   */
  getMetrics(): ChangeGroupMetrics {
    const groups = Array.from(this.changeGroups.values());
    const now = Date.now();
    
    const totalAccesses = groups.reduce((sum, group) => sum + group.accessCount, 0);
    const averageGroupSize = groups.length > 0 
      ? groups.reduce((sum, group) => sum + group.controls.length, 0) / groups.length 
      : 0;
    const oldestGroupAge = groups.length > 0 
      ? Math.max(...groups.map(group => now - group.createdAt))
      : 0;
    
    // Estimate memory usage (rough calculation)
    const memoryUsageBytes = groups.reduce((sum, group) => {
      const groupSize = JSON.stringify(group).length * 2; // Rough Unicode estimate
      return sum + groupSize;
    }, 0);

    return {
      totalGroups: groups.length,
      activeGroups: groups.filter(group => group.autoPoll).length,
      totalAccesses,
      averageGroupSize: Math.round(averageGroupSize * 100) / 100,
      oldestGroupAge,
      memoryUsageBytes
    };
  }

  /**
   * Clean up stale change groups based on TTL
   */
  cleanupStaleChangeGroups(): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [id, group] of this.changeGroups) {
      if (group.ttl && now - group.lastAccessed > group.ttl) {
        this.changeGroups.delete(id);
        cleaned++;
        this.logger.debug('Cleaned up stale change group', {
          id,
          age: now - group.lastAccessed,
          ttl: group.ttl
        });
      }
    }

    if (cleaned > 0) {
      this.logger.info('Cleanup completed', { cleaned, remaining: this.changeGroups.size });
    }

    return cleaned;
  }

  /**
   * Evict least recently used change group to make room for new ones
   */
  private async evictLeastRecentlyUsed(): Promise<void> {
    if (this.changeGroups.size === 0) return;

    let oldestGroup: QSysChangeGroupWithMeta | null = null;
    let oldestId = '';

    // Find the least recently used group
    for (const [id, group] of this.changeGroups) {
      if (!oldestGroup || group.lastAccessed < oldestGroup.lastAccessed) {
        oldestGroup = group;
        oldestId = id;
      }
    }

    if (oldestId) {
      await this.deleteChangeGroup(oldestId);
      this.logger.info('Evicted least recently used change group', {
        id: oldestId,
        lastAccessed: oldestGroup?.lastAccessed,
        age: oldestGroup ? Date.now() - oldestGroup.lastAccessed : 0
      });
    }
  }

  /**
   * Load change groups from persistence
   */
  async loadFromPersistence(): Promise<void> {
    if (!this.persistence) {
      this.logger.warn('No persistence configured, cannot load');
      return;
    }

    try {
      const savedGroups = await this.persistence.load();
      const now = Date.now();
      
      // Filter out expired groups during load
      for (const [id, group] of savedGroups) {
        if (!group.ttl || now - group.lastAccessed <= group.ttl) {
          this.changeGroups.set(id, group);
        }
      }
      
      this.logger.info('Loaded change groups from persistence', {
        loaded: this.changeGroups.size,
        total: savedGroups.size
      });
    } catch (error) {
      this.logger.error('Failed to load from persistence', { error });
    }
  }

  /**
   * Clear all change groups
   */
  async clearAllChangeGroups(): Promise<void> {
    const count = this.changeGroups.size;
    this.changeGroups.clear();
    
    if (this.config.enablePersistence && this.persistence) {
      try {
        await this.persistence.clear();
      } catch (error) {
        this.logger.error('Failed to clear persistence', { error });
      }
    }
    
    this.logger.info('Cleared all change groups', { count });
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleChangeGroups();
    }, this.config.cleanupInterval);
  }

  /**
   * Stop automatic cleanup and close the manager
   */
  async dispose(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Final persistence save if enabled
    if (this.config.enablePersistence && this.persistence && this.changeGroups.size > 0) {
      try {
        await this.persistence.save(this.changeGroups);
        this.logger.info('Final persistence save completed');
      } catch (error) {
        this.logger.error('Failed final persistence save', { error });
      }
    }

    this.logger.info('ChangeGroupManager disposed');
  }

  /**
   * Convert internal group to public interface (removes metadata)
   */
  private toPublicGroup(group: QSysChangeGroupWithMeta): QSysChangeGroup {
    const publicGroup: QSysChangeGroup = {
      id: group.id,
      controls: group.controls,
      autoPoll: group.autoPoll
    };
    
    if (group.pollRate !== undefined) {
      publicGroup.pollRate = group.pollRate;
    }
    
    return publicGroup;
  }
} 