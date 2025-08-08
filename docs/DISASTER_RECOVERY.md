# Disaster Recovery Guide

## Overview

This guide provides procedures for backup, recovery, and disaster mitigation for the MCP Q-SYS Voice/Text Control system. The system includes automated backup functionality with point-in-time recovery capabilities.

## Backup Strategy

### Automated Backups

The system performs automated daily backups of the event database:

- **Default Schedule**: Every 24 hours
- **Retention**: 7 backups (configurable)
- **Compression**: Enabled by default (gzip)
- **Location**: `./data/backups/` (configurable)

### Configuration

Set backup parameters via environment variables:

```bash
# Backup directory path
EVENT_BACKUP_PATH=/var/backups/mcp

# Maximum number of backups to retain
EVENT_MAX_BACKUPS=7

# Backup interval in milliseconds (86400000 = 24 hours)
EVENT_BACKUP_INTERVAL=86400000
```

## Backup Operations

### Manual Backup

Create an immediate backup:

```bash
npm run backup:create
```

### List Backups

View available backups:

```bash
npm run backup:list
```

Output example:
```
Available backups:
==================

📦 events-backup-2025-08-08T02-50-45-359Z.db.gz
   Date: 2025-08-08 02:50:45
   Size: 1.23 MB
   Compressed: Yes
```

### Verify Database Integrity

Check database health:

```bash
npx tsx src/cli/backup.ts verify ./data/events/events-2025-08-08.db
```

## Recovery Procedures

### Scenario 1: Database Corruption

**Symptoms**: Error messages about database integrity, crashes during operations

**Recovery Steps**:

1. Stop the MCP server:
   ```bash
   # If running as systemd service
   sudo systemctl stop mcp-qsys
   
   # If running directly
   # Press Ctrl+C or kill the process
   ```

2. Identify the latest clean backup:
   ```bash
   npm run backup:list
   ```

3. Restore from backup:
   ```bash
   npx tsx src/cli/backup.ts restore ./data/backups/events-backup-[timestamp].db.gz \
     --target ./data/events --force
   ```

4. Verify the restored database:
   ```bash
   npx tsx src/cli/backup.ts verify ./data/events/events-[date].db
   ```

5. Restart services:
   ```bash
   sudo systemctl start mcp-qsys
   # or
   npm start
   ```

**Recovery Time**: < 5 minutes

### Scenario 2: Accidental Data Deletion

**Symptoms**: Missing events, controls not responding

**Recovery Steps**:

1. Export recent data if possible:
   ```bash
   # Export last 24 hours
   npx tsx src/cli/backup.ts export --days 1
   ```

2. Stop write operations:
   ```bash
   sudo systemctl stop mcp-qsys
   ```

3. Restore from backup:
   ```bash
   npx tsx src/cli/backup.ts restore [backup-file] --force
   ```

4. Import recent data if exported:
   ```bash
   npx tsx src/cli/backup.ts import events-export-[timestamp].json
   ```

5. Restart services:
   ```bash
   sudo systemctl start mcp-qsys
   ```

**Recovery Time**: < 10 minutes

### Scenario 3: Hardware Failure

**Symptoms**: Server crash, disk failure, complete system loss

**Recovery Steps**:

1. Provision new server with same OS (Ubuntu 20.04+ or similar)

2. Install Node.js and dependencies:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs git
   ```

3. Clone and setup MCP server:
   ```bash
   git clone [repository-url]
   cd mcp-voice-text-qsys
   npm install
   npm run build
   ```

4. Restore configuration:
   ```bash
   # Copy backed up config files
   cp /backup/location/qsys-core.config.json ./
   cp /backup/location/.env ./
   ```

5. Restore database from backup:
   ```bash
   mkdir -p ./data/events
   npx tsx src/cli/backup.ts restore /backup/location/events-backup-latest.db.gz
   ```

6. Start services:
   ```bash
   npm start
   # or setup systemd service
   ```

**Recovery Time**: < 30 minutes

### Scenario 4: Ransomware/Malware

**Symptoms**: Encrypted files, suspicious system behavior

**Recovery Steps**:

1. Isolate the affected system immediately
2. Do NOT pay ransom
3. Boot from clean recovery media
4. Wipe and reinstall OS
5. Follow Hardware Failure recovery steps
6. Restore from off-site backups only
7. Implement additional security measures

**Recovery Time**: 1-2 hours

## Data Export/Import

### Export Time Range

Export specific time periods:

```bash
# Export last 7 days
npx tsx src/cli/backup.ts export --days 7

# Export specific range (timestamps in milliseconds)
npx tsx src/cli/backup.ts export --start 1704067200000 --end 1704153600000
```

### Import from Export

Import previously exported data:

```bash
npx tsx src/cli/backup.ts import ./data/backups/events-export-[timestamp].json
```

## Backup Verification

### Automated Checks

The backup system automatically:
- Verifies database integrity before backup
- Checks backup file integrity after creation
- Validates restore operations

### Manual Verification

Verify backup integrity:

```bash
# Decompress and check
gunzip -c events-backup-[timestamp].db.gz > temp.db
npx tsx src/cli/backup.ts verify temp.db
rm temp.db
```

## Best Practices

### Backup Storage

1. **Local Backups**: Keep recent backups on the server
2. **Remote Backups**: Copy to network storage daily
3. **Off-site Backups**: Archive weekly backups off-site

Example backup script:

```bash
#!/bin/bash
# backup-remote.sh

# Create local backup
npm run backup:create

# Copy to network storage
rsync -av ./data/backups/ /mnt/network-backup/mcp/

# Copy to S3 (requires AWS CLI)
aws s3 sync ./data/backups/ s3://your-bucket/mcp-backups/ \
  --exclude "*" --include "*.db.gz"
```

### Monitoring

Monitor backup health:

```bash
# Check last backup time
ls -la ./data/backups/ | tail -1

# Set up alerts for backup failures
# Add to crontab:
0 3 * * * /path/to/check-backup.sh || mail -s "MCP Backup Failed" admin@example.com
```

### Testing

**Monthly**: Test restore procedure on staging server
**Quarterly**: Full disaster recovery drill
**Annually**: Review and update procedures

## Troubleshooting

### Common Issues

**Backup Fails with "Database locked"**
- Stop write-heavy operations
- Retry backup after a few seconds
- Check for stuck processes: `ps aux | grep node`

**Restore Fails with "Integrity check failed"**
- Try an older backup
- Check disk space: `df -h`
- Verify backup file: `gunzip -t backup.db.gz`

**Out of Disk Space**
- Reduce retention: `EVENT_MAX_BACKUPS=3`
- Move old backups: `mv ./data/backups/*.gz /archive/`
- Clean logs: `find ./logs -mtime +30 -delete`

## Emergency Contacts

Maintain a list of contacts for emergencies:

- System Administrator: [Name, Phone, Email]
- Database Expert: [Name, Phone, Email]
- Q-SYS Support: [Contact Information]
- Hosting Provider: [Support Details]

## Recovery Checklist

- [ ] Identify the problem scenario
- [ ] Stop affected services
- [ ] Locate latest clean backup
- [ ] Perform restore procedure
- [ ] Verify data integrity
- [ ] Test system functionality
- [ ] Resume normal operations
- [ ] Document incident
- [ ] Review and improve procedures

## Automation Scripts

### Daily Backup with Rotation

```bash
#!/bin/bash
# /usr/local/bin/mcp-daily-backup.sh

set -e

LOG_FILE="/var/log/mcp-backup.log"
BACKUP_DIR="/var/backups/mcp"
REMOTE_HOST="backup-server.example.com"
REMOTE_PATH="/backups/mcp"

echo "[$(date)] Starting daily backup" >> $LOG_FILE

# Create backup
cd /opt/mcp-voice-text-qsys
npm run backup:create >> $LOG_FILE 2>&1

# Copy to remote
rsync -av --delete $BACKUP_DIR/ $REMOTE_HOST:$REMOTE_PATH/ >> $LOG_FILE 2>&1

# Verify remote copy
ssh $REMOTE_HOST "ls -la $REMOTE_PATH | tail -5" >> $LOG_FILE

echo "[$(date)] Backup completed successfully" >> $LOG_FILE
```

Add to crontab:
```bash
0 2 * * * /usr/local/bin/mcp-daily-backup.sh
```

## Summary

The MCP system provides comprehensive backup and recovery capabilities:

- ✅ Automated daily backups
- ✅ Point-in-time recovery
- ✅ Data export/import functionality
- ✅ Integrity verification
- ✅ Compression and retention management
- ✅ CLI tools for all operations

Recovery times:
- Database corruption: < 5 minutes
- Accidental deletion: < 10 minutes
- Hardware failure: < 30 minutes
- Complete disaster: 1-2 hours

Regular testing and off-site backup storage ensure business continuity even in worst-case scenarios.