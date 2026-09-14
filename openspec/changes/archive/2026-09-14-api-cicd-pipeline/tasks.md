# Tasks: API CI/CD Pipeline

## Review Workload Forecast

Estimated lines: ~160 changed lines of code.
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

## Work Units

| Unit | Scope | Test Command | Runtime Harness | Rollback Boundary |
|---|---|---|---|---|
| **U1: Repo Foundation** | `package.json`, `.env.example`, `docs/cicd/` | `bun run typecheck` | Local Bun runtime | Discard working tree changes |
| **U2: Testing Infra** | `api/tests/health.test.ts` | `bun test` | Local Bun test runner | Remove test file |
| **U3: CI/CD Workflow** | `.github/workflows/api.yml` | `bun test` & GitHub Actions | Self-hosted runner | Revert workflow commit |
| **U4: Target Pairing** | SSH keys, sudoers, secrets | `ssh -T <host>`, `systemctl status` | Proxmox LXC target | Remove keys / sudoers file |

## Concrete Tasks

### Phase 1: Repo Foundation
- [x] **1.1 Add npm scripts in `api/package.json`**: Add `"typecheck": "tsc --noEmit"` and `"test": "bun test"`.
- [x] **1.2 Create `api/.env.example`**: Document runtime keys (`PORT`, `AI_PROVIDER`, API keys for Cerebras, Google GenAI, Mistral, OpenRouter, Groq, OpenAI).
- [x] **1.3 Track CI/CD documentation**: Ensure reference guides and configurations in `docs/cicd/` are tracked in version control.

### Phase 2: Testing Infrastructure
- [x] **2.1 Implement health endpoint unit test**: Create `api/tests/health.test.ts` verifying `GET /health` returns HTTP status 200 and payload `{"status":"ok"}`.
- [x] **2.2 Local verification**: Run `bun run typecheck` and `bun test` in `api/` to verify zero type errors and passing test suite.

### Phase 3: GitHub Actions Workflow
- [x] **3.1 Create workflow with CI validation**: Author `.github/workflows/api.yml` triggered on push/PR targeting `main` path-filtered to `api/**` and `.github/workflows/api.yml`. Include dependency installation, typecheck, and unit testing.
- [x] **3.2 Implement CD deployment job**:
  - Trigger deployment on push to `main` upon successful CI.
  - Create pre-deploy backup under `/opt/backups/finanzas-api/finanzas-api-<TIMESTAMP>`.
  - Synchronize files to `/opt/finanzas-api/api/` via `rsync`, excluding `.git` and preserving remote `.env`.
  - Restart service via `sudo systemctl reload-or-restart bun-api.service`.
- [x] **3.3 Implement health verification & automated rollback**:
  - Poll `GET http://localhost:3000/health` up to 3 retries (5s timeout).
  - Add automated rollback step restoring latest backup and restarting `bun-api.service` if healthcheck fails.

### Phase 4: Proxmox Runner & Secret Pairing
- [ ] **4.1 Verify runner environment**: Confirm GitHub Actions self-hosted runner and Bun runtime (>= v1.3.5) are active on Proxmox LXC.
- [ ] **4.2 Configure SSH key pairing**: Generate dedicated `ed25519` key pair between runner and API LXC; enforce strict permissions (`chmod 600/700`).
- [ ] **4.3 Configure target sudoers**: Add `/etc/sudoers.d/github-runner` allowing non-interactive restart of `bun-api.service`.
- [ ] **4.4 Configure GitHub repository secrets**: Populate `SSH_PRIVATE_KEY`, `SSH_HOST`, `SSH_USER`, and `SSH_PORT` in repository settings.
