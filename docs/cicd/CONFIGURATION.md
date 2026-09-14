# Configuration Reference

This document contains all configuration files and settings required for the CI/CD implementation.

## GitHub Secrets

| Secret | Description | Example | Required |
|--------|-------------|---------|----------|
| `API_SSH_HOST` | IP address of API LXC | `your_server_ip_here` | Yes |
| `API_SSH_USER` | SSH username | `root` | Yes |
| `API_SSH_KEY` | SSH private key (ed25519) | `-----BEGIN OPENSSH...` | Yes |
| `API_DEPLOY_PATH` | Deploy path on API server | `/opt/finanzas-api/api` | Yes |

### How to Add Secrets

1. Go to `Repository → Settings → Secrets and variables → Actions`
2. Click `New repository secret`
3. Enter name and value
4. Click `Add secret`

## Systemd Service

**File**: `/etc/systemd/system/bun-api.service`

```ini
[Unit]
Description=Bun API - Finanzas Personales IA
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/finanzas-api/api
ExecStart=/usr/local/bin/bun run index.ts
Restart=on-failure
RestartSec=10
StartLimitBurst=5
StartLimitIntervalSec=60

# Environment variables
Environment=PORT=3000
Environment=NODE_ENV=production
Environment=IDLE_TIMEOUT_SECONDS=120

# Load API keys from file
EnvironmentFile=/opt/finanzas-api/api/.env

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=bun-api

# Security hardening (optional, requires root)
ProtectSystem=false
ProtectHome=false
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

### Service Commands

```bash
# Status
systemctl status bun-api.service

# Start/Stop/Restart
systemctl start bun-api.service
systemctl stop bun-api.service
systemctl restart bun-api.service

# Enable on boot
systemctl enable bun-api.service

# View logs
journalctl -u bun-api.service -f
journalctl -u bun-api.service --since "1 hour ago"
```

## Sudoers Configuration

**File**: `/etc/sudoers.d/github-runner`

```
# Sudoers configuration for GitHub Actions runner
# Created: $(date)
# Purpose: Allow CI/CD to manage bun-api service

# Service management
root ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart bun-api
root ALL=(ALL) NOPASSWD: /usr/bin/systemctl status bun-api
root ALL=(ALL) NOPASSWD: /usr/bin/systemctl stop bun-api
root ALL=(ALL) NOPASSWD: /usr/bin/systemctl start bun-api

# Backup management
root ALL=(ALL) NOPASSWD: /bin/cp -r /opt/finanzas-api/api /opt/backups/finanzas-api-*
root ALL=(ALL) NOPASSWD: /bin/rm -rf /opt/backups/finanzas-api-*

# File operations (for rsync)
root ALL=(ALL) NOPASSWD: /usr/bin/rsync
```

### Validate Sudoers

```bash
visudo -c
```

## SSH Configuration

### Runner LXC (`/home/github-runner/.ssh/config`)

```
Host api-server
    HostName <API_LXC_IP>
    User root
    IdentityFile ~/.ssh/id_ed25519
    StrictHostKeyChecking yes
    UserKnownHostsFile ~/.ssh/known_hosts
```

### API LXC (`/root/.ssh/authorized_keys`)

```
# GitHub Actions Runner
ssh-ed25519 AAAA... github-runner@lxc-runner
```

### SSH Permissions

```bash
# Runner LXC
chmod 700 /home/github-runner/.ssh
chmod 600 /home/github-runner/.ssh/id_ed25519
chmod 644 /home/github-runner/.ssh/known_hosts
chown -R github-runner:github-runner /home/github-runner/.ssh

# API LXC
chmod 700 /root/.ssh
chmod 600 /root/.ssh/authorized_keys
```

## API Configuration

### Environment Variables

**File**: `/opt/finanzas-api/api/.env`

```bash
# Server Configuration
PORT=3000
IDLE_TIMEOUT_SECONDS=120

# AI Provider API Keys
# These are loaded automatically by the SDKs
GROQ_API_KEY=gsk_...
OPENROUTER_API_KEY=sk-or-...
GOOGLE_API_KEY=...
MISTRAL_API_KEY=...
OPENAI_API_KEY=...
CEREBRAS_API_KEY=...

# Optional
UPSTREAM_TIMEOUT_MS=20000
```

### Package.json Scripts

**File**: `api/package.json`

```json
{
  "scripts": {
    "start": "bun run index.ts",
    "dev": "bun --watch run index.ts"
  }
}
```

## Network Configuration

### Ports

| Service | Port | Protocol | Exposure |
|---------|------|----------|----------|
| Bun API | 3000 | TCP | Internal (LXC only) |
| SSH | 22 | TCP | Internal (LXC only) |
| GitHub Actions | 443 | HTTPS | Outbound |

### Firewall Rules (API LXC)

```bash
# Allow SSH from Runner LXC only
ufw allow from <RUNNER_LXC_IP> to any port 22

# Allow API port internally only (no external)
ufw deny 3000

# Enable UFW
ufw enable
```

> **Note**: If API needs external access, adjust firewall accordingly.

## Backup Configuration

### Backup Directory

```
/opt/backups/finanzas-api/
├── finanzas-api-20260913_143022/
├── finanzas-api-20260913_150045/
└── finanzas-api-20260913_160112/
```

### Backup Retention

```bash
# Keep last 5 backups
ls -dt /opt/backups/finanzas-api-* | tail -n +6 | xargs rm -rf
```

### Manual Backup

```bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
cp -r /opt/finanzas-api/api /opt/backups/finanzas-api-${TIMESTAMP}
```

## Workflow Configuration

### Path Filters

```yaml
on:
  push:
    paths:
      - 'api/**'                    # Any change in api/
      - '.github/workflows/api.yml' # Workflow itself
  pull_request:
    paths:
      - 'api/**'
      - '.github/workflows/api.yml'
```

### Concurrency

```yaml
concurrency:
  group: api-deploy-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

### Job Dependencies

```yaml
jobs:
  ci:
    # Runs first
  deploy:
    needs: ci  # Only runs if ci succeeds
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

## Health Check Configuration

### Endpoint

```
GET http://localhost:3000/health
```

### Expected Response

```json
{
  "status": "ok"
}
```

### Timeout

```bash
# Default timeout: 5 seconds
curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3000/health
```

### Retry Logic

```bash
# Retry 3 times with 2 second interval
for i in {1..3}; do
  HTTP_STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3000/health)
  if [ "$HTTP_STATUS" = "200" ]; then
    echo "Health check passed"
    exit 0
  fi
  sleep 2
done
echo "Health check failed"
exit 1
```

## Logging Configuration

### Systemd Journal

```bash
# View all bun-api logs
journalctl -u bun-api.service

# View last 100 lines
journalctl -u bun-api.service -n 100

# View since specific time
journalctl -u bun-api.service --since "2026-09-13 14:00:00"

# Follow logs in real-time
journalctl -u bun-api.service -f
```

### Application Logs

The API uses `console.log` and `console.error` which are captured by systemd journal.

```bash
# Filter by log level
journalctl -u bun-api.service | grep "ERROR"
journalctl -u bun-api.service | grep "Using service"
```

## Monitoring Commands

```bash
# Service status
systemctl status bun-api.service

# Port usage
ss -tlnp | grep 3000

# Process check
ps aux | grep bun

# Disk usage
df -h /opt/finanzas-api
df -h /opt/backups

# Memory usage
free -h

# API response time
curl -w '@-' -o /dev/null -s http://localhost:3000/health <<< 'time_total: %{time_total}s\n'
```
