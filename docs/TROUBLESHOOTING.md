# Troubleshooting Guide

## 🚨 Common Issues and Solutions

### Connection Issues

#### Problem: Cannot connect to Q-SYS Core
**Symptoms:**
- "Connection refused" errors
- "ECONNREFUSED" in logs
- Tools return "NOT_CONNECTED" errors

**Solutions:**
1. **Verify Core accessibility:**
   ```bash
   # Test network connectivity
   ping your-qsys-core.local
   
   # Test port 443 (WSS)
   telnet your-qsys-core.local 443
   ```

2. **Check configuration:**
   ```bash
   # Verify config file
   cat qsys-core.config.json
   
   # Test connection
   npm run test:connection
   ```

3. **Verify QRWC is enabled:**
   - Open Q-SYS Designer
   - Check Core properties
   - Ensure "External Control Protocol" includes QRWC

4. **Check credentials:**
   ```json
   {
     "host": "correct-hostname-or-ip",
     "port": 443,
     "username": "valid-username",
     "password": "valid-password",
     "rejectUnauthorized": false
   }
   ```

5. **Firewall/Network issues:**
   - Ensure port 443 is open
   - Check VPN connection if required
   - Verify no proxy interference

---

#### Problem: SSL/TLS Certificate errors
**Symptoms:**
- "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
- "CERT_HAS_EXPIRED"
- "DEPTH_ZERO_SELF_SIGNED_CERT"

**Solutions:**
1. **For self-signed certificates:**
   ```json
   {
     "rejectUnauthorized": false
   }
   ```

2. **For production with valid certificates:**
   ```json
   {
     "rejectUnauthorized": true,
     "ca": "/path/to/ca-cert.pem"
   }
   ```

---

#### Problem: Connection drops frequently
**Symptoms:**
- "Connection lost" messages
- Intermittent tool failures
- WebSocket disconnections

**Solutions:**
1. **Adjust keepalive settings:**
   ```json
   {
     "keepAliveInterval": 30000,
     "reconnectDelay": 5000,
     "maxReconnectAttempts": 10
   }
   ```

2. **Check network stability:**
   ```bash
   # Monitor network latency
   ping -t your-qsys-core.local
   
   # Check for packet loss
   mtr your-qsys-core.local
   ```

3. **Review logs for patterns:**
   ```bash
   grep "disconnect\|reconnect" /var/log/mcp-qsys/*.log
   ```

---

### MCP Server Issues

#### Problem: MCP server won't start
**Symptoms:**
- "Cannot find module" errors
- Exit code 1
- Process crashes immediately

**Solutions:**
1. **Rebuild the project:**
   ```bash
   npm run clean
   npm ci
   npm run build
   ```

2. **Check Node.js version:**
   ```bash
   node --version  # Should be 20.x or higher
   ```

3. **Verify environment variables:**
   ```bash
   # Check .env file exists
   ls -la .env
   
   # Verify required variables
   grep -E "NODE_ENV|LOG_LEVEL" .env
   ```

4. **Check port conflicts:**
   ```bash
   # Check if port 3000 is in use
   lsof -i :3000
   ```

---

#### Problem: Tools not appearing in MCP client
**Symptoms:**
- Empty tool list
- "No tools available"
- Client can't discover tools

**Solutions:**
1. **Verify MCP server is running:**
   ```bash
   # Test tool listing
   echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/src/index.js
   ```

2. **Check initialization:**
   ```bash
   # Look for initialization logs
   grep "Tool registry initialized" logs/*.log
   ```

3. **Verify stdio transport:**
   - Ensure client is configured for stdio
   - Check no output redirection issues

---

### Performance Issues

#### Problem: High memory usage
**Symptoms:**
- Process using >1GB RAM
- "JavaScript heap out of memory"
- System becomes sluggish

**Solutions:**
1. **Increase heap size:**
   ```bash
   NODE_OPTIONS="--max-old-space-size=2048" npm start
   ```

2. **Optimize event cache:**
   ```bash
   # Reduce cache size
   EVENT_MONITORING_MAX_EVENTS=100000
   
   # Clean old events
   sqlite3 /var/lib/mcp/events/events.db "DELETE FROM events WHERE timestamp < datetime('now', '-7 days');"
   ```

3. **Reduce change group polling:**
   - Increase poll intervals
   - Limit number of monitored controls
   - Disable unused change groups

---

#### Problem: Slow tool execution
**Symptoms:**
- Tools take >5 seconds
- Timeouts on operations
- UI becomes unresponsive

**Solutions:**
1. **Check network latency:**
   ```bash
   ping -c 10 your-qsys-core.local
   ```

2. **Optimize queries:**
   - Use filters to reduce data
   - Disable metadata when not needed
   - Batch operations

3. **Review system resources:**
   ```bash
   # CPU usage
   top -p $(pgrep -f "node.*mcp")
   
   # Disk I/O
   iotop -p $(pgrep -f "node.*mcp")
   ```

---

### Event Monitoring Issues

#### Problem: Events not being recorded
**Symptoms:**
- Empty event queries
- No events in database
- Statistics show zero events

**Solutions:**
1. **Verify monitoring is enabled:**
   ```bash
   # Check environment
   echo $EVENT_MONITORING_ENABLED  # Should be "true"
   
   # Verify in logs
   grep "Event monitoring" logs/*.log
   ```

2. **Check database:**
   ```bash
   # Verify database exists
   ls -la /var/lib/mcp/events/events.db
   
   # Check permissions
   ls -la /var/lib/mcp/events/
   
   # Test database access
   sqlite3 /var/lib/mcp/events/events.db "SELECT COUNT(*) FROM events;"
   ```

3. **Ensure auto-polling is enabled:**
   ```json
   {
     "tool": "set_change_group_auto_poll",
     "arguments": {
       "id": "your-group",
       "enabled": true,
       "interval": 100
     }
   }
   ```

---

#### Problem: Database disk space issues
**Symptoms:**
- "disk I/O error"
- "database or disk is full"
- Write operations fail

**Solutions:**
1. **Check disk space:**
   ```bash
   df -h /var/lib/mcp/events/
   ```

2. **Clean old events:**
   ```bash
   # Delete events older than 30 days
   sqlite3 /var/lib/mcp/events/events.db \
     "DELETE FROM events WHERE timestamp < datetime('now', '-30 days');"
   
   # Vacuum database
   sqlite3 /var/lib/mcp/events/events.db "VACUUM;"
   ```

3. **Configure automatic cleanup:**
   ```bash
   # Add to crontab
   0 2 * * * sqlite3 /var/lib/mcp/events/events.db "DELETE FROM events WHERE timestamp < datetime('now', '-30 days'); VACUUM;"
   ```

---

### Q-SYS Control Issues

#### Problem: Controls not responding
**Symptoms:**
- Set operations succeed but values don't change
- Controls show wrong values
- Delayed control responses

**Solutions:**
1. **Verify control exists:**
   ```json
   {
     "tool": "get_component_controls",
     "arguments": {
       "componentName": "YourComponent"
     }
   }
   ```

2. **Check control permissions:**
   - Some controls may be read-only
   - User account may lack permissions
   - Control may be locked in design

3. **Test with direct API:**
   ```json
   {
     "tool": "query_qsys_api",
     "arguments": {
       "method": "Component.Set",
       "params": {
         "Name": "Component",
         "Controls": [
           { "Name": "control", "Value": 1 }
         ]
       }
     }
   }
   ```

---

#### Problem: Component not found
**Symptoms:**
- "COMPONENT_NOT_FOUND" errors
- Empty control lists
- Tools fail with invalid component

**Solutions:**
1. **List all components:**
   ```json
   {
     "tool": "list_components",
     "arguments": {
       "includeProperties": true
     }
   }
   ```

2. **Check component naming:**
   - Names are case-sensitive
   - Special characters must match exactly
   - No leading/trailing spaces

3. **Verify design is running:**
   ```json
   {
     "tool": "query_core_status",
     "arguments": {
       "includeDesignInfo": true
     }
   }
   ```

---

### Deployment Issues

#### Problem: PM2 process keeps restarting
**Symptoms:**
- Process restart loop
- High CPU usage
- Logs show repeated startup

**Solutions:**
1. **Check PM2 logs:**
   ```bash
   pm2 logs mcp-qsys-server --lines 100
   ```

2. **Increase restart delay:**
   ```javascript
   // ecosystem.config.js
   {
     min_uptime: '10s',
     max_restarts: 10,
     restart_delay: 5000
   }
   ```

3. **Debug startup issues:**
   ```bash
   # Run directly without PM2
   node dist/src/index.js
   ```

---

#### Problem: systemd service fails to start
**Symptoms:**
- "Failed to start" in systemctl status
- Exit code 1 or 2
- Service inactive (dead)

**Solutions:**
1. **Check service logs:**
   ```bash
   sudo journalctl -u mcp-qsys -n 100
   sudo systemctl status mcp-qsys
   ```

2. **Verify paths and permissions:**
   ```bash
   # Check working directory exists
   ls -la /opt/mcp-qsys-server/
   
   # Verify user permissions
   sudo -u mcp ls /opt/mcp-qsys-server/
   ```

3. **Test as service user:**
   ```bash
   sudo -u mcp /usr/bin/node /opt/mcp-qsys-server/dist/src/index.js
   ```

---

## 🔍 Diagnostic Commands

### System Health Check
```bash
#!/bin/bash
echo "=== MCP Q-SYS Health Check ==="

# Check process
if pgrep -f "node.*mcp" > /dev/null; then
    echo "✓ Process running"
else
    echo "✗ Process not running"
fi

# Check port
if nc -z localhost 3000; then
    echo "✓ Health port open"
else
    echo "✗ Health port closed"
fi

# Check database
if [ -f /var/lib/mcp/events/events.db ]; then
    echo "✓ Database exists"
    sqlite3 /var/lib/mcp/events/events.db "SELECT COUNT(*) as 'Event count:' FROM events;"
else
    echo "✗ Database missing"
fi

# Check connection
curl -s http://localhost:3000/health | jq .
```

### Log Analysis
```bash
# Find errors
grep -i error /var/log/mcp-qsys/*.log | tail -20

# Connection issues
grep -E "connect|disconnect|reconnect" /var/log/mcp-qsys/*.log | tail -20

# Performance warnings
grep -i "slow\|timeout\|performance" /var/log/mcp-qsys/*.log

# Memory issues
grep -i "heap\|memory\|gc" /var/log/mcp-qsys/*.log
```

### Network Diagnostics
```bash
# Test Q-SYS connectivity
nc -zv your-qsys-core.local 443

# Check DNS resolution
nslookup your-qsys-core.local

# Trace route
traceroute your-qsys-core.local

# Monitor connections
netstat -an | grep :443
```

---

## 📊 Performance Monitoring

### Real-time Metrics
```bash
# CPU and Memory
top -p $(pgrep -f "node.*mcp")

# Network connections
watch 'netstat -an | grep :443'

# Disk I/O
iotop -p $(pgrep -f "node.*mcp")

# PM2 monitoring
pm2 monit
```

### Database Metrics
```sql
-- Event statistics
SELECT 
    COUNT(*) as total_events,
    MIN(timestamp) as oldest_event,
    MAX(timestamp) as newest_event,
    COUNT(DISTINCT change_group_id) as change_groups,
    COUNT(DISTINCT component_name) as components
FROM events;

-- Events per hour
SELECT 
    strftime('%Y-%m-%d %H:00', timestamp) as hour,
    COUNT(*) as event_count
FROM events
WHERE timestamp > datetime('now', '-24 hours')
GROUP BY hour
ORDER BY hour DESC;

-- Database size
SELECT 
    page_count * page_size / 1024 / 1024 as size_mb
FROM pragma_page_count(), pragma_page_size();
```

---

## 🐛 Debug Mode

### Enable Verbose Logging
```bash
# Environment variable
export LOG_LEVEL=debug

# Or in .env file
LOG_LEVEL=debug

# Or in PM2 config
env: {
  LOG_LEVEL: 'debug'
}
```

### Debug Specific Components
```bash
# Q-SYS connection
DEBUG=qsys:* npm start

# MCP protocol
DEBUG=mcp:* npm start

# Event monitoring
DEBUG=events:* npm start

# All debug output
DEBUG=* npm start
```

### Capture Debug Session
```bash
# Start with full debugging
LOG_LEVEL=debug DEBUG=* npm start 2>&1 | tee debug-session.log

# Analyze the log
grep -i error debug-session.log
grep -i warning debug-session.log
```

---

## 🆘 Getting Help

### Gather Information
Before reporting issues, collect:

1. **System information:**
   ```bash
   node --version
   npm --version
   sqlite3 --version
   uname -a
   ```

2. **Configuration (sanitized):**
   ```bash
   # Remove passwords before sharing!
   cat qsys-core.config.json | sed 's/"password":.*/\"password\": \"REDACTED\",/'
   ```

3. **Recent logs:**
   ```bash
   tail -n 1000 /var/log/mcp-qsys/*.log > recent-logs.txt
   ```

4. **Health check:**
   ```bash
   curl http://localhost:3000/health
   ```

### Report Issues
Include the above information when:
- Opening GitHub issues
- Asking for community help
- Contacting support

### Community Resources
- [GitHub Issues](https://github.com/your-org/mcp-qsys-server/issues)
- [Discord Community](https://discord.gg/your-server)
- [Q-SYS Developer Forum](https://q-syshelp.qsc.com/)

---

## 📚 Additional Resources

- [Deployment Guide](./DEPLOYMENT.md)
- [Configuration Reference](./CONFIGURATION.md)
- [MCP Tools API](./api/MCP_TOOLS.md)
- [Event Monitoring Troubleshooting](./EVENT_MONITORING_TROUBLESHOOTING.md)
- [Security Guide](./SECURITY.md)