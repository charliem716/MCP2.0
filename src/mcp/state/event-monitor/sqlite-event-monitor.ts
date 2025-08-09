/**
 * SQLite Event Monitor - Polling Based
 * 
 * Records control values when polled by change groups.
 * Since the SDK doesn't emit discrete events, we record values
 * when the adapter polls them.
 */

import Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import type { QRWCClientAdapter } from '../../qrwc/adapter.js';
import { globalLogger as logger } from '../../../shared/utils/logger.js';
import * as path from 'path';
import * as fs from 'fs';
import { EventDatabaseBackupManager, type BackupInfo } from './backup-manager.js';
import type { 
  DatabaseStatsResult,
  DatabaseExportResult,
  DatabaseExportData
} from '../../../shared/types/external-apis.js';
import {
  assertDatabaseStatsResult,
  assertDatabaseExportData
} from '../../../shared/types/external-apis.js';

interface EventRecord {
  timestamp: number;
  changeGroupId: string;
  controlPath: string;
  componentName: string;
  controlName: string;
  value: number;
  stringValue: string;
  source: string;
}

interface EventMonitorConfig {
  enabled?: boolean;
  dbPath?: string;
  retentionDays?: number;
  bufferSize?: number;
  flushInterval?: number;
}

export class SQLiteEventMonitor extends EventEmitter {
  private db?: Database.Database;
  private buffer: EventRecord[] = [];
  private flushTimer?: NodeJS.Timeout;
  private config: Required<EventMonitorConfig>;
  private isInitialized = false;
  private adapter?: QRWCClientAdapter;
  private backupManager: EventDatabaseBackupManager;

  constructor(adapter?: QRWCClientAdapter, config?: EventMonitorConfig) {
    super();
    
    if (adapter) {
      this.adapter = adapter;
    }
    
    this.config = {
      enabled: config?.enabled !== undefined 
        ? config.enabled 
        : process.env['EVENT_MONITORING_ENABLED'] !== 'false',
      dbPath: config?.dbPath ?? process.env['EVENT_MONITORING_DB_PATH'] ?? './data/events',
      retentionDays: config?.retentionDays ?? parseInt(process.env['EVENT_MONITORING_RETENTION_DAYS'] ?? '30', 10),
      bufferSize: config?.bufferSize ?? parseInt(process.env['EVENT_MONITORING_BUFFER_SIZE'] ?? '1000', 10),
      flushInterval: config?.flushInterval ?? parseInt(process.env['EVENT_MONITORING_FLUSH_INTERVAL'] ?? '100', 10),
    };
    
    // Initialize backup manager
    // Disable auto-backup if in test environment
    const backupConfig = process.env['NODE_ENV'] === 'test' 
      ? { autoBackupInterval: 0 }
      : undefined;
    this.backupManager = new EventDatabaseBackupManager(backupConfig);
  }

  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Event monitoring disabled by configuration');
      return;
    }

    try {
      // Ensure data directory exists
      if (this.config.dbPath !== ':memory:') {
        const dbDir = path.dirname(this.config.dbPath);
        if (!fs.existsSync(dbDir)) {
          fs.mkdirSync(dbDir, { recursive: true });
        }
      }

      // Initialize database with date-based filename
      const dbFile = this.getDatabaseFilename();
      this.db = new Database(dbFile);
      
      // Optimize for write performance (skip WAL for in-memory databases)
      if (dbFile !== ':memory:') {
        this.db.pragma('journal_mode = WAL');
      }
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = -64000'); // 64MB cache
      this.db.pragma('temp_store = MEMORY');
      
      // Create events table if not exists
      this.createTables();
      
      // Start flush timer
      this.startFlushTimer();
      
      // Listen to adapter's poll events if available
      if (this.adapter) {
        this.adapter.on('changeGroup:poll', (event: {
          groupId: string;
          controls: Array<{
            Name: string;
            Value: number;
            String: string;
          }>;
          timestamp: number;
        }) => {
          this.recordPollEvent(event);
        });
      }
      
      // Initialize backup manager (skip for in-memory databases)
      if (dbFile !== ':memory:') {
        await this.backupManager.initialize(dbFile);
      }
      
      this.isInitialized = true;
      logger.info('SQLite event monitor initialized', {
        dbPath: dbFile,
        bufferSize: this.config.bufferSize,
        flushInterval: this.config.flushInterval,
        retentionDays: this.config.retentionDays
      });
      
    } catch (error) {
      logger.error('Failed to initialize SQLite event monitor', { error });
      throw error;
    }
  }

  /**
   * Record a poll event with all control values
   */
  private recordPollEvent(event: {
    groupId: string;
    controls: Array<{
      Name: string;
      Value: number;
      String: string;
    }>;
    timestamp: number;
  }): void {
    if (!this.config.enabled || !this.isInitialized) return;
    
    for (const control of event.controls) {
      const [componentName, ...controlParts] = control.Name.split('.');
      const controlName = controlParts.join('.');
      
      const record: EventRecord = {
        timestamp: event.timestamp,
        changeGroupId: event.groupId,
        controlPath: control.Name,
        componentName: componentName ?? '',
        controlName: controlName ?? '',
        value: control.Value,
        stringValue: control.String,
        source: 'change-group-poll'
      };
      
      this.buffer.push(record);
    }
    
    // Flush if buffer is full
    if (this.buffer.length >= this.config.bufferSize) {
      this.flush();
    }
  }

  /**
   * Create a change group for monitoring
   */
  async createChangeGroup(
    groupId: string,
    controls: string[],
    rate: number
  ): Promise<void> {
    if (!this.adapter) {
      logger.warn('No adapter available for creating change groups');
      return;
    }
    
    // Create the change group in the adapter
    await this.adapter.sendCommand('ChangeGroup.AddControl', {
      Id: groupId,
      Controls: controls.map(c => ({ Name: c }))
    });
    
    // Set up auto-polling at the specified rate
    await this.adapter.sendCommand('ChangeGroup.AutoPoll', {
      Id: groupId,
      Rate: rate
    });
    
    logger.info('Created monitored change group', {
      groupId,
      controls: controls.length,
      rate: `${(1/rate).toFixed(1)}Hz`
    });
  }

  /**
   * Get the database instance (for testing only)
   * @internal
   */
  public getDatabase(): Database.Database | null {
    return this.db || null;
  }

  /**
   * Get database filename with date
   */
  private getDatabaseFilename(): string {
    if (this.config.dbPath === ':memory:') {
      return ':memory:';
    }
    
    const date = new Date().toISOString().split('T')[0];
    const basePath = this.config.dbPath.replace(/\.db$/, '');
    return `${basePath}-${date}.db`;
  }

  /**
   * Create database tables
   */
  private createTables(): void {
    if (!this.db) return;
    
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        change_group_id TEXT NOT NULL,
        control_path TEXT NOT NULL,
        component_name TEXT NOT NULL,
        control_name TEXT NOT NULL,
        value REAL NOT NULL,
        string_value TEXT,
        source TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_group ON events(change_group_id);
      CREATE INDEX IF NOT EXISTS idx_events_control ON events(control_path);
      CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
      
      -- Add missing indexes for better query performance
      CREATE INDEX IF NOT EXISTS idx_events_component ON events(component_name);
      
      -- Compound indexes for common query patterns
      CREATE INDEX IF NOT EXISTS idx_events_component_time ON events(component_name, timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_group_time ON events(change_group_id, timestamp);
    `);
  }

  /**
   * Start the flush timer
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0) {
        this.flush();
      }
    }, this.config.flushInterval);
  }

  /**
   * Flush buffer to database
   */
  flush(): void {
    if (!this.db || this.buffer.length === 0) return;
    
    const toFlush = [...this.buffer];
    this.buffer = [];
    
    try {
      const stmt = this.db.prepare(`
        INSERT INTO events (
          timestamp, change_group_id, control_path,
          component_name, control_name, value, string_value, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const transaction = this.db.transaction((records: EventRecord[]) => {
        for (const record of records) {
          stmt.run(
            record.timestamp,
            record.changeGroupId,
            record.controlPath,
            record.componentName,
            record.controlName,
            record.value,
            record.stringValue,
            record.source
          );
        }
      });
      
      transaction(toFlush);
      
      logger.debug(`Flushed ${toFlush.length} events to database`);
      
    } catch (error) {
      logger.error('Failed to flush events to database', { error });
      // Re-add to buffer to retry
      this.buffer.unshift(...toFlush);
    }
  }

  /**
   * Query events from the database
   */
  async queryEvents(params: {
    startTime?: number;
    endTime?: number;
    controlPaths?: string[];
    changeGroupId?: string;
    limit?: number;
  }): Promise<EventRecord[]> {
    if (!this.db) return [];
    
    // Flush any pending events first
    this.flush();
    
    let query = 'SELECT * FROM events WHERE 1=1';
    const queryParams: any[] = [];
    
    if (params.startTime) {
      query += ' AND timestamp >= ?';
      queryParams.push(params.startTime);
    }
    
    if (params.endTime) {
      query += ' AND timestamp <= ?';
      queryParams.push(params.endTime);
    }
    
    if (params.controlPaths && params.controlPaths.length > 0) {
      const placeholders = params.controlPaths.map(() => '?').join(',');
      query += ` AND control_path IN (${placeholders})`;
      queryParams.push(...params.controlPaths);
    }
    
    if (params.changeGroupId) {
      query += ' AND change_group_id = ?';
      queryParams.push(params.changeGroupId);
    }
    
    query += ' ORDER BY timestamp DESC';
    
    if (params.limit) {
      query += ' LIMIT ?';
      queryParams.push(params.limit);
    }
    
    try {
      const stmt = this.db.prepare(query);
      return stmt.all(...(queryParams as (string | number)[])) as EventRecord[];
    } catch (error) {
      logger.error('Failed to query events', { error });
      return [];
    }
  }

  /**
   * Get event statistics
   */
  async getStatistics(): Promise<{
    totalEvents: number;
    uniqueControls: number;
    changeGroups: number;
    oldestEvent: number | null;
    newestEvent: number | null;
    databaseSize: number;
  }> {
    if (!this.db) {
      return {
        totalEvents: 0,
        uniqueControls: 0,
        changeGroups: 0,
        oldestEvent: null,
        newestEvent: null,
        databaseSize: 0
      };
    }
    
    // Flush any pending events first
    this.flush();
    
    try {
      const rawStats = this.db.prepare(`
        SELECT 
          COUNT(*) as total_events,
          COUNT(DISTINCT control_path) as unique_controls,
          COUNT(DISTINCT change_group_id) as change_groups,
          MIN(timestamp) as oldest_event,
          MAX(timestamp) as newest_event
        FROM events
      `).get();
      
      const stats = assertDatabaseStatsResult(rawStats);
      
      // Get database file size
      let dbSize = 0;
      if (this.config.dbPath !== ':memory:') {
        const dbFile = this.getDatabaseFilename();
        if (fs.existsSync(dbFile)) {
          const stat = fs.statSync(dbFile);
          dbSize = stat.size;
        }
      }
      
      return {
        totalEvents: stats.total_events,
        uniqueControls: stats.unique_controls,
        changeGroups: stats.change_groups,
        oldestEvent: stats.oldest_event,
        newestEvent: stats.newest_event,
        databaseSize: dbSize
      };
      
    } catch (error) {
      logger.error('Failed to get statistics', { error });
      return {
        totalEvents: 0,
        uniqueControls: 0,
        changeGroups: 0,
        oldestEvent: null,
        newestEvent: null,
        databaseSize: 0
      };
    }
  }

  /**
   * Clean up old events based on retention policy
   */
  async cleanupOldEvents(): Promise<number> {
    if (!this.db) return 0;
    
    const cutoffTime = Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000);
    
    try {
      const result = this.db.prepare(
        'DELETE FROM events WHERE timestamp < ?'
      ).run(cutoffTime);
      
      const deletedCount = result.changes;
      
      if (deletedCount > 0) {
        logger.info(`Cleaned up ${deletedCount} old events`);
        // Vacuum to reclaim space
        this.db.exec('VACUUM');
      }
      
      return deletedCount;
      
    } catch (error) {
      logger.error('Failed to cleanup old events', { error });
      return 0;
    }
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    // Stop flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined as unknown as NodeJS.Timeout;
    }
    
    // Flush any remaining events
    if (this.buffer.length > 0) {
      this.flush();
    }
    
    // Shutdown backup manager
    await this.backupManager.shutdown();
    
    // Close database
    if (this.db) {
      this.db.close();
      this.db = undefined as unknown as Database.Database;
    }
    
    this.isInitialized = false;
    logger.info('SQLite event monitor closed');
  }

  /**
   * Check if monitoring is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled && this.isInitialized;
  }
  
  /**
   * Perform a manual backup of the database
   */
  async performBackup(): Promise<BackupInfo> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Event monitor not initialized');
    }
    
    // Flush any pending events before backup
    this.flush();
    
    const dbFile = this.getDatabaseFilename();
    return await this.backupManager.performBackup(dbFile);
  }
  
  /**
   * Restore database from a backup
   */
  async restoreFromBackup(backupPath: string): Promise<void> {
    const dbFile = this.getDatabaseFilename();
    
    // Close current database if open
    if (this.db) {
      await this.close();
    }
    
    // Restore from backup
    await this.backupManager.restoreFromBackup(backupPath, dbFile);
    
    // Reinitialize with restored database
    await this.initialize();
  }
  
  /**
   * Export event data to JSON
   */
  async exportData(startTime?: number, endTime?: number): Promise<string> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Event monitor not initialized');
    }
    
    // Flush any pending events before export
    this.flush();
    
    const dbFile = this.getDatabaseFilename();
    return await this.backupManager.exportData(dbFile, startTime, endTime);
  }
  
  /**
   * Import event data from JSON
   */
  async importData(exportPath: string): Promise<number> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Event monitor not initialized');
    }
    
    const dbFile = this.getDatabaseFilename();
    return await this.backupManager.importData(dbFile, exportPath);
  }
  
  /**
   * List available backups
   */
  async listBackups(): Promise<BackupInfo[]> {
    return await this.backupManager.listBackups();
  }
  
  /**
   * Get the latest backup
   */
  async getLatestBackup(): Promise<BackupInfo | null> {
    return await this.backupManager.getLatestBackup();
  }
}