# Proposal: API Symlink Deployment & Atomic Releases

## Intent
The current in-place rsync deployment mutates running files, incurs slow copy rollbacks, risks disk exhaustion from unpruned backups, and couples `.env` to deploy paths. Migrating to symlink-based atomic releases provides zero file-tearing, instant pointer rollback, persistent shared configuration, and automated retention pruning.

## Scope
### In Scope
- Structure target host: `/opt/finanzas-api/releases/<timestamp>`, `/opt/finanzas-api/shared/`, and `/opt/finanzas-api/current` symlink.
- Atomic cutover using `ln -sfn`.
- Symlink persistent configuration `/opt/finanzas-api/shared/.env` into each release.
- Update `bun-api.service` WorkingDirectory to `/opt/finanzas-api/current`.
- Automated retention cleanup keeping the 5 most recent releases.
- Instant rollback repointing `current` to previous release on healthcheck failure.
- Update GitHub Actions workflow and CI/CD documentation.

### Out of Scope
- Containerization (Docker/Podman).
- CI workflow jobs (lint/typecheck/test).
- Blue/green reverse proxy routing.

## Capabilities
### New Capabilities
- None

### Modified Capabilities
- `api-cd-deployment`: Replaces in-place rsync and `/opt/backups/` snapshots with atomic symlink cutovers, shared `.env` symlinking, instant pointer rollback, and post-deploy automated pruning (retaining last 5 releases).

## Approach
1. **Directory Setup**: Establish `shared/` and `releases/` directories under `/opt/finanzas-api/`. Move `.env` to `shared/.env`.
2. **Workflow Update**: Rsync build artifacts to `releases/<timestamp>`, symlink `shared/.env` to `releases/<timestamp>/.env`, atomically repoint `/opt/finanzas-api/current`, and reload `bun-api.service`.
3. **Rollback Mechanism**: If healthcheck fails, repoint `current` to the previous release and restart the service.
4. **Retention Pruning**: On successful health verification, delete releases beyond the 5 most recent.
5. **Documentation**: Update CI/CD architecture, configuration, operations, and troubleshooting guides.

## Affected Areas
| Area | Impact | Description |
|------|--------|-------------|
| `.github/workflows/api.yml` | Modified | Symlink release cutover, shared env link, instant rollback, retention pruning |
| `docs/cicd/ARCHITECTURE.md` | Modified | Document symlink layout (`current`, `releases`, `shared`) and deployment flow |
| `docs/cicd/CONFIGURATION.md` | Modified | Update path specifications and systemd `WorkingDirectory` settings |
| `docs/cicd/OPERATIONS.md` | Modified | Update manual deployment, rollback, and maintenance procedures |
| `docs/cicd/TROUBLESHOOTING.md` | Modified | Add guidance for symlink issues, cutover failures, and release pruning |

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Broken symlink during switch | Low | Use atomic `ln -sfn` switch |
| Systemd service path mismatch | Medium | Point `WorkingDirectory=/opt/finanzas-api/current` before cutover |
| Premature release pruning | Low | Execute retention cleanup only after HTTP 200 verification |
| Missing shared configuration | Low | Assert `/opt/finanzas-api/shared/.env` exists prior to symlink creation |

## Rollback Plan
If post-deployment health check fails:
1. Identify the previous valid release in `/opt/finanzas-api/releases/`.
2. Repoint `/opt/finanzas-api/current` to previous release using `ln -sfn`.
3. Restart `bun-api.service` and verify health.
4. Purge the failed release directory.

## Dependencies
- Deployment user write access to `/opt/finanzas-api/`.
- `bun-api.service` configured with `WorkingDirectory=/opt/finanzas-api/current`.

## Success Criteria
- [ ] Deployments transfer to `/opt/finanzas-api/releases/<timestamp>`.
- [ ] `/opt/finanzas-api/shared/.env` symlinked into active release.
- [ ] `/opt/finanzas-api/current` atomically points to active release.
- [ ] Failed health checks trigger instant rollback to previous release.
- [ ] Successful deployments retain only the 5 most recent releases.
- [ ] CI/CD documentation updated to reflect symlink architecture.
