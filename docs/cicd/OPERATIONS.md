# Operations & Maintenance

This document covers day-to-day operations, monitoring, and maintenance tasks.

## Daily Operations

### Health Monitoring

```bash
# Quick health check
curl http://localhost:3000/health

# Service status
systemctl status bun-api.service

# Recent logs
journalctl -u bun-api.service -n 50
```

### Automated Monitoring Script

**File**: `/opt/scripts/check-api.sh`

```bash
#!/bin/bash
HEALTH_URL="http://localhost:3000/health"
LOG_FILE="/var/log/api-monitor.log"

HTTP_STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 $HEALTH_URL)

if [ "$HTTP_STATUS" != "200" ]; then
    echo "$(date): API Health Check FAILED (HTTP $HTTP_STATUS)" >> $LOG_FILE
    systemctl restart bun-api.service
    echo "$(date): Service restarted" >> $LOG_FILE
else
    echo "$(date): API Health Check OK" >> $LOG_FILE
fi
```

### Cron Job for Monitoring

```bash
# Check every 5 minutes
*/5 * * * * /opt/scripts/check-api.sh
```

## Backup Operations

### Manual Backup

```bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
cp -r /opt/finanzas-api/api /opt/backups/finanzas-api-${TIMESTAMP}
echo "Backup created: finanzas-api-${TIMESTAMP}"
```

### Automated Backup Script

**File**: `/opt/scripts/backup-api.sh`

```bash
#!/bin/bash
BACKUP_DIR="/opt/backups"
SOURCE="/opt/finanzas-api/api"
KEEP=5

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="finanzas-api-${TIMESTAMP}"

cp -r $SOURCE ${BACKUP_DIR}/${BACKUP_NAME}
echo "Created backup: ${BACKUP_NAME}"

# Cleanup old backups
ls -dt ${BACKUP_DIR}/finanzas-api-* | tail -n +$((KEEP+1)) | xargs rm -rf
echo "Cleaned up old backups, keeping ${KEEP}"
```

### Backup Cron Job

```bash
# Daily backup at 2 AM
0 2 * * * /opt/scripts/backup-api.sh >> /var/log/api-backup.log 2>&1
```

### Verify Backup

```bash
# List backups
ls -la /opt/backups/finanzas-api-*

# Check backup size
du -sh /opt/backups/finanzas-api-*

# Verify backup content
ls -la /opt/backups/finanzas-api-$(date +%Y%m%d)/
```

## Deploy Operations

### Standard Deploy (Automated)

Triggered by GitHub Actions on push to `main` with `api/**` changes.

### Manual Deploy

```bash
# On API LXC

# 1. Backup current version
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
cp -r /opt/finanzas-api/api /opt/backups/finanzas-api-${TIMESTAMP}

# 2. Copy new files (from local machine or git)
cd /opt/finanzas-api
git pull origin main

# 3. Install dependencies
cd api
bun install --production

# 4. Restart service
systemctl restart bun-api.service

# 5. Verify health
sleep 5
curl http://localhost:3000/health
```

### Emergency Deploy

```bash
# If automated deploy fails

# 1. Stop service
systemctl stop bun-api.service

# 2. Restore from backup
LATEST_BACKUP=$(ls -t /opt/backups/finanzas-api-* | head -1)
rm -rf /opt/finanzas-api/api/*
cp -r ${LATEST_BACKUP}/* /opt/finanzas-api/api/

# 3. Start service
systemctl start bun-api.service

# 4. Verify
curl http://localhost:3000/health
```

## Rollback Operations

### Automatic Rollback

Triggered by GitHub Actions when health check fails after deploy.

### Manual Rollback

```bash
# 1. List available backups
ls -lt /opt/backups/finanzas-api-*

# 2. Identify target backup
BACKUP="/opt/backups/finanzas-api-YYYYMMDD_HHMMSS"

# 3. Stop service
systemctl stop bun-api.service

# 4. Restore files
rm -rf /opt/finanzas-api/api/*
cp -r ${BACKUP}/* /opt/finanzas-api/api/

# 5. Start service
systemctl start bun-api.service

# 6. Verify
curl http://localhost:3000/health
```

### Rollback to Specific Version

```bash
# If multiple backups exist, choose specific one
BACKUP=$(ls -dt /opt/backups/finanzas-api-* | grep "YYYYMMDD" | head -1)

# Restore
systemctl stop bun-api.service
rm -rf /opt/finanzas-api/api/*
cp -r ${BACKUP}/* /opt/finanzas-api/api/
systemctl start bun-api.service
```

## Service Management

### Start/Stop/Restart

```bash
# Start
systemctl start bun-api.service

# Stop
systemctl stop bun-api.service

# Restart
systemctl restart bun-api.service

# Reload (if config changes)
systemctl daemon-reload
systemctl restart bun-api.service
```

### Enable/Disable on Boot

```bash
# Enable (start on boot)
systemctl enable bun-api.service

# Disable (don't start on boot)
systemctl disable bun-api.service
```

### View Service Status

```bash
systemctl status bun-api.service
```

Expected output:

```
● bun-api.service - Bun API - Finanzas Personales IA
     Loaded: loaded (/etc/systemd/system/bun-api.service; enabled; vendor preset: enabled)
     Active: active (running) since ...
   Main PID: 12345 (bun)
      Tasks: 10 (limit: 4631)
     Memory: 50.2M
        CPU: 1.234s
     CGroup: /system.slice/bun-api.service
             └─12345 /usr/local/bin/bun run index.ts
```

## Log Management

### View Logs

```bash
# All logs
journalctl -u bun-api.service

# Last 100 lines
journalctl -u bun-api.service -n 100

# Since specific time
journalctl -u bun-api.service --since "1 hour ago"
journalctl -u bun-api.service --since "2026-09-13 14:00:00"

# Follow real-time
journalctl -u bun-api.service -f

# Filter by priority
journalctl -u bun-api.service -p err
```

### Log Rotation

Systemd journal handles log rotation automatically. Configure in:

```bash
# /etc/systemd/journald.conf
[Journal]
SystemMaxUse=500M
MaxRetentionSec=30day
```

### Export Logs

```bash
# Export to file
journalctl -u bun-api.service > /var/log/bun-api-export.log

# Export with timestamp
journalctl -u bun-api.service > /var/log/bun-api-$(date +%Y%m%d).log
```

## Maintenance Tasks

### Update Dependencies

```bash
# On development machine
cd api
bun update

# Commit changes
git add bun.lock package.json
git commit -m "chore: update dependencies"
git push origin main
# CI/CD will handle deployment
```

### Update Bun Runtime

```bash
# On API LXC
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bun --version

# Restart service to use new version
systemctl restart bun-api.service
```

### Clean Disk Space

```bash
# Check disk usage
df -h /opt/finanzas-api
df -h /opt/backups

# Remove old backups manually
rm -rf /opt/backups/finanzas-api-*

# Clean journal logs
journalctl --vacuum-size=100M
```

### Certificate Renewal

If using TLS/SSL:

```bash
# Check certificate expiry
openssl x509 -enddate -noout -in /etc/ssl/certs/api.crt

# Renew (example for Let's Encrypt)
certbot renew
systemctl restart nginx  # if using reverse proxy
```

## Monitoring Commands Reference

| Command | Purpose |
|---------|---------|
| `systemctl status bun-api` | Service status |
| `curl http://localhost:3000/health` | Health check |
| `journalctl -u bun-api -f` | Live logs |
| `ss -tlnp \| grep 3000` | Port listening |
| `ps aux \| grep bun` | Process check |
| `df -h` | Disk usage |
| `free -h` | Memory usage |
| `uptime` | System uptime |

## Scheduled Tasks

### Crontab

```bash
# Edit crontab
crontab -e

# Add tasks
*/5 * * * * /opt/scripts/check-api.sh  # Health check every 5 min
0 2 * * * /opt/scripts/backup-api.sh   # Daily backup at 2 AM
0 0 * * * /opt/scripts/cleanup-backups.sh  # Cleanup weekly
```

### Verify Crontab

```bash
crontab -l
```
