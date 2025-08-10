# Production Deployment Guide

## 🚀 Quick Start

### Prerequisites

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your Q-SYS Core details
   ```

3. **Configure Q-SYS connection:**
   ```bash
   cp qsys-core.config.example.json qsys-core.config.json
   # Edit with your Q-SYS Core credentials
   ```

### Running the Application

#### Development Mode
```bash
npm run dev
```

#### Production Mode
```bash
npm run build
npm start
```

### What Happens When You Run It

1. **Configuration Validation**: The app validates all environment variables
2. **QRWC Client Creation**: Creates a WebSocket client with your Q-SYS settings
3. **Connection to Q-SYS Core**: Attempts to connect to your Q-SYS Core
   - If successful: "✅ Connected to Q-SYS Core"
   - If failed: Error message with details
4. **QRC Commands Initialization**: Sets up the command interface
5. **Ready State**: "🎯 Application is ready and running"

### Graceful Shutdown

Press `Ctrl+C` to stop the application. It will:
- Dispose of QRC commands
- Disconnect from Q-SYS Core
- Clean up all resources

### Quick Troubleshooting

**Connection Failed:**
- Check Q-SYS Core is accessible at configured host/port
- Verify username/password are correct
- Ensure firewall allows connection on port 443

**Environment Errors:**
- Run `npm run check:env` to validate configuration
- Check `.env.example` for required variables

---

## 📋 Full Deployment Prerequisites

### System Requirements
- **Node.js**: Version 20.x or higher
- **npm**: Version 10.x or higher
- **SQLite3**: For event monitoring persistence
- **Q-SYS Core**: With QRWC enabled (WSS on port 443)
- **Process Manager**: PM2, systemd, or Docker

### Network Requirements
- Access to Q-SYS Core on port 443 (WSS)
- Outbound HTTPS for OpenAI API (if using agent features)
- Port for health endpoint (default: 3000)

---

## 🔧 Environment Variables

Create a `.env` file in the project root:

```bash
# Core Configuration
NODE_ENV=production
LOG_LEVEL=info

# Event Monitoring
EVENT_MONITORING_ENABLED=true
EVENT_MONITORING_DB_PATH=/var/lib/mcp/events
EVENT_MONITORING_MAX_EVENTS=1000000
EVENT_MONITORING_BATCH_SIZE=100

# OpenAI (optional, for agent features)
OPENAI_API_KEY=your-api-key-here

# Health Monitoring
HEALTH_CHECK_PORT=3000
HEALTH_CHECK_INTERVAL=30000
```

---

## 📦 Installation Steps

### 1. Clone Repository
```bash
git clone https://github.com/your-org/mcp-qsys-server.git
cd mcp-qsys-server
```

### 2. Install Dependencies
```bash
# Production dependencies only
npm ci --production

# Or with all dependencies for debugging
npm ci
```

### 3. Configure Q-SYS Connection
```bash
# Copy and edit configuration
cp qsys-core.config.example.json qsys-core.config.json

# Edit with your Q-SYS Core details
nano qsys-core.config.json
```

Required configuration:
```json
{
  "host": "your-qsys-core.local",
  "port": 443,
  "username": "your-username",
  "password": "your-password",
  "rejectUnauthorized": false
}
```

### 4. Build Application
```bash
npm run build
```

### 5. Create Data Directories
```bash
# Event monitoring database directory
sudo mkdir -p /var/lib/mcp/events
sudo chown -R $USER:$USER /var/lib/mcp

# Log directory (optional)
sudo mkdir -p /var/log/mcp-qsys
sudo chown -R $USER:$USER /var/log/mcp-qsys
```

---

## 🚀 Deployment Methods

### Option 1: PM2 (Recommended)

Create `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [{
    name: 'mcp-qsys-server',
    script: './dist/src/index.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      EVENT_MONITORING_ENABLED: 'true',
      EVENT_MONITORING_DB_PATH: '/var/lib/mcp/events',
      LOG_LEVEL: 'info'
    },
    error_file: '/var/log/mcp-qsys/error.log',
    out_file: '/var/log/mcp-qsys/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
```

Start with PM2:
```bash
# Install PM2 globally
npm install -g pm2

# Start application
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Enable startup on boot
pm2 startup
```

### Option 2: systemd

Create `/etc/systemd/system/mcp-qsys.service`:
```ini
[Unit]
Description=MCP Q-SYS Server
After=network.target

[Service]
Type=simple
User=mcp
WorkingDirectory=/opt/mcp-qsys-server
ExecStart=/usr/bin/node /opt/mcp-qsys-server/dist/src/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=mcp-qsys

Environment="NODE_ENV=production"
Environment="EVENT_MONITORING_ENABLED=true"
Environment="EVENT_MONITORING_DB_PATH=/var/lib/mcp/events"
Environment="LOG_LEVEL=info"

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable mcp-qsys
sudo systemctl start mcp-qsys
sudo systemctl status mcp-qsys
```

### Option 3: Docker

Create `Dockerfile`:
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install SQLite
RUN apk add --no-cache sqlite

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --production

# Copy source code
COPY . .

# Build application
RUN npm run build

# Create data directory
RUN mkdir -p /var/lib/mcp/events

# Expose health check port
EXPOSE 3000

# Run application
CMD ["node", "dist/src/index.js"]
```

Build and run:
```bash
# Build image
docker build -t mcp-qsys-server .

# Run container
docker run -d \
  --name mcp-qsys \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /var/lib/mcp/events:/var/lib/mcp/events \
  -e NODE_ENV=production \
  -e EVENT_MONITORING_ENABLED=true \
  -e EVENT_MONITORING_DB_PATH=/var/lib/mcp/events \
  -e LOG_LEVEL=info \
  mcp-qsys-server
```

---

## 🏥 Health Checks

### Health Endpoint
The server provides a health endpoint at `GET /health`:

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-20T10:30:00Z",
  "uptime": 3600,
  "connections": {
    "qsys": "connected",
    "database": "connected"
  }
}
```

### Monitoring with PM2
```bash
# View status
pm2 status

# View logs
pm2 logs mcp-qsys-server

# Monitor metrics
pm2 monit
```

### Monitoring with systemd
```bash
# View status
sudo systemctl status mcp-qsys

# View logs
sudo journalctl -u mcp-qsys -f

# View last 100 lines
sudo journalctl -u mcp-qsys -n 100
```

---

## 🔍 Verification Steps

### 1. Test Q-SYS Connection
```bash
npm run test:connection
```

### 2. Check MCP Server
```bash
# List available tools
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/src/index.js
```

### 3. Verify Event Monitoring
```bash
# Check database creation
ls -la /var/lib/mcp/events/

# Test event logging
npm run test:events
```

---

## 📊 Performance Tuning

### Memory Configuration
Adjust Node.js memory limits for large deployments:
```bash
# Set max heap size to 2GB
NODE_OPTIONS="--max-old-space-size=2048" node dist/src/index.js
```

### Event Cache Tuning
Configure in `.env`:
```bash
# Adjust based on available memory
EVENT_MONITORING_MAX_EVENTS=500000
EVENT_MONITORING_BATCH_SIZE=50
EVENT_MONITORING_CLEANUP_INTERVAL=3600000
```

### Connection Pool
For multiple Q-SYS Cores, adjust in `qsys-core.config.json`:
```json
{
  "connectionPool": {
    "maxConnections": 10,
    "keepAliveInterval": 30000,
    "reconnectDelay": 5000
  }
}
```

---

## 🔒 Security Considerations

### 1. Secure Credentials
- Never commit credentials to version control
- Use environment variables or secrets management
- Rotate passwords regularly

### 2. Network Security
- Use firewall rules to restrict access
- Enable TLS/SSL for all connections
- Consider VPN for remote access

### 3. File Permissions
```bash
# Restrict configuration file access
chmod 600 qsys-core.config.json
chmod 600 .env

# Secure data directories
chmod 700 /var/lib/mcp/events
```

### 4. Process Isolation
- Run as non-root user
- Use systemd sandboxing features
- Consider container isolation

---

## 🔄 Backup and Recovery

### Database Backup
```bash
# Backup event database
sqlite3 /var/lib/mcp/events/events.db ".backup /backup/events-$(date +%Y%m%d).db"

# Automated daily backup
crontab -e
0 2 * * * sqlite3 /var/lib/mcp/events/events.db ".backup /backup/events-$(date +\%Y\%m\%d).db"
```

### Configuration Backup
```bash
# Backup configuration
tar -czf mcp-config-$(date +%Y%m%d).tar.gz qsys-core.config.json .env

# Store in secure location
aws s3 cp mcp-config-*.tar.gz s3://your-backup-bucket/
```

---

## 📈 Monitoring and Alerting

### Prometheus Metrics
Enable metrics endpoint in `.env`:
```bash
METRICS_ENABLED=true
METRICS_PORT=9090
```

### Grafana Dashboard
Import the provided dashboard from `monitoring/grafana-dashboard.json`

### Alert Rules
Configure alerts for:
- Q-SYS connection failures
- High memory usage (>80%)
- Event database size
- API response times

---

## 🔧 Maintenance

### Log Rotation
Configure logrotate in `/etc/logrotate.d/mcp-qsys`:
```
/var/log/mcp-qsys/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 mcp mcp
    sharedscripts
    postrotate
        pm2 reload mcp-qsys-server
    endscript
}
```

### Database Maintenance
```bash
# Vacuum database monthly
sqlite3 /var/lib/mcp/events/events.db "VACUUM;"

# Analyze for performance
sqlite3 /var/lib/mcp/events/events.db "ANALYZE;"
```

---

## 🚨 Rollback Procedure

### Quick Rollback
```bash
# Stop current version
pm2 stop mcp-qsys-server

# Restore previous version
cd /opt/mcp-qsys-server
git checkout previous-tag

# Rebuild and restart
npm run build
pm2 restart mcp-qsys-server
```

### Database Rollback
```bash
# Stop service
pm2 stop mcp-qsys-server

# Restore database
sqlite3 /var/lib/mcp/events/events.db ".restore /backup/events-20250119.db"

# Restart service
pm2 start mcp-qsys-server
```

---

## 📝 Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues and solutions.

---

## 📚 Additional Resources

- [Configuration Reference](./CONFIGURATION.md)
- [MCP Tools API](./api/MCP_TOOLS.md)
- [Event Monitoring Guide](./EVENT_MONITORING_API.md)
- [Security Best Practices](./SECURITY.md)

---

## 🆘 Support

For production support:
- GitHub Issues: [Project Issues](https://github.com/your-org/mcp-qsys-server/issues)
- Documentation: [Project Wiki](https://github.com/your-org/mcp-qsys-server/wiki)
- Community: [Discord Server](https://discord.gg/your-server)