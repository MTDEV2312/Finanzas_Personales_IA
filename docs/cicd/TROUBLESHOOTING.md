# Troubleshooting Guide

This document covers common issues and their solutions.

## CI/CD Pipeline Issues

### Workflow Not Triggering

**Symptoms**: Push to `main` with `api/**` changes doesn't trigger workflow.

**Possible Causes**:

1. **Path filter not matching**
   ```bash
   # Check if changes are in api/
   git diff --name-only HEAD~1 | grep "^api/"
   ```

2. **Workflow file not on main branch**
   ```bash
   # Verify workflow exists on main
   git ls-files .github/workflows/api.yml
   ```

3. **GitHub Actions disabled**
   - Check: `Repository → Settings → Actions → General → Actions permissions`

4. **Runner offline**
   - Check: `Repository → Settings → Actions → Runners`

**Solutions**:

```bash
# Ensure workflow file is committed to main
git add .github/workflows/api.yml
git commit -m "ci: add workflow"
git push origin main
```

### CI Job Fails at Type Checking

**Symptoms**: `bunx tsc --noEmit` fails with TypeScript errors.

**Diagnostic**:

```bash
# Run locally to see errors
cd api
bun install
bunx tsc --noEmit
```

**Common Errors**:

| Error | Solution |
|-------|----------|
| `Cannot find module` | Check imports, run `bun install` |
| `Type 'X' is not assignable` | Fix type mismatch |
| `Property 'X' does not exist` | Add missing property or fix type |

### CI Job Fails at Dependencies

**Symptoms**: `bun install` fails.

**Solutions**:

```bash
# Delete lockfile and reinstall
rm bun.lock
bun install
git add bun.lock
git commit -m "fix: regenerate lockfile"
```

### Deploy Job Skipped

**Symptoms**: CI passes but deploy doesn't run.

**Cause**: Deploy only runs on push to `main`, not on PRs.

**Verification**:

```yaml
# In workflow
deploy:
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

## SSH Connection Issues

### Connection Refused

**Symptoms**: `ssh: connect to host ... port 22: Connection refused`

**Diagnostic**:

```bash
# From runner LXC
ssh -v root@<API_LXC_IP>

# Check if SSH is running on API LXC
systemctl status sshd
```

**Solutions**:

1. Start SSH service:
   ```bash
   systemctl start sshd
   systemctl enable sshd
   ```

2. Check firewall:
   ```bash
   ufw status
   ufw allow 22
   ```

### Permission Denied

**Symptoms**: `Permission denied (publickey)`

**Diagnostic**:

```bash
# Test SSH manually
ssh -i ~/.ssh/id_ed25519 root@<API_LXC_IP> "echo test"

# Check key permissions
ls -la ~/.ssh/id_ed25519
# Should be: -rw------- (600)
```

**Solutions**:

1. Fix key permissions:
   ```bash
   chmod 600 ~/.ssh/id_ed25519
   chmod 700 ~/.ssh
   ```

2. Re-copy public key:
   ```bash
   ssh-copy-id -i ~/.ssh/id_ed25519.pub root@<API_LXC_IP>
   ```

3. Check authorized_keys:
   ```bash
   # On API LXC
   cat /root/.ssh/authorized_keys
   # Verify public key is present
   ```

### Host Key Verification Failed

**Symptoms**: `Host key verification failed`

**Solution**:

```bash
# Add host to known_hosts
ssh-keyscan -H <API_LXC_IP> >> ~/.ssh/known_hosts
```

## Deploy Issues

### Backup Fails

**Symptoms**: Deploy fails at backup step.

**Diagnostic**:

```bash
# Check disk space
df -h /opt/backups

# Check permissions
ls -la /opt/backups
```

**Solutions**:

1. Free disk space:
   ```bash
   # Remove old backups
   ls -dt /opt/backups/finanzas-api-* | tail -n +6 | xargs rm -rf
   ```

2. Fix permissions:
   ```bash
   chown -R root:root /opt/backups
   chmod -R 755 /opt/backups
   ```

### Rsync Fails

**Symptoms**: Files not copied to API LXC.

**Diagnostic**:

```bash
# Test rsync manually
rsync -avz --delete \
  -e "ssh -i ~/.ssh/id_ed25519" \
  ./api/ root@<API_LXC_IP>:/opt/finanzas-api/api/
```

**Common Issues**:

| Issue | Solution |
|-------|----------|
| Permission denied | Check SSH key and sudoers |
| Disk full | Check `df -h` on API LXC |
| Path not found | Verify `API_DEPLOY_PATH` secret |

### Service Won't Restart

**Symptoms**: `systemctl restart bun-api` fails.

**Diagnostic**:

```bash
# Check service status
systemctl status bun-api.service

# Check logs
journalctl -u bun-api.service -n 50

# Check if process is running
ps aux | grep bun
```

**Solutions**:

1. Manual restart:
   ```bash
   systemctl stop bun-api.service
   sleep 2
   systemctl start bun-api.service
   ```

2. Check for port conflict:
   ```bash
   ss -tlnp | grep 3000
   # Kill any process using port 3000
   ```

3. Check file permissions:
   ```bash
   ls -la /opt/finanzas-api/api/
   # Should be owned by root
   ```

### Health Check Fails After Deploy

**Symptoms**: Service restarts but health check fails.

**Diagnostic**:

```bash
# Test health endpoint
curl -v http://localhost:3000/health

# Check if service is actually running
systemctl status bun-api.service

# Check application logs
journalctl -u bun-api.service -f
```

**Common Causes**:

1. **Application error**: Check logs for startup errors
2. **Port conflict**: Another process using port 3000
3. **Missing dependencies**: Run `bun install` manually
4. **Environment variables**: Check `.env` file exists

**Solutions**:

```bash
# Test run manually
cd /opt/finanzas-api/api
bun run index.ts

# Check environment
env | grep PORT

# Verify .env exists
cat /opt/finanzas-api/api/.env
```

## Rollback Issues

### Rollback Fails

**Symptoms**: Service doesn't recover after rollback.

**Diagnostic**:

```bash
# List available backups
ls -lt /opt/backups/finanzas-api-*

# Check backup integrity
ls -la /opt/backups/finanzas-api-<timestamp>/

# Try manual rollback
systemctl stop bun-api.service
rm -rf /opt/finanzas-api/api/*
cp -r /opt/backups/finanzas-api-<timestamp>/* /opt/finanzas-api/api/
systemctl start bun-api.service
```

**If No Backups Exist**:

1. Clone from repository:
   ```bash
   cd /opt/finanzas-api
   git clone https://github.com/user/Finanzas_Personales_IA.git temp
   cp -r temp/api/* api/
   rm -rf temp
   cd api
   bun install --production
   systemctl start bun-api.service
   ```

2. If `git clone` fails, manually copy from development machine via SCP.

## Runner Issues

### Runner Offline

**Symptoms**: GitHub shows runner as offline.

**Diagnostic**:

```bash
# Check runner status
cd /home/github-runner/actions-runner
./svc.sh status

# Check runner logs
tail -f /home/github-runner/actions-runner/_diag/*.log
```

**Solutions**:

```bash
# Restart runner
cd /home/github-runner/actions-runner
./svc.sh stop
./svc.sh start

# Or restart the LXC container
```

### Runner Out of Disk Space

**Symptoms**: Workflow fails with "no space left on device".

**Solution**:

```bash
# On runner LXC
df -h

# Clean GitHub Actions cache
rm -rf /home/github-runner/actions-runner/_work/*

# Clean old workflows
find /home/github-runner/actions-runner/_work -maxdepth 1 -type d -mtime +7 -exec rm -rf {} \;
```

## API-Specific Issues

### API Keys Invalid

**Symptoms**: AI services returning 401/403 errors.

**Diagnostic**:

```bash
# Check environment variables
env | grep -E "GROQ|OPENROUTER|GOOGLE|MISTRAL|OPENAI"

# Check .env file
cat /opt/finanzas-api/api/.env
```

**Solution**:

1. Verify API keys are valid at provider dashboards
2. Update `.env` file
3. Restart service:
   ```bash
   systemctl restart bun-api.service
   ```

### Service Crash Loop

**Symptoms**: Service keeps restarting repeatedly.

**Diagnostic**:

```bash
# Check restart count
systemctl status bun-api.service

# View crash logs
journalctl -u bun-api.service -n 100 | grep -i "error\|crash\|fatal"
```

**Solution**:

1. Stop the service:
   ```bash
   systemctl stop bun-api.service
   ```

2. Run manually to see error:
   ```bash
   cd /opt/finanzas-api/api
   bun run index.ts
   ```

3. Fix the issue, then restart.

## Debug Commands Reference

| Command | Purpose |
|---------|---------|
| `systemctl status bun-api` | Check service status |
| `journalctl -u bun-api -f` | Live logs |
| `curl -v http://localhost:3000/health` | Health check verbose |
| `ps aux \| grep bun` | Check process |
| `ss -tlnp \| grep 3000` | Check port |
| `df -h` | Disk usage |
| `free -h` | Memory usage |
| `ssh -v root@<IP>` | Debug SSH |
| `cat /var/log/auth.log` | Auth logs |
| `tail -f /var/log/syslog` | System logs |

## Escalation Path

If unable to resolve:

1. **Check all logs** (application, system, auth)
2. **Verify network connectivity** between LXC containers
3. **Check Proxmox** for LXC issues
4. **Manual intervention**: Deploy via SCP from development machine
5. **Last resort**: Restore from backup, manually restart

## Emergency Contacts

| Issue | Contact |
|-------|---------|
| API Down | Check service, restart manually |
| SSH Issues | Check Proxmox console |
| GitHub Actions | Check GitHub status page |
| Proxmox Issues | Check Proxmox web interface |
