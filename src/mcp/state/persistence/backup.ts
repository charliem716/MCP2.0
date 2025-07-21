import { promises as fs } from "fs";
import { join, extname } from "path";
import { globalLogger as logger } from "../../../shared/utils/logger.js";
import type { PersistedState } from "./types.js";
import type { ControlState } from "../repository.js";

/**
 * Backup Manager for State Persistence
 * 
 * Handles backup creation, cleanup, and recovery operations
 */
export class BackupManager {
  constructor(
    private readonly filePath: string,
    private readonly backupCount: number
  ) {}

  /**
   * Create a backup of the current state file
   */
  async createBackup(): Promise<void> {
    try {
      const exists = await this.fileExists(this.filePath);
      if (!exists) {
        logger.debug('No state file to backup');
        return;
      }

      const backupPath = this.getBackupPath(this.filePath);
      await fs.copyFile(this.filePath, backupPath);
      logger.debug('Backup created', { backupPath });

      // Cleanup old backups
      await this.cleanupOldBackups();
    } catch (error) {
      logger.error('Failed to create backup', { error });
      throw error;
    }
  }

  /**
   * Cleanup old backups keeping only the most recent ones
   */
  async cleanupOldBackups(): Promise<void> {
    try {
      const backups = await this.getBackupsSortedByTime();
      
      // Keep only the configured number of backups
      const backupsToDelete = backups.slice(this.backupCount);
      
      for (const backup of backupsToDelete) {
        await fs.unlink(backup);
        logger.debug('Old backup deleted', { backup });
      }
    } catch (error) {
      logger.error('Failed to cleanup old backups', { error });
      // Don't throw - this is not critical
    }
  }

  /**
   * Get list of backup files sorted by modification time (newest first)
   */
  async getBackupsSortedByTime(): Promise<string[]> {
    try {
      const dir = this.getDirectory(this.filePath);
      const files = await fs.readdir(dir);
      
      // Filter backup files
      const ext = extname(this.filePath);
      const baseFile = this.getBasename(this.filePath);
      const backupPattern = new RegExp(`^${baseFile}\\.\\d{8}-\\d{6}${ext}$`);
      
      const backupFiles = files
        .filter(file => backupPattern.test(file))
        .map(file => join(dir, file));
      
      // Sort by modification time (newest first)
      const filesWithStats = await Promise.all(
        backupFiles.map(async file => ({
          file,
          mtime: (await fs.stat(file)).mtime.getTime()
        }))
      );
      
      return filesWithStats
        .sort((a, b) => b.mtime - a.mtime)
        .map(f => f.file);
    } catch (error) {
      logger.error('Failed to get backup files', { error });
      return [];
    }
  }

  /**
   * Get the most recent backup file
   */
  async getMostRecentBackup(): Promise<string | null> {
    try {
      const backups = await this.getBackupsSortedByTime();
      if (backups.length === 0) {
        logger.debug('No backups found');
        return null;
      }
      
      logger.debug('Most recent backup found', { backup: backups[0] });
      return backups[0] || null;
    } catch (error) {
      logger.error('Failed to get most recent backup', { error });
      return null;
    }
  }

  /**
   * Clear all backup files
   */
  async clearBackups(): Promise<void> {
    try {
      const backups = await this.getBackupsSortedByTime();
      
      for (const backup of backups) {
        await fs.unlink(backup);
        logger.debug('Backup cleared', { backup });
      }
      
      logger.info('All backups cleared', { count: backups.length });
    } catch (error) {
      logger.error('Failed to clear backups', { error });
      throw error;
    }
  }

  /**
   * Recover state from the most recent backup
   */
  async recoverFromBackup(
    readJSON: (path: string) => Promise<PersistedState>,
    validateState: (state: unknown) => void
  ): Promise<Map<string, ControlState> | null> {
    const backupPath = await this.getMostRecentBackup();
    if (!backupPath) {
      logger.warn('No backup available for recovery');
      return null;
    }

    try {
      logger.info('Attempting recovery from backup', { backupPath });
      
      const state = await readJSON(backupPath);
      validateState(state);
      
      // Convert to Map
      const stateMap = new Map<string, ControlState>();
      for (const [key, value] of Object.entries(state.controls)) {
        stateMap.set(key, value);
      }
      
      logger.info('State recovered from backup', {
        backupPath,
        controlCount: stateMap.size
      });
      
      return stateMap;
    } catch (error) {
      logger.error('Failed to recover from backup', { error, backupPath });
      return null;
    }
  }

  /**
   * Generate backup filename with timestamp
   */
  private getBackupPath(filePath: string): string {
    const dir = this.getDirectory(filePath);
    const ext = extname(filePath);
    const base = this.getBasename(filePath);
    const timestamp = new Date().toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '-')
      .slice(0, 15); // YYYYMMDD-HHMMSS
    
    return join(dir, `${base}.${timestamp}${ext}`);
  }

  /**
   * Helper methods
   */
  private async fileExists(path: string): Promise<boolean> {
    try {
      await fs.stat(path);
      return true;
    } catch {
      return false;
    }
  }

  private getDirectory(filePath: string): string {
    const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    return lastSlash > 0 ? filePath.slice(0, lastSlash) : '.';
  }

  private getBasename(filePath: string): string {
    const dir = this.getDirectory(filePath);
    const filename = filePath.slice(dir.length + 1);
    const ext = extname(filename);
    return ext ? filename.slice(0, -ext.length) : filename;
  }
}