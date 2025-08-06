# Event Cache Rebuild Implementation Plan

## Executive Summary

This plan details the implementation of a lightweight, SQLite-based event monitoring system that integrates seamlessly with the existing Q-SYS MCP server architecture. The system will record control changes from active change groups at up to 33Hz, store 7-14 days of data, and provide query capabilities through MCP tools.

## Key Design Decisions

Based on requirements analysis:
- **Storage**: SQLite (zero dependencies, 3-5GB storage)
- **Activation**: Event monitoring starts when change groups are subscribed
- **Retention**: 7-14 days with automatic cleanup
- **Frequency**: Up to 33Hz per change group (configurable)
- **Scale**: Support 4 change groups with up to 500 controls each
- **Integration**: Hook into existing SimpleStateManager events

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   MCP Server                         │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────┐        ┌──────────────────────┐  │
│  │ Change Group │───────▶│  SimpleStateManager  │  │
│  │   Manager    │        │  (Event Emitter)     │  │
│  └──────────────┘        └──────────────────────┘  │
│         │                          │                │
│         │ subscribe                │ StateChanged   │
│         ▼                          ▼ BatchUpdate    │
│  ┌──────────────────────────────────────────────┐  │
│  │           SQLiteEventMonitor                 │  │
│  ├──────────────────────────────────────────────┤  │
│  │ • Listens to state change events             │  │
│  │ • Filters by active change groups            │  │
│  │ • Buffers and writes to SQLite               │  │
│  │ • Handles queries via MCP tools              │  │
│  └──────────────────────────────────────────────┘  │
│                      │                              │
│                      ▼                              │
│            ┌──────────────────┐                    │
│            │  SQLite Database  │                    │
│            │  (./data/*.db)    │                    │
│            └──────────────────┘                    │
└─────────────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Core Infrastructure (Day 1)

#### 1.1 Create SQLiteEventMonitor Class

**File**: `src/mcp/state/event-monitor/sqlite-event-monitor.ts`

```typescript
import Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import { SimpleStateManager, StateManagerEvent } from '../simple-state-manager';
import { IChangeGroupManager } from '../../types/change-group';
import { logger } from '../../../shared/logger';
import * as path from 'path';
import * as fs from 'fs';

interface EventRecord {
  timestamp: number;
  changeGroupId: string;
  controlName: string;
  componentName: string;
  value: string;  // JSON stringified
  previousValue?: string;  // JSON stringified
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
  private config: Required<EventMonitorConfig>;
  private isInitialized = false;

  constructor(
    private stateManager: SimpleStateManager,
    private changeGroupManager: IChangeGroupManager,
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
    // Listen to state changes
    this.stateManager.on(StateManagerEvent.StateChanged, this.handleStateChange.bind(this));
    this.stateManager.on(StateManagerEvent.BatchUpdate, this.handleBatchUpdate.bind(this));
    
    // Listen to change group lifecycle
    this.changeGroupManager.on('subscribed', this.handleChangeGroupSubscribed.bind(this));
    this.changeGroupManager.on('unsubscribed', this.handleChangeGroupUnsubscribed.bind(this));
  }

  private handleChangeGroupSubscribed(changeGroupId: string): void {
    this.activeChangeGroups.add(changeGroupId);
    logger.info('Event monitoring activated for change group', { changeGroupId });
  }

  private handleChangeGroupUnsubscribed(changeGroupId: string): void {
    this.activeChangeGroups.delete(changeGroupId);
    logger.info('Event monitoring deactivated for change group', { changeGroupId });
  }

  private async handleStateChange(event: any): Promise<void> {
    const { controlName, oldState, newState, timestamp } = event;
    
    // Find which change group this control belongs to
    const changeGroupId = await this.findChangeGroupForControl(controlName);
    if (!changeGroupId || !this.activeChangeGroups.has(changeGroupId)) {
      return; // Not monitoring this control
    }

    const [componentName] = controlName.split('.');
    
    const eventRecord: EventRecord = {
      timestamp: timestamp.getTime(),
      changeGroupId,
      controlName,
      componentName,
      value: JSON.stringify(newState.value),
      previousValue: oldState ? JSON.stringify(oldState.value) : undefined,
      source: newState.source || 'unknown',
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

  private async findChangeGroupForControl(controlName: string): Promise<string | null> {
    // Query change group manager to find which group contains this control
    const changeGroups = await this.changeGroupManager.getAllChangeGroups();
    
    for (const [groupId, group] of changeGroups) {
      if (group.controls?.includes(controlName)) {
        return groupId;
      }
    }
    
    return null;
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
```

#### 1.2 Update Dependencies

**File**: `package.json`
```json
{
  "dependencies": {
    "better-sqlite3": "^9.0.0"
  }
}
```

### Phase 2: Integration with State Manager (Day 1-2)

#### 2.1 Create Extended State Manager

**File**: `src/mcp/state/monitored-state-manager.ts`

```typescript
import { SimpleStateManager } from './simple-state-manager';
import { SQLiteEventMonitor } from './event-monitor/sqlite-event-monitor';
import { IChangeGroupManager } from '../types/change-group';
import { StateConfig } from '../types/state';

export interface MonitoredStateConfig extends StateConfig {
  eventMonitoring?: {
    enabled: boolean;
    dbPath?: string;
    retentionDays?: number;
    bufferSize?: number;
    flushInterval?: number;
  };
}

export class MonitoredStateManager extends SimpleStateManager {
  private eventMonitor?: SQLiteEventMonitor;

  async initialize(
    config: MonitoredStateConfig,
    changeGroupManager: IChangeGroupManager
  ): Promise<void> {
    await super.initialize(config);

    if (config.eventMonitoring?.enabled) {
      this.eventMonitor = new SQLiteEventMonitor(
        this,
        changeGroupManager,
        config.eventMonitoring
      );
      await this.eventMonitor.initialize();
    }
  }

  getEventMonitor(): SQLiteEventMonitor | undefined {
    return this.eventMonitor;
  }

  async close(): Promise<void> {
    if (this.eventMonitor) {
      await this.eventMonitor.close();
    }
    await super.close();
  }
}
```

#### 2.2 Update Factory

**File**: `src/mcp/factories/default-factory.ts` (modifications)

```typescript
// Add to createStateManager method
async createStateManager(config: AppConfig): Promise<IStateManager> {
  const monitoredConfig: MonitoredStateConfig = {
    ...config.state,
    eventMonitoring: config.mcp?.eventMonitoring,
  };

  const stateManager = new MonitoredStateManager();
  await stateManager.initialize(monitoredConfig, this.changeGroupManager);
  
  return stateManager;
}
```

### Phase 3: MCP Tools Implementation (Day 2)

#### 3.1 Query Events Tool

**File**: `src/mcp/tools/event-monitoring/query-events.ts`

```typescript
import { BaseQSysTool } from '../base-tool';
import { MonitoredStateManager } from '../../state/monitored-state-manager';
import { logger } from '../../../shared/logger';

interface QueryEventsParams {
  startTime?: number;
  endTime?: number;
  changeGroupId?: string;
  controlNames?: string[];
  componentNames?: string[];
  limit?: number;
  offset?: number;
}

export function createQueryEventsTool(
  stateManager: MonitoredStateManager
): BaseQSysTool<QueryEventsParams> {
  return {
    name: 'qsys.query_change_events',
    description: 'Query historical control change events from active change groups',
    inputSchema: {
      type: 'object',
      properties: {
        startTime: {
          type: 'number',
          description: 'Start time (Unix timestamp in milliseconds)',
        },
        endTime: {
          type: 'number',
          description: 'End time (Unix timestamp in milliseconds)',
        },
        changeGroupId: {
          type: 'string',
          description: 'Filter by specific change group ID',
        },
        controlNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by specific control names',
        },
        componentNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by component names',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of events to return (default: 1000)',
          default: 1000,
        },
        offset: {
          type: 'number',
          description: 'Number of events to skip',
        },
      },
    },

    async execute(params: QueryEventsParams): Promise<ToolExecutionResult> {
      const startTime = Date.now();

      try {
        const eventMonitor = stateManager.getEventMonitor();
        
        if (!eventMonitor) {
          return {
            content: [{
              type: 'text',
              text: 'Event monitoring is not enabled. Please create and subscribe to a change group with auto-polling enabled to start recording events.',
            }],
            isError: true,
            executionTimeMs: Date.now() - startTime,
          };
        }

        const events = await eventMonitor.query({
          startTime: params.startTime,
          endTime: params.endTime,
          changeGroupId: params.changeGroupId,
          controlNames: params.controlNames,
          componentNames: params.componentNames,
          limit: params.limit || 1000,
          offset: params.offset,
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              eventCount: events.length,
              events: events.map(e => ({
                ...e,
                value: JSON.parse(e.value),
                previousValue: e.previousValue ? JSON.parse(e.previousValue) : undefined,
              })),
            }, null, 2),
          }],
          isError: false,
          executionTimeMs: Date.now() - startTime,
          metadata: {
            eventCount: events.length,
            queryRange: {
              start: params.startTime,
              end: params.endTime,
            },
          },
        };
      } catch (error: any) {
        logger.error('Failed to query events', { error, params });
        
        return {
          content: [{
            type: 'text',
            text: `Failed to query events: ${error.message}`,
          }],
          isError: true,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  };
}
```

#### 3.2 Get Event Statistics Tool

**File**: `src/mcp/tools/event-monitoring/get-statistics.ts`

```typescript
import { BaseQSysTool } from '../base-tool';
import { MonitoredStateManager } from '../../state/monitored-state-manager';
import { logger } from '../../../shared/logger';

export function createGetEventStatisticsTool(
  stateManager: MonitoredStateManager
): BaseQSysTool<{}> {
  return {
    name: 'qsys.get_event_statistics',
    description: 'Get event monitoring statistics and status',
    inputSchema: {
      type: 'object',
      properties: {},
    },

    async execute(): Promise<ToolExecutionResult> {
      const startTime = Date.now();

      try {
        const eventMonitor = stateManager.getEventMonitor();
        
        if (!eventMonitor) {
          return {
            content: [{
              type: 'text',
              text: 'Event monitoring is not enabled. Please create and subscribe to a change group with auto-polling enabled to start recording events.',
            }],
            isError: true,
            executionTimeMs: Date.now() - startTime,
          };
        }

        const stats = await eventMonitor.getStatistics();

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ...stats,
              databaseSizeMB: (stats.databaseSize / 1024 / 1024).toFixed(2),
              oldestEventDate: stats.oldestEvent ? new Date(stats.oldestEvent).toISOString() : null,
              newestEventDate: stats.newestEvent ? new Date(stats.newestEvent).toISOString() : null,
            }, null, 2),
          }],
          isError: false,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        logger.error('Failed to get event statistics', { error });
        
        return {
          content: [{
            type: 'text',
            text: `Failed to get statistics: ${error.message}`,
          }],
          isError: true,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  };
}
```

### Phase 4: Configuration Updates (Day 2)

#### 4.1 Update Config Types

**File**: `src/config/types.ts` (additions)

```typescript
export interface EventMonitoringConfig {
  enabled: boolean;
  dbPath?: string;
  retentionDays?: number;
  bufferSize?: number;
  flushInterval?: number;
}

export interface MCPConfig {
  // ... existing fields
  eventMonitoring?: EventMonitoringConfig;
}
```

#### 4.2 Update Config Loader

**File**: `src/config/index.ts` (modifications)

```typescript
// Add to loadMCPConfig method
private loadMCPConfig(): MCPConfig {
  return {
    // ... existing config
    eventMonitoring: {
      enabled: this.getEnvBoolean('EVENT_MONITORING_ENABLED', false),
      dbPath: this.getEnvString('EVENT_MONITORING_DB_PATH', './data/events'),
      retentionDays: this.getEnvNumber('EVENT_MONITORING_RETENTION_DAYS', 7),
      bufferSize: this.getEnvNumber('EVENT_MONITORING_BUFFER_SIZE', 1000),
      flushInterval: this.getEnvNumber('EVENT_MONITORING_FLUSH_INTERVAL', 100),
    },
  };
}
```

### Phase 5: Tool Registry Updates (Day 3)

#### 5.1 Register Event Tools

**File**: `src/mcp/handlers/index.ts` (modifications)

```typescript
// Add imports
import { createQueryEventsTool } from '../tools/event-monitoring/query-events';
import { createGetEventStatisticsTool } from '../tools/event-monitoring/get-statistics';

// Update registerQSysTools method
private registerQSysTools(): void {
  // ... existing tools

  // Event monitoring tools
  const stateManager = this.controlSystem as MonitoredStateManager;
  if (stateManager.getEventMonitor) {
    this.registerQSysTool(createQueryEventsTool(stateManager));
    this.registerQSysTool(createGetEventStatisticsTool(stateManager));
    
    logger.info('Event monitoring tools registered');
  }
}
```

### Phase 6: Testing (Day 3-4)

#### 6.1 Unit Tests

**File**: `tests/unit/event-monitor.test.ts`

```typescript
import { SQLiteEventMonitor } from '../../../src/mcp/state/event-monitor/sqlite-event-monitor';
import { SimpleStateManager } from '../../../src/mcp/state/simple-state-manager';
import { MockChangeGroupManager } from '../../mocks/change-group-manager';

describe('SQLiteEventMonitor', () => {
  let eventMonitor: SQLiteEventMonitor;
  let stateManager: SimpleStateManager;
  let changeGroupManager: MockChangeGroupManager;

  beforeEach(async () => {
    stateManager = new SimpleStateManager();
    changeGroupManager = new MockChangeGroupManager();
    
    eventMonitor = new SQLiteEventMonitor(stateManager, changeGroupManager, {
      enabled: true,
      dbPath: ':memory:',
      retentionDays: 7,
      bufferSize: 10,
      flushInterval: 50,
    });

    await eventMonitor.initialize();
  });

  afterEach(async () => {
    await eventMonitor.close();
  });

  it('should record events when change group is active', async () => {
    // Simulate change group subscription
    changeGroupManager.emit('subscribed', 'test-group');
    changeGroupManager.setControlGroup('test-group', ['Zone1.Volume']);

    // Trigger state change
    await stateManager.setState('Zone1.Volume', {
      value: 0.5,
      source: 'test',
    });

    // Wait for flush
    await new Promise(resolve => setTimeout(resolve, 100));

    // Query events
    const events = await eventMonitor.query({
      changeGroupId: 'test-group',
    });

    expect(events).toHaveLength(1);
    expect(events[0].controlName).toBe('Zone1.Volume');
    expect(JSON.parse(events[0].value)).toBe(0.5);
  });

  it('should handle 33Hz updates', async () => {
    changeGroupManager.emit('subscribed', 'meter-group');
    changeGroupManager.setControlGroup('meter-group', ['Meter.Level']);

    const startTime = Date.now();
    let updateCount = 0;

    // Simulate 33Hz for 1 second
    const interval = setInterval(async () => {
      await stateManager.setState('Meter.Level', {
        value: Math.random(),
        source: 'meter',
      });
      updateCount++;
    }, 30);

    await new Promise(resolve => setTimeout(resolve, 1000));
    clearInterval(interval);

    // Wait for final flush
    await new Promise(resolve => setTimeout(resolve, 200));

    const stats = await eventMonitor.getStatistics();
    expect(stats.totalEvents).toBeGreaterThanOrEqual(30);
    expect(stats.totalEvents).toBeLessThanOrEqual(35);
  });

  it('should respect retention period', async () => {
    // Test database cleanup logic
    // This would require mocking the date/time
  });

  it('should handle query errors gracefully', async () => {
    await expect(
      eventMonitor.query({ startTime: -1 })
    ).rejects.toThrow();
  });
});
```

#### 6.2 Integration Tests

**File**: `tests/integration/event-monitoring.test.ts`

```typescript
import { MCPServer } from '../../src/mcp/server';
import { TestHelpers } from '../helpers';

describe('Event Monitoring Integration', () => {
  let server: MCPServer;

  beforeAll(async () => {
    server = await TestHelpers.createTestServer({
      eventMonitoring: {
        enabled: true,
        dbPath: ':memory:',
      },
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it('should record and query events through MCP tools', async () => {
    // Create change group
    const createResult = await server.callTool('qsys.create_change_group', {
      id: 'test-group',
      controls: ['Zone1.Volume', 'Zone2.Volume'],
      pollInterval: 30,
    });

    expect(createResult.isError).toBe(false);

    // Subscribe to change group
    const subscribeResult = await server.callTool('qsys.subscribe_to_change_group', {
      changeGroupId: 'test-group',
      pollInterval: 30,
    });

    expect(subscribeResult.isError).toBe(false);

    // Make some control changes
    await server.callTool('qsys.set_control_value', {
      controlName: 'Zone1.Volume',
      value: 0.75,
    });

    await server.callTool('qsys.set_control_value', {
      controlName: 'Zone2.Volume',
      value: 0.5,
    });

    // Wait for events to be recorded
    await new Promise(resolve => setTimeout(resolve, 200));

    // Query events
    const queryResult = await server.callTool('qsys.query_change_events', {
      changeGroupId: 'test-group',
      limit: 10,
    });

    expect(queryResult.isError).toBe(false);
    const data = JSON.parse(queryResult.content[0].text);
    expect(data.eventCount).toBeGreaterThanOrEqual(2);
  });

  it('should provide meaningful error when monitoring not active', async () => {
    const server = await TestHelpers.createTestServer({
      eventMonitoring: { enabled: false },
    });

    const result = await server.callTool('qsys.query_change_events', {});
    
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not enabled');
    
    await server.close();
  });
});
```

### Phase 7: Documentation Updates (Day 4)

#### 7.1 Update README

Add section about event monitoring:

```markdown
## Event Monitoring

The MCP server supports event monitoring for change groups with auto-polling enabled.

### Configuration

Set the following environment variables:

```bash
EVENT_MONITORING_ENABLED=true
EVENT_MONITORING_DB_PATH=./data/events
EVENT_MONITORING_RETENTION_DAYS=7
```

### Usage

1. Create a change group with controls to monitor
2. Subscribe to the change group with a poll interval
3. Events will be automatically recorded
4. Query events using `qsys.query_change_events` tool

### Storage

Events are stored in SQLite databases in the `./data/events/` directory. 
Databases are automatically rotated daily and cleaned up after the retention period.
```

## Migration Strategy

### Step 1: Deploy Code
1. Merge the implementation branch
2. Run `npm install` to add better-sqlite3 dependency
3. No configuration changes needed initially (disabled by default)

### Step 2: Enable in Development
1. Set `EVENT_MONITORING_ENABLED=true` in .env
2. Test with existing change groups
3. Verify event recording and queries work

### Step 3: Production Rollout
1. Enable event monitoring in production config
2. Monitor disk usage and performance
3. Adjust retention and buffer settings if needed

## Performance Considerations

### Write Performance
- Buffered writes reduce I/O overhead
- WAL mode enables concurrent reads during writes
- 33Hz sustained rate achievable with buffering

### Query Performance
- Strategic indexes on common query patterns
- Queries limited to 10,000 events by default
- Daily database rotation keeps file sizes manageable

### Memory Usage
- Buffer size limited to 1000 events (~100KB)
- Database cache limited to 10MB
- Total overhead < 50MB

### Disk Usage
- ~100MB per day with 100 controls at 1Hz average
- ~3GB for 30 days with typical usage
- Automatic cleanup prevents unbounded growth

## Error Handling

### Graceful Degradation
- System continues operation if event monitoring fails
- Errors logged but don't block state changes
- Buffer overflow handled by forced flush

### Recovery
- Database corruption: Create new database file
- Disk full: Stop recording, log error, continue operation
- Connection issues: Retry with exponential backoff

## Monitoring & Metrics

### Health Indicators
- Total events recorded
- Buffer utilization
- Database size
- Query performance

### Alerts
- Database write failures
- Buffer overflow events
- Disk usage > 80%
- Query timeouts

## Success Criteria

✅ **Requirement**: Record events at up to 33Hz
- Implementation: Buffered writes with 100ms flush interval

✅ **Requirement**: Support 4 change groups with 500 controls each
- Implementation: Efficient indexing and filtering by change group

✅ **Requirement**: 7-14 day retention
- Implementation: Configurable retention with automatic cleanup

✅ **Requirement**: No external dependencies
- Implementation: SQLite embedded database

✅ **Requirement**: Activate on change group subscription
- Implementation: Event listeners on change group lifecycle

✅ **Requirement**: Simple and lightweight
- Implementation: < 1000 lines of code, minimal overhead

## Next Steps

1. **Immediate Actions**
   - Review and approve implementation plan
   - Create feature branch for implementation
   - Set up test environment

2. **Development Phase** (3-4 days)
   - Implement core components
   - Add MCP tools
   - Write tests

3. **Testing Phase** (1-2 days)
   - Performance testing with Q-SYS
   - Integration testing
   - Fix any issues

4. **Deployment** (1 day)
   - Deploy to development environment
   - Monitor for 24 hours
   - Deploy to production

## Conclusion

This implementation provides a lightweight, efficient event monitoring system that:
- Integrates seamlessly with the existing architecture
- Requires no external dependencies
- Handles the required performance targets
- Provides the necessary query capabilities
- Maintains system stability even if monitoring fails

The system is designed to be simple, maintainable, and performant while meeting all specified requirements.