# Technical Design: Workflow Security Hardening

## Technical Approach
This hardening decouples continuous integration (CI) validation from the internal self-hosted environment and enforces the principle of least privilege across the API deployment lifecycle. Untrusted code submitted via pull requests from forks will execute exclusively on ephemeral, GitHub-hosted cloud runners (`ubuntu-latest`), isolating the internal LAN and Proxmox infrastructure. The workflow token is restricted to read-only repository contents. The `deploy` job remains pinned to the `self-hosted` Proxmox runner, gated on verified `push` events to `main`, and enhanced with pre-configured SSH host authenticity verification.

## Architecture Decisions

| Option | Tradeoff | Decision |
|---|---|---|
| **CI Runner**: `ubuntu-latest` vs `self-hosted` | `ubuntu-latest` consumes GitHub Actions cloud minutes; `self-hosted` risks exposing internal LAN/Proxmox host to malicious PR payloads. | Migrate `ci` job to `ubuntu-latest` to establish complete sandbox isolation for untrusted PR code. |
| **Workflow Permissions**: Top-level `contents: read` vs unconstrained default | Restricting permissions limits token capabilities; leaving unconstrained risks write-level repo takeover if actions or tests are compromised. | Declare workflow-level `permissions: { contents: read }` to enforce least privilege. |
| **SSH Host Authenticity**: Dedicated secret vs dynamic `ssh-keyscan` | Requiring `API_SSH_KNOWN_HOSTS` eliminates MITM risk; dynamic fallback ensures zero downtime if the secret is not yet configured. | Dual-mode: Prefer `API_SSH_KNOWN_HOSTS` secret; fallback to `ssh-keyscan` with a warning log. |
| **Action Pinning**: Pinned major tags vs commit SHAs | Commit SHAs guarantee byte immutability but increase update maintenance; official major tags balance security updates with stability. | Pin trusted actions to official major versions (`actions/checkout@v4`, `oven-sh/setup-bun@v2`). |

## Trust Boundaries & Pipeline Flow

```mermaid
flowchart TD
    subgraph UntrustedZone["Untrusted Boundary"]
        PR["Pull Request (Public Fork / Branch)"]
    end

    subgraph GitHubCloud["GitHub Cloud Infrastructure"]
        GH["GitHub Actions Orchestrator<br/>(permissions: contents: read)"]
        CloudRunner["Ephemeral Runner (ubuntu-latest)<br/>• Checkout (v4)<br/>• Setup Bun (v2)<br/>• bun run typecheck<br/>• bun test<br/>• NO LAN access / NO deploy secrets"]
    end

    subgraph InternalLAN["Private Proxmox Infrastructure"]
        subgraph RunnerLXC["Runner LXC (self-hosted)"]
            DeployJob["Deploy Job (Push to main ONLY)<br/>• Ingest API_SSH_KEY & Known Hosts<br/>• Rsync to /opt/finanzas-api/releases/<br/>• Atomic cutover via ln -sfn"]
        end
        subgraph ApiLXC["API LXC (Production Target)"]
            Service["bun-api.service<br/>/opt/finanzas-api/current"]
        end
    end

    PR -->|Trigger: pull_request| GH
    GH -->|Dispatch CI validation| CloudRunner
    CloudRunner -->|Status: Pass / Fail| GH

    GH -.->|Deploy gated: push to main ONLY| DeployJob
    DeployJob -->|SSH (ed25519) + Host Verification| ApiLXC
    ApiLXC --> Service
```

## File Changes

| File | Change Type | Description |
|---|---|---|
| `.github/workflows/api.yml` | Modified | Add top-level `permissions: contents: read`, set `ci` runner to `ubuntu-latest`, inject `API_SSH_KNOWN_HOSTS` with fallback. |
| `docs/cicd/SECURITY.md` | Modified | Document cloud/self-hosted runner boundary, token least privilege, and SSH host key verification. |
| `docs/cicd/ARCHITECTURE.md` | Modified | Update architecture and sequence diagrams to reflect hybrid GitHub-hosted CI and self-hosted CD. |
| `docs/cicd/CONFIGURATION.md` | Modified | Document `API_SSH_KNOWN_HOSTS` secret setup, known host fingerprint extraction, and permission defaults. |

## Interfaces & Contracts

### Top-Level Workflow Permissions
```yaml
permissions:
  contents: read
```

### Runner Placement Contract
```yaml
jobs:
  ci:
    name: CI — Validation
    runs-on: ubuntu-latest
  deploy:
    name: Deploy to Production
    needs: ci
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: self-hosted
```

### SSH Host Verification Contract
```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
if [ -n "$SSH_KNOWN_HOSTS" ]; then
  echo "$SSH_KNOWN_HOSTS" > ~/.ssh/known_hosts
  echo "✅ Ingested API_SSH_KNOWN_HOSTS secret"
else
  echo "::warning::API_SSH_KNOWN_HOSTS secret not configured; falling back to ssh-keyscan"
  ssh-keyscan -p "$SSH_PORT" -H "$SSH_HOST" >> ~/.ssh/known_hosts 2>/dev/null
fi
chmod 644 ~/.ssh/known_hosts
```

## Testing Strategy
- **Workflow Schema Validation**: Validate `.github/workflows/api.yml` syntax and permission scopes against GitHub Actions schema.
- **Cloud Runner Execution**: Trigger CI via PR to verify clean Bun v1.3.5 environment setup, dependency resolution, type checking, and unit testing on `ubuntu-latest`.
- **Secret & Boundary Isolation**: Verify fork PR execution cannot access repository secrets or dispatch self-hosted jobs.
- **SSH Verification Dual-Mode**: Validate deployment success both with `API_SSH_KNOWN_HOSTS` configured and using the fallback mechanism.

## Threat Matrix

| Threat | Severity | Impact | Mitigation |
|---|---|---|---|
| **PR Code Injection** | Critical | Arbitrary code execution in internal network | Run PR CI exclusively on isolated `ubuntu-latest` runners. No internal LAN reachability. |
| **Token Escalation** | High | Unauthorized repository mutations or releases | Explicit top-level `permissions: contents: read` restricts automated `GITHUB_TOKEN`. |
| **SSH MITM** | High | Interception or alteration of deploy commands | Strict host checking with `API_SSH_KNOWN_HOSTS` pre-shared fingerprint. |
| **Action Tampering** | Medium | Supply chain injection via third-party actions | Use verified actions (`actions/checkout@v4`, `oven-sh/setup-bun@v2`) with immutable release tags. |

## Migration / Rollout
1. **Optional Pre-configuration**: Generate the API LXC SSH host key fingerprint (`ssh-keyscan -p 22 -H <API_IP>`) and store it as `API_SSH_KNOWN_HOSTS` in GitHub Secrets.
2. **Apply Workflow & Docs**: Merge the hardened `.github/workflows/api.yml` and updated documentation into `main`.
3. **Verification**: Confirm subsequent CI runs execute on `ubuntu-latest` and production deployments proceed smoothly on `self-hosted` without server downtime.

## Open Questions
- None.
