import Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import { SimpleStateManager, StateManagerEvent } from '../simple-state-manager.js';
import type { QRWCClientAdapter } from '../../qrwc/adapter.js';
import { globalLogger as logger } from '../../../shared/utils/logger.js';
import * as path from 'path';
import * as fs from 'fs';

interface EventRecord {
  timestamp: number;
  changeGroupId: string;
  controlName: string;
  componentName: string;
  value: string;  // JSON stringified
  previousValue?: string | undefined;  // JSON stringified
  source: string;
}

interface EventMonitorConfig {
  enabled: boolean;
  dbPath?: string;
  retentionDays?: number;
  bufferSize?: number;
  flushInterval?: number;
}

export class SQLiteEventMonitor extends EventEmitter {
  private db?: Database.Database;
  private buffer: EventRecord[] = [];
  private flushTimer?: NodeJS.Timeout;
  private activeChangeGroups: Set<string> = new Set();
  private monitoredControls: Map<string, Set<string>> = new Map(); // control -> set of group IDs
  private config: Required<EventMonitorConfig>;
  private isInitialized = false;

  constructor(
    private stateManager: SimpleStateManager,
    private qrwcAdapter: QRWCClientAdapter,
    config: EventMonitorConfig
  ) {
    super();
    this.config = {
      enabled: config.enabled,
      dbPath: config.dbPath || './data/events',
      retentionDays: config.retentionDays || 7,
      bufferSize: config.bufferSize || 1000,
      flushInterval: config.flushInterval || 100,
    };
  }

  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Event monitoring disabled by configuration');
      return;
    }

    try {
      // Ensure data directory exists
      const dbDir = path.dirname(this.config.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
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
      logger.info('SQLite Event Monitor initialized', {
        dbFile,
        retentionDays: this.config.retentionDays,
      });
    } catch (error) {
      logger.error('Failed to initialize event monitor', { error });
      throw error;
    }
  }

  private getDatabaseFilename(): string {
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
        control_name TEXT NOT NULL,
        component_name TEXT NOT NULL,
        value TEXT NOT NULL,
        previous_value TEXT,
        source TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch() * 1000)
      );

      CREATE INDEX IF NOT EXISTS idx_timestamp 
        ON events(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_change_group 
        ON events(change_group_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_control 
        ON events(control_name, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_component 
        ON events(component_name, timestamp DESC);
    `);
  }

  private setupEventListeners(): void {
    // Listen to change group polling events from QRWC adapter
    this.qrwcAdapter.on('changeGroup:changes', this.handleChangeGroupChanges.bind(this));
    
    // Also listen to state changes for additional context
    this.stateManager.on(StateManagerEvent.StateChanged, this.handleStateChange.bind(this));
    this.stateManager.on(StateManagerEvent.BatchUpdate, this.handleBatchUpdate.bind(this));
    
    // Track when auto-polling starts/stops (multiple event names for compatibility)
    const handleSubscribed = async (groupId: string) => {
      this.activeChangeGroups.add(groupId);
      
      // Get the controls for this change group
      try {
        const changeGroups = await (this.qrwcAdapter as any).getAllChangeGroups();
        const group = changeGroups.get(groupId);
        if (group && group.controls) {
          for (const controlName of group.controls) {
            if (!this.monitoredControls.has(controlName)) {
              this.monitoredControls.set(controlName, new Set());
            }
            this.monitoredControls.get(controlName)!.add(groupId);
          }
        }
      } catch (error) {
        logger.error('Failed to get change group controls', { error, groupId });
      }
      
      logger.info('Event monitoring activated for change group', { groupId });
    };
    
    const handleUnsubscribed = (groupId: string) => {
      this.activeChangeGroups.delete(groupId);
      
      // Remove controls from monitoring for this group
      for (const [controlName, groups] of this.monitoredControls.entries()) {
        groups.delete(groupId);
        if (groups.size === 0) {
          this.monitoredControls.delete(controlName);
        }
      }
      
      logger.info('Event monitoring deactivated for change group', { groupId });
    };
    
    // Listen to multiple event names for compatibility
    this.qrwcAdapter.on('changeGroup:autoPollStarted', handleSubscribed);
    this.qrwcAdapter.on('changeGroupSubscribed', handleSubscribed);
    this.qrwcAdapter.on('changeGroup:autoPollStopped', handleUnsubscribed);
    this.qrwcAdapter.on('changeGroupUnsubscribed', handleUnsubscribed);
  }

  private handleChangeGroupChanges(event: any): void {
    const { groupId, changes, timestampMs } = event;
    
    // Only record if we're tracking this group
    if (!this.activeChangeGroups.has(groupId)) {
      this.activeChangeGroups.add(groupId); // Auto-track on first event
    }
    
    // Record each change as an event
    for (const change of changes) {
      const [componentName] = change.Name.split('.');
      
      const eventRecord: EventRecord = {
        timestamp: timestampMs || Date.now(),
        changeGroupId: groupId,
        controlName: change.Name,
        componentName,
        value: JSON.stringify(change.Value),
        previousValue: undefined, // Change events don't include previous value
        source: 'changeGroup',
      };
      
      this.addToBuffer(eventRecord);
    }
  }

  private async handleStateChange(event: any): Promise<void> {
    // Keep this for completeness but change groups are the primary source
    const { controlName, oldState, newState, timestamp } = event;
    
    // Only record if part of an active change group
    if (!this.isControlMonitored(controlName)) {
      return;
    }
    
    const [componentName] = controlName.split('.');
    
    // Get the change group ID for this control
    const groupIds = this.monitoredControls.get(controlName);
    const changeGroupId: string = groupIds && groupIds.size > 0 ? Array.from(groupIds)[0]! : 'state-change';
    
    const eventRecord: EventRecord = {
      timestamp: timestamp?.getTime ? timestamp.getTime() : Date.now(),
      changeGroupId,
      controlName,
      componentName,
      value: JSON.stringify(newState.value),
      previousValue: oldState ? JSON.stringify(oldState.value) : undefined,
      source: newState?.source || 'unknown',
    };

    this.addToBuffer(eventRecord);
  }

  private async handleBatchUpdate(event: any): Promise<void> {
    const { changes, timestamp } = event;
    
    for (const change of changes) {
      await this.handleStateChange({
        ...change,
        timestamp,
      });
    }
  }

  private isControlMonitored(controlName: string): boolean {
    // Check if this control is part of any active change group
    return this.monitoredControls.has(controlName);
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

  private flush(): void {
    if (!this.db || this.buffer.length === 0) return;

    const events = [...this.buffer];
    this.buffer = [];

    try {
      const insert = this.db.prepare(`
        INSERT INTO events (
          timestamp, change_group_id, control_name, component_name,
          value, previous_value, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMany = this.db.transaction((events: EventRecord[]) => {
        for (const event of events) {
          insert.run(
            event.timestamp,
            event.changeGroupId,
            event.controlName,
            event.componentName,
            event.value,
            event.previousValue || null,
            event.source
          );
        }
      });

      insertMany(events);
      
      logger.debug('Flushed events to database', { count: events.length });
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
    controlNames?: string[];
    componentNames?: string[];
    limit?: number;
    offset?: number;
  }): Promise<EventRecord[]> {
    if (!this.isInitialized) {
      throw new Error('Event monitoring is not active. Please create and subscribe to a change group first.');
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

    if (params.controlNames?.length) {
      conditions.push(`control_name IN (${params.controlNames.map(() => '?').join(',')})`);
      values.push(...params.controlNames);
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
        controlName: row.control_name,
        componentName: row.component_name,
        value: row.value,
        previousValue: row.previous_value,
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
      this.performMaintenance();
      // Schedule daily
      setInterval(() => this.performMaintenance(), 24 * 60 * 60 * 1000);
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
    databaseSize: number;
    bufferSize: number;
  }> {
    if (!this.isInitialized) {
      throw new Error('Event monitoring is not active. Please create and subscribe to a change group first.');
    }

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // Flush buffer first
    this.flush();

    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total_events,
        COUNT(DISTINCT control_name) as unique_controls,
        COUNT(DISTINCT change_group_id) as unique_change_groups,
        MIN(timestamp) as oldest_event,
        MAX(timestamp) as newest_event
      FROM events
    `).get() as any;

    const dbInfo = this.db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get() as any;

    return {
      totalEvents: stats.total_events || 0,
      uniqueControls: stats.unique_controls || 0,
      uniqueChangeGroups: stats.unique_change_groups || 0,
      oldestEvent: stats.oldest_event,
      newestEvent: stats.newest_event,
      databaseSize: dbInfo.size || 0,
      bufferSize: this.buffer.length,
    };
  }

  async close(): Promise<void> {
    // Flush any remaining events
    this.flush();

    // Clear timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Remove listeners
    this.stateManager.removeAllListeners(StateManagerEvent.StateChanged);
    this.stateManager.removeAllListeners(StateManagerEvent.BatchUpdate);

    // Close database
    if (this.db) {
      this.db.close();
    }

    this.isInitialized = false;
    logger.info('Event monitor closed');
  }
}