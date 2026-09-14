# Implementation Guide — CI/CD

This document provides step-by-step instructions for implementing the CI/CD pipeline.

## Prerequisites

Before starting, verify:

- [ ] Proxmox LXC containers are running (Runner + API)
- [ ] GitHub repository has Actions enabled
- [ ] Self-hosted runner is registered and active
- [ ] SSH access exists between Runner LXC and API LXC

## Phase 1: Server Preparation

### 1.1 Create Release and Shared Directories

On the **API LXC**, execute:

```bash
mkdir -p /opt/finanzas-api/releases /opt/finanzas-api/shared
chmod 755 /opt/finanzas-api/releases
chmod 700 /opt/finanzas-api/shared
```

### 1.2 Verify Bun Installation

On the **API LXC**, verify Bun is installed:

```bash
bun --version
# Expected: 1.3.5 or higher
```

If not installed:

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

### 1.3 Verify API Service Status

```bash
systemctl status bun-api.service
```

Expected output should show `active (running)`.

### 1.4 Test Health Endpoint

```bash
curl http://localhost:3000/health
# Expected: {"status":"ok"}
```

## Phase 2: SSH Configuration

### 2.1 Generate SSH Key (Runner LXC)

On the **Runner LXC**, as `github-runner` user:

```bash
su - github-runner
ssh-keygen -t ed25519 -C "github-runner@lxc-runner" -f ~/.ssh/id_ed25519 -N ""
```

### 2.2 Copy Public Key to API LXC

On the **Runner LXC**:

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub root@<API_LXC_IP>
```

Or manually on **API LXC**:

```bash
mkdir -p /root/.ssh
chmod 700 /root/.ssh
echo "ssh-ed25519 AAAA... github-runner@lxc-runner" >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
```

### 2.3 Test SSH Connection

From **Runner LXC**:

```bash
ssh -i ~/.ssh/id_ed25519 root@<API_LXC_IP> "echo 'SSH OK'"
```

### 2.4 Capture Server Fingerprint

```bash
ssh-keyscan -H <API_LXC_IP> >> ~/.ssh/known_hosts
```

### 2.5 Configure sudoers (API LXC)

On the **API LXC**, create sudoers file:

```bash
visudo -f /etc/sudoers.d/github-runner
```

Content:

```
# Allow github-runner to restart bun-api service
root ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart bun-api
root ALL=(ALL) NOPASSWD: /usr/bin/systemctl status bun-api
root ALL=(ALL) NOPASSWD: /usr/bin/systemctl stop bun-api
root ALL=(ALL) NOPASSWD: /usr/bin/systemctl start bun-api
```

> **Note**: If SSH connects as `root`, these permissions apply to root.
> If using a different user, adjust accordingly.

## Phase 3: GitHub Configuration

### 3.1 Create Secrets

Navigate to: `Repository → Settings → Secrets and variables → Actions → New repository secret`

| Secret Name | Value |
|-------------|-------|
| `API_SSH_HOST` | `<API_LXC_IP>` (e.g., `your_server_ip_here`) |
| `API_SSH_USER` | `root` (or dedicated deploy user) |
| `API_SSH_KEY` | Contents of `~/.ssh/id_ed25519` (private key) |
| `API_DEPLOY_PATH` | `/opt/finanzas-api/api` |

### 3.2 Verify Runner Status

Navigate to: `Repository → Settings → Actions → Runners`

Verify the self-hosted runner shows as **Online**.

## Phase 4: Workflow Implementation

### 4.1 Create Workflow Directory

On your local machine (or via GitHub web interface):

```bash
mkdir -p .github/workflows
```

### 4.2 Create Workflow File

Create `.github/workflows/api.yml` with the content from [workflow-reference.yml](./workflow-reference.yml).

### 4.3 Commit and Push

```bash
git add .github/workflows/api.yml
git commit -m "ci: add API CI/CD workflow"
git push origin main
```

## Phase 5: CI Validation

### 5.1 Test Path Filtering

Create a test PR with changes only in `n8n/` or `alexaSkill/`:

```bash
git checkout -b test/path-filter
echo "test" > n8n/test.txt
git add n8n/test.txt
git commit -m "test: path filtering"
git push origin test/path-filter
# Create PR → Workflow should NOT trigger
```

### 5.2 Test Type Checking

Create a PR with intentional TypeScript error:

```bash
git checkout -b test/type-check
# Add intentional error to api/index.ts
git add api/index.ts
git commit -m "test: type checking"
git push origin test/type-check
# Create PR → CI should fail
```

### 5.3 Test CI Success

Create a PR with valid change:

```bash
git checkout -b test/ci-pass
echo "// valid change" >> api/README.md
git add api/README.md
git commit -m "test: CI success"
git push origin test/ci-pass
# Create PR → CI should pass
```

## Phase 6: First Deploy

### 6.1 Merge Test PR

Merge the `test/ci-pass` PR to trigger deploy.

### 6.2 Monitor Workflow

Navigate to: `Repository → Actions → Select workflow run`

Verify all steps complete successfully.

### 6.3 Verify Deployment

On **API LXC**:

```bash
# Check service status
systemctl status bun-api.service

# Check active release and symlink pointer
ls -l /opt/finanzas-api/current
ls -la /opt/finanzas-api/releases/

# Test health endpoint
curl http://localhost:3000/health
```

## Phase 7: Health Check Validation

### 7.1 Test Health Check Success

Deploy should complete with health check passing (default behavior).

### 7.2 Test Health Check Failure

Simulate failure (optional, advanced):

```bash
# On API LXC, temporarily break the service
# This will trigger automatic rollback
```

## Phase 8: Rollback Testing

### 8.1 Simulate Deploy Failure

Modify workflow to fail after backup:

```yaml
# Add this step to test rollback
- name: Simulate Failure
  run: exit 1
```

### 8.2 Verify Rollback

Check that:
- Previous version is restored
- Service is restarted
- Health check passes

## Phase 9: Security Hardening

### 9.1 Rotate SSH Keys

After initial setup, rotate keys:

```bash
# Generate new key
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_new

# Update GitHub secrets with new private key
# Update API LXC authorized_keys with new public key
# Remove old key
```

### 9.2 Restrict sudoers

Review and minimize sudoers permissions:

```bash
# Verify current permissions
visudo -c
cat /etc/sudoers.d/github-runner
```

### 9.3 Audit Logs

Review GitHub Actions logs regularly:

```
Repository → Actions → Select run → View logs
```

## Verification Checklist

After implementation, verify:

- [ ] Workflow triggers on `api/**` changes
- [ ] Workflow does NOT trigger on `n8n/**` or `alexaSkill/**` changes
- [ ] CI runs type checking correctly
- [ ] Deploy only occurs on push to `main`
- [ ] Deploy does NOT occur on pull requests
- [ ] Backup is created before deploy
- [ ] Service restarts after deploy
- [ ] Health check passes after deploy
- [ ] Rollback works on failure
- [ ] SSH connection is secure
- [ ] Secrets are not exposed in logs
