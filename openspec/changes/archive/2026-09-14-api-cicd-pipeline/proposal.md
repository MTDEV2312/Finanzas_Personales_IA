# Proposal: API CI/CD Pipeline

## Intent
Manual deployments of the Finanzas Personales IA API risk downtime, lack automated validation (typechecking/testing), and have no automated rollback mechanism. Establishing an automated CI/CD pipeline ensures reliable, verified deployments from GitHub to the Proxmox LXC API server using a self-hosted runner.

## Scope
### In Scope
- Add CI scripts (`typecheck`, `test`) to `api/package.json` and create `api/.env.example`.
- Add Bun unit test for `GET /health`.
- GitHub Actions workflow (`.github/workflows/api.yml`) for CI (PRs/push) and deployment (push to `main` when `api/**` changes).
- Proxmox infrastructure configuration (LXC runner SSH keys, secrets, `bun-api.service` systemd unit, sudoers permissions).
- Zero-downtime deployment with pre-deploy backups, rsync transfer, post-deploy healthcheck, and automated rollback on failure.

### Out of Scope
- CI/CD for `alexaSkill` or `n8n` workflows.
- Multi-environment staging/production matrix (single target LXC initially).
- Containerization of the API runtime into Docker/Podman.

## Capabilities
### New Capabilities
- `api-ci`: Automated type checking and unit test verification on pull requests and commits to `main`.
- `api-cd-deployment`: Automated SSH/rsync delivery, service reload (`systemctl reload-or-restart bun-api.service`), healthcheck polling, and automatic rollback to timestamped backups upon failure.

### Modified Capabilities
- None

## Approach
Follow a phased rollout based on `docs/cicd/`:
1. **Phase 1 (Repo Prep & CI)**: Configure `api/package.json` scripts (`typecheck`, `test`), create `api/.env.example`, write `api/tests/health.test.ts`, track `docs/cicd/`, and create `.github/workflows/api.yml` with CI job.
2. **Phase 2 (Infra & Runner Setup)**: Configure self-hosted GitHub runner on Proxmox LXC, establish ed25519 SSH keys to API LXC, set up `bun-api.service` systemd unit and sudoers, and configure GitHub repository secrets/vars.
3. **Phase 3 (CD & Automated Rollback)**: Enable deployment job in `.github/workflows/api.yml` to trigger on push to `main` with timestamped `/opt/backups/finanzas-api/` creation, rsync, healthcheck retry loop, and rollback trigger if healthcheck fails.

## Affected Areas
| Area | Impact | Description |
|------|--------|-------------|
| `api/package.json` | Modified | Add `typecheck` and `test` scripts |
| `api/.env.example` | New | Environment template documenting required API secrets |
| `api/tests/health.test.ts` | New | Health endpoint verification test |
| `.github/workflows/api.yml` | New | GitHub Actions workflow for CI validation & CD deployment |
| `docs/cicd/` | Tracked | Version control documentation and reference configs |

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| SSH or runner connectivity failure | Medium | Pre-validate SSH keys, strict permissions (600/700), non-interactive sudoers |
| Deployment fails health check | Medium | Automated rollback restores previous timestamped backup and restarts service |
| Missing environment variables in prod | Low | Maintain `api/.env.example` and keep `/opt/finanzas-api/api/.env` preserved during rsync |

## Rollback Plan
If deployment fails post-transfer health checks:
1. Stop `bun-api.service`.
2. Restore previous code from `/opt/backups/finanzas-api/finanzas-api-<TIMESTAMP>`.
3. Restart `bun-api.service` and re-verify `GET /health`.
4. Workflow aborts with failure notification.

## Dependencies
- Proxmox LXC runner with GitHub Actions Runner registered.
- Bun runtime (>= v1.3.5) on both runner and API LXCs.
- GitHub repository secrets: `SSH_PRIVATE_KEY`, `SSH_HOST`, `SSH_USER`, `SSH_PORT`.

## Success Criteria
- [ ] `bun run typecheck` and `bun test` pass locally and in CI.
- [ ] Push to `main` affecting `api/**` triggers automatic deployment to API LXC.
- [ ] Deployment automatically rolls back to backup if `GET /health` fails.
- [ ] API service remains healthy and responsive post-deployment.
