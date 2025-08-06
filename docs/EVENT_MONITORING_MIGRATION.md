# Event Monitoring Migration Strategy

This guide provides a step-by-step approach to deploying and enabling the event monitoring system in your MCP server installation.

## Overview

The event monitoring system is designed for zero-downtime deployment. It's disabled by default and can be safely deployed to production without affecting existing functionality.

## Step 1: Deploy Code

### 1.1 Pre-Deployment Checklist

- [ ] Backup current configuration files
- [ ] Ensure SQLite3 is available on the system
- [ ] Verify disk space (minimum 1GB recommended for event storage)
- [ ] Review current change group configurations

### 1.2 Deployment Process

```bash
# 1. Pull the latest code
git pull origin main

# 2. Install dependencies (includes better-sqlite3)
npm install

# 3. Build the TypeScript code
npm run build

# 4. Verify build success
npm test
```

### 1.3 Verification

At this stage, event monitoring is NOT active. Verify the system still works normally:

```bash
# Test Q-SYS connection
npm run test:connection

# Verify MCP server starts
npm start
```

**No configuration changes needed** - Event monitoring is disabled by default.

## Step 2: Enable in Development

### 2.1 Development Environment Setup

1. **Create development configuration**:
   ```bash
   # Copy production config for testing
   cp .env .env.development
   ```

2. **Enable event monitoring**:
   ```bash
   # Edit .env.development
   EVENT_MONITORING_ENABLED=true
   EVENT_MONITORING_DB_PATH=./data/events-dev
   EVENT_MONITORING_RETENTION_DAYS=3  # Shorter retention for testing
   EVENT_MONITORING_BUFFER_SIZE=100   # Smaller buffer for testing
   EVENT_MONITORING_FLUSH_INTERVAL=50 # Faster flush for testing
   ```

3. **Create data directory**:
   ```bash
   mkdir -p ./data/events-dev
   ```

### 2.2 Testing Event Monitoring

1. **Start the server with development config**:
   ```bash
   NODE_ENV=development npm run dev
   ```

2. **Create a test change group**:
   ```javascript
   // Use your MCP client or test script
   await mcp.callTool('create_change_group', {
     id: 'test-monitoring',
     controls: ['TestZone.Volume', 'TestZone.Mute']
   });
   ```

3. **Enable auto-polling**:
   ```javascript
   await mcp.callTool('set_change_group_auto_poll', {
     changeGroupId: 'test-monitoring',
     interval: 100  // Poll every 100ms
   });
   ```

4. **Verify event recording**:
   ```javascript
   // Wait a few seconds for events to be recorded
   await new Promise(r => setTimeout(r, 5000));

   // Query events
   const events = await mcp.callTool('query_change_events', {
     changeGroupId: 'test-monitoring'
   });
   
   console.log('Events recorded:', events);
   ```

5. **Check statistics**:
   ```javascript
   const stats = await mcp.callTool('get_event_statistics', {});
   console.log('Event monitoring stats:', stats);
   ```

### 2.3 Performance Validation

Run the verification script to ensure performance meets requirements:

```bash
node verify-event-monitoring-fixed.js
```

Expected results:
- ✅ All 6 tests should pass
- ✅ Performance should exceed 30 events/second

## Step 3: Production Rollout

### 3.1 Pre-Production Checklist

- [ ] Development testing completed successfully
- [ ] Disk space allocation confirmed (5GB+ recommended)
- [ ] Backup strategy in place
- [ ] Monitoring alerts configured
- [ ] Team notified of deployment

### 3.2 Gradual Rollout

#### Stage 1: Deploy with Monitoring Disabled (Day 1)

```bash
# Deploy code but keep monitoring disabled
EVENT_MONITORING_ENABLED=false

# Deploy and verify normal operation
npm run build
pm2 reload mcp-server
```

#### Stage 2: Enable for Specific Change Groups (Day 2)

```bash
# Enable monitoring
EVENT_MONITORING_ENABLED=true
EVENT_MONITORING_RETENTION_DAYS=7
EVENT_MONITORING_DB_PATH=/var/lib/mcp/events

# Start with low-frequency monitoring
# Only enable for non-critical change groups initially
```

#### Stage 3: Full Production Rollout (Day 3-7)

```bash
# Production configuration
EVENT_MONITORING_ENABLED=true
EVENT_MONITORING_DB_PATH=/var/lib/mcp/events
EVENT_MONITORING_RETENTION_DAYS=14  # Two weeks retention
EVENT_MONITORING_BUFFER_SIZE=1000   # Production buffer
EVENT_MONITORING_FLUSH_INTERVAL=100 # 100ms flush interval
```

### 3.3 Production Monitoring

Monitor these metrics after deployment:

1. **Disk Usage**
   ```bash
   # Check event database size
   du -sh /var/lib/mcp/events/
   ```

2. **Performance Metrics**
   ```javascript
   // Check recording performance
   const stats = await mcp.callTool('get_event_statistics', {});
   console.log('Buffer utilization:', stats.statistics.buffer.utilizationPercent);
   console.log('Total events:', stats.statistics.totalEvents);
   ```

3. **Database Health**
   ```bash
   # List database files and sizes
   ls -lh /var/lib/mcp/events/*.db
   ```

### 3.4 Rollback Plan

If issues occur, event monitoring can be disabled instantly without restart:

```bash
# Disable event monitoring
EVENT_MONITORING_ENABLED=false

# The system will stop recording new events immediately
# Existing data remains accessible for queries
```

## Troubleshooting

### Common Issues and Solutions

#### Issue: High Disk Usage
**Solution**: Reduce retention days or increase cleanup frequency
```bash
EVENT_MONITORING_RETENTION_DAYS=3  # Reduce to 3 days
```

#### Issue: Slow Queries
**Solution**: Optimize buffer size and flush interval
```bash
EVENT_MONITORING_BUFFER_SIZE=500    # Smaller buffer
EVENT_MONITORING_FLUSH_INTERVAL=200  # Less frequent flushes
```

#### Issue: Missing Events
**Solution**: Check change group subscription
```javascript
// Verify change group is subscribed
const groups = await mcp.callTool('list_change_groups', {});
console.log('Active groups:', groups);
```

## Maintenance

### Daily Tasks
- Monitor disk usage
- Check event recording rate
- Verify database cleanup is running

### Weekly Tasks
- Review retention policy
- Analyze query performance
- Check for old database files

### Monthly Tasks
- Performance tuning review
- Storage capacity planning
- Update retention policies if needed

## Best Practices

1. **Start Small**: Begin with a few change groups and gradually add more
2. **Monitor Performance**: Watch CPU and disk I/O during initial rollout
3. **Set Appropriate Retention**: Balance storage costs with data needs
4. **Use Buffering**: Larger buffers reduce disk I/O but use more memory
5. **Regular Cleanup**: Ensure old databases are being deleted properly

## Support

For issues or questions about event monitoring:
1. Check the verification script: `node verify-event-monitoring-fixed.js`
2. Review logs for errors: `grep "event" logs/mcp-server.log`
3. Check database integrity: `sqlite3 data/events/events-*.db "PRAGMA integrity_check;"`