import { randomUUID } from 'crypto';
import { globalLogger as logger } from '../../../shared/utils/logger.js';
import type { ChangeGroup, ControlState, StateRepositoryError, StateRepositoryEvent } from '../repository.js';
import type { CoreCache } from './core-cache.js';

/**
 * Cache Change Group Manager
 *
 * Handles change group operations specifically for cache layer batch control updates.
 * This is a lightweight implementation for cache-specific operations, distinct from
 * the transaction-based ChangeGroupManager in the state management layer.
 */
export class CacheChangeGroupManager {
  private changeGroups = new Map<string, ChangeGroup>();
  private changeGroupCleanupTimer?: NodeJS.Timeout;

  constructor(private coreCache: CoreCache) {}

  /**
   * Create a new change group for batch operations
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
      id: randomUUID(),
      controls,
      timestamp: new Date(),
      status: 'pending',
      source,
    };

    this.changeGroups.set(changeGroup.id, changeGroup);

    logger.info('Change group created', {
      groupId: changeGroup.id,
      controlCount: controls.length,
    });

    this.coreCache.emit(StateRepositoryEvent.ChangeGroupCreated, {
      changeGroup,
      timestamp: new Date(),
    });

    return changeGroup;
  }

  /**
   * Get change group by ID
   */
  async getChangeGroup(groupId: string): Promise<ChangeGroup | null> {
    return this.changeGroups.get(groupId) || null;
  }

  /**
   * Update change group status
   */
  async updateChangeGroupStatus(
    groupId: string,
    status: 'pending' | 'applying' | 'completed' | 'failed'
  ): Promise<boolean> {
    const group = this.changeGroups.get(groupId);
    if (!group) {
      return false;
    }

    group.status = status;

    logger.info('Change group status updated', {
      groupId,
      status,
    });

    return true;
  }

  /**
   * Clean up old change groups
   */
  async cleanupChangeGroups(): Promise<number> {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    let cleaned = 0;

    for (const [id, group] of this.changeGroups) {
      const age = now - group.timestamp.getTime();
      if (
        age > maxAge &&
        (group.status === 'completed' || group.status === 'failed')
      ) {
        this.changeGroups.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('Change groups cleaned up', { count: cleaned });
    }

    return cleaned;
  }

  /**
   * Start change group cleanup timer
   */
  startChangeGroupCleanup(intervalMs: number = 60 * 60 * 1000): void {
    if (this.changeGroupCleanupTimer) {
      return;
    }

    this.changeGroupCleanupTimer = setInterval(() => {
      this.cleanupChangeGroups().catch(error => {
        logger.error('Change group cleanup failed', { error });
      });
    }, intervalMs);
  }

  /**
   * Stop change group cleanup timer
   */
  stopChangeGroupCleanup(): void {
    if (this.changeGroupCleanupTimer) {
      clearInterval(this.changeGroupCleanupTimer);
      delete this.changeGroupCleanupTimer;
    }
  }

  /**
   * Get all change groups
   */
  getChangeGroups(): Map<string, ChangeGroup> {
    return new Map(this.changeGroups);
  }

  /**
   * Clear all change groups
   */
  clearChangeGroups(): void {
    this.changeGroups.clear();
  }
}
