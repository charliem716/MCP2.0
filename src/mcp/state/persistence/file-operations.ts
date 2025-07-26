import { promises as fs } from 'fs';
import { dirname } from 'path';
import { globalLogger as logger } from '../../../shared/utils/logger.js';
import type { PersistedState, PersistenceConfig } from './types.js';

/**
 * File Operations for State Persistence
 *
 * Handles low-level file I/O operations with atomic writes and JSON formatting
 */
export class FileOperations {
  constructor(private readonly config: PersistenceConfig) {}

  /**
   * Write state to JSON file
   */
  async writeJSON(state: PersistedState): Promise<void> {
    const content = this.config.pretty
      ? JSON.stringify(state, null, 2)
      : JSON.stringify(state);

    if (this.config.atomicWrites) {
      await this.writeAtomic(content);
    } else {
      await fs.writeFile(this.config.filePath, content, 'utf8');
    }
  }

  /**
   * Read state from JSON file
   */
  async readJSON(): Promise<PersistedState> {
    const content = await fs.readFile(this.config.filePath, 'utf8');
    return JSON.parse(content);
  }

  /**
   * Read state from specific file path (for backup recovery)
   */
  async readJSONFromPath(path: string): Promise<PersistedState> {
    const content = await fs.readFile(path, 'utf8');
    return JSON.parse(content);
  }

  /**
   * Write file atomically by writing to temp file then renaming
   */
  private async writeAtomic(content: string): Promise<void> {
    const tempPath = `${this.config.filePath}.tmp`;

    try {
      // Ensure directory exists
      await this.ensureDirectory(dirname(this.config.filePath));

      // Write to temp file
      await fs.writeFile(tempPath, content, 'utf8');

      // Rename temp file to actual file (atomic operation)
      await fs.rename(tempPath, this.config.filePath);
    } catch (error) {
      // Try to cleanup temp file on error
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(path: string): Promise<boolean> {
    try {
      await fs.stat(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file size in bytes
   */
  async getFileSize(path: string): Promise<number> {
    try {
      const stats = await fs.stat(path);
      return stats.size;
    } catch {
      return 0;
    }
  }

  /**
   * Ensure directory exists, create if not
   */
  async ensureDirectory(dir: string): Promise<void> {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create directory', { dir, error });
      throw error;
    }
  }

  /**
   * Delete file
   */
  async deleteFile(path: string): Promise<void> {
    await fs.unlink(path);
  }
}
