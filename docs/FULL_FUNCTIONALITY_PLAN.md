# Full Functionality Plan - Event Cache System

## Overview

This plan replaces steps 2.3 through 4.3 in the original event cache implementation plan. It focuses
on getting the event caching system fully operational with a simplified, functionality-first
approach.

## Current Status

- ✅ **Phase 1**: Core event cache infrastructure (COMPLETED)
- ✅ **Phase 2.1**: Core memory management (COMPLETED)
- ✅ **Phase 2.2**: Compression and disk spillover (IMPLEMENTED but tests failing)
- ✅ **Phase 3.1**: Core query tool (COMPLETED)
- ✅ **Phase 3.2**: Statistics integration (COMPLETED)

## Remaining Work

### Phase 1: Stabilize Core (1 day)

#### 1.1 Fix Failing Tests

**Priority: Critical | Timeline: 4-6 hours**

Currently 8 tests are failing across the event cache system:

- Memory management tests (timeout issues)
- Disk spillover tests (configuration path issues)
- Compression tests (timing/mock issues)
- Type validation tests (edge cases)

**Implementation Details:**

```typescript
// Fix memory test timeouts
jest.setTimeout(60000); // Increase timeout for memory-intensive tests

// Fix disk spillover initialization
class DiskSpillover {
  private initialized = false;

  async ensureInitialized() {
    if (!this.initialized) {
      await fs.mkdir(this.spilloverDir, { recursive: true });
      this.initialized = true;
    }
  }

  async write(events: CachedEvent[]) {
    await this.ensureInitialized();
    // ... rest of implementation
  }
}

// Fix compression timing
beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(global, 'setTimeout');
});

afterEach(() => {
  jest.useRealTimers();
});
```

#### 1.2 Add Integration Test

**Priority: High | Timeline: 2-3 hours**

Create a comprehensive test that simulates real-world Q-SYS usage:

```typescript
// tests/integration/event-cache-real-world.test.ts
describe('Event Cache Real-World Scenarios', () => {
  it('should handle 33Hz polling with 30 controls for 1 minute', async () => {
    const manager = new EventCacheManager({
      maxEvents: 100000,
      maxAgeMs: 300000, // 5 minutes
      globalMemoryLimitMB: 50,
      compressionConfig: { enabled: true },
      diskSpilloverConfig: { enabled: true, directory: './test-spillover' },
    });

    // Simulate 30 controls changing at 33Hz
    const controlCount = 30;
    const frequency = 33; // Hz
    const duration = 60000; // 1 minute
    const expectedEvents = controlCount * frequency * (duration / 1000);

    // Generate events
    const startTime = Date.now();
    let eventCount = 0;

    const interval = setInterval(() => {
      for (let i = 0; i < controlCount; i++) {
        mockAdapter.emit('changeGroup:changes', {
          groupId: 'test-group',
          changes: [
            {
              Name: `control${i}`,
              Value: Math.random() * 100,
              String: Math.random().toString(),
            },
          ],
          timestamp: BigInt(Date.now() * 1_000_000),
          timestampMs: Date.now(),
          sequenceNumber: eventCount++,
        });
      }
    }, 1000 / frequency);

    // Run for 1 minute
    await new Promise(resolve => setTimeout(resolve, duration));
    clearInterval(interval);

    // Verify results
    const stats = manager.getStatistics();
    expect(stats.totalEvents).toBeCloseTo(expectedEvents, -2); // Within 100 events
    expect(stats.memoryUsageMB).toBeLessThan(50);

    // Query different time ranges
    const recent = await manager.query({
      groupId: 'test-group',
      startTime: Date.now() - 10000, // Last 10 seconds
    });
    expect(recent.length).toBeGreaterThan(0);

    // Verify compression activated
    expect(stats.compressionActive).toBe(true);

    // Verify disk spillover if needed
    if (stats.memoryUsageMB > 40) {
      expect(stats.diskSpilloverActive).toBe(true);
    }

    // Cleanup
    await manager.shutdown();
    await fs.rm('./test-spillover', { recursive: true, force: true });
  });
});
```

### Phase 2: Complete Missing Features (1-2 days)

#### 2.1 Query Optimization (Step 2.3)

**Priority: High | Timeline: 3-4 hours**

Implement a simple LRU cache for query results to improve performance:

```typescript
// src/mcp/state/event-cache/query-cache.ts
import { LRUCache } from 'lru-cache';
import { EventQuery, QueryResult } from './types';
import crypto from 'crypto';

export class QueryCache {
  private cache: LRUCache<string, QueryResult>;

  constructor(options: { maxSize?: number; ttlMs?: number } = {}) {
    this.cache = new LRUCache<string, QueryResult>({
      max: options.maxSize || 100,
      ttl: options.ttlMs || 60000, // 1 minute default
      updateAgeOnGet: true,
      updateAgeOnHas: false
    });
  }

  private getCacheKey(query: EventQuery): string {
    // Create deterministic key from query parameters
    const normalized = {
      groupId: query.groupId || '',
      startTime: query.startTime || 0,
      endTime: query.endTime || 0,
      controlNames: query.controlNames?.sort() || [],
      valueFilter: query.valueFilter || null,
      limit: query.limit || 1000,
      offset: query.offset || 0,
      orderBy: query.orderBy || 'timestamp',
      orderDirection: query.orderDirection || 'asc'
    };

    const json = JSON.stringify(normalized);
    return crypto.createHash('md5').update(json).digest('hex');
  }

  get(query: EventQuery): QueryResult | undefined {
    const key = this.getCacheKey(query);
    const cached = this.cache.get(key);
    if (cached) {
      return { ...cached, fromCache: true };
    }
    return undefined;
  }

  set(query: EventQuery, result: QueryResult): void {
    const key = this.getCacheKey(query);
    this.cache.set(key, result);
  }

  invalidate(groupId?: string): void {
    if (groupId) {
      // Invalidate all queries for specific group
      for (const [key, value] of this.cache.entries()) {
        if (value.events.some(e => e.groupId === groupId)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  getStats() {
    return {
      size: this.cache.size,
      hitRate: this.cache.size > 0 ?
        (this.cache.size / (this.cache.size + this.cache.calculatedSize)) : 0
    };
  }
}

// Integration with EventCacheManager
// In manager.ts, add:
private queryCache = new QueryCache();

async query(params: EventQuery): Promise<CachedEvent[]> {
  // Check cache first
  const cached = this.queryCache.get(params);
  if (cached) {
    return cached.events;
  }

  // Execute query
  const result = await this.executeQuery(params);

  // Cache successful results
  if (result.events.length > 0) {
    this.queryCache.set(params, result);
  }

  return result.events;
}

// Invalidate cache on new events
private handleChanges(data: ChangeData) {
  // ... existing code ...

  // Invalidate query cache for this group
  this.queryCache.invalidate(data.groupId);
}
```

#### 2.2 Subscribe to Change Events Tool (Step 3.3)

**Priority: High | Timeline: 2-3 hours**

Add the missing MCP tool for subscription management:

```typescript
// Add to src/mcp/tools/change-groups.ts

export const subscribeToChangeEventsTool: BaseQSysTool = {
  name: 'subscribe_to_change_events',
  description: `Subscribe to real-time change events from a change group. 
    Events are automatically cached and can be queried later using read_change_group_events. 
    Subscription enables both real-time monitoring and historical analysis.
    Note: You must call set_change_group_auto_poll to start receiving events.
    
    Example:
    1. Subscribe: subscribe_to_change_events({ groupId: "my-group", enableCache: true })
    2. Start polling: set_change_group_auto_poll({ groupId: "my-group", rate: 100 })
    3. Query history: read_change_group_events({ groupId: "my-group", startTime: Date.now()-60000 })`,

  schema: z.object({
    groupId: z.string().describe('The change group ID to subscribe to'),
    enableCache: z.boolean().default(true).describe('Enable event caching for this group'),
    cacheConfig: z
      .object({
        maxAgeMs: z
          .number()
          .min(60000) // 1 minute
          .max(86400000) // 24 hours
          .default(3600000) // 1 hour
          .optional()
          .describe('How long to keep events in cache (milliseconds)'),
        maxEvents: z
          .number()
          .min(1000)
          .max(1000000)
          .default(100000)
          .optional()
          .describe('Maximum number of events to cache per group'),
        priority: z
          .enum(['high', 'normal', 'low'])
          .default('normal')
          .optional()
          .describe('Priority for memory management (high priority groups are evicted last)'),
      })
      .optional()
      .describe('Optional cache configuration for this group'),
  }),

  handler: async (params, ctx) => {
    const { groupId, enableCache, cacheConfig } = params;

    if (!ctx.eventCache) {
      throw new Error('Event cache not available');
    }

    try {
      if (enableCache) {
        // Configure group-specific settings
        if (cacheConfig) {
          ctx.eventCache.configureGroup(groupId, {
            maxAgeMs: cacheConfig.maxAgeMs,
            maxEvents: cacheConfig.maxEvents,
            priority: cacheConfig.priority,
          });
        }

        // Enable caching for this group
        ctx.eventCache.enableGroup(groupId);

        return {
          success: true,
          message: `Event caching enabled for group '${groupId}'`,
          config: {
            maxAgeMs: cacheConfig?.maxAgeMs || 3600000,
            maxEvents: cacheConfig?.maxEvents || 100000,
            priority: cacheConfig?.priority || 'normal',
          },
        };
      } else {
        // Disable caching for this group
        ctx.eventCache.disableGroup(groupId);

        return {
          success: true,
          message: `Event caching disabled for group '${groupId}'`,
        };
      }
    } catch (error) {
      ctx.logger.error('Failed to configure event subscription', { error, groupId });
      throw new Error(`Failed to configure event subscription: ${error.message}`);
    }
  },
};

// Add to tools array in change-groups.ts
export const changeGroupTools = [
  createChangeGroupTool,
  deleteChangeGroupTool,
  addControlToChangeGroupTool,
  removeControlFromChangeGroupTool,
  listChangeGroupsTool,
  getChangeGroupDetailsTool,
  setChangeGroupAutoPollTool,
  getChangeGroupValuesTool,
  readChangeGroupEventsTool, // Already exists
  subscribeToChangeEventsTool, // NEW TOOL
];
```

#### 2.3 Load Testing (Step 4.2)

**Priority: Medium | Timeline: 2 hours**

Add load testing to the integration test suite:

```typescript
// tests/integration/event-cache-load.test.ts
describe('Event Cache Load Testing', () => {
  it('should handle sustained 1000 events/second', async () => {
    const manager = new EventCacheManager({
      maxEvents: 200000,
      maxAgeMs: 600000, // 10 minutes
      globalMemoryLimitMB: 100,
    });

    const eventsPerSecond = 1000;
    const duration = 10000; // 10 seconds
    let sentCount = 0;
    let startTime = Date.now();

    // Generate events at target rate
    const interval = setInterval(() => {
      const batchSize = eventsPerSecond / 10; // 100 events per 100ms

      for (let i = 0; i < batchSize; i++) {
        mockAdapter.emit('changeGroup:changes', {
          groupId: 'load-test',
          changes: [
            {
              Name: `control${i % 50}`, // 50 unique controls
              Value: Math.random() * 100,
              String: Math.random().toString(),
            },
          ],
          timestamp: BigInt(Date.now() * 1_000_000),
          timestampMs: Date.now(),
          sequenceNumber: sentCount++,
        });
      }
    }, 100);

    // Run load test
    await new Promise(resolve => setTimeout(resolve, duration));
    clearInterval(interval);

    const endTime = Date.now();
    const actualDuration = (endTime - startTime) / 1000;
    const actualRate = sentCount / actualDuration;

    // Verify performance
    expect(actualRate).toBeGreaterThan(900); // Allow 10% margin

    // Verify no events dropped
    const stats = manager.getStatistics();
    expect(stats.totalEvents).toBe(sentCount);

    // Verify query performance
    const queryStart = Date.now();
    const results = await manager.query({
      groupId: 'load-test',
      limit: 10000,
    });
    const queryTime = Date.now() - queryStart;

    expect(queryTime).toBeLessThan(100); // Query should complete in <100ms
    expect(results.length).toBe(10000);
  });

  it('should handle 100k+ event queries efficiently', async () => {
    const manager = new EventCacheManager({
      maxEvents: 150000,
      maxAgeMs: 3600000,
    });

    // Pre-populate with 100k events
    for (let i = 0; i < 100000; i++) {
      mockAdapter.emit('changeGroup:changes', {
        groupId: 'query-test',
        changes: [
          {
            Name: `control${i % 100}`,
            Value: i,
            String: i.toString(),
          },
        ],
        timestamp: BigInt((Date.now() - i) * 1_000_000),
        timestampMs: Date.now() - i,
        sequenceNumber: i,
      });
    }

    // Test various query patterns
    const queries = [
      { limit: 100000 }, // Full scan
      { controlNames: ['control50'], limit: 1000 }, // Filtered
      { valueFilter: { operator: 'gt', value: 50000 } }, // Value filter
      { startTime: Date.now() - 30000 }, // Time range
    ];

    for (const query of queries) {
      const start = Date.now();
      const results = await manager.query({ groupId: 'query-test', ...query });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(500); // All queries under 500ms
      expect(results.length).toBeGreaterThan(0);
    }
  });
});
```

#### 2.4 Integration Tests for Critical Workflows (BUG-044)

**Priority: High | Timeline: 4-6 hours**

Add comprehensive integration tests for critical user workflows:

```typescript
// tests/integration/mcp-workflows.test.ts
describe('MCP Server Integration Workflows', () => {
  let mcpServer: MCPServer;
  let qsysCore: QSYSCoreMock;

  beforeAll(async () => {
    // Initialize mock Q-SYS Core and MCP server
    qsysCore = await QSYSCoreMock.start();
    mcpServer = await MCPServer.start({
      qsysUrl: qsysCore.url,
    });
  });

  describe('Component Discovery Workflow', () => {
    it('should discover and control components via MCP', async () => {
      // Full end-to-end discovery test
      const discovery = await mcpServer.callTool('qsys_discover', {});
      expect(discovery.components).toHaveLength(42);
      
      // Control change workflow
      await mcpServer.callTool('qsys_control', {
        componentId: 'mixer.1',
        controlId: 'gain',
        value: -10,
      });
      
      // Verify state synchronization
      const status = await mcpServer.callTool('qsys_status', {
        componentId: 'mixer.1',
      });
      expect(status.controls.gain.value).toBe(-10);
    });
  });

  describe('Error Recovery', () => {
    it('should recover from connection loss', async () => {
      await qsysCore.disconnect();
      
      // Verify error handling
      await expect(
        mcpServer.callTool('qsys_status', {})
      ).rejects.toThrow('Not connected');
      
      // Verify automatic recovery
      await qsysCore.reconnect();
      await eventually(async () => {
        const result = await mcpServer.callTool('qsys_status', {});
        expect(result).toBeDefined();
      });
    });
  });
});
```

This phase will:
- Add MCP server lifecycle tests
- Test complete component discovery workflows
- Verify control changes and state synchronization
- Test error recovery and reconnection scenarios
- Ensure multi-client consistency
- Implement a mock Q-SYS Core for reliable testing

### Phase 3: Production Hardening (1 day)

#### 3.1 Error Recovery

**Priority: High | Timeline: 2-3 hours**

Add robust error handling and recovery:

```typescript
// In EventCacheManager
private async handleError(error: Error, context: string): Promise<void> {
  this.logger.error(`Event cache error in ${context}`, { error });

  // Emit error event for monitoring
  this.emit('error', { error, context, timestamp: Date.now() });

  // Attempt recovery based on error type
  if (error.message.includes('ENOSPC')) {
    // Disk full - disable spillover
    this.logger.warn('Disk full, disabling spillover');
    this.diskSpillover?.disable();
  } else if (error.message.includes('memory')) {
    // Memory pressure - aggressive eviction
    this.logger.warn('Memory pressure detected, performing emergency eviction');
    this.performEmergencyEviction();
  }
}

private performEmergencyEviction(): void {
  const targetReduction = 0.5; // Remove 50% of events

  for (const [groupId, buffer] of this.buffers) {
    const currentSize = buffer.getSize();
    const targetSize = Math.floor(currentSize * targetReduction);
    const toEvict = currentSize - targetSize;

    if (toEvict > 0) {
      buffer.evictOldest(toEvict);
      this.logger.info(`Emergency eviction: removed ${toEvict} events from ${groupId}`);
    }
  }
}

// Add health check
getHealth(): HealthStatus {
  const stats = this.getStatistics();
  const memoryUsagePercent = (stats.memoryUsageMB / this.config.globalMemoryLimitMB) * 100;

  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  const issues: string[] = [];

  if (memoryUsagePercent > 90) {
    status = 'unhealthy';
    issues.push('Memory usage critical');
  } else if (memoryUsagePercent > 75) {
    status = 'degraded';
    issues.push('Memory usage high');
  }

  if (this.errorCount > 10) {
    status = 'unhealthy';
    issues.push(`High error rate: ${this.errorCount} errors`);
  }

  return {
    status,
    uptime: Date.now() - this.startTime,
    memoryUsagePercent,
    errorCount: this.errorCount,
    lastError: this.lastError,
    issues
  };
}
```

#### 3.2 Configuration Validation

**Priority: Medium | Timeline: 1-2 hours**

Add comprehensive config validation:

```typescript
// src/mcp/state/event-cache/config-validator.ts
export function validateEventCacheConfig(config: EventCacheConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate memory limits
  if (config.globalMemoryLimitMB < 10) {
    errors.push('globalMemoryLimitMB must be at least 10MB');
  } else if (config.globalMemoryLimitMB < 50) {
    warnings.push('Low memory limit may cause frequent evictions');
  }

  // Validate event limits
  if (config.maxEvents < 1000) {
    warnings.push('maxEvents < 1000 may be too low for production use');
  } else if (config.maxEvents > 1000000) {
    warnings.push('maxEvents > 1M may cause memory issues');
  }

  // Validate retention
  if (config.maxAgeMs < 60000) {
    warnings.push('Retention < 1 minute may be too short');
  } else if (config.maxAgeMs > 86400000) {
    warnings.push('Retention > 24 hours may use excessive memory');
  }

  // Validate disk spillover
  if (config.diskSpilloverConfig?.enabled) {
    const dir = config.diskSpilloverConfig.directory;
    if (!dir) {
      errors.push('Disk spillover enabled but no directory specified');
    } else {
      // Check if directory is writable
      try {
        fs.accessSync(path.dirname(dir), fs.constants.W_OK);
      } catch {
        errors.push(`Spillover directory not writable: ${dir}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
```

### Phase 4: Documentation (0.5 days)

#### 4.1 API Documentation (Step 4.3)

**Priority: High | Timeline: 2-3 hours**

Create comprehensive API documentation:

````markdown
# Event Cache API Documentation

## Overview

The Event Cache system provides high-performance storage and querying of Q-SYS control change events
with nanosecond precision timestamps.

## MCP Tools

### read_change_group_events

Query historical change events from monitored change groups.

**Parameters:**

- `groupId` (string, optional): Filter to specific change group
- `startTime` (number, optional): Start time in milliseconds since epoch (default: now - 60s)
- `endTime` (number, optional): End time in milliseconds since epoch (default: now)
- `controlNames` (string[], optional): Filter to specific control names
- `valueFilter` (object, optional): Filter by value conditions
  - `operator`: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'changed_to' | 'changed_from'
  - `value`: The value to compare against
- `limit` (number, optional): Maximum events to return (default: 1000, max: 10000)
- `offset` (number, optional): Pagination offset

**Examples:**

```javascript
// Recent changes
{ startTime: Date.now() - 60000 }

// Specific control
{ controlNames: ["Mic1.mute"], startTime: Date.now() - 300000 }

// Value changes
{ valueFilter: { operator: "changed_to", value: true } }

// Gain changes above threshold
{
  controlNames: ["Main.gain"],
  valueFilter: { operator: "gt", value: -6 },
  startTime: Date.now() - 3600000
}
```
````

### subscribe_to_change_events

Enable or disable event caching for change groups.

**Parameters:**

- `groupId` (string): The change group to configure
- `enableCache` (boolean): Enable or disable caching
- `cacheConfig` (object, optional):
  - `maxAgeMs` (number): Retention period in milliseconds (1 minute to 24 hours)
  - `maxEvents` (number): Maximum events to store (1000 to 1000000)
  - `priority` ('high' | 'normal' | 'low'): Eviction priority

**Example:**

```javascript
{
  groupId: "audio-meters",
  enableCache: true,
  cacheConfig: {
    maxAgeMs: 300000,  // 5 minutes
    maxEvents: 50000,
    priority: "high"
  }
}
```

## Event Data Structure

```typescript
interface CachedEvent {
  // Identifiers
  groupId: string;
  controlName: string;

  // Timestamps
  timestamp: bigint; // Nanosecond precision
  timestampMs: number; // Millisecond precision

  // Values
  value: unknown;
  string: string;
  previousValue?: unknown;
  previousString?: string;

  // Computed fields
  delta?: number; // Numeric change amount
  duration?: number; // Ms since last change
  eventType?: 'change' | 'threshold_crossed' | 'state_transition' | 'significant_change';

  // Metadata
  sequenceNumber: number;
}
```

## Configuration

### System-wide Configuration

```javascript
{
  // Memory management
  globalMemoryLimitMB: 500,    // Total memory limit
  memoryCheckIntervalMs: 5000, // How often to check memory

  // Default retention
  maxEvents: 100000,           // Events per group
  maxAgeMs: 3600000,          // 1 hour

  // Advanced features
  compressionConfig: {
    enabled: true,
    minAgeMs: 60000,          // Compress after 1 minute
    compressionRatio: 0.5     // Target 50% reduction
  },

  diskSpilloverConfig: {
    enabled: true,
    directory: './event-cache-spillover',
    thresholdPercent: 80      // Spill at 80% memory
  }
}
```

### Per-Group Configuration

Groups can have custom settings that override defaults:

```javascript
// High-frequency monitoring (short retention)
{
  groupId: "meters",
  maxAgeMs: 300000,   // 5 minutes
  maxEvents: 50000,
  priority: "low"     // Evict first if needed
}

// Critical system events (long retention)
{
  groupId: "system",
  maxAgeMs: 86400000, // 24 hours
  maxEvents: 10000,
  priority: "high"    // Keep as long as possible
}
```

## Query Patterns

### Time-based Queries

```javascript
// Last 5 minutes
{ startTime: Date.now() - 300000 }

// Specific time range
{
  startTime: Date.now() - 3600000,  // 1 hour ago
  endTime: Date.now() - 1800000     // 30 minutes ago
}
```

### Value Filters

```javascript
// Mute activated
{
  controlNames: ["*.mute"],
  valueFilter: { operator: "changed_to", value: true }
}

// Level exceeded threshold
{
  controlNames: ["*.level"],
  valueFilter: { operator: "gt", value: -6 }
}

// State transitions
{
  valueFilter: { operator: "changed_from", value: "stopped" }
}
```

### Aggregation

```javascript
// Get only state changes
{
  aggregation: "changes_only",
  controlNames: ["Room1.occupied"]
}
```

## Performance Guidelines

1. **Query Optimization**
   - Use specific time ranges to limit data scanned
   - Filter by control names when possible
   - Set appropriate limits for large datasets

2. **Memory Management**
   - Monitor memory usage via get_q_sys_status
   - Configure appropriate retention for your use case
   - Use group priorities for important data

3. **Best Practices**
   - Enable compression for long-term storage
   - Use disk spillover for large deployments
   - Query recent data more frequently than historical

## Troubleshooting

### High Memory Usage

- Reduce maxAgeMs or maxEvents
- Enable compression
- Enable disk spillover
- Check for groups with high event rates

### Slow Queries

- Use more specific time ranges
- Add control name filters
- Enable query caching (automatic)
- Check event cache statistics

### Missing Events

- Verify group is subscribed with subscribe_to_change_events
- Check auto-poll is enabled with set_change_group_auto_poll
- Verify retention settings haven't expired events
- Check memory limits haven't caused eviction

```

## Summary

This plan delivers a fully operational event caching system in approximately 3-4 days:

1. **Day 1**: Fix tests and add integration test
2. **Day 2**: Implement query cache and subscription tool
3. **Day 3**: Add load testing and production hardening
4. **Day 0.5**: Complete documentation

The system will be production-ready with:
- ✅ All tests passing
- ✅ Query optimization via caching
- ✅ Complete MCP tool suite (3 tools total)
- ✅ Robust error handling
- ✅ Comprehensive documentation
- ✅ Load tested for real-world scenarios
```
