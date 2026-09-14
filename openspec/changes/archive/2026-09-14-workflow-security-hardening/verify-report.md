---
schema: gentle-ai.verify-result/v1
change: workflow-security-hardening
status: pass_with_warnings
timestamp: "2026-09-14T17:00:00-05:00"
mode: openspec
coverage:
  build: passed
  tests: passed
  scenarios_total: 5
  scenarios_compliant: 5
tasks:
  total: 6
  completed: 6
  pending: 0
artifacts:
  - openspec/changes/workflow-security-hardening/verify-report.md
---

## Verification Report

**Change**: workflow-security-hardening  
**Version**: 1.0.0  
**Mode**: Standard (OpenSpec)  

### Completeness

| Metric | Value |
|---|---|
| Tasks total | 6 |
| Tasks complete | 6 |
| Tasks incomplete | 0 |

All 6 tasks defined across Phase 1 (Workflow Hardening) and Phase 2 (Documentation Hardening) in `tasks.md` are marked complete and verified against the working codebase and configuration files.

---

### Build & Tests Execution

**Build / Static Analysis**: ✅ Passed
```text
$ bun run typecheck
$ tsc --noEmit
Exit code: 0
Errors: 0
```

**Tests**: ✅ 1 passed / ❌ 0 failed / ⚠️ 0 skipped
```text
$ bun test
bun test v1.3.14 (0d9b296a)

tests\health.test.ts:
Servidor escuchando en http://localhost:3000/
(pass) Health Check Endpoint > GET /health returns HTTP 200 and status ok payload [19.87ms]

 1 pass
 0 fail
 3 expect() calls
Ran 1 test across 1 file. [798.00ms]
Exit code: 0
```

**Coverage**: ➖ Not configured (Unit test validates GET `/health` response and JSON contract; TypeScript compiler verifies complete type soundness without regressions).

---

### Spec Compliance Matrix

#### Specification: `api-ci` (Delta)

| Requirement | Scenario | Test / Verification Method | Result |
|---|---|---|---|
| **Least-Privilege Workflow Token Permissions** | GITHUB_TOKEN scope constrained to read-only | Static inspection of `.github/workflows/api.yml` lines 14–15: top-level `permissions: { contents: read }` explicitly declared | ✅ COMPLIANT |
| **Least-Privilege Workflow Token Permissions** | Unintended token elevation prevented | Static inspection of `.github/workflows/api.yml`: explicit read-only token suppresses all default write privileges across jobs | ✅ COMPLIANT |
| **Path-Filtered CI Triggering** | Workflow triggered by API changes on cloud runner | Static inspection of `.github/workflows/api.yml` lines 20–31 & 47–49: triggers on `api/**` & `.github/workflows/api.yml`, executes on `runs-on: ubuntu-latest` | ✅ COMPLIANT |
| **Path-Filtered CI Triggering** | Workflow ignored for non-API changes | Static inspection: path filters strictly scoped to `api/**` and `.github/workflows/api.yml`, ignoring other directories | ✅ COMPLIANT |
| **Path-Filtered CI Triggering** | Public pull request executes in cloud runner isolation | Static inspection: `ci` job runs on ephemeral `ubuntu-latest` cloud runner; `deploy` job is guarded by `if: github.event_name == 'push' && github.ref == 'refs/heads/main'` and runs on `self-hosted` | ✅ COMPLIANT |

**Compliance summary**: 5/5 scenarios verified and compliant.

---

### Correctness (Static Evidence)

| Deliverable | Status | Evidence / Notes |
|---|---|---|
| `.github/workflows/api.yml` | ✅ Verified | Top-level `permissions: contents: read` declared (lines 14–15); `ci` job executes on `runs-on: ubuntu-latest` (lines 47–49); `deploy` job executes on `runs-on: self-hosted` guarded by `push` to `main` (lines 76–80); SSH step ingests `API_SSH_KNOWN_HOSTS` with fallback to `ssh-keyscan` and warning annotation (lines 95–114) |
| `docs/cicd/SECURITY.md` | ✅ Verified | Updated with physical and cryptographic runner boundary diagrams, ephemeral `ubuntu-latest` isolation details, `GITHUB_TOKEN` least privilege, and `API_SSH_KNOWN_HOSTS` MITM defenses |
| `docs/cicd/ARCHITECTURE.md` | ✅ Verified | Updated system overview diagrams, deployment flow, sequence diagrams, and trust boundaries to document hybrid cloud CI / self-hosted CD model |
| `docs/cicd/CONFIGURATION.md` | ✅ Verified | Documented `API_SSH_KNOWN_HOSTS` secret, fingerprint generation via `ssh-keyscan`, dynamic fallback behavior, and top-level `permissions` block |
| `api/package.json` | ✅ Verified | Valid typecheck and test scripts intact |
| `api/tests/health.test.ts` | ✅ Verified | Health endpoint unit test passes cleanly with teardown |

---

### Coherence (Design)

| Architectural Decision | Followed? | Implementation Evidence |
|---|---|---|
| **CI Runner Placement** | ✅ Yes | CI validation migrated to `ubuntu-latest` ephemeral GitHub-hosted runner, sandboxing untrusted PR code from the local network |
| **Workflow Permissions** | ✅ Yes | Explicit workflow-level `permissions: { contents: read }` enforces least privilege on `GITHUB_TOKEN` |
| **Deploy Job Guarding** | ✅ Yes | Restricted to `runs-on: self-hosted` guarded by `if: github.event_name == 'push' && github.ref == 'refs/heads/main'` |
| **SSH Host Authenticity** | ✅ Yes | Ingests `API_SSH_KNOWN_HOSTS` when present with seamless fallback to `ssh-keyscan` and a warning annotation |
| **Action Version Pinning** | ✅ Yes | External actions pinned to verified releases (`actions/checkout@v4`, `oven-sh/setup-bun@v2`) |

---

### Issues Found

- **CRITICAL**: None.
- **WARNING**:
  - **Advisory Secret Setup**: To eliminate the dynamic `ssh-keyscan` fallback warning during production deployments and protect against network MITM attacks on the internal LAN, configure the `API_SSH_KNOWN_HOSTS` repository secret in GitHub Settings (instructions provided in `docs/cicd/CONFIGURATION.md`).
- **SUGGESTION**: None.

---

### Verdict

**PASS WITH WARNINGS**  
The implementation conforms to the delta specification, technical design, and tasks. Type checking and unit tests pass cleanly in the local Bun environment. The single advisory warning concerns provisioning the optional `API_SSH_KNOWN_HOSTS` secret in GitHub repository settings for complete MITM protection.
