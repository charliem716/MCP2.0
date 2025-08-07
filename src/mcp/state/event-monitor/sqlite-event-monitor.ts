/**
 * SQLite Event Monitor - SDK Event Based
 * 
 * Records control events directly from the SDK instead of polling for changes.
 * This provides true real-time recording at the rates configured in change groups.
 */

import Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import { SDKEventBridge, type SDKControlEvent } from './sdk-event-bridge.js';
import type { OfficialQRWCClient } from '../../../qrwc/officialClient.js';
import { globalLogger as logger } from '../../../shared/utils/logger.js';
import * as path from 'path';
import * as fs from 'fs';

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
  private sdkBridge: SDKEventBridge;
  private client: OfficialQRWCClient;
  private controlUpdateHandler: ((event: SDKControlEvent) => void) | null = null;

  constructor(client: OfficialQRWCClient, config?: EventMonitorConfig) {
    super();
    
    this.client = client;
    this.sdkBridge = new SDKEventBridge(client);
    
    this.config = {
      enabled: config?.enabled !== false && process.env['EVENT_MONITORING_ENABLED'] !== 'false',
      dbPath: config?.dbPath || process.env['EVENT_MONITORING_DB_PATH'] || './data/events',
      retentionDays: config?.retentionDays || parseInt(process.env['EVENT_MONITORING_RETENTION_DAYS'] || '30', 10),
      bufferSize: config?.bufferSize || parseInt(process.env['EVENT_MONITORING_BUFFER_SIZE'] || '1000', 10),
      flushInterval: config?.flushInterval || parseInt(process.env['EVENT_MONITORING_FLUSH_INTERVAL'] || '100', 10),
    };
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
      
      // Optimize for write performance
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = 10000');
      
      // Create schema
      await this.createSchema();
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Start flush timer
      this.startFlushTimer();
      
      // Schedule maintenance
      this.scheduleMaintenance();
      
      this.isInitialized = true;
      logger.info('SQLite Event Monitor (SDK-based) initialized', {
        dbFile,
        retentionDays: this.config.retentionDays,
      });
    } catch (error) {
      logger.error('Failed to initialize event monitor', { error });
      throw error;
    }
  }

  private getDatabaseFilename(): string {
    if (this.config.dbPath === ':memory:') {
      return ':memory:';
    }
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.config.dbPath, `events-${date}.db`);
  }

  private async createSchema(): Promise<void> {
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
        created_at INTEGER DEFAULT (unixepoch() * 1000)
      );

      CREATE INDEX IF NOT EXISTS idx_timestamp 
        ON events(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_change_group 
        ON events(change_group_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_control_path 
        ON events(control_path, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_component 
        ON events(component_name, timestamp DESC);
    `);
  }

  private setupEventListeners(): void {
    // Listen to SDK control events via the bridge
    this.controlUpdateHandler = (event: SDKControlEvent) => {
      this.handleControlUpdate(event);
    };
    
    this.sdkBridge.on('control:update', this.controlUpdateHandler);
    
    // Listen to change group lifecycle events
    this.sdkBridge.on('changeGroup:activated', (groupId: string) => {
      logger.info('Change group activated for SDK monitoring', { groupId });
    });
    
    this.sdkBridge.on('changeGroup:deactivated', (groupId: string) => {
      logger.info('Change group deactivated from SDK monitoring', { groupId });
    });
  }

  private handleControlUpdate(event: SDKControlEvent): void {
    const eventRecord: EventRecord = {
      timestamp: event.timestamp,
      changeGroupId: event.groupId,
      controlPath: event.controlPath,
      componentName: event.componentName,
      controlName: event.controlName,
      value: event.value,
      stringValue: event.stringValue,
      source: event.source,
    };
    
    this.addToBuffer(eventRecord);
  }

  /**
   * Register a change group for SDK event monitoring
   */
  async registerChangeGroup(groupId: string, controls: string[], rate: number): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    // Register with SDK bridge
    this.sdkBridge.registerChangeGroup(groupId, controls, rate);
    
    logger.info('Registered change group for SDK monitoring', {
      groupId,
      controls: controls.length,
      rate: `${(1/rate).toFixed(1)}Hz`
    });
  }

  /**
   * Unregister a change group from SDK event monitoring
   */
  async unregisterChangeGroup(groupId: string): Promise<void> {
    this.sdkBridge.unregisterChangeGroup(groupId);
    
    logger.info('Unregistered change group from SDK monitoring', { groupId });
  }

  private addToBuffer(event: EventRecord): void {
    this.buffer.push(event);
    
    if (this.buffer.length >= this.config.bufferSize) {
      this.flush();
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0) {
        this.flush();
      }
    }, this.config.flushInterval);
  }

  flush(): void {
    if (!this.db || this.buffer.length === 0) return;

    const events = [...this.buffer];
    this.buffer = [];

    try {
      const insert = this.db.prepare(`
        INSERT INTO events (
          timestamp, change_group_id, control_path, component_name,
          control_name, value, string_value, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMany = this.db.transaction((events: EventRecord[]) => {
        for (const event of events) {
          insert.run(
            event.timestamp,
            event.changeGroupId,
            event.controlPath,
            event.componentName,
            event.controlName,
            event.value,
            event.stringValue,
            event.source
          );
        }
      });

      insertMany(events);
      
      logger.debug('Flushed SDK events to database', { count: events.length });
    } catch (error) {
      logger.error('Failed to flush events', { error });
      // Re-add to buffer for retry
      this.buffer.unshift(...events);
    }
  }

  async query(params: {
    startTime?: number;
    endTime?: number;
    changeGroupId?: string;
    controlPaths?: string[];
    componentNames?: string[];
    limit?: number;
    offset?: number;
  }): Promise<EventRecord[]> {
    if (!this.isInitialized) {
      throw new Error('Event monitoring is not active. Please initialize first.');
    }

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // Flush any pending events before querying
    this.flush();

    const conditions: string[] = [];
    const values: any[] = [];

    if (params.startTime) {
      conditions.push('timestamp >= ?');
      values.push(params.startTime);
    }

    if (params.endTime) {
      conditions.push('timestamp <= ?');
      values.push(params.endTime);
    }

    if (params.changeGroupId) {
      conditions.push('change_group_id = ?');
      values.push(params.changeGroupId);
    }

    if (params.controlPaths?.length) {
      conditions.push(`control_path IN (${params.controlPaths.map(() => '?').join(',')})`);
      values.push(...params.controlPaths);
    }

    if (params.componentNames?.length) {
      conditions.push(`component_name IN (${params.componentNames.map(() => '?').join(',')})`);
      values.push(...params.componentNames);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = params.limit ? `LIMIT ${params.limit}` : 'LIMIT 10000';
    const offsetClause = params.offset ? `OFFSET ${params.offset}` : '';

    const query = `
      SELECT * FROM events
      ${whereClause}
      ORDER BY timestamp DESC
      ${limitClause} ${offsetClause}
    `;

    try {
      const rows = this.db.prepare(query).all(...values) as any[];
      
      return rows.map(row => ({
        timestamp: row.timestamp,
        changeGroupId: row.change_group_id,
        controlPath: row.control_path,
        componentName: row.component_name,
        controlName: row.control_name,
        value: row.value,
        stringValue: row.string_value,
        source: row.source,
      }));
    } catch (error) {
      logger.error('Failed to query events', { error, params });
      throw error;
    }
  }

  private scheduleMaintenance(): void {
    // Run cleanup daily at 3 AM
    const now = new Date();
    const next3AM = new Date(now);
    next3AM.setHours(3, 0, 0, 0);
    if (next3AM <= now) {
      next3AM.setDate(next3AM.getDate() + 1);
    }

    const msUntil3AM = next3AM.getTime() - now.getTime();

    setTimeout(() => {
      void this.performMaintenance();
      // Schedule daily
      setInterval(() => void this.performMaintenance(), 24 * 60 * 60 * 1000);
    }, msUntil3AM);
  }

  private async performMaintenance(): Promise<void> {
    logger.info('Starting event database maintenance');

    try {
      // Delete database files older than retention period
      const retentionMs = this.config.retentionDays * 24 * 60 * 60 * 1000;
      const cutoffDate = new Date(Date.now() - retentionMs);
      
      const dbDir = path.dirname(this.config.dbPath);
      const files = fs.readdirSync(dbDir);
      
      for (const file of files) {
        if (file.startsWith('events-') && file.endsWith('.db')) {
          const dateStr = file.replace('events-', '').replace('.db', '');
          const fileDate = new Date(dateStr);
          
          if (fileDate < cutoffDate) {
            const filePath = path.join(dbDir, file);
            fs.unlinkSync(filePath);
            logger.info('Deleted old event database', { file, date: dateStr });
          }
        }
      }

      // Vacuum current database
      if (this.db) {
        this.db.exec('VACUUM');
      }

      logger.info('Event database maintenance completed');
    } catch (error) {
      logger.error('Maintenance failed', { error });
    }
  }

  async getStatistics(): Promise<{
    totalEvents: number;
    uniqueControls: number;
    uniqueChangeGroups: number;
    oldestEvent?: number;
    newestEvent?: number;
    eventsPerSecond?: number;
    databaseSize: number;
    bufferSize: number;
  }> {
    if (!this.isInitialized || !this.db) {
      return {
        totalEvents: 0,
        uniqueControls: 0,
        uniqueChangeGroups: 0,
        databaseSize: 0,
        bufferSize: this.buffer?.length || 0,
      };
    }

    try {
      // Flush buffer first
      this.flush();

      const stats = this.db.prepare(`
        SELECT
          COUNT(*) as total_events,
          COUNT(DISTINCT control_path) as unique_controls,
          COUNT(DISTINCT change_group_id) as unique_change_groups,
          MIN(timestamp) as oldest_event,
          MAX(timestamp) as newest_event
        FROM events
      `).get() as any;

      const dbInfo = this.db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get() as any;

      let eventsPerSecond: number | undefined;
      if (stats?.oldest_event && stats?.newest_event && stats?.total_events > 0) {
        const durationSeconds = (stats.newest_event - stats.oldest_event) / 1000;
        if (durationSeconds > 0) {
          eventsPerSecond = stats.total_events / durationSeconds;
        }
      }

      return {
        totalEvents: stats?.total_events || 0,
        uniqueControls: stats?.unique_controls || 0,
        uniqueChangeGroups: stats?.unique_change_groups || 0,
        oldestEvent: stats?.oldest_event,
        newestEvent: stats?.newest_event,
        ...(eventsPerSecond !== undefined && { eventsPerSecond }),
        databaseSize: dbInfo?.size || 0,
        bufferSize: this.buffer.length,
      };
    } catch (error) {
      logger.error('Failed to get statistics', { error });
      return {
        totalEvents: 0,
        uniqueControls: 0,
        uniqueChangeGroups: 0,
        databaseSize: 0,
        bufferSize: this.buffer?.length || 0,
      };
    }
  }

  isEnabled(): boolean {
    return this.config.enabled && this.isInitialized;
  }

  getActiveGroups(): Map<string, any> {
    return this.sdkBridge.getActiveGroups();
  }

  async close(): Promise<void> {
    // Flush any remaining events
    this.flush();

    // Clear timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Remove listeners
    if (this.controlUpdateHandler) {
      this.sdkBridge.off('control:update', this.controlUpdateHandler);
      this.controlUpdateHandler = null;
    }

    // Clean up bridge
    this.sdkBridge.cleanup();

    // Close database
    if (this.db) {
      this.db.close();
    }

    this.isInitialized = false;
    this.config.enabled = false;
    logger.info('SDK Event monitor closed');
  }
}