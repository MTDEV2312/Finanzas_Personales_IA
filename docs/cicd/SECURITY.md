# Security Considerations

This document covers security aspects of the CI/CD implementation.

## Threat Model

### Assets to Protect

| Asset | Location | Criticality |
|-------|----------|-------------|
| API Source Code | GitHub + API LXC | High |
| API Keys | API LXC (.env) | Critical |
| SSH Private Key | Runner LXC | Critical |
| Production Service | API LXC | High |
| User Data | Google Sheets (external) | High |

### Attack Vectors

| Vector | Risk | Mitigation |
|--------|------|------------|
| Compromised SSH key | High | Key rotation, limited permissions |
| Malicious PR / Fork execution | Critical | CI on ephemeral cloud runner (`ubuntu-latest`), no deploy from PRs, no LAN/secret access |
| SSH Man-in-the-Middle (MITM) | High | Host key pinning via `API_SSH_KNOWN_HOSTS` secret (with warning fallback) |
| Workflow Token Escalation | High | Explicit workflow `permissions: contents: read` (least privilege) |
| Leaked secrets | Critical | GitHub secret masking, no secrets passed to PRs |
| Unauthorized access | High | SSH key-only auth, firewall rules |
| Supply chain attack | Medium | Pinned dependencies, lockfile, pinned action versions |
| Runner compromise | High | Isolated LXC, minimal permissions, CD-only push triggers |

## Security Controls

### 1. Deployment Isolation & Runner Boundary

The architecture enforces a strict physical and cryptographic boundary between untrusted CI execution and trusted production deployment:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             Isolation Boundaries                                 │
│                                                                                  │
│   GITHUB CLOUD INFRASTRUCTURE                 PROXMOX ON-PREMISES LAN            │
│  ┌───────────────────────────────┐           ┌─────────────────┐ ┌────────────┐ │
│  │ Ephemeral Runner              │           │ Runner LXC      │ │ API LXC    │ │
│  │ (ubuntu-latest)               │           │ (self-hosted)   │ │            │ │
│  │                               │           │                 │ │ bun-api    │ │
│  │ - CI Validation Only          │           │ - CD Deploy Only│ │ .env(shared│ │
│  │ - PRs & pushes to main        │           │ - Push to main  │ │ port 3000  │ │
│  │ - Isolated from LAN           │           │   gate ONLY     │ │ internal   │ │
│  │ - Zero deploy secrets         │           │ - SSH to API    │ │            │ │
│  │ - permissions: contents: read │           │                 │ │            │ │
│  └───────────────────────────────┘           └────────┬────────┘ └─────▲──────┘ │
│                                                       │     SSH (22)   │        │
│                                                       └────────────────┘        │
│  Public PRs NEVER execute on self-hosted runners or access the internal network. │
└──────────────────────────────────────────────────────────────────────────────────┘
```

#### Cloud vs Self-Hosted Runner Boundary

- **Public Pull Request Protection**: In a public repository, code submitted in pull requests must be treated as untrusted. The `ci` job executes strictly on GitHub-hosted `ubuntu-latest` runners. Even if malicious code is embedded in tests, dependencies, or PR files, it executes inside an ephemeral GitHub cloud VM with **no connectivity to the internal Proxmox LAN**, no access to internal IP addresses, and no access to deployment secrets.
- **Production Deployment Boundary**: The `deploy` job runs exclusively on the internal `self-hosted` Proxmox LXC runner and is strictly gated to push events on `refs/heads/main` (`if: github.event_name == 'push' && github.ref == 'refs/heads/main'`). Pull requests cannot trigger the deployment job under any circumstances.

### 2. SSH Security

#### Key Management

```bash
# Generate strong key
ssh-keygen -t ed25519 -C "github-runner@lxc-runner" -f ~/.ssh/id_ed25519

# Permissions
chmod 600 ~/.ssh/id_ed25519
chmod 644 ~/.ssh/id_ed25519.pub
chmod 700 ~/.ssh
```

#### Host Key Verification & MITM Protection (`API_SSH_KNOWN_HOSTS`)

To prevent Man-in-the-Middle (MITM) attacks and DNS/IP spoofing during deployment:
- **Pre-configured Secret**: Store the target server's public host key fingerprint in the `API_SSH_KNOWN_HOSTS` repository secret. The deploy workflow writes this directly to `~/.ssh/known_hosts`.
- **Dynamic Fallback**: If the secret is not configured, the workflow falls back to querying the host key via `ssh-keyscan -p "$SSH_PORT" -H "$SSH_HOST"` and issues a GitHub Actions warning annotation (`::warning::API_SSH_KNOWN_HOSTS secret not configured; falling back to dynamic ssh-keyscan`).
- **Strict Host Checking**: The runner's SSH config enforces `StrictHostKeyChecking yes` and `UserKnownHostsFile ~/.ssh/known_hosts`, ensuring connections are rejected if the host key changes unexpectedly.

#### Key Rotation Schedule

| Key Type | Rotation Period | Process |
|----------|-----------------|---------|
| SSH deploy key | 90 days | Generate new, update secrets |
| GitHub PAT | 90 days | Regenerate in GitHub |
| API keys | As needed | Update .env file |

### 3. Secrets Management

#### GitHub Secrets

- Stored encrypted at rest
- Masked in logs
- Not available to forks
- Scoped to repository

#### Avoid

```yaml
# NEVER do this
- run: echo ${{ secrets.API_SSH_KEY }}

# NEVER hardcode
API_KEY=sk-1234567890

# NEVER log secrets
- run: echo "Deploying with key..."
```

### 4. PR Safety & Fork Isolation

```yaml
# CI runs on ephemeral cloud runner (untrusted code isolation)
ci:
  runs-on: ubuntu-latest

# Deploy runs ONLY on self-hosted runner for push to main
deploy:
  needs: ci
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  runs-on: self-hosted
```

**Why**: Pull requests can originate from external forks or untrusted branches. Protection measures include:
- **Cloud Runner Isolation**: All validation (type checking, test execution, dependency resolution) runs on `ubuntu-latest` inside an ephemeral, disposable container in GitHub Cloud. Untrusted PR code has zero network access to the internal Proxmox environment.
- **Automatic Secret Stripping**: GitHub Actions automatically suppresses repository secrets on PRs submitted from fork repositories.
- **Deploy Gating**: The deploy job is hard-gated to push events on `refs/heads/main` and will never execute on PR triggers.

### 5. Principle of Least Privilege

#### Workflow Token Permissions (`GITHUB_TOKEN`)

The workflow explicitly declares top-level permissions constrained to `contents: read`:

```yaml
permissions:
  contents: read
```

- **Read-Only Scope**: The automated `GITHUB_TOKEN` is strictly constrained to read repository contents.
- **Elevation Prevention**: Write permissions on packages, actions, deployments, issues, and pull request metadata are disabled.
- **Supply-Chain Compromise Blast-Radius**: Even if an external npm dependency or malicious script runs during CI, it cannot abuse the token to push malicious commits, create fraudulent releases, or alter repository settings.

#### Runner User

```bash
# Runner should only have:
# - Read access to its workspace
# - SSH access to API LXC
# - No sudo on runner LXC
# - No access to other projects' files
```

#### Sudoers Rules

```bash
# ONLY allow specific commands
root ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart bun-api
root ALL=(ALL) NOPASSWD: /usr/bin/systemctl status bun-api

# NOT this (too broad)
root ALL=(ALL) NOPASSWD: ALL
```

### 6. Network Security

#### Firewall Rules

```bash
# API LXC
ufw default deny incoming
ufw default allow outgoing
ufw allow from <RUNNER_IP> to any port 22
ufw enable
```

#### Port Exposure

```bash
# API should NOT be exposed directly to internet
# Clients connect through n8n or reverse proxy
ufw deny 3000  # Block external access
```

### 7. File System Security

#### Permissions

```bash
# Application directory
chown -R root:root /opt/finanzas-api
chmod -R 755 /opt/finanzas-api

# Environment file (contains secrets)
chmod 600 /opt/finanzas-api/shared/.env
chown root:root /opt/finanzas-api/shared/.env

# Releases directory
chmod 755 /opt/finanzas-api/releases
```

#### Sensitive Files

| File | Risk | Protection |
|------|------|------------|
| `.env` | API keys exposed | chmod 600, gitignore |
| `bun.lock` | Dependency versions | Commit to repo |
| `id_ed25519` | Server access | chmod 600, never commit |
| `authorized_keys` | SSH access | chmod 600, audit regularly |

## Risk Assessment

### High Risk

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| SSH key compromise | Full server access | Low | Rotation, monitoring, strictly constrained sudoers |
| Malicious PR / Fork code | LAN intrusion / Compromise | Low | CI isolated to ephemeral `ubuntu-latest`; deploy restricted to push on main |
| SSH MITM / Spoofing | Deployment interception | Low | Pre-configured `API_SSH_KNOWN_HOSTS` fingerprint; strict host checking |
| API key leak | Provider abuse | Medium | .env protection, no logging, secrets masking |

### Medium Risk

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Runner compromise | LXC access | Low | Separate LXC, minimal perms |
| Rollback failure | Service downtime | Medium | Manual recovery procedure |
| Dependency vulnerability | Code execution | Medium | Pinned versions, audits |

### Low Risk

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| GitHub outage | CI unavailable | Low | Wait, manual deploy |
| Network partition | Deploy fails | Low | Retry logic |

## Audit Checklist

### Weekly

- [ ] Review GitHub Actions logs for anomalies
- [ ] Check API LXC authentication logs
- [ ] Verify backup integrity

### Monthly

- [ ] Review sudoers configuration
- [ ] Audit SSH authorized_keys
- [ ] Check for exposed secrets in logs
- [ ] Review API key usage

### Quarterly

- [ ] Rotate SSH keys
- [ ] Rotate GitHub PAT
- [ ] Audit dependency vulnerabilities
- [ ] Review firewall rules

## Security Hardening

### 1. Disable Password Authentication

```bash
# /etc/ssh/sshd_config
PasswordAuthentication no
ChallengeResponseAuthentication no
UsePAM no
```

### 2. Enable Fail2Ban

```bash
apt install fail2ban
systemctl enable fail2ban
```

### 3. Regular Updates

```bash
# API LXC
apt update && apt upgrade -y

# Runner LXC
apt update && apt upgrade -y
```

### 4. Log Monitoring

```bash
# Watch for unauthorized access attempts
journalctl -u sshd | grep "Failed password"
tail -f /var/log/auth.log | grep "sshd"
```

## Incident Response

### SSH Key Compromised

1. Immediately disable the key on API LXC
2. Generate new key pair
3. Update GitHub secrets
4. Update API LXC authorized_keys
5. Audit logs for unauthorized access
6. Check for file modifications

### API Key Leaked

1. Rotate the compromised key at provider
2. Update .env file on API LXC
3. Restart the service
4. Check provider dashboard for abuse
5. Review logs for unauthorized usage

### Service Compromised

1. Stop the service immediately
2. Take forensic snapshot
3. Restore from known-good backup
4. Rotate all credentials
5. Audit entire system
6. Review CI/CD pipeline for tampering
