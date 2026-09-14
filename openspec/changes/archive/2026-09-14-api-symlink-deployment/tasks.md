# Tasks: API Symlink Deployment & Atomic Releases

## Review Workload Forecast

Estimated lines: ~120 changed lines of code.
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

## Work Units

| Unit | Scope | Test Command | Runtime Harness | Rollback Boundary |
|---|---|---|---|---|
| **U1: Workflow Implementation** | `.github/workflows/api.yml` | `actionlint` / YAML validation | Self-hosted runner | Revert workflow commit |
| **U2: Documentation Updates** | `docs/cicd/*.md` | Markdown linter / link check | Local repo docs | Discard doc file edits |
| **U3: Server Migration Runbook** | `docs/cicd/OPERATIONS.md`, Runbook doc | Step validation via dry-run | Proxmox LXC target | Restore original `/opt/finanzas-api/api` path |

## Concrete Tasks

### Phase 1: Workflow Implementation
- [x] **1.1 Configure release directory and artifact rsync**: Update `.github/workflows/api.yml` to generate timestamped directory `/opt/finanzas-api/releases/<timestamp>` and rsync production build artifacts to target directory.
- [x] **1.2 Assert and link shared environment**: Validate presence of canonical `/opt/finanzas-api/shared/.env` before linking; symlink it to `${RELEASE_DIR}/.env` using `ln -sfn`.
- [x] **1.3 Execute atomic symlink cutover & service restart**: Atomically repoint `/opt/finanzas-api/current` to the new release using `ln -sfn "${RELEASE_DIR}" /opt/finanzas-api/current` and reload/restart `bun-api.service`.
- [x] **1.4 Implement instant pointer rollback**: On healthcheck failure, identify previous release via `ls -dt`, repoint `/opt/finanzas-api/current`, restart `bun-api.service`, remove failed release, and exit 1.
- [x] **1.5 Implement post-healthcheck retention pruning**: On healthcheck success, prune releases retaining only the 5 most recent directories via `ls -dt /opt/finanzas-api/releases/* | tail -n +6 | xargs -r rm -rf`.

### Phase 2: Documentation Updates
- [x] **2.1 Update ARCHITECTURE.md**: Document directory layout (`releases/`, `shared/`, `current`), atomic cutover flow, and deployment sequence diagram.
- [x] **2.2 Update CONFIGURATION.md**: Document `bun-api.service` (`WorkingDirectory=/opt/finanzas-api/current`, `EnvironmentFile=/opt/finanzas-api/current/.env`), permissions (`chmod 600`), and path structures.
- [x] **2.3 Update OPERATIONS.md**: Document manual deployment steps, instant pointer rollback commands, and release pruning procedures.
- [x] **2.4 Update TROUBLESHOOTING.md**: Add diagnostics and remediation for broken symlinks, failed cutovers, missing shared env, and release cleanup errors.

### Phase 3: Server Migration Runbook
- [x] **3.1 Document Step 1 (Hierarchy Setup)**: Record directory creation command: `mkdir -p /opt/finanzas-api/releases /opt/finanzas-api/shared`.
- [x] **3.2 Document Step 2 (Config Migration)**: Record environment isolation commands: `mv /opt/finanzas-api/api/.env /opt/finanzas-api/shared/.env && chmod 600 /opt/finanzas-api/shared/.env`.
- [x] **3.3 Document Step 3 (Initial Baseline & Symlink)**: Record baseline release establishment: `mv /opt/finanzas-api/api /opt/finanzas-api/releases/initial && ln -sfn /opt/finanzas-api/releases/initial /opt/finanzas-api/current && ln -sfn /opt/finanzas-api/shared/.env /opt/finanzas-api/current/.env`.
- [x] **3.4 Document Step 4 (Systemd Cutover)**: Record systemd update and restart: `sed -i 's|WorkingDirectory=.*|WorkingDirectory=/opt/finanzas-api/current|' /etc/systemd/system/bun-api.service && systemctl daemon-reload && systemctl restart bun-api.service`.
