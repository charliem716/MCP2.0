# Event Monitoring System

## Overview
The MCP server includes an event monitoring system that records all control changes to a SQLite database for historical tracking and analysis.

## Automatic Configuration
As of the latest update, event monitoring is **always enabled for MCP servers**:

- ✅ **Always enabled** - No configuration needed
- ✅ Works with Claude Desktop automatically
- ✅ Works with any MCP client
- ✅ No per-agent configuration needed
- ✅ No dependency on .env file for MCP servers
- ✅ Uses absolute paths to work from any directory

### How It Works
- Event monitoring is always enabled when running as an MCP server
- The system automatically uses absolute paths for database and backup storage
- Default database location: `/Users/charliemccarrel/Desktop/Builds/MCP2.0/data/events`
- Default backup location: `/Users/charliemccarrel/Desktop/Builds/MCP2.0/data/backups`

## Configuration
Event monitoring works automatically without configuration. For advanced users, these optional environment variables can be set:

```bash
# Database location (optional - defaults to absolute path)
EVENT_MONITORING_DB_PATH=/Users/charliemccarrel/Desktop/Builds/MCP2.0/data/events

# Backup location (optional - defaults to absolute path)
EVENT_BACKUP_PATH=/Users/charliemccarrel/Desktop/Builds/MCP2.0/data/backups

# How many days to keep events (optional - defaults to 30)
EVENT_MONITORING_RETENTION_DAYS=30

# Buffer settings for performance (optional)
EVENT_MONITORING_BUFFER_SIZE=1000
EVENT_MONITORING_FLUSH_INTERVAL=100
```

**Note:** These are all optional. The system works perfectly with default values.

## How It Works

1. **Automatic Activation**: When you create a change group and add controls to it, event monitoring automatically starts recording events

2. **Event Recording**: Every control change within a monitored change group is recorded with:
   - Timestamp
   - Control name
   - Old value
   - New value
   - Change group ID
   - Component name (if applicable)

3. **Available Tools**:
   - `query_change_events` - Query historical events with filters
   - `get_event_statistics` - Get monitoring status and metrics

## Testing Event Monitoring

### Quick Test
```
1. Create a change group: create_change_group(id: "test", pollRate: 0.1)
2. Add controls: add_controls_to_change_group
3. Change values: set_control_values
4. Query events: query_change_events
5. Check stats: get_event_statistics
```

### Verify Configuration
Run the test script to verify event monitoring is properly configured:
```bash
./test-event-monitoring-env.mjs
```

## Troubleshooting

Event monitoring should work automatically. If you encounter issues:

1. **Rebuild after changes**: Run `npm run build` after modifying source files
2. **Check permissions**: Ensure the data directory is writable
3. **Restart MCP server**: Restart Claude Desktop after configuration changes
4. **Check logs**: Look for event monitoring initialization messages in the logs

## Database Location

Events are stored in a SQLite database at:
- **Default**: `/Users/charliemccarrel/Desktop/Builds/MCP2.0/data/events`
- The database filename includes the current date: `events-YYYY-MM-DD.db`
- Backups are stored in: `/Users/charliemccarrel/Desktop/Builds/MCP2.0/data/backups`

The database includes indexes for efficient querying by:
- Timestamp
- Control name
- Component name
- Change group ID