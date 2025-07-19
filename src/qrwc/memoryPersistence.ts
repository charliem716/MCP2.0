import { createLogger } from '../shared/utils/logger.js';
import type { 
  ChangeGroupPersistence,
  QSysChangeGroupWithMeta 
} from '../shared/types/qsys.js';

/**
 * In-memory persistence implementation for change groups
 * This is a demonstration implementation - in production, use file system or database
 */
export class MemoryPersistence implements ChangeGroupPersistence {
  private readonly logger = createLogger('MemoryPersistence');
  private storage = new Map<string, QSysChangeGroupWithMeta>();

  /**
   * Save change groups to memory storage
   */
  async save(groups: Map<string, QSysChangeGroupWithMeta>): Promise<void> {
    this.storage.clear();
    
    for (const [id, group] of groups) {
      // Deep clone to prevent reference issues
      this.storage.set(id, JSON.parse(JSON.stringify(group)) as QSysChangeGroupWithMeta);
    }
    
    this.logger.debug('Change groups saved to memory', { count: groups.size });
    await Promise.resolve();
  }

  /**
   * Load change groups from memory storage
   */
  async load(): Promise<Map<string, QSysChangeGroupWithMeta>> {
    const groups = new Map<string, QSysChangeGroupWithMeta>();
    
    for (const [id, group] of this.storage) {
      // Deep clone to prevent reference issues
      groups.set(id, JSON.parse(JSON.stringify(group)) as QSysChangeGroupWithMeta);
    }
    
    this.logger.debug('Change groups loaded from memory', { count: groups.size });
    await Promise.resolve();
    return groups;
  }

  /**
   * Clear all stored change groups
   */
  async clear(): Promise<void> {
    const count = this.storage.size;
    this.storage.clear();
    this.logger.debug('Memory storage cleared', { count });
    await Promise.resolve();
  }

  /**
   * Get current storage size
   */
  getStorageSize(): number {
    return this.storage.size;
  }

  /**
   * Get storage keys
   */
  getStorageKeys(): string[] {
    return Array.from(this.storage.keys());
  }
} 