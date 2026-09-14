# CI/CD Documentation — Finanzas Personales IA

## Overview

This documentation covers the complete CI/CD implementation for the **Finanzas Personales IA** project using GitHub Actions with a self-hosted runner.

## Project Context

| Component | Technology | Location |
|-----------|------------|----------|
| API Runtime | Bun v1.3.5 | LXC (Proxmox) |
| Language | TypeScript (strict) | `api/` directory |
| Runner | GitHub Actions (self-hosted) | Separate LXC |
| Service | `bun-api.service` (systemd) | LXC API Server |
| Deploy Path | `/opt/finanzas-api/api` | LXC API Server |

## Documentation Structure

| Document | Purpose |
|----------|---------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture and component relationships |
| [IMPLEMENTATION.md](./IMPLEMENTATION.md) | Step-by-step implementation guide |
| [CONFIGURATION.md](./CONFIGURATION.md) | All configuration reference (GitHub, Server, systemd) |
| [SECURITY.md](./SECURITY.md) | Security considerations and risk mitigation |
| [OPERATIONS.md](./OPERATIONS.md) | Day-to-day operations and maintenance |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Common issues and solutions |
| [workflow-reference.yml](./workflow-reference.yml) | Reference workflow file for implementation |

## Quick Reference

### Triggers

- **Push to `main` with `api/**` changes**: CI + Deploy
- **PR to `main` with `api/**` changes**: CI only (no deploy)
- **Changes in `n8n/` or `alexaSkill/`**: No execution

### Pipeline Steps

```
Push to main (api/**)
    │
    ├── CI Job
    │   ├── Checkout
    │   ├── Setup Bun
    │   ├── bun install --frozen-lockfile
    │   └── bunx tsc --noEmit
    │
    └── Deploy Job (after CI passes)
        ├── SSH to LXC API
        ├── Backup current version
        ├── rsync new files
        ├── systemctl restart bun-api
        ├── Health check (curl /health)
        └── Rollback if failed
```

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `API_SSH_HOST` | LXC API server IP |
| `API_SSH_USER` | SSH username |
| `API_SSH_KEY` | SSH private key (ed25519) |
| `API_DEPLOY_PATH` | `/opt/finanzas-api/api` |

## Implementation Status

- [ ] Phase 1: Server preparation
- [ ] Phase 2: SSH configuration
- [ ] Phase 3: GitHub secrets
- [ ] Phase 4: Workflow implementation
- [ ] Phase 5: CI validation
- [ ] Phase 6: First deploy
- [ ] Phase 7: Health checks
- [ ] Phase 8: Rollback testing
- [ ] Phase 9: Security hardening
