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
| Malicious PR | High | No deploy from PRs |
| Leaked secrets | Critical | GitHub secret masking |
| Unauthorized access | High | SSH only, firewall rules |
| Supply chain attack | Medium | Pinned dependencies, lockfile |
| Runner compromise | High | Separate LXC, minimal permissions |

## Security Controls

### 1. Deployment Isolation

```
┌─────────────────────────────────────────────────────────────┐
│                    Isolation Boundaries                       │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   GitHub      │    │   Runner     │    │   API LXC    │  │
│  │              │    │              │    │              │  │
│  │  Cloud       │    │  On-prem     │    │  On-prem     │  │
│  │  Managed     │    │  Self-hosted │    │  Self-hosted │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                              │
│  Each boundary requires authentication                      │
└─────────────────────────────────────────────────────────────┘
```

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

### 4. PR Safety

```yaml
# Deploy ONLY on push to main
deploy:
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

**Why**: PRs can come from:
- External contributors (untrusted)
- Fork repositories (untrusted)
- Compromised branches

### 5. Principle of Least Privilege

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
| SSH key compromise | Full server access | Low | Rotation, monitoring |
| Malicious deploy | Service compromise | Low | PR-only CI, no deploy |
| API key leak | Provider abuse | Medium | .env protection, no logging |

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
