# MCP Tools API Reference

## Overview

The MCP Q-SYS Server provides a comprehensive set of tools for controlling and monitoring Q-SYS audio/video systems through the Model Context Protocol. These tools enable AI agents to discover components, manipulate controls, monitor status, and track changes in real-time.

## Tool Categories

### 🎛️ Component Management
- `list_components` - Discover Q-SYS components
- `get_component_controls` - Get controls for a specific component

### 🔧 Control Operations
- `list_controls` - List available controls with filtering
- `get_control_values` - Read current control values
- `set_control_values` - Modify control values

### 📊 System Status
- `query_core_status` - Get Q-SYS Core system status
- `get_all_controls` - Comprehensive control discovery

### 🔄 Change Groups
- `create_change_group` - Create a new change group
- `add_controls_to_change_group` - Add controls to monitor
- `poll_change_group` - Get latest changes
- `set_change_group_auto_poll` - Enable/disable auto-polling
- `list_change_groups` - List active change groups
- `remove_controls_from_change_group` - Remove specific controls
- `clear_change_group` - Clear all controls
- `destroy_change_group` - Delete change group

### 📈 Event Monitoring
- `query_change_events` - Query historical events
- `get_event_statistics` - Get event statistics

### 🔌 Direct API Access
- `query_qsys_api` - Direct Q-SYS API access

## Detailed Tool Documentation

### 1. `list_components`

Lists all components in the Q-SYS design with optional filtering.

**Parameters:**
```typescript
{
  filter?: string;           // Filter pattern for component names
  includeProperties?: boolean; // Include detailed properties (default: false)
}
```

**Example Request:**
```json
{
  "tool": "list_components",
  "arguments": {
    "filter": "Mixer",
    "includeProperties": true
  }
}
```

**Example Response:**
```json
{
  "components": [
    {
      "name": "MainMixer",
      "type": "Mixer",
      "properties": {
        "channels": 8,
        "hasMatrixMixer": true
      }
    }
  ],
  "count": 1
}
```

---

### 2. `get_component_controls`

Gets all controls for a specific component.

**Parameters:**
```typescript
{
  componentName: string;  // Name of the component
}
```

**Example Request:**
```json
{
  "tool": "get_component_controls",
  "arguments": {
    "componentName": "MainMixer"
  }
}
```

**Example Response:**
```json
{
  "controls": [
    {
      "name": "gain",
      "type": "gain",
      "value": -10.5,
      "string": "-10.5 dB",
      "position": 0.75,
      "metadata": {
        "min": -100,
        "max": 20,
        "units": "dB"
      }
    }
  ]
}
```

---

### 3. `list_controls`

Lists available controls with advanced filtering options.

**Parameters:**
```typescript
{
  component?: string;      // Filter by component name
  controlType?: 'gain' | 'mute' | 'input_select' | 'output_select' | 'all';
  includeMetadata?: boolean; // Include min/max values and units
}
```

**Example Request:**
```json
{
  "tool": "list_controls",
  "arguments": {
    "component": "MainMixer",
    "controlType": "gain",
    "includeMetadata": true
  }
}
```

---

### 4. `get_control_values`

Gets current values of specified controls.

**Parameters:**
```typescript
{
  controls: Array<{
    component: string;  // Component name
    name: string;      // Control name
  }>;
}
```

**Example Request:**
```json
{
  "tool": "get_control_values",
  "arguments": {
    "controls": [
      { "component": "MainMixer", "name": "gain" },
      { "component": "MainMixer", "name": "mute" }
    ]
  }
}
```

**Example Response:**
```json
{
  "values": [
    {
      "component": "MainMixer",
      "name": "gain",
      "value": -10.5,
      "string": "-10.5 dB",
      "position": 0.75
    },
    {
      "component": "MainMixer",
      "name": "mute",
      "value": 0,
      "string": "false",
      "position": 0
    }
  ]
}
```

---

### 5. `set_control_values`

Sets values for specified controls.

**Parameters:**
```typescript
{
  controls: Array<{
    component: string;  // Component name
    name: string;      // Control name
    value?: number;    // Numeric value
    position?: number; // Position (0.0 to 1.0)
    ramp?: number;     // Ramp time in seconds
  }>;
}
```

**Example Request:**
```json
{
  "tool": "set_control_values",
  "arguments": {
    "controls": [
      {
        "component": "MainMixer",
        "name": "gain",
        "value": -5.0,
        "ramp": 2.0
      },
      {
        "component": "MainMixer",
        "name": "mute",
        "value": 1
      }
    ]
  }
}
```

---

### 6. `query_core_status`

Gets comprehensive Q-SYS Core system status.

**Parameters:**
```typescript
{
  includeDesignInfo?: boolean;  // Include design details
  includeNetworkInfo?: boolean; // Include network status
}
```

**Example Response:**
```json
{
  "status": {
    "code": 0,
    "string": "OK",
    "designName": "Conference_Room_A",
    "designCode": "ABC123",
    "isRedundant": false,
    "isEmulator": false,
    "platform": "Core 110f",
    "coreId": "CORE-12345",
    "uptime": 3600
  }
}
```

---

### 7. `get_all_controls`

Discovers all available controls across all components.

**Parameters:**
```typescript
{
  includeMetadata?: boolean;  // Include control metadata
  groupByComponent?: boolean; // Group results by component
}
```

---

### 8. `create_change_group`

Creates a new change group for monitoring control changes.

**Parameters:**
```typescript
{
  id: string;           // Unique identifier for the group
  pollInterval?: number; // Auto-poll interval in ms (min: 30ms)
}
```

**Example Request:**
```json
{
  "tool": "create_change_group",
  "arguments": {
    "id": "mixer-monitor",
    "pollInterval": 100
  }
}
```

---

### 9. `add_controls_to_change_group`

Adds controls to an existing change group for monitoring.

**Parameters:**
```typescript
{
  id: string;           // Change group ID
  controls: Array<{
    component: string;  // Component name
    name: string;      // Control name
  }>;
}
```

**Example Request:**
```json
{
  "tool": "add_controls_to_change_group",
  "arguments": {
    "id": "mixer-monitor",
    "controls": [
      { "component": "MainMixer", "name": "gain" },
      { "component": "MainMixer", "name": "mute" }
    ]
  }
}
```

---

### 10. `poll_change_group`

Polls a change group for recent changes.

**Parameters:**
```typescript
{
  id: string;  // Change group ID
}
```

**Example Response:**
```json
{
  "changes": [
    {
      "component": "MainMixer",
      "name": "gain",
      "value": -5.0,
      "string": "-5.0 dB",
      "timestamp": 1642000000000
    }
  ]
}
```

---

### 11. `set_change_group_auto_poll`

Enables or disables automatic polling for a change group.

**Parameters:**
```typescript
{
  id: string;           // Change group ID
  enabled: boolean;     // Enable/disable auto-polling
  interval?: number;    // Poll interval in ms (if enabling)
}
```

---

### 12. `list_change_groups`

Lists all active change groups.

**Parameters:** None

**Example Response:**
```json
{
  "groups": [
    {
      "id": "mixer-monitor",
      "controlCount": 2,
      "autoPoll": true,
      "pollInterval": 100,
      "created": 1642000000000
    }
  ]
}
```

---

### 13. `query_change_events`

Queries historical control change events from the monitoring system.

**Parameters:**
```typescript
{
  startTime?: number;       // Start time (Unix timestamp ms)
  endTime?: number;         // End time (Unix timestamp ms)
  changeGroupId?: string;   // Filter by change group ID
  controlNames?: string[];  // Filter by control names
  componentNames?: string[]; // Filter by component names
  limit?: number;          // Max events (default: 1000, max: 10000)
  offset?: number;         // Skip events for pagination
}
```

**Example Request:**
```json
{
  "tool": "query_change_events",
  "arguments": {
    "changeGroupId": "mixer-monitor",
    "limit": 100,
    "startTime": 1642000000000
  }
}
```

**Example Response:**
```json
{
  "events": [
    {
      "timestamp": 1642000001000,
      "changeGroupId": "mixer-monitor",
      "component": "MainMixer",
      "control": "gain",
      "oldValue": -10.5,
      "newValue": -5.0,
      "string": "-5.0 dB"
    }
  ],
  "count": 1,
  "hasMore": false
}
```

---

### 14. `get_event_statistics`

Gets statistical summary of recorded events.

**Parameters:**
```typescript
{
  startTime?: number;      // Start time for statistics
  endTime?: number;        // End time for statistics
  groupBy?: 'component' | 'control' | 'changeGroup' | 'hour' | 'day';
}
```

**Example Response:**
```json
{
  "statistics": {
    "totalEvents": 1523,
    "timeRange": {
      "start": 1642000000000,
      "end": 1642003600000
    },
    "eventsByComponent": {
      "MainMixer": 523,
      "ZoneMixer": 1000
    },
    "eventsPerSecond": 0.42,
    "peakEventsPerSecond": 5.2
  }
}
```

---

### 15. `query_qsys_api`

Direct access to Q-SYS API for advanced operations.

**Parameters:**
```typescript
{
  method: string;         // Q-SYS API method name
  params?: object;        // Method parameters
}
```

**Example Request:**
```json
{
  "tool": "query_qsys_api",
  "arguments": {
    "method": "Component.GetControls",
    "params": {
      "Name": "MainMixer"
    }
  }
}
```

⚠️ **Warning:** This tool provides direct API access. Use with caution and refer to Q-SYS documentation for valid methods and parameters.

---

## Error Handling

All tools return consistent error responses:

```json
{
  "error": {
    "code": "TOOL_ERROR",
    "message": "Description of the error",
    "details": {
      "tool": "tool_name",
      "params": { ... }
    }
  }
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| `TOOL_ERROR` | General tool execution error |
| `INVALID_PARAMS` | Invalid or missing parameters |
| `NOT_CONNECTED` | Q-SYS Core not connected |
| `COMPONENT_NOT_FOUND` | Specified component doesn't exist |
| `CONTROL_NOT_FOUND` | Specified control doesn't exist |
| `CHANGE_GROUP_NOT_FOUND` | Change group doesn't exist |
| `PERMISSION_DENIED` | Insufficient permissions |
| `TIMEOUT` | Operation timed out |

---

## Best Practices

### 1. Connection Verification
Always verify connection before complex operations:
```json
{
  "tool": "query_core_status"
}
```

### 2. Component Discovery
Discover components before attempting control:
```json
{
  "tool": "list_components",
  "arguments": {
    "filter": "Mixer"
  }
}
```

### 3. Change Groups for Monitoring
Use change groups for efficient real-time monitoring:
```json
{
  "tool": "create_change_group",
  "arguments": {
    "id": "monitor-1",
    "pollInterval": 100
  }
}
```

### 4. Batch Operations
Set multiple controls in a single call:
```json
{
  "tool": "set_control_values",
  "arguments": {
    "controls": [
      { "component": "Mixer1", "name": "gain", "value": -5 },
      { "component": "Mixer2", "name": "gain", "value": -5 }
    ]
  }
}
```

### 5. Event Monitoring
Enable event monitoring for historical analysis:
```json
{
  "tool": "set_change_group_auto_poll",
  "arguments": {
    "id": "monitor-1",
    "enabled": true,
    "interval": 100
  }
}
```

---

## Rate Limits and Performance

### Recommended Limits
- **Poll Interval**: Minimum 30ms, recommended 100ms+
- **Batch Size**: Maximum 100 controls per operation
- **Event Query**: Maximum 10,000 events per query
- **Concurrent Change Groups**: Recommended maximum 10

### Performance Tips
1. Use filtering to reduce response size
2. Enable metadata only when needed
3. Batch control operations
4. Use appropriate poll intervals
5. Implement pagination for large event queries

---

## Integration Examples

### Example 1: Volume Control
```javascript
// Discover mixer
const components = await callTool('list_components', {
  filter: 'Mixer'
});

// Get current volume
const values = await callTool('get_control_values', {
  controls: [
    { component: 'MainMixer', name: 'gain' }
  ]
});

// Adjust volume with ramp
await callTool('set_control_values', {
  controls: [
    {
      component: 'MainMixer',
      name: 'gain',
      value: -10,
      ramp: 2.0
    }
  ]
});
```

### Example 2: Real-time Monitoring
```javascript
// Create monitoring group
await callTool('create_change_group', {
  id: 'room-monitor',
  pollInterval: 100
});

// Add controls to monitor
await callTool('add_controls_to_change_group', {
  id: 'room-monitor',
  controls: [
    { component: 'RoomMic', name: 'level' },
    { component: 'RoomSpeaker', name: 'gain' }
  ]
});

// Enable auto-polling
await callTool('set_change_group_auto_poll', {
  id: 'room-monitor',
  enabled: true
});

// Query historical events
const events = await callTool('query_change_events', {
  changeGroupId: 'room-monitor',
  limit: 100
});
```

---

## Troubleshooting

### Connection Issues
1. Verify Q-SYS Core is accessible on port 443
2. Check credentials in configuration
3. Ensure QRWC is enabled on the Core
4. Use `query_core_status` to verify connection

### Performance Issues
1. Reduce poll frequency
2. Limit number of monitored controls
3. Use component/control filters
4. Enable batch operations

### Event Monitoring Issues
1. Ensure `EVENT_MONITORING_ENABLED=true`
2. Check database path permissions
3. Verify change group has auto-poll enabled
4. Check available disk space

---

## Additional Resources

- [Q-SYS Developer Documentation](https://q-syshelp.qsc.com/)
- [QRWC Protocol Reference](https://q-syshelp.qsc.com/DeveloperHelp/)
- [MCP Protocol Specification](https://spec.modelcontextprotocol.io/)
- [Deployment Guide](../DEPLOYMENT.md)
- [Troubleshooting Guide](../TROUBLESHOOTING.md)