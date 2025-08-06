# Event Monitoring Troubleshooting Guide

This guide helps diagnose and resolve common issues with the event monitoring system.

## Quick Diagnostics

Run this verification script to check system health:

```bash
node verify-event-monitoring-fixed.js
```

Expected output:
```
✅ Create monitored state manager with event monitoring
✅ Event monitoring tools are registered
✅ Events are recorded when change group is active
✅ Statistics are correctly calculated
✅ Query filters work correctly
✅ System handles 30+ events per second
```

## Common Issues and Solutions

### Issue 1: Event Monitoring Not Working

**Symptoms:**
- No events being recorded
- `get_event_statistics` returns `status: 'disabled'`
- Tools `query_change_events` and `get_event_statistics` not available

**Diagnosis:**
```javascript
// Check if monitoring is enabled
const stats = await mcp.callTool('get_event_statistics', {});
console.log('Status:', stats.status);
console.log('Config:', stats.configuration);
```

**Solutions:**

1. **Enable event monitoring in environment:**
   ```bash
   # Check current setting
   echo $EVENT_MONITORING_ENABLED
   
   # Enable in .env file
   EVENT_MONITORING_ENABLED=true
   ```

2. **Restart the MCP server:**
   ```bash
   npm run build
   npm start
   ```

3. **Verify tools are registered:**
   ```javascript
   const tools = await mcp.listTools();
   const hasEventTools = tools.some(t => 
     t.name === 'query_change_events' || 
     t.name === 'get_event_statistics'
   );
   console.log('Event tools available:', hasEventTools);
   ```

### Issue 2: Events Not Being Recorded

**Symptoms:**
- Event monitoring enabled but no events in database
- `totalEvents` remains 0
- Change groups exist but no data recorded

**Diagnosis:**
```javascript
// Check active change groups
const groups = await mcp.callTool('list_change_groups', {});
console.log('Change groups:', groups);

// Check if any groups have auto-polling enabled
const activeGroups = groups.filter(g => g.autoPoll === true);
console.log('Groups with auto-polling:', activeGroups);
```

**Solutions:**

1. **Create and subscribe to a change group:**
   ```javascript
   // Create change group
   await mcp.callTool('create_change_group', {
     id: 'test-monitoring',
     controls: ['Zone1.Volume', 'Zone1.Mute']
   });
   
   // Enable auto-polling (required for event recording)
   await mcp.callTool('set_change_group_auto_poll', {
     changeGroupId: 'test-monitoring',
     interval: 100  // Poll every 100ms
   });
   ```

2. **Verify Q-SYS connection:**
   ```bash
   npm run test:connection
   ```

3. **Check for permission issues:**
   ```bash
   # Check database directory permissions
   ls -la ./data/events/
   
   # Fix permissions if needed
   chmod 755 ./data/events/
   ```

### Issue 3: High Memory Usage

**Symptoms:**
- Node.js process using excessive memory
- Buffer utilization consistently high
- System becomes slow or unresponsive

**Diagnosis:**
```javascript
const stats = await mcp.callTool('get_event_statistics', {});
console.log('Buffer utilization:', stats.statistics.buffer.utilizationPercent);
console.log('Buffer size:', stats.statistics.buffer.currentSize);
```

**Solutions:**

1. **Reduce buffer size:**
   ```bash
   # In .env file
   EVENT_MONITORING_BUFFER_SIZE=500  # Reduce from 1000
   ```

2. **Increase flush frequency:**
   ```bash
   EVENT_MONITORING_FLUSH_INTERVAL=50  # Flush every 50ms instead of 100ms
   ```

3. **Reduce polling frequency:**
   ```javascript
   // Use lower polling rates for non-critical monitoring
   await mcp.callTool('set_change_group_auto_poll', {
     changeGroupId: 'low-priority',
     interval: 1000  // Poll every second instead of 100ms
   });
   ```

### Issue 4: Slow Query Performance

**Symptoms:**
- `query_change_events` takes several seconds
- Queries timeout or fail
- High CPU usage during queries

**Diagnosis:**
```javascript
// Test query performance
const start = Date.now();
const result = await mcp.callTool('query_change_events', {
  limit: 1000
});
const duration = Date.now() - start;
console.log(`Query took ${duration}ms for ${result.eventCount} events`);
```

**Solutions:**

1. **Use time-bounded queries:**
   ```javascript
   // Good: Specific time range
   const efficient = await mcp.callTool('query_change_events', {
     startTime: Date.now() - 300000,  // Last 5 minutes
     endTime: Date.now(),
     limit: 100
   });
   
   // Avoid: Open-ended queries
   const inefficient = await mcp.callTool('query_change_events', {
     limit: 10000  // Too many events
   });
   ```

2. **Filter by specific controls:**
   ```javascript
   // Query specific controls only
   const filtered = await mcp.callTool('query_change_events', {
     controlNames: ['Zone1.Volume'],
     changeGroupId: 'audio-monitoring'
   });
   ```

3. **Vacuum the database:**
   ```bash
   # Manual vacuum (do during maintenance window)
   sqlite3 ./data/events/events-*.db "VACUUM;"
   ```

### Issue 5: Disk Space Issues

**Symptoms:**
- "Disk full" errors
- Database write failures
- Events stop being recorded

**Diagnosis:**
```bash
# Check disk usage
df -h ./data/events/

# Check database sizes
du -sh ./data/events/*.db

# Check statistics
```
```javascript
const stats = await mcp.callTool('get_event_statistics', {});
console.log('Database size:', stats.statistics.database.sizeMB, 'MB');
```

**Solutions:**

1. **Reduce retention period:**
   ```bash
   # In .env file
   EVENT_MONITORING_RETENTION_DAYS=3  # Reduce from 7 days
   ```

2. **Manual cleanup of old databases:**
   ```bash
   # Remove databases older than 3 days
   find ./data/events/ -name "events-*.db" -mtime +3 -delete
   ```

3. **Reduce monitoring scope:**
   ```javascript
   // Monitor fewer controls
   await mcp.callTool('remove_controls_from_change_group', {
     changeGroupId: 'extensive-monitoring',
     controlNames: ['NonCritical.Control1', 'NonCritical.Control2']
   });
   ```

### Issue 6: Database Corruption

**Symptoms:**
- "Database disk image is malformed" errors
- Queries return empty results despite events being recorded
- Statistics show incorrect values

**Diagnosis:**
```bash
# Check database integrity
sqlite3 ./data/events/events-2024-01-15.db "PRAGMA integrity_check;"
```

**Solutions:**

1. **Remove corrupted database:**
   ```bash
   # Backup corrupted file
   mv ./data/events/events-2024-01-15.db ./data/events/corrupted-2024-01-15.db.bak
   
   # System will create new database automatically
   ```

2. **Attempt recovery:**
   ```bash
   # Try to recover data
   sqlite3 corrupted.db ".recover" | sqlite3 recovered.db
   ```

3. **Prevent future corruption:**
   ```bash
   # Ensure proper shutdown
   # Always use graceful shutdown
   kill -SIGTERM <pid>  # Not kill -9
   ```

## Performance Optimization Checklist

- [ ] Buffer size appropriate for workload (100-1000)
- [ ] Flush interval balanced (50-200ms)
- [ ] Retention period reasonable (3-14 days)
- [ ] Database files on SSD if possible
- [ ] Polling intervals appropriate for controls
- [ ] Time-bounded queries being used
- [ ] Regular database maintenance scheduled

## Monitoring Scripts

### Health Check Script

Create `check-event-health.js`:

```javascript
#!/usr/bin/env node

async function checkHealth() {
  const mcp = require('./mcp-client');
  
  // Get statistics
  const stats = await mcp.callTool('get_event_statistics', {});
  
  // Check status
  if (stats.status !== 'enabled') {
    console.error('❌ Event monitoring is DISABLED');
    process.exit(1);
  }
  
  // Check buffer
  const bufferUtil = parseFloat(stats.statistics.buffer.utilizationPercent);
  if (bufferUtil > 80) {
    console.warn('⚠️  High buffer utilization:', bufferUtil + '%');
  }
  
  // Check database size
  const dbSize = parseFloat(stats.statistics.database.sizeMB);
  if (dbSize > 1000) {
    console.warn('⚠️  Large database:', dbSize + 'MB');
  }
  
  // Check recording rate
  const events = await mcp.callTool('query_change_events', {
    startTime: Date.now() - 60000,
    limit: 10000
  });
  
  const rate = events.eventCount / 60;
  console.log('✅ Recording rate:', rate.toFixed(1), 'events/sec');
  
  // Overall status
  console.log('✅ Event monitoring is healthy');
  console.log('  Total events:', stats.statistics.totalEvents);
  console.log('  Unique controls:', stats.statistics.uniqueControls);
  console.log('  Database size:', dbSize, 'MB');
}

checkHealth().catch(console.error);
```

### Cleanup Script

Create `cleanup-events.js`:

```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const EVENT_DB_PATH = './data/events';
const RETENTION_DAYS = 7;

function cleanup() {
  const cutoff = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const files = fs.readdirSync(EVENT_DB_PATH);
  
  files.forEach(file => {
    if (file.startsWith('events-') && file.endsWith('.db')) {
      const filePath = path.join(EVENT_DB_PATH, file);
      const stats = fs.statSync(filePath);
      
      if (stats.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
        console.log('Deleted old database:', file);
      }
    }
  });
  
  console.log('Cleanup complete');
}

cleanup();
```

## Getting Help

If issues persist after trying these solutions:

1. **Check logs:**
   ```bash
   grep -i "event" logs/mcp-server.log | tail -50
   ```

2. **Run verification script:**
   ```bash
   node verify-event-monitoring-fixed.js
   ```

3. **Enable debug logging:**
   ```bash
   LOG_LEVEL=debug npm run dev
   ```

4. **File an issue:**
   Include:
   - Output from verification script
   - Recent log entries
   - Configuration settings
   - Error messages

## Emergency Procedures

### Disable Event Monitoring

If event monitoring causes system instability:

```bash
# Immediately disable without restart
export EVENT_MONITORING_ENABLED=false

# Or update .env and restart
echo "EVENT_MONITORING_ENABLED=false" >> .env
npm restart
```

### Clear All Event Data

In case of severe issues:

```bash
# Stop the server
npm stop

# Backup current data
tar -czf events-backup-$(date +%Y%m%d).tar.gz ./data/events/

# Remove all event databases
rm -rf ./data/events/*.db

# Restart
npm start
```

### Reset to Clean State

Complete reset:

```bash
# Stop server
npm stop

# Remove all event data
rm -rf ./data/events/

# Create fresh directory
mkdir -p ./data/events/

# Reset configuration to defaults
cat > .env.events << EOF
EVENT_MONITORING_ENABLED=true
EVENT_MONITORING_DB_PATH=./data/events
EVENT_MONITORING_RETENTION_DAYS=7
EVENT_MONITORING_BUFFER_SIZE=1000
EVENT_MONITORING_FLUSH_INTERVAL=100
EOF

# Restart
npm start
```