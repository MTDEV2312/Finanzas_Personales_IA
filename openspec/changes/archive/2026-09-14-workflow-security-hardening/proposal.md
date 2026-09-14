# Proposal: Workflow Security Hardening

## Intent
The repository is public, but the continuous integration workflow executes on a self-hosted Proxmox LXC runner for `pull_request` events with unconstrained default permissions. This allows untrusted forks to execute arbitrary code within the internal LAN and Proxmox environment. Decoupling CI validation to GitHub-hosted cloud runners and enforcing least privilege eliminates this vulnerability while safeguarding deployment integrity.

## Scope
### In Scope
- Isolate CI: Migrate `ci` job runner from `self-hosted` to `ubuntu-latest`.
- Enforce least privilege: Set top-level workflow `permissions: contents: read`.
- SSH host authenticity: Add `API_SSH_KNOWN_HOSTS` secret lookup with dynamic fallback to prevent MITM.
- Action pinning: Pin external actions to verified releases/SHAs.
- Documentation: Update security, architecture, and configuration documentation in `docs/cicd/`.

### Out of Scope
- Modifying LXC deployment mechanics or systemd service configurations.
- Altering existing test suites (`health.test.ts`) or build scripts.
- Deploying private GitHub Actions runner groups.

## Capabilities
### New Capabilities
- None

### Modified Capabilities
- `api-ci`: Require public PR code execution and validation on GitHub-hosted cloud runners (`ubuntu-latest`) with least-privilege `GITHUB_TOKEN` permissions (`contents: read`).

## Approach
1. **Runner Decoupling**: Configure `ci` job to run on `ubuntu-latest`. Keep `deploy` restricted to `self-hosted` and gated on verified `push` events to `refs/heads/main`.
2. **Permission Lockdown**: Declare workflow-level `permissions: { contents: read }` to block default token escalations.
3. **SSH Host Hardening**: Inject `API_SSH_KNOWN_HOSTS` if configured; fallback to `ssh-keyscan` with logged warning.
4. **Action Hardening**: Pin action versions (`actions/checkout@v4`, `oven-sh/setup-bun@v2`) consistently.
5. **Docs Synchronization**: Update `docs/cicd/SECURITY.md`, `ARCHITECTURE.md`, and `CONFIGURATION.md` to document the cloud/self-hosted split.

## Affected Areas
| Area | Impact | Description |
|------|--------|-------------|
| `.github/workflows/api.yml` | Modified | Migrate CI runner to `ubuntu-latest`, add `permissions`, harden SSH & actions |
| `docs/cicd/SECURITY.md` | Modified | Document public fork isolation and secret access boundaries |
| `docs/cicd/ARCHITECTURE.md` | Modified | Update architecture diagrams to reflect GitHub-hosted CI runner |
| `docs/cicd/CONFIGURATION.md` | Modified | Document optional `API_SSH_KNOWN_HOSTS` secret |

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Bun setup failure on `ubuntu-latest` | Low | Use established `oven-sh/setup-bun@v2` with pinned Bun version |
| CI egress / rate limit on cloud runner | Low | Standard Bun cache & frozen lockfile reduce fetch overhead |
| Missing `API_SSH_KNOWN_HOSTS` breaks deploy | Low | Include backward-compatible fallback to `ssh-keyscan` |

## Rollback Plan
Revert `.github/workflows/api.yml` and `docs/cicd/*` via git commit revert. Previous workflow configuration remains compatible with existing LXC environments.

## Dependencies
- GitHub Actions standard cloud runner availability (`ubuntu-latest`).
- Optional repository secret `API_SSH_KNOWN_HOSTS`.

## Success Criteria
- [ ] PRs from external forks trigger `ci` strictly on `ubuntu-latest`.
- [ ] Self-hosted runner is never invoked on `pull_request` events.
- [ ] `deploy` job executes exclusively on `self-hosted` for `push` to `main`.
- [ ] Top-level `permissions: contents: read` is active.
- [ ] All CI validation steps (typecheck, tests) pass on cloud runner.
