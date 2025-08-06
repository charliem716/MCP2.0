# Event Monitoring Performance Tuning Guide

This guide helps optimize the event monitoring system for various workloads and deployment scenarios.

## Performance Benchmarks

Current system capabilities (verified):
- **Recording Rate**: 60+ events/second sustained
- **Query Speed**: <100ms for hourly data
- **Storage Efficiency**: ~10MB per million events
- **Memory Overhead**: <50MB with 1000-event buffer
- **CPU Usage**: <5% for typical workloads

## Configuration Parameters

### Critical Performance Settings

```bash
# Buffer Configuration
EVENT_MONITORING_BUFFER_SIZE=1000      # Events buffered before flush
EVENT_MONITORING_FLUSH_INTERVAL=100    # Milliseconds between flushes

# Storage Configuration  
EVENT_MONITORING_DB_PATH=./data/events # Database location
EVENT_MONITORING_RETENTION_DAYS=7      # Days to keep data
```

## Performance Profiles

### 1. High-Frequency Monitoring (Audio Meters, Real-time)

**Use Case**: Recording meter levels, real-time audio parameters at 30+ Hz

**Configuration**:
```bash
EVENT_MONITORING_BUFFER_SIZE=2000      # Larger buffer for bursts
EVENT_MONITORING_FLUSH_INTERVAL=50     # Frequent flushes
EVENT_MONITORING_RETENTION_DAYS=3      # Shorter retention
```

**Change Group Settings**:
```javascript
await mcp.callTool('set_change_group_auto_poll', {
  changeGroupId: 'audio-meters',
  interval: 30  // 33Hz polling
});
```

**Optimization Tips**:
- Use SSD storage for database files
- Monitor specific controls only (not entire components)
- Consider separate change groups for different frequencies

### 2. Standard Monitoring (Control Changes, User Actions)

**Use Case**: Tracking user interactions, control adjustments

**Configuration**:
```bash
EVENT_MONITORING_BUFFER_SIZE=1000      # Standard buffer
EVENT_MONITORING_FLUSH_INTERVAL=100    # Balanced flush rate
EVENT_MONITORING_RETENTION_DAYS=7      # Week of history
```

**Change Group Settings**:
```javascript
await mcp.callTool('set_change_group_auto_poll', {
  changeGroupId: 'user-controls',
  interval: 100  // 10Hz polling
});
```

**Optimization Tips**:
- Group related controls in single change groups
- Use appropriate polling intervals for control types
- Enable monitoring only during business hours if applicable

### 3. Low-Frequency Monitoring (Status, Environmental)

**Use Case**: System status, temperature sensors, occupancy

**Configuration**:
```bash
EVENT_MONITORING_BUFFER_SIZE=500       # Smaller buffer
EVENT_MONITORING_FLUSH_INTERVAL=1000   # Infrequent flushes
EVENT_MONITORING_RETENTION_DAYS=30     # Longer retention
```

**Change Group Settings**:
```javascript
await mcp.callTool('set_change_group_auto_poll', {
  changeGroupId: 'environmental',
  interval: 5000  // Poll every 5 seconds
});
```

**Optimization Tips**:
- Larger flush intervals reduce disk I/O
- Longer retention feasible with fewer events
- Combine multiple low-frequency monitors

### 4. Burst Recording (Events, Triggers)

**Use Case**: Conference starts/stops, scene changes, alerts

**Configuration**:
```bash
EVENT_MONITORING_BUFFER_SIZE=5000      # Very large buffer
EVENT_MONITORING_FLUSH_INTERVAL=200    # Less frequent flushes
EVENT_MONITORING_RETENTION_DAYS=14     # Two weeks retention
```

**Optimization Tips**:
- Large buffers handle sudden bursts
- Longer flush intervals during quiet periods
- Consider event-driven polling instead of continuous

## Query Optimization

### Efficient Query Patterns

#### 1. Time-Bounded Queries
```javascript
// GOOD: Specific time window
const efficient = await mcp.callTool('query_change_events', {
  startTime: Date.now() - 300000,  // 5 minutes
  endTime: Date.now(),
  limit: 100
});

// BAD: Open-ended query
const inefficient = await mcp.callTool('query_change_events', {
  limit: 10000  // No time bounds
});
```

#### 2. Filtered Queries
```javascript
// GOOD: Specific controls
const filtered = await mcp.callTool('query_change_events', {
  controlNames: ['Zone1.Volume'],
  changeGroupId: 'audio',
  startTime: Date.now() - 60000
});

// BAD: All controls
const unfiltered = await mcp.callTool('query_change_events', {
  startTime: Date.now() - 3600000  // All controls for an hour
});
```

#### 3. Paginated Queries
```javascript
// GOOD: Paginated results
async function* getEventsPaginated(startTime, endTime) {
  let offset = 0;
  const limit = 1000;
  
  while (true) {
    const result = await mcp.callTool('query_change_events', {
      startTime,
      endTime,
      limit,
      offset
    });
    
    yield result.events;
    
    if (result.events.length < limit) break;
    offset += limit;
  }
}

// Use pagination
for await (const batch of getEventsPaginated(start, end)) {
  processBatch(batch);
}
```

## Database Optimization

### SQLite Tuning

The system uses these SQLite optimizations:

```sql
-- Indexes (automatically created)
CREATE INDEX idx_timestamp ON events(timestamp);
CREATE INDEX idx_control ON events(control_name);
CREATE INDEX idx_change_group ON events(change_group_id);

-- Pragmas (set by system)
PRAGMA journal_mode = WAL;        -- Write-ahead logging
PRAGMA synchronous = NORMAL;      -- Balance safety/speed
PRAGMA cache_size = 10000;        -- 10MB cache
PRAGMA temp_store = MEMORY;       -- Use RAM for temp tables
```

### Manual Optimization

#### 1. Vacuum Database (Monthly)
```bash
# During maintenance window
sqlite3 ./data/events/events-*.db "VACUUM;"
```

#### 2. Analyze Statistics (Weekly)
```bash
# Update query planner statistics
sqlite3 ./data/events/events-*.db "ANALYZE;"
```

#### 3. Check Integrity (Monthly)
```bash
# Verify database health
sqlite3 ./data/events/events-*.db "PRAGMA integrity_check;"
```

## Memory Optimization

### Buffer Management

#### Calculate Optimal Buffer Size
```javascript
// Formula: Buffer Size = Events/Second × Flush Interval(ms) / 1000 × Safety Factor

// Example: 30 events/sec, 100ms flush, 2x safety
const optimalBuffer = 30 * 100 / 1000 * 2;  // 60 events

// Round up to nearest hundred
const bufferSize = Math.ceil(optimalBuffer / 100) * 100;  // 100
```

#### Memory Usage Estimation
```javascript
// Each buffered event uses approximately:
// - Control name: 50 bytes
// - Value: 100 bytes  
// - Metadata: 150 bytes
// Total: ~300 bytes per event

// Buffer memory usage:
const memoryMB = (bufferSize * 300) / (1024 * 1024);
console.log(`Buffer will use ~${memoryMB.toFixed(1)} MB`);
```

### Monitoring Memory Usage

```javascript
async function checkMemoryUsage() {
  const stats = await mcp.callTool('get_event_statistics', {});
  
  const bufferUsage = stats.statistics.buffer.currentSize;
  const bufferMax = stats.statistics.buffer.maxSize;
  const utilization = parseFloat(stats.statistics.buffer.utilizationPercent);
  
  console.log(`Buffer: ${bufferUsage}/${bufferMax} (${utilization}%)`);
  
  if (utilization > 80) {
    console.warn('Consider increasing buffer size or flush frequency');
  }
  
  // Node.js memory
  const mem = process.memoryUsage();
  console.log(`Heap: ${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB`);
}
```

## CPU Optimization

### Reduce CPU Load

#### 1. Batch Operations
```javascript
// GOOD: Batch control updates
const controls = ['Zone1.Volume', 'Zone2.Volume', 'Zone3.Volume'];
await mcp.callTool('add_controls_to_change_group', {
  changeGroupId: 'audio',
  controls  // Add all at once
});

// BAD: Individual updates
for (const control of controls) {
  await mcp.callTool('add_controls_to_change_group', {
    changeGroupId: 'audio',
    controls: [control]  // One at a time
  });
}
```

#### 2. Appropriate Polling Rates
```javascript
// Match polling rate to actual change frequency
const pollingRates = {
  'audio-meters': 30,      // 33Hz for real-time meters
  'user-controls': 100,    // 10Hz for user interactions  
  'system-status': 1000,   // 1Hz for status
  'environmental': 5000    // 0.2Hz for slow sensors
};

for (const [groupId, interval] of Object.entries(pollingRates)) {
  await mcp.callTool('set_change_group_auto_poll', {
    changeGroupId: groupId,
    interval
  });
}
```

## Disk I/O Optimization

### Storage Configuration

#### 1. Use SSD Storage
```bash
# Move database to SSD
EVENT_MONITORING_DB_PATH=/mnt/ssd/events
```

#### 2. Separate Database Drive
```bash
# Isolate event database I/O
EVENT_MONITORING_DB_PATH=/mnt/events-drive/data
```

#### 3. RAM Disk for Extreme Performance
```bash
# Create RAM disk (Linux)
sudo mkdir /mnt/ramdisk
sudo mount -t tmpfs -o size=1G tmpfs /mnt/ramdisk

# Configure path
EVENT_MONITORING_DB_PATH=/mnt/ramdisk/events

# Note: Data lost on reboot - backup regularly!
```

### Write Optimization

#### Batch Write Settings
```javascript
// Optimize for write performance
const writeOptimized = {
  bufferSize: 2000,      // Larger buffer
  flushInterval: 200,    // Less frequent writes
  retentionDays: 3       // Shorter retention
};

// Optimize for data safety
const safetyOptimized = {
  bufferSize: 100,       // Small buffer
  flushInterval: 50,     // Frequent writes
  retentionDays: 14      // Longer retention
};
```

## Monitoring Performance

### Performance Metrics Script

Create `monitor-performance.js`:

```javascript
#!/usr/bin/env node

const SAMPLE_DURATION = 60000; // 1 minute

async function monitorPerformance() {
  const mcp = require('./mcp-client');
  
  // Get initial statistics
  const startStats = await mcp.callTool('get_event_statistics', {});
  const startEvents = startStats.statistics.totalEvents;
  const startTime = Date.now();
  
  console.log('Monitoring performance for 1 minute...');
  
  // Wait for sample period
  await new Promise(r => setTimeout(r, SAMPLE_DURATION));
  
  // Get final statistics
  const endStats = await mcp.callTool('get_event_statistics', {});
  const endEvents = endStats.statistics.totalEvents;
  const endTime = Date.now();
  
  // Calculate metrics
  const duration = (endTime - startTime) / 1000;
  const eventsRecorded = endEvents - startEvents;
  const eventsPerSecond = eventsRecorded / duration;
  
  // Query performance test
  const queryStart = Date.now();
  await mcp.callTool('query_change_events', {
    startTime: startTime,
    endTime: endTime,
    limit: 1000
  });
  const queryTime = Date.now() - queryStart;
  
  // Report results
  console.log('\n=== Performance Report ===');
  console.log(`Recording Rate: ${eventsPerSecond.toFixed(1)} events/sec`);
  console.log(`Total Events: ${eventsRecorded}`);
  console.log(`Query Time (1000 events): ${queryTime}ms`);
  console.log(`Buffer Utilization: ${endStats.statistics.buffer.utilizationPercent}%`);
  console.log(`Database Size: ${endStats.statistics.database.sizeMB} MB`);
  
  // Recommendations
  if (eventsPerSecond > 50) {
    console.log('\n⚠️  High event rate detected');
    console.log('Consider: Increasing buffer size or reducing polling frequency');
  }
  
  if (queryTime > 1000) {
    console.log('\n⚠️  Slow query performance');
    console.log('Consider: Adding time bounds to queries or using pagination');
  }
  
  const bufferUtil = parseFloat(endStats.statistics.buffer.utilizationPercent);
  if (bufferUtil > 80) {
    console.log('\n⚠️  High buffer utilization');
    console.log('Consider: Increasing buffer size or flush frequency');
  }
}

monitorPerformance().catch(console.error);
```

## Scaling Guidelines

### Vertical Scaling (Single Server)

| Workload | Events/Sec | Buffer Size | Flush Interval | RAM Needed | CPU Cores |
|----------|------------|-------------|----------------|------------|-----------|
| Light | <10 | 500 | 200ms | 2GB | 1 |
| Medium | 10-30 | 1000 | 100ms | 4GB | 2 |
| Heavy | 30-60 | 2000 | 50ms | 8GB | 4 |
| Extreme | 60+ | 5000 | 50ms | 16GB | 8 |

### Horizontal Scaling (Multiple Servers)

For very large deployments:

1. **Partition by Change Groups**
   - Server A: Audio monitoring
   - Server B: Video monitoring
   - Server C: Environmental monitoring

2. **Partition by Time**
   - Server A: Real-time (last hour)
   - Server B: Recent (last day)
   - Server C: Archive (older data)

3. **Read Replicas**
   - Primary: Handles writes
   - Replicas: Handle queries

## Best Practices Summary

1. **Match polling rates to actual change frequencies**
2. **Use time-bounded queries whenever possible**
3. **Configure buffer size based on event rate**
4. **Place databases on SSD storage**
5. **Monitor buffer utilization regularly**
6. **Vacuum databases monthly**
7. **Set appropriate retention periods**
8. **Use pagination for large result sets**
9. **Filter queries by specific controls**
10. **Regular performance monitoring**

## Troubleshooting Performance Issues

See [EVENT_MONITORING_TROUBLESHOOTING.md](./EVENT_MONITORING_TROUBLESHOOTING.md) for detailed troubleshooting steps.