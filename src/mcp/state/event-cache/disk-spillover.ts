/**
 * Disk Spillover Manager for Event Cache
 *
 * Handles spilling events to disk when memory limits are reached
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { CachedEvent, EventCacheConfig } from './manager.js';
import { globalLogger as logger } from '../../../shared/utils/logger.js';
import { isSpilledEventFile, type SpilledEventFile } from './types.js';

export class DiskSpilloverManager {
  private spilloverPath: string;
  private maxSpilloverSizeMB: number;
  private spilloverFileIndex = 0;
  private initialized = false;

  constructor(config: EventCacheConfig) {
    this.spilloverPath =
      config.diskSpilloverConfig?.directory ?? './event-cache-spillover';
    this.maxSpilloverSizeMB = config.diskSpilloverConfig?.maxFileSizeMB ?? 1000;
  }

  /**
   * Initialize spillover directory
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.spilloverPath, { recursive: true });
      this.initialized = true;
      logger.info('Spillover directory initialized', {
        path: this.spilloverPath,
      });
    } catch (error) {
      logger.error('Failed to create spillover directory', {
        error,
        path: this.spilloverPath,
      });
      throw error;
    }
  }

  /**
   * Spill events to disk
   */
  async spillToDisk(groupId: string, events: CachedEvent[]): Promise<boolean> {
    if (events.length === 0) return false;

    await this.ensureInitialized();

    const filename = `${groupId}_${Date.now()}_${this.spilloverFileIndex++}.json`;
    const filepath = path.join(this.spilloverPath, filename);

    const firstEvent = events[0];
    const lastEvent = events[events.length - 1];
    
    if (!firstEvent || !lastEvent) {
      logger.warn('Cannot spill empty events array', { groupId });
      return false;
    }
    
    const spillData = {
      groupId,
      timestamp: Date.now(),
      eventCount: events.length,
      startTime: firstEvent.timestampMs,
      endTime: lastEvent.timestampMs,
      events: events.map(e => ({
        ...e,
        timestamp: e.timestamp.toString(),
      })),
    };

    try {
      await fs.mkdir(this.spilloverPath, { recursive: true });
      await fs.writeFile(filepath, JSON.stringify(spillData));

      logger.info('Spilled events to disk', {
        groupId,
        eventCount: events.length,
        filename,
        sizeKB: JSON.stringify(spillData).length / 1024,
      });

      return true;
    } catch (error) {
      logger.error('Failed to spill events to disk', {
        error,
        groupId,
        eventCount: events.length,
      });
      return false;
    }
  }

  /**
   * Load events from disk for a time range
   */
  async loadFromDisk(
    groupId: string,
    startTime?: number,
    endTime?: number
  ): Promise<CachedEvent[]> {
    try {
      await fs.mkdir(this.spilloverPath, { recursive: true });
      const files = await fs.readdir(this.spilloverPath);
      const groupFiles = files.filter(
        f => f.startsWith(`${groupId}_`) && f.endsWith('.json')
      );

      const allEvents: CachedEvent[] = [];

      for (const file of groupFiles) {
        try {
          const filepath = path.join(this.spilloverPath, file);
          const content = await fs.readFile(filepath, 'utf-8');
          const data = JSON.parse(content) as unknown;

          if (!isSpilledEventFile(data)) {
            logger.warn('Invalid spillover file format', { file });
            continue;
          }

          if (startTime && data.endTime < startTime) continue;
          if (endTime && data.startTime > endTime) continue;

          const events: CachedEvent[] = data.events
            .map(
              e =>
                ({
                  ...e,
                  timestamp: BigInt(e.timestamp),
                }) as CachedEvent
            )
            .filter(e => {
              if (startTime && e.timestampMs < startTime) return false;
              if (endTime && e.timestampMs > endTime) return false;
              return true;
            });

          allEvents.push(...events);
        } catch (error) {
          logger.error('Failed to read spillover file', { error, file });
        }
      }

      return allEvents.sort((a, b) => Number(a.timestamp - b.timestamp));
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== 'ENOENT') {
        logger.error('Failed to load from disk', { error, groupId });
      }
      return [];
    }
  }

  /**
   * Get spillover statistics
   */
  async getSpilloverStats(): Promise<{
    fileCount: number;
    totalSizeMB: number;
    oldestFile?: string;
  }> {
    try {
      const files = await fs.readdir(this.spilloverPath);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      let totalSize = 0;
      let oldestTime = Date.now();
      let oldestFile: string | undefined;

      for (const file of jsonFiles) {
        const filepath = path.join(this.spilloverPath, file);
        const stat = await fs.stat(filepath);
        totalSize += stat.size;

        if (stat.mtimeMs < oldestTime) {
          oldestTime = stat.mtimeMs;
          oldestFile = file;
        }
      }

      return {
        fileCount: jsonFiles.length,
        totalSizeMB: totalSize / (1024 * 1024),
        ...(oldestFile && { oldestFile }),
      };
    } catch (error) {
      return {
        fileCount: 0,
        totalSizeMB: 0,
      };
    }
  }

  /**
   * Clean up old spillover files
   */
  async cleanupOldFiles(maxAgeDays = 7): Promise<number> {
    try {
      const files = await fs.readdir(this.spilloverPath);
      const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
      const now = Date.now();
      let deletedCount = 0;

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filepath = path.join(this.spilloverPath, file);
        const stat = await fs.stat(filepath);

        if (now - stat.mtimeMs > maxAgeMs) {
          await fs.unlink(filepath);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        logger.info('Cleaned up old spillover files', { deletedCount });
      }

      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup spillover files', { error });
      return 0;
    }
  }
}
