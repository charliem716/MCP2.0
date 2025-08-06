# Event Monitoring API Documentation

## Overview

The Event Monitoring system provides MCP tools for recording, querying, and analyzing Q-SYS control changes over time. When enabled, these tools allow AI agents and clients to access historical data and monitor real-time changes.

## Prerequisites

- Event monitoring must be enabled (`EVENT_MONITORING_ENABLED=true`)
- At least one change group must be created and subscribed with auto-polling
- The MCP server must be connected to a Q-SYS Core

## Available Tools

### 1. `query_change_events`

Query historical control change events from the event monitoring database.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `startTime` | number | No | Start time (Unix timestamp in milliseconds) |
| `endTime` | number | No | End time (Unix timestamp in milliseconds) |
| `changeGroupId` | string | No | Filter by specific change group ID |
| `controlNames` | string[] | No | Filter by specific control names |
| `componentNames` | string[] | No | Filter by component names |
| `limit` | number | No | Maximum events to return (default: 1000, max: 10000) |
| `offset` | number | No | Number of events to skip for pagination |

#### Response

```typescript
{
  eventCount: number;
  events: Array<{
    timestamp: number;
    changeGroupId: string;
    controlName: string;
    componentName: string;
    value: any;
    previousValue?: any;
    source: string;
  }>;
  query: {
    startTime?: number;
    endTime?: number;
    changeGroupId?: string;
    controlNames?: string[];
    componentNames?: string[];
    limit: number;
    offset?: number;
  };
  executionTimeMs: number;
}
```

#### Example Usage

```javascript
// Query all events from the last hour
const result = await mcp.callTool('query_change_events', {
  startTime: Date.now() - 3600000,
  limit: 100
});

// Query events for specific controls
const volumeEvents = await mcp.callTool('query_change_events', {
  controlNames: ['Zone1.Volume', 'Zone2.Volume'],
  changeGroupId: 'audio-monitoring',
  limit: 50
});

// Paginated query
const page2 = await mcp.callTool('query_change_events', {
  limit: 100,
  offset: 100
});
```

### 2. `get_event_statistics`

Get comprehensive statistics about the event monitoring system.

#### Parameters

None - this tool takes no parameters.

#### Response

```typescript
{
  status: 'enabled' | 'disabled';
  statistics?: {
    totalEvents: number;
    uniqueControls: number;
    uniqueChangeGroups: number;
    oldestEvent: string | null;  // ISO 8601 timestamp
    newestEvent: string | null;  // ISO 8601 timestamp
    timeRange: {
      durationMs: number;
      durationHours: number;
    } | null;
    database: {
      sizeBytes: number;
      sizeMB: string;
    };
    buffer: {
      currentSize: number;
      maxSize: number;
      utilizationPercent: string;
    };
  };
  configuration: {
    enabled: boolean;
    dbPath: string;
    retentionDays: number;
    bufferSize: number;
    flushInterval: number;
  };
  executionTimeMs: number;
}
```

#### Example Usage

```javascript
const stats = await mcp.callTool('get_event_statistics', {});

console.log(`Total events recorded: ${stats.statistics.totalEvents}`);
console.log(`Database size: ${stats.statistics.database.sizeMB} MB`);
console.log(`Buffer utilization: ${stats.statistics.buffer.utilizationPercent}%`);
```

## Common Use Cases

### 1. Monitor Volume Changes

```javascript
// Create a change group for volume controls
await mcp.callTool('create_change_group', {
  id: 'volume-monitor',
  controls: [
    'Zone1.Volume',
    'Zone2.Volume',
    'MainMix.Volume',
    'MainMix.Mute'
  ]
});

// Enable auto-polling at 30Hz
await mcp.callTool('set_change_group_auto_poll', {
  changeGroupId: 'volume-monitor',
  interval: 33  // ~30Hz
});

// Query recent volume changes
const recentChanges = await mcp.callTool('query_change_events', {
  changeGroupId: 'volume-monitor',
  startTime: Date.now() - 60000,  // Last minute
  controlNames: ['Zone1.Volume', 'Zone2.Volume']
});
```

### 2. Analyze Usage Patterns

```javascript
// Get all events for a specific time period
const morningEvents = await mcp.callTool('query_change_events', {
  startTime: new Date('2024-01-15T09:00:00').getTime(),
  endTime: new Date('2024-01-15T12:00:00').getTime(),
  limit: 10000
});

// Group by control to find most active controls
const controlActivity = {};
morningEvents.events.forEach(event => {
  controlActivity[event.controlName] = (controlActivity[event.controlName] || 0) + 1;
});

console.log('Most active controls:', controlActivity);
```

### 3. Detect Rapid Changes

```javascript
// Query recent events with high frequency
const recentEvents = await mcp.callTool('query_change_events', {
  startTime: Date.now() - 5000,  // Last 5 seconds
  limit: 1000
});

// Detect controls changing more than 10 times per second
const rapidChanges = {};
recentEvents.events.forEach(event => {
  const key = `${event.controlName}:${Math.floor(event.timestamp / 1000)}`;
  rapidChanges[key] = (rapidChanges[key] || 0) + 1;
});

Object.entries(rapidChanges).forEach(([key, count]) => {
  if (count > 10) {
    console.log(`Rapid changes detected: ${key} changed ${count} times`);
  }
});
```

### 4. Monitor System Health

```javascript
// Regular health check function
async function checkEventMonitoringHealth() {
  const stats = await mcp.callTool('get_event_statistics', {});
  
  // Check if monitoring is active
  if (stats.status !== 'enabled') {
    console.error('Event monitoring is disabled!');
    return false;
  }
  
  // Check buffer utilization
  const bufferUtil = parseFloat(stats.statistics.buffer.utilizationPercent);
  if (bufferUtil > 80) {
    console.warn(`High buffer utilization: ${bufferUtil}%`);
  }
  
  // Check database size
  const dbSizeMB = parseFloat(stats.statistics.database.sizeMB);
  if (dbSizeMB > 1000) {  // 1GB warning threshold
    console.warn(`Large database size: ${dbSizeMB} MB`);
  }
  
  // Check recording rate
  const recentEvents = await mcp.callTool('query_change_events', {
    startTime: Date.now() - 60000,  // Last minute
    limit: 10000
  });
  
  const eventsPerSecond = recentEvents.eventCount / 60;
  console.log(`Current recording rate: ${eventsPerSecond.toFixed(1)} events/sec`);
  
  return true;
}
```

## Error Handling

Both tools return error responses when issues occur:

```javascript
{
  isError: true,
  content: [{
    type: 'text',
    text: 'Error message describing the issue'
  }]
}
```

Common error scenarios:

1. **Event monitoring not enabled**
   - Message: "Event monitoring is not enabled"
   - Solution: Set `EVENT_MONITORING_ENABLED=true`

2. **No active change groups**
   - Message: "Event monitoring is not active. Please create and subscribe to a change group first."
   - Solution: Create a change group and enable auto-polling

3. **Database errors**
   - Message: "Failed to query events: [error details]"
   - Solution: Check database file permissions and disk space

4. **Invalid parameters**
   - Message: "Invalid parameter: [parameter name]"
   - Solution: Verify parameter types and values

## Performance Considerations

### Query Optimization

1. **Use time ranges**: Always specify `startTime` and `endTime` when possible
2. **Limit results**: Use reasonable `limit` values (default: 1000)
3. **Filter by control**: Use `controlNames` to reduce result set
4. **Use pagination**: For large datasets, use `offset` and `limit`

### Example: Efficient Query

```javascript
// Good: Specific time range, filtered controls, reasonable limit
const efficientQuery = await mcp.callTool('query_change_events', {
  startTime: Date.now() - 300000,  // Last 5 minutes
  controlNames: ['Zone1.Volume'],   // Specific control
  limit: 100                        // Reasonable limit
});

// Avoid: No filters, large limit
const inefficientQuery = await mcp.callTool('query_change_events', {
  limit: 10000  // May be slow and memory-intensive
});
```

## Integration Examples

### With AI Agents

```python
# Python example using MCP client
import asyncio
from mcp_client import MCPClient

async def analyze_volume_patterns():
    client = MCPClient("ws://localhost:3000")
    
    # Get recent volume events
    events = await client.call_tool("query_change_events", {
        "controlNames": ["Zone1.Volume", "Zone2.Volume"],
        "startTime": int(time.time() * 1000) - 3600000
    })
    
    # Analyze patterns
    volumes = [e["value"] for e in events["events"]]
    avg_volume = sum(volumes) / len(volumes)
    
    return f"Average volume over last hour: {avg_volume:.2f}"
```

### With Node.js Applications

```javascript
const WebSocket = require('ws');

class EventMonitorClient {
  constructor(url) {
    this.ws = new WebSocket(url);
  }
  
  async queryRecentEvents(minutes = 5) {
    const request = {
      method: 'tools/call',
      params: {
        name: 'query_change_events',
        arguments: {
          startTime: Date.now() - (minutes * 60000)
        }
      }
    };
    
    this.ws.send(JSON.stringify(request));
    
    return new Promise((resolve) => {
      this.ws.on('message', (data) => {
        const response = JSON.parse(data);
        resolve(response.result);
      });
    });
  }
}
```

## Limitations

1. **Maximum query limit**: 10,000 events per query
2. **Retention period**: Configurable, typically 7-30 days
3. **Recording rate**: Optimized for 33Hz, tested up to 60Hz
4. **Storage**: SQLite database limitations apply
5. **Memory**: Buffer size limited by available RAM

## Best Practices

1. **Regular Statistics Checks**: Monitor system health with `get_event_statistics`
2. **Time-Bounded Queries**: Always use time ranges to limit query scope
3. **Appropriate Polling Rates**: Balance data granularity with system load
4. **Clean Up Old Data**: Set appropriate retention periods
5. **Monitor Buffer Usage**: Watch for high buffer utilization

## Troubleshooting

See [EVENT_MONITORING_TROUBLESHOOTING.md](./EVENT_MONITORING_TROUBLESHOOTING.md) for detailed troubleshooting guides.