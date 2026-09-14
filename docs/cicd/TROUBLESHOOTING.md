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

### Missing Shared Environment (`/opt/finanzas-api/shared/.env`)

**Symptoms**: Deploy pipeline fails at `Assert and Link Shared Environment` with:
```
❌ Error: /opt/finanzas-api/shared/.env does not exist!
```

**Diagnostic**:

```bash
# Verify shared directory contents and permissions on API LXC
ls -la /opt/finanzas-api/shared/
```

**Solutions**:

1. Re-create the shared directory if missing:
   ```bash
   mkdir -p /opt/finanzas-api/shared
   ```

2. Restore `.env` from template or secure backup:
   ```bash
   cp /path/to/backup.env /opt/finanzas-api/shared/.env
   chmod 600 /opt/finanzas-api/shared/.env
   ```

3. If transitioning from previous deployment:
   ```bash
   mv /opt/finanzas-api/api/.env /opt/finanzas-api/shared/.env
   chmod 600 /opt/finanzas-api/shared/.env
   ```

### Broken or Dangling Symlink (`/opt/finanzas-api/current`)

**Symptoms**: `bun-api.service` fails to start with `No such file or directory` or `ENOENT` pointing to `/opt/finanzas-api/current`.

**Diagnostic**:

```bash
# Check where current points and whether the target directory exists
ls -l /opt/finanzas-api/current
file /opt/finanzas-api/current

# Check if release .env link is valid
ls -l /opt/finanzas-api/current/.env
```

**Solutions**:

1. If `/opt/finanzas-api/current` points to a non-existent or deleted release:
   ```bash
   # Point to the newest available release directory
   LATEST_RELEASE=$(ls -dt /opt/finanzas-api/releases/* | head -n 1)
   ln -sfn "$LATEST_RELEASE" /opt/finanzas-api/current
   systemctl reload-or-restart bun-api.service || systemctl restart bun-api.service
   ```

2. If `.env` link within the release is broken:
   ```bash
   ln -sfn /opt/finanzas-api/shared/.env /opt/finanzas-api/current/.env
   systemctl restart bun-api.service
   ```

### Cutover or Permission Failure During `ln -sfn`

**Symptoms**: Pipeline cutover step fails with `Operation not permitted` or `Permission denied`.

**Diagnostic**:

```bash
# Check permissions on /opt/finanzas-api/ and /opt/finanzas-api/releases/
ls -ld /opt/finanzas-api /opt/finanzas-api/releases /opt/finanzas-api/current
```

**Solutions**:

1. Correct directory ownership and permissions:
   ```bash
   chown -R root:root /opt/finanzas-api
   chmod 755 /opt/finanzas-api /opt/finanzas-api/releases
   ```

### Release Retention Pruning Failure

**Symptoms**: Releases accumulate beyond the 5 most recent directories, consuming excessive disk space.

**Diagnostic**:

```bash
# Count total release directories
ls -dt /opt/finanzas-api/releases/* | wc -l

# Check available disk space
df -h /opt/finanzas-api
```

**Solutions**:

1. Execute pruning command manually using `xargs -r` (avoids running if fewer than 5):
   ```bash
   ls -dt /opt/finanzas-api/releases/* | tail -n +6 | xargs -r rm -rf
   ```

2. Verify that only the 5 newest release directories remain:
   ```bash
   ls -lt /opt/finanzas-api/releases/
   ```

### Rsync Fails

**Symptoms**: Production artifacts are not copied to API LXC release directory.

**Diagnostic**:

```bash
# Test rsync manually
RELEASE_DIR="/opt/finanzas-api/releases/test"
rsync -avz --delete \
  -e "ssh -i ~/.ssh/id_ed25519" \
  ./api/ root@<API_LXC_IP>:"$RELEASE_DIR"/
```

**Common Issues**:

| Issue | Solution |
|-------|----------|
| Permission denied | Check SSH key and target folder permissions |
| Disk full | Check `df -h /opt/finanzas-api` on API LXC |
| Missing parent directory | Ensure `/opt/finanzas-api/releases` exists |

### Service Won't Restart

**Symptoms**: `systemctl reload-or-restart bun-api.service` fails.

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
   ls -la /opt/finanzas-api/current/
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
3. **Missing dependencies**: Check `node_modules` in `/opt/finanzas-api/current`
4. **Missing or invalid environment configuration**: Check `/opt/finanzas-api/shared/.env`

**Solutions**:

```bash
# Test run manually from current symlink
cd /opt/finanzas-api/current
bun run index.ts

# Check environment
env | grep PORT

# Verify shared .env exists and is linked
ls -l /opt/finanzas-api/current/.env
cat /opt/finanzas-api/shared/.env
```

## Rollback Issues

### Instant Pointer Rollback Fails

**Symptoms**: Rollback step fails or service cannot recover after pointer repoint.

**Diagnostic**:

```bash
# List available release directories
ls -lt /opt/finanzas-api/releases/

# Check where current symlink is pointing
ls -l /opt/finanzas-api/current
```

**Solutions**:

1. Manual pointer rollback:
   ```bash
   # Select previous release directory
   PREV_RELEASE=$(ls -dt /opt/finanzas-api/releases/* | sed -n '2p')
   ln -sfn "$PREV_RELEASE" /opt/finanzas-api/current
   systemctl reload-or-restart bun-api.service || systemctl restart bun-api.service
   curl http://localhost:3000/health
   ```

2. If no previous release directory exists in `/opt/finanzas-api/releases/`:
   - Initialize baseline release:
     ```bash
     mkdir -p /opt/finanzas-api/releases/recovery
     cd /opt/finanzas-api
     git clone https://github.com/user/Finanzas_Personales_IA.git temp
     cp -r temp/api/* /opt/finanzas-api/releases/recovery/
     rm -rf temp
     cd /opt/finanzas-api/releases/recovery
     bun install --production
     ln -sfn /opt/finanzas-api/shared/.env /opt/finanzas-api/releases/recovery/.env
     ln -sfn /opt/finanzas-api/releases/recovery /opt/finanzas-api/current
     systemctl restart bun-api.service
     ```

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
cat /opt/finanzas-api/shared/.env
```

**Solution**:

1. Verify API keys are valid at provider dashboards
2. Update `.env` file (`/opt/finanzas-api/shared/.env`)
3. Restart service:
   ```bash
   systemctl reload-or-restart bun-api.service || systemctl restart bun-api.service
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
   cd /opt/finanzas-api/current
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
| `df -h /opt/finanzas-api` | Disk usage |
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
