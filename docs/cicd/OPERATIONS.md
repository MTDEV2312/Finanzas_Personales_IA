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

## Release Management & Retention Operations

### Immutable Release Snapshots

With atomic symlink deployment, every release is an isolated, immutable directory under `/opt/finanzas-api/releases/<timestamp>/`. Separate backup copying is no longer needed.

### Automated Retention Pruning

The CI/CD pipeline automatically retains the 5 most recent releases after a successful deployment. To run pruning manually:

```bash
# Keep 5 newest releases and remove older directories
ls -dt /opt/finanzas-api/releases/* | tail -n +6 | xargs -r rm -rf
```

### Release Inspection & Audit

```bash
# View active symlink pointer
ls -l /opt/finanzas-api/current

# List all release directories ordered by modification time
ls -lt /opt/finanzas-api/releases/

# Inspect disk footprint of releases
du -sh /opt/finanzas-api/releases/*
```

## Deploy Operations

### Standard Deploy (Automated)

Triggered by GitHub Actions on push to `main` with changes in `api/**` or `.github/workflows/api.yml`:
1. Self-hosted runner builds production artifacts (`bun install --production`).
2. Creates isolated release directory `/opt/finanzas-api/releases/<timestamp>/`.
3. Rsyncs build artifacts to the new release directory.
4. Symlinks `/opt/finanzas-api/shared/.env` to `${RELEASE_DIR}/.env`.
5. Executes atomic pointer cutover: `ln -sfn "${RELEASE_DIR}" /opt/finanzas-api/current`.
6. Reloads/restarts `bun-api.service`.
7. Verifies health endpoint (`GET http://localhost:3000/health`).
8. On success: Prunes older releases keeping the 5 most recent.
9. On failure: Triggers instant pointer rollback.

### Manual Deploy

```bash
# On API LXC:

# 1. Create timestamped release directory
RELEASE_DIR="/opt/finanzas-api/releases/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$RELEASE_DIR"

# 2. Copy artifacts to release directory
cp -r /path/to/source/api/* "$RELEASE_DIR/"
cd "$RELEASE_DIR"
bun install --production

# 3. Symlink shared environment configuration
ln -sfn /opt/finanzas-api/shared/.env "$RELEASE_DIR/.env"

# 4. Atomic pointer cutover
ln -sfn "$RELEASE_DIR" /opt/finanzas-api/current

# 5. Reload/restart service
systemctl reload-or-restart bun-api.service || systemctl restart bun-api.service

# 6. Verify health
sleep 3
curl http://localhost:3000/health

# 7. Prune older releases (retain 5 newest)
ls -dt /opt/finanzas-api/releases/* | tail -n +6 | xargs -r rm -rf
```

### Emergency Recovery Deploy

```bash
# If active deployment is corrupted and requires immediate reset:
# Repoint current to the last known good release
PREV_RELEASE=$(ls -dt /opt/finanzas-api/releases/* | sed -n '2p')
ln -sfn "$PREV_RELEASE" /opt/finanzas-api/current
systemctl reload-or-restart bun-api.service || systemctl restart bun-api.service
curl http://localhost:3000/health
```

## Rollback Operations

### Automated Rollback

GitHub Actions automatically executes instant pointer rollback if health verification fails after deployment:
1. Identifies the previous release: `ls -dt /opt/finanzas-api/releases/* | sed -n '2p'`.
2. Repoints `/opt/finanzas-api/current` to previous release via `ln -sfn`.
3. Restarts `bun-api.service`.
4. Deletes the failed release directory.
5. Fails workflow with exit status 1.

### Instant Pointer Rollback (Manual)

To instantaneously revert the active release to the previous release (sub-millisecond pointer switch):

```bash
# 1. Identify previous release directory
PREV_RELEASE=$(ls -dt /opt/finanzas-api/releases/* | sed -n '2p')
echo "Reverting to: $PREV_RELEASE"

# 2. Atomically swap pointer
ln -sfn "$PREV_RELEASE" /opt/finanzas-api/current

# 3. Reload/restart service
systemctl reload-or-restart bun-api.service || systemctl restart bun-api.service

# 4. Verify health
curl http://localhost:3000/health
```

### Rollback to Specific Release

```bash
# 1. List available releases
ls -lt /opt/finanzas-api/releases/

# 2. Point current to selected release timestamp
ln -sfn /opt/finanzas-api/releases/YYYYMMDD_HHMMSS /opt/finanzas-api/current

# 3. Reload/restart service
systemctl reload-or-restart bun-api.service || systemctl restart bun-api.service

# 4. Verify health
curl http://localhost:3000/health
```

## Server Migration Runbook (4-Step Zero-Downtime Migration)

This runbook migrates an existing in-place server deployment (`/opt/finanzas-api/api`) to the atomic symlink release architecture without downtime.

### Step 1: Hierarchy Setup
Create the directory structure for immutable releases and shared configuration:
```bash
mkdir -p /opt/finanzas-api/releases /opt/finanzas-api/shared
```

### Step 2: Config Migration
Relocate `.env` to the shared directory and set strict permissions:
```bash
mv /opt/finanzas-api/api/.env /opt/finanzas-api/shared/.env && chmod 600 /opt/finanzas-api/shared/.env
```

### Step 3: Initial Baseline & Symlink
Establish the existing API directory as the initial release baseline and create symlinks for `current` and `.env`:
```bash
mv /opt/finanzas-api/api /opt/finanzas-api/releases/initial && ln -sfn /opt/finanzas-api/releases/initial /opt/finanzas-api/current && ln -sfn /opt/finanzas-api/shared/.env /opt/finanzas-api/current/.env
```

### Step 4: Systemd Cutover
Update the service unit to use `/opt/finanzas-api/current` as `WorkingDirectory`, reload systemd, and restart the service:
```bash
sed -i 's|WorkingDirectory=.*|WorkingDirectory=/opt/finanzas-api/current|' /etc/systemd/system/bun-api.service && systemctl daemon-reload && systemctl restart bun-api.service
```

### Post-Migration Verification
Confirm service operational status:
```bash
systemctl status bun-api.service
curl http://localhost:3000/health
ls -l /opt/finanzas-api/current
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

# Prune excess releases manually (retain 5 newest)
ls -dt /opt/finanzas-api/releases/* | tail -n +6 | xargs -r rm -rf

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
| `df -h /opt/finanzas-api` | Disk usage |
| `free -h` | Memory usage |
| `uptime` | System uptime |

## Scheduled Tasks

### Crontab

```bash
# Edit crontab
crontab -e

# Add tasks
*/5 * * * * /opt/scripts/check-api.sh  # Health check every 5 min
0 3 * * 0 ls -dt /opt/finanzas-api/releases/* | tail -n +6 | xargs -r rm -rf  # Weekly retention pruning check
```

### Verify Crontab

```bash
crontab -l
```
