# Change Group Event Cache Implementation Plan

## Overview

This plan details the implementation of a time-series event cache system for Q-SYS Change Groups. The system will capture all control value changes with high-precision timestamps, store them in an efficient circular buffer, and provide powerful query capabilities for both real-time and historical analysis.

## Key Features

1. **High-frequency event capture** (up to 33Hz per control)
2. **Time-series storage** with nanosecond precision timestamps
3. **Configurable retention** policies (time and size based)
4. **Advanced query capabilities** for historical analysis
5. **Smart compression** for older events
6. **Real-time event subscription** support

## Architecture

### Event Flow
```
Q-SYS Core → AutoPoll Timer → Change Detection → Event Cache → Query Interface
                                        ↓
                                 Event Subscribers
```

### Core Components

#### 1. Event Cache Manager (`src/mcp/state/event-cache-manager.ts`)
- Manages multiple circular buffers (one per change group)
- Handles event insertion with timestamp generation
- Performs automatic cleanup and compression
- Provides query execution engine

#### 2. Event Storage Structure
```typescript
interface CachedEvent {
  // Core event data
  groupId: string;
  controlName: string;
  timestamp: bigint;        // nanosecond precision (process.hrtime.bigint())
  timestampMs: number;      // millisecond timestamp for queries
  
  // Value information
  value: unknown;
  string: string;
  previousValue?: unknown;
  previousString?: string;
  
  // Computed fields
  delta?: number;           // For numeric values: value - previousValue
  duration?: number;        // Ms since last change of this control
  eventType?: 'change' | 'threshold_crossed' | 'state_transition';
  
  // Metadata
  sequenceNumber: number;   // Global sequence for ordering
  compressed?: boolean;     // True if this is a compressed event
}

interface EventCacheConfig {
  maxAgeMs: number;         // Default: 3600000 (1 hour)
  maxEvents: number;        // Default: 100000 events
  compressionStrategy: {
    recentWindowMs: number;     // Keep full resolution (default: 60000 - 1 min)
    mediumWindowMs: number;     // Keep significant changes (default: 600000 - 10 min)
    ancientWindowMs: number;    // Keep state transitions only (default: 3600000 - 1 hour)
  };
  indexingEnabled: boolean;  // Enable secondary indexes
}
```

#### 3. Circular Buffer Implementation
```typescript
class CircularEventBuffer {
  private events: CachedEvent[];
  private head: number = 0;
  private tail: number = 0;
  private size: number = 0;
  private readonly capacity: number;
  
  // Secondary indexes for fast queries
  private timeIndex: BTree<bigint, number>;        // timestamp -> buffer position
  private controlIndex: Map<string, Set<number>>;  // controlName -> positions
  
  // Compression state
  private lastCompressionRun: number = 0;
  private compressionStats: CompressionStats;
}
```

#### 4. Query Engine
```typescript
interface EventQuery {
  // Time range filtering
  startTime?: number;       // Unix timestamp ms (default: now - 60s)
  endTime?: number;         // Unix timestamp ms (default: now)
  
  // Control filtering
  groupId?: string;         // Optional: query specific group
  controlNames?: string[];  // Optional: filter specific controls
  
  // Value filtering
  valueFilter?: {
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 
              'contains' | 'changed_to' | 'changed_from' | 
              'between' | 'in' | 'regex';
    value: unknown;
    value2?: unknown;     // For 'between' operator
  };
  
  // Result options
  aggregation?: 'raw' | 'changes_only' | 'summary' | 'statistics';
  orderBy?: 'timestamp' | 'controlName' | 'value';
  orderDirection?: 'asc' | 'desc';
  limit?: number;           // Max events to return (default: 1000)
  offset?: number;          // For pagination
  
  // Advanced options
  includePrevious?: boolean;    // Include previousValue in results
  includeDeltas?: boolean;      // Calculate and include deltas
  groupByControl?: boolean;     // Group results by control name
}

interface QueryResult {
  events: CachedEvent[];
  totalCount: number;
  executionTimeMs: number;
  fromCache: boolean;
  summary?: EventSummary;
}

interface EventSummary {
  timeRange: { start: number; end: number };
  uniqueControls: number;
  totalEvents: number;
  eventsPerControl: Map<string, number>;
  statistics?: {
    [controlName: string]: {
      count: number;
      minValue?: number;
      maxValue?: number;
      avgValue?: number;
      stdDev?: number;
      valueDistribution?: Map<unknown, number>;
      totalDuration?: number;
    };
  };
}
```

## Implementation Steps

### Phase 1: Core Event Cache Infrastructure

#### Step 1.1: Create Event Cache Manager
1. Implement `CircularEventBuffer` class with basic add/get operations
2. Add time-based indexing using B-tree for efficient range queries
3. Implement automatic cleanup of events older than maxAgeMs
4. Add event count limits and eviction policy

#### Step 1.2: Integrate with QRWCAdapter
1. Modify `ChangeGroup.Poll` to emit events to cache
2. Add high-precision timestamp generation
3. Calculate deltas and duration for numeric values
4. Preserve previous values for comparison

#### Step 1.3: Implement Basic Query Engine
1. Time range filtering with index lookup
2. Control name filtering
3. Basic value comparison operators
4. Result limiting and ordering

### Phase 2: Advanced Features

#### Step 2.1: Smart Compression
1. Implement three-tier compression strategy:
   - Recent (< 1 min): Keep all events
   - Medium (1-10 min): Keep significant changes (> 5% delta)
   - Ancient (> 10 min): Keep state transitions only
2. Background compression task
3. Compression statistics tracking

#### Step 2.2: Advanced Query Operators
1. `changed_to` / `changed_from` operators
2. `between` and `in` operators for ranges
3. Regular expression matching for string values
4. Compound queries with multiple filters

#### Step 2.3: Aggregation and Statistics
1. Summary statistics calculation
2. Value distribution analysis
3. Time-spent-in-state calculations
4. Control grouping and aggregation

### Phase 3: MCP Tool Integration

#### Step 3.1: Create `read_change_group_events` Tool
```typescript
class ReadChangeGroupEventsTool extends BaseQSysTool {
  name = "read_change_group_events";
  description = `Query historical change events from monitored change groups. 
    Supports time-range queries, control filtering, and value-based searches. 
    Perfect for answering questions like "What controls changed in the last 5 minutes?" 
    or "When did the microphone get unmuted?". 
    Returns up to 1000 events by default, ordered by timestamp.
    
    Examples:
    - Recent changes: {startTime: Date.now()-60000}
    - Specific control: {controlNames: ["Mic1.mute"], startTime: Date.now()-300000}
    - Value changes: {valueFilter: {operator: "changed_to", value: true}}
    - Statistics: {aggregation: "summary", startTime: Date.now()-3600000}`;
    
  schema = z.object({
    groupId: z.string().optional(),
    startTime: z.number().optional(),
    endTime: z.number().optional(),
    controlNames: z.array(z.string()).optional(),
    valueFilter: z.object({
      operator: z.enum(['eq','neq','gt','gte','lt','lte','contains',
                       'changed_to','changed_from','between','in','regex']),
      value: z.unknown(),
      value2: z.unknown().optional()
    }).optional(),
    aggregation: z.enum(['raw','changes_only','summary','statistics']).optional(),
    limit: z.number().min(1).max(10000).optional(),
    includeDeltas: z.boolean().optional()
  });
}
```

#### Step 3.2: Create `subscribe_to_change_events` Tool
```typescript
class SubscribeToChangeEventsTool extends BaseQSysTool {
  name = "subscribe_to_change_events";
  description = `Subscribe to real-time change events from a change group. 
    Events are automatically cached and can be queried later using read_change_group_events. 
    Subscription enables both real-time monitoring and historical analysis.
    Note: You must call set_change_group_auto_poll to start receiving events.`;
    
  schema = z.object({
    groupId: z.string(),
    enableCache: z.boolean().default(true),
    cacheConfig: z.object({
      maxAgeMs: z.number().min(60000).max(86400000).optional(),
      maxEvents: z.number().min(1000).max(1000000).optional()
    }).optional()
  });
}
```

#### Step 3.3: Create `get_event_cache_stats` Tool
```typescript
class GetEventCacheStatsTool extends BaseQSysTool {
  name = "get_event_cache_stats";
  description = "Get statistics about the event cache including size, compression ratio, and memory usage.";
  
  schema = z.object({
    groupId: z.string().optional()
  });
}
```

### Phase 4: Memory Management & Optimization

#### Step 4.1: Implement Memory Monitoring
1. Track buffer memory usage
2. Implement memory pressure callbacks
3. Aggressive compression under memory pressure
4. Optional disk spillover for large datasets

#### Step 4.2: Query Optimization
1. Query result caching for repeated queries
2. Prepared query templates
3. Parallel query execution for multi-group queries
4. Index optimization based on query patterns

#### Step 4.3: Performance Monitoring
1. Query execution time tracking
2. Cache hit/miss ratios
3. Compression effectiveness metrics
4. Event ingestion rate monitoring

## Usage Examples

### Example 1: "Have any microphones been unmuted in the last 5 minutes?"
```typescript
{
  startTime: Date.now() - 300000,
  controlNames: ["Mic1.mute", "Mic2.mute", "Mic3.mute", "Mic4.mute"],
  valueFilter: {
    operator: "changed_to",
    value: false
  }
}
```

### Example 2: "Show me the gain changes on the main output over the last hour"
```typescript
{
  startTime: Date.now() - 3600000,
  controlNames: ["MainOutput.gain"],
  includeDeltas: true,
  orderBy: "timestamp",
  orderDirection: "desc"
}
```

### Example 3: "What's the average SPL reading from the room sensor today?"
```typescript
{
  startTime: Date.now() - 86400000,  // 24 hours
  controlNames: ["RoomSensor.spl"],
  aggregation: "statistics"
}
```

### Example 4: "Alert me when any level exceeds -6dB"
```typescript
{
  controlNames: ["MainOutput.level", "Monitor1.level", "Monitor2.level"],
  valueFilter: {
    operator: "gt",
    value: -6
  },
  startTime: Date.now() - 1000  // Last second only
}
```

## Configuration

### Default Settings
```typescript
const DEFAULT_CACHE_CONFIG = {
  maxAgeMs: 3600000,        // 1 hour
  maxEvents: 100000,        // Per change group
  compressionStrategy: {
    recentWindowMs: 60000,      // 1 minute
    mediumWindowMs: 600000,     // 10 minutes  
    ancientWindowMs: 3600000    // 1 hour
  },
  compressionThresholds: {
    numericDeltaPercent: 5,     // Keep if > 5% change
    minTimeBetweenEvents: 100   // Min 100ms between compressed events
  }
};
```

### Per-Group Overrides
```typescript
// High-frequency metering
eventCache.configureGroup("meter-group", {
  maxAgeMs: 300000,         // 5 minutes (shorter retention)
  maxEvents: 50000,         // Higher event count
  compressionStrategy: {
    recentWindowMs: 10000,  // 10 seconds full resolution
    mediumWindowMs: 60000,  // 1 minute medium
    ancientWindowMs: 300000 // 5 minutes total
  }
});

// Critical system monitoring  
eventCache.configureGroup("system-health", {
  maxAgeMs: 86400000,      // 24 hours retention
  maxEvents: 10000,        // Lower frequency expected
  compressionStrategy: {
    recentWindowMs: 3600000,    // No compression for 1 hour
    mediumWindowMs: 43200000,   // 12 hours medium
    ancientWindowMs: 86400000   // 24 hours total
  }
});
```

## Performance Considerations

### Memory Usage
- Base overhead: ~200 bytes per event
- With indexes: ~300 bytes per event  
- 100k events ≈ 30MB RAM
- Compression can reduce by 50-80%

### Query Performance
- Time range queries: O(log n) with index
- Control name filter: O(1) with hash index
- Value filters: O(n) in filtered range
- Aggregations: O(n) with early termination

### Ingestion Rate
- Target: 1000+ events/second
- 33Hz × 30 controls = 990 events/second peak
- Batched inserts for efficiency
- Lock-free ring buffer for low contention

## Testing Strategy

### Unit Tests
1. Circular buffer operations
2. Compression algorithms
3. Query operators
4. Index maintenance
5. Memory management

### Integration Tests
1. End-to-end event flow
2. Multi-group scenarios
3. High-frequency ingestion
4. Complex queries
5. Memory pressure handling

### Performance Tests
1. 33Hz sustained ingestion
2. 100k+ event queries
3. Concurrent read/write
4. Memory usage validation
5. Compression effectiveness

## Migration Path

1. **Phase 1**: Deploy alongside existing polling (no breaking changes)
2. **Phase 2**: Update tools to use event cache for queries
3. **Phase 3**: Add real-time subscription support
4. **Phase 4**: Deprecate simple polling in favor of cache queries

## Success Metrics

1. Support 33Hz update rate per control
2. Sub-millisecond event insertion
3. < 100ms query response for 10k events
4. < 50MB memory per 100k events
5. 50%+ compression ratio for old events