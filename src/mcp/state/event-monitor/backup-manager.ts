/**
 * SQLite Database Backup Manager
 * 
 * Provides automated backup, restore, and data export functionality
 * for the event monitoring SQLite database.
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { globalLogger as logger } from '../../../shared/utils/logger.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export interface BackupConfig {
  backupPath?: string;
  maxBackups?: number;
  compressionEnabled?: boolean;
  autoBackupInterval?: number; // in milliseconds, 0 to disable
}

export interface BackupInfo {
  filename: string;
  path: string;
  size: number;
  compressed: boolean;
  createdAt: Date;
  eventsCount?: number;
}

export class EventDatabaseBackupManager {
  private config: Required<BackupConfig>;
  private autoBackupTimer?: NodeJS.Timeout;
  private currentDbPath?: string;
  
  constructor(config?: BackupConfig) {
    this.config = {
      backupPath: config?.backupPath ?? process.env['EVENT_BACKUP_PATH'] ?? './data/backups',
      maxBackups: config?.maxBackups ?? parseInt(process.env['EVENT_MAX_BACKUPS'] ?? '7', 10),
      compressionEnabled: config?.compressionEnabled !== false,
      autoBackupInterval: config?.autoBackupInterval ?? parseInt(process.env['EVENT_BACKUP_INTERVAL'] || '86400000', 10), // 24 hours default
    };
  }
  
  /**
   * Initialize backup manager and create backup directory
   */
  async initialize(dbPath: string): Promise<void> {
    this.currentDbPath = dbPath;
    
    // Ensure backup directory exists
    if (!fs.existsSync(this.config.backupPath)) {
      fs.mkdirSync(this.config.backupPath, { recursive: true });
      logger.info('Created backup directory', { path: this.config.backupPath });
    }
    
    // Start auto-backup if configured
    if (this.config.autoBackupInterval > 0) {
      this.startAutoBackup();
    }
    
    logger.info('Backup manager initialized', {
      backupPath: this.config.backupPath,
      maxBackups: this.config.maxBackups,
      compression: this.config.compressionEnabled,
      autoBackupInterval: this.config.autoBackupInterval
    });
  }
  
  /**
   * Perform a backup of the database
   */
  async performBackup(dbPath?: string): Promise<BackupInfo> {
    const sourcePath = dbPath ?? this.currentDbPath;
    if (!sourcePath || sourcePath === ':memory:') {
      throw new Error('Cannot backup in-memory database');
    }
    
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Database file not found: ${sourcePath}`);
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilename = `events-backup-${timestamp}.db`;
    const backupPath = path.join(this.config.backupPath, backupFilename);
    
    try {
      // Open source database in readonly mode
      const sourceDb = new Database(sourcePath, { readonly: true });
      
      // Verify integrity before backup
      const integrityCheck = sourceDb.prepare('PRAGMA integrity_check').get() as any;
      if (integrityCheck.integrity_check !== 'ok') {
        sourceDb.close();
        throw new Error('Source database integrity check failed');
      }
      
      // Get event count for metadata
      const stats = sourceDb.prepare('SELECT COUNT(*) as count FROM events').get() as any;
      const eventsCount = stats.count;
      
      // Perform backup using SQLite backup API
      await sourceDb.backup(backupPath);
      sourceDb.close();
      
      // Compress if enabled
      let finalPath = backupPath;
      let isCompressed = false;
      
      if (this.config.compressionEnabled) {
        const compressedPath = `${backupPath}.gz`;
        const fileContent = fs.readFileSync(backupPath);
        const compressedData = await gzip(fileContent);
        fs.writeFileSync(compressedPath, compressedData);
        fs.unlinkSync(backupPath); // Remove uncompressed file
        finalPath = compressedPath;
        isCompressed = true;
      }
      
      // Get file size
      const fileStats = fs.statSync(finalPath);
      
      const backupInfo: BackupInfo = {
        filename: path.basename(finalPath),
        path: finalPath,
        size: fileStats.size,
        compressed: isCompressed,
        createdAt: new Date(),
        eventsCount
      };
      
      logger.info('Database backup completed', backupInfo);
      
      // Clean up old backups
      await this.cleanupOldBackups();
      
      return backupInfo;
      
    } catch (error) {
      logger.error('Backup failed', { error, sourcePath, backupPath });
      // Clean up partial backup if it exists
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
      throw error;
    }
  }
  
  /**
   * Restore database from a backup
   */
  async restoreFromBackup(backupPath: string, targetPath: string): Promise<void> {
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupPath}`);
    }
    
    try {
      let tempPath = backupPath;
      
      // Decompress if needed
      if (backupPath.endsWith('.gz')) {
        const compressed = fs.readFileSync(backupPath);
        const decompressed = await gunzip(compressed);
        tempPath = backupPath.replace('.gz', '.tmp');
        fs.writeFileSync(tempPath, decompressed);
      }
      
      // Verify backup integrity
      const backupDb = new Database(tempPath, { readonly: true });
      const integrityCheck = backupDb.prepare('PRAGMA integrity_check').get() as any;
      
      if (integrityCheck.integrity_check !== 'ok') {
        backupDb.close();
        if (tempPath !== backupPath) {
          fs.unlinkSync(tempPath);
        }
        throw new Error('Backup file integrity check failed');
      }
      
      // Get backup info
      const stats = backupDb.prepare('SELECT COUNT(*) as count, MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM events').get() as any;
      backupDb.close();
      
      // Create target directory if needed
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      
      // Copy backup to target
      fs.copyFileSync(tempPath, targetPath);
      
      // Clean up temp file if we created one
      if (tempPath !== backupPath) {
        fs.unlinkSync(tempPath);
      }
      
      logger.info('Database restored from backup', {
        backupPath,
        targetPath,
        eventsCount: stats.count,
        dateRange: {
          from: new Date(stats.min_ts),
          to: new Date(stats.max_ts)
        }
      });
      
    } catch (error) {
      logger.error('Restore failed', { error, backupPath, targetPath });
      throw error;
    }
  }
  
  /**
   * Export data to JSON format
   */
  async exportData(dbPath: string, startTime?: number, endTime?: number): Promise<string> {
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Database file not found: ${dbPath}`);
    }
    
    const db = new Database(dbPath, { readonly: true });
    
    try {
      let query = 'SELECT * FROM events WHERE 1=1';
      const params: any[] = [];
      
      if (startTime) {
        query += ' AND timestamp >= ?';
        params.push(startTime);
      }
      
      if (endTime) {
        query += ' AND timestamp <= ?';
        params.push(endTime);
      }
      
      query += ' ORDER BY timestamp ASC';
      
      const events = db.prepare(query).all(...params);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const exportPath = path.join(this.config.backupPath, `events-export-${timestamp}.json`);
      
      const exportData = {
        exportedAt: new Date().toISOString(),
        eventsCount: events.length,
        startTime: startTime ? new Date(startTime).toISOString() : undefined,
        endTime: endTime ? new Date(endTime).toISOString() : undefined,
        events
      };
      
      fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));
      
      logger.info('Data exported', {
        path: exportPath,
        eventsCount: events.length,
        fileSize: fs.statSync(exportPath).size
      });
      
      return exportPath;
      
    } finally {
      db.close();
    }
  }
  
  /**
   * Import data from JSON export
   */
  async importData(dbPath: string, exportPath: string): Promise<number> {
    if (!fs.existsSync(exportPath)) {
      throw new Error(`Export file not found: ${exportPath}`);
    }
    
    const db = new Database(dbPath);
    
    try {
      const exportContent = fs.readFileSync(exportPath, 'utf-8');
      const exportData = JSON.parse(exportContent);
      
      if (!exportData.events || !Array.isArray(exportData.events)) {
        throw new Error('Invalid export file format');
      }
      
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO events (
          timestamp, change_group_id, control_path,
          component_name, control_name, value, string_value, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const transaction = db.transaction((events: any[]) => {
        for (const event of events) {
          stmt.run(
            event.timestamp,
            event.change_group_id,
            event.control_path,
            event.component_name,
            event.control_name,
            event.value,
            event.string_value,
            event.source
          );
        }
      });
      
      transaction(exportData.events);
      
      logger.info('Data imported', {
        path: exportPath,
        eventsCount: exportData.events.length
      });
      
      return exportData.events.length;
      
    } finally {
      db.close();
    }
  }
  
  /**
   * List available backups
   */
  async listBackups(): Promise<BackupInfo[]> {
    if (!fs.existsSync(this.config.backupPath)) {
      return [];
    }
    
    const files = fs.readdirSync(this.config.backupPath);
    const backups: BackupInfo[] = [];
    
    for (const file of files) {
      if (file.startsWith('events-backup-') && (file.endsWith('.db') || file.endsWith('.db.gz'))) {
        const filePath = path.join(this.config.backupPath, file);
        const stats = fs.statSync(filePath);
        
        // Extract timestamp from filename
        const timestampRegex = /events-backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/;
        const timestampMatch = timestampRegex.exec(file);
        let createdAt = stats.mtime;
        
        if (timestampMatch && timestampMatch[1]) {
          // Convert filename timestamp format back to ISO format
          // From: 2025-08-08T02-27-34 to 2025-08-08T02:27:34
          const isoString = timestampMatch[1].replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3');
          const parsedDate = new Date(isoString);
          if (!isNaN(parsedDate.getTime())) {
            createdAt = parsedDate;
          }
        }
        
        backups.push({
          filename: file,
          path: filePath,
          size: stats.size,
          compressed: file.endsWith('.gz'),
          createdAt
        });
      }
    }
    
    // Sort by creation date, newest first
    backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    return backups;
  }
  
  /**
   * Get the latest backup
   */
  async getLatestBackup(): Promise<BackupInfo | null> {
    const backups = await this.listBackups();
    return backups.length > 0 ? backups[0] ?? null : null;
  }
  
  /**
   * Clean up old backups keeping only the configured maximum
   */
  private async cleanupOldBackups(): Promise<void> {
    const backups = await this.listBackups();
    
    if (backups.length <= this.config.maxBackups) {
      return;
    }
    
    // Remove oldest backups
    const toDelete = backups.slice(this.config.maxBackups);
    
    for (const backup of toDelete) {
      try {
        fs.unlinkSync(backup.path);
        logger.info('Deleted old backup', { filename: backup.filename });
      } catch (error) {
        logger.error('Failed to delete old backup', { error, filename: backup.filename });
      }
    }
  }
  
  /**
   * Start automatic backups
   */
  private startAutoBackup(): void {
    if (this.autoBackupTimer) {
      clearInterval(this.autoBackupTimer);
    }
    
    this.autoBackupTimer = setInterval(() => {
      // Handle async operation without making the callback async
      this.performBackup()
        .then(() => {
          logger.info('Automatic backup completed');
        })
        .catch((error) => {
          logger.error('Automatic backup failed', { error });
        });
    }, this.config.autoBackupInterval);
    
    logger.info('Automatic backups scheduled', {
      interval: `${this.config.autoBackupInterval / 1000 / 60 / 60} hours`
    });
  }
  
  /**
   * Stop automatic backups
   */
  stopAutoBackup(): void {
    if (this.autoBackupTimer) {
      clearInterval(this.autoBackupTimer);
      this.autoBackupTimer = undefined as any;
      logger.info('Automatic backups stopped');
    }
  }
  
  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    this.stopAutoBackup();
  }
}