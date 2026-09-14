# Tasks: Workflow Security Hardening

## Review Workload Forecast

Estimated lines: ~80 changed lines of code.
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

## Work Units

| Unit | Scope | Test Command | Runtime Harness | Rollback Boundary |
|---|---|---|---|---|
| **U1: Workflow Hardening** | `.github/workflows/api.yml` | Workflow schema validation & push trigger | GitHub Actions (`ubuntu-latest` / self-hosted) | Revert `.github/workflows/api.yml` |
| **U2: Documentation Hardening** | `docs/cicd/*.md` | Markdown link and schema audit | Local filesystem | Revert `docs/cicd/` changes |

## Concrete Tasks

### Phase 1: Workflow Hardening
- [x] **1.1 Add top-level permissions declaration**: In `.github/workflows/api.yml`, declare top-level `permissions: { contents: read }` to enforce least privilege on the automated `GITHUB_TOKEN`.
- [x] **1.2 Decouple CI runner to cloud**: Update `ci` validation job in `.github/workflows/api.yml` to use `runs-on: ubuntu-latest`, isolating untrusted PR code execution and tests from the local network.
- [x] **1.3 Harden SSH host authenticity verification**:
  - In `deploy` job in `.github/workflows/api.yml`, update the SSH setup step to ingest the `API_SSH_KNOWN_HOSTS` secret when available.
  - Retain dynamic fallback to `ssh-keyscan -p "$SSH_PORT" -H "$SSH_HOST"` with a warning annotation when the secret is unset.

### Phase 2: Documentation Hardening
- [x] **2.1 Update security documentation (`docs/cicd/SECURITY.md`)**:
  - Document the hybrid execution model (GitHub-hosted cloud runner for CI vs self-hosted Proxmox runner for CD).
  - Document token least-privilege scoping (`contents: read`) preventing unauthorized write or repo alteration from fork PRs.
- [x] **2.2 Update architecture documentation (`docs/cicd/ARCHITECTURE.md`)**:
  - Update system overview diagrams and deployment sequence diagrams to reflect `ubuntu-latest` for CI validation and `self-hosted` runner for production deployments.
  - Clarify runner network boundaries and isolation properties.
- [x] **2.3 Update configuration reference (`docs/cicd/CONFIGURATION.md`)**:
  - Document the optional `API_SSH_KNOWN_HOSTS` secret, including instructions for fingerprint generation via `ssh-keyscan`.
  - Document the top-level permissions block in the workflow reference section.
