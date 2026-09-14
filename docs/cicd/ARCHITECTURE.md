# Architecture — CI/CD Implementation

## System Overview

The CI/CD system connects two isolated LXC containers via SSH, using GitHub Actions as the orchestration layer.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              GitHub                                     │
│  ┌──────────────────┐                                                   │
│  │  Repository       │                                                   │
│  │  Finanzas_Personal│─── Push/PR (api/**) ───┐                        │
│  └──────────────────┘                          │                        │
└─────────────────────────────────────────────────┼────────────────────────┘
                                                  │
                                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    LXC: Runner (Proxmox)                                │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Self-Hosted Runner (github-runner user)                         │  │
│  │                                                                   │  │
│  │  Steps:                                                           │  │
│  │  1. Checkout repository                                          │  │
│  │  2. Setup Bun runtime                                            │  │
│  │  3. Install dependencies (bun install)                           │  │
│  │  4. Type checking (bunx tsc --noEmit)                            │  │
│  │  5. SSH connection to LXC API                                    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              │ SSH (ed25519)                            │
└──────────────────────────────┼──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    LXC: API Server (Proxmox)                            │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  bun-api.service (systemd, root)                                  │  │
│  │                                                                   │  │
│  │  Path: /opt/finanzas-api/api                                      │  │
│  │  Port: 3000                                                       │  │
│  │  Runtime: Bun v1.3.5                                              │  │
│  │                                                                   │  │
│  │  Endpoints:                                                       │  │
│  │  - GET /health → { status: 'ok' }                                │  │
│  │  - POST /chat  → AI processing                                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Backups: /opt/backups/finanzas-api/                              │  │
│  │  Format: finanzas-api-YYYYMMDD_HHMMSS                            │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### GitHub Actions

- **Trigger detection**: Path-based filtering (`api/**`)
- **CI validation**: Type checking, future tests
- **Orchestration**: Coordinate deploy steps
- **Secrets management**: Store SSH credentials

### Self-Hosted Runner

- **Code execution**: Run CI steps locally
- **SSH client**: Connect to API server
- **Deploy agent**: Transfer files, restart services
- **Health monitor**: Verify deployment success

### LXC API Server

- **Service hosting**: Run the Bun API
- **File storage**: Maintain application files
- **Backup storage**: Keep previous versions
- **Network exposure**: Serve API on port 3000

## Data Flow

### Push to Main (Deploy)

```
Developer → git push → GitHub → Actions → Runner → SSH → LXC API
                                                            │
                                              ┌─────────────┼─────────────┐
                                              │             │             │
                                              ▼             ▼             ▼
                                           Backup       Deploy       Restart
                                                            │
                                                            ▼
                                                      Health Check
                                                            │
                                                 ┌──────────┴──────────┐
                                                 │                     │
                                                 ▼                     ▼
                                              Success              Rollback
```

### Pull Request (CI Only)

```
Developer → git push → GitHub → Actions → Runner
                                              │
                                              ▼
                                    Type Checking + Tests
                                              │
                                      ┌───────┴───────┐
                                      │               │
                                      ▼               ▼
                                   Pass            Fail
                                      │               │
                                      ▼               ▼
                                   Allow          Block
                                   Merge           Merge
```

## Network Requirements

| Source | Destination | Port | Protocol | Purpose |
|--------|-------------|------|----------|---------|
| GitHub Actions | GitHub API | 443 | HTTPS | Workflow triggers |
| Runner LXC | GitHub | 443 | HTTPS | Checkout, artifacts |
| Runner LXC | API LXC | 22 | SSH | Deploy, manage |
| API LXC | Internet | 443 | HTTPS | AI provider APIs |
| Clients | API LXC | 3000 | HTTP | API access |

## Storage Layout

### LXC API Server

```
/opt/finanzas-api/
├── api/                    # Current deployment
│   ├── index.ts
│   ├── package.json
│   ├── bun.lock
│   ├── services/
│   └── ...
│
/opt/backups/
└── finanzas-api-*/         # Timestamped backups
    ├── index.ts
    ├── package.json
    └── ...
```

### LXC Runner

```
/home/github-runner/
├── .ssh/
│   ├── id_ed25519          # Private key
│   └── known_hosts         # API server fingerprint
└── _work/                  # GitHub Actions workspace
```

## Service Dependencies

### bun-api.service

```
Network Target
      │
      ▼
bun-api.service
      │
      ├── Depends on: network.target
      ├── User: root
      ├── WorkingDirectory: /opt/finanzas-api/api
      └── ExecStart: /usr/local/bin/bun run index.ts
```

### External Dependencies

| Dependency | Purpose | Failure Impact |
|------------|---------|----------------|
| Groq API | AI processing | Fallback to next provider |
| Cerebras API | AI processing | Fallback to next provider |
| Gemini API | AI processing | Fallback to next provider |
| Mistral API | AI processing | Fallback to next provider |
| OpenRouter API | AI processing | Fallback to next provider |
| Internet | API calls | Complete failure |

## Failure Modes

| Failure | Detection | Response |
|---------|-----------|----------|
| Type check fails | CI job fails | Block merge, no deploy |
| SSH connection fails | Deploy job fails | No changes applied |
| Backup fails | Deploy job fails | Abort, no changes |
| Deploy fails | Deploy job fails | Rollback |
| Health check fails | Deploy job fails | Rollback |
| Service won't start | Health check fails | Rollback |
| Rollback fails | Manual intervention | Alert, manual recovery |

## Security Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                    Trust Boundaries                          │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   GitHub      │    │   Runner     │    │   API LXC    │  │
│  │              │    │              │    │              │  │
│  │  - Secrets   │───▶│  - SSH Key   │───▶│  - Service   │  │
│  │  - Workflows │    │  - Workspace │    │  - Files     │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                              │
│  Isolation: Separate LXCs                                    │
│  Authentication: SSH ed25519                                 │
│  Authorization: sudoers (limited commands)                  │
└─────────────────────────────────────────────────────────────┘
```
