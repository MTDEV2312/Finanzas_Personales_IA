# Specification Delta: api-cd-deployment

## Purpose
Defines changes to continuous deployment for the Proxmox LXC server, replacing in-place synchronization and backup copies with atomic symlink releases, shared environment symlinking, instant pointer rollback, and retention pruning.

## ADDED Requirements

### Requirement: Automated Release Retention Pruning
Following successful health verification, the deployment pipeline MUST prune obsolete releases in `/opt/finanzas-api/releases/`, retaining only the 5 most recent timestamped releases and purging older directories using `xargs -r rm -rf`.

#### Scenario: Post-deployment pruning of excess releases
- **Given** successful post-deployment health verification and more than 5 timestamped directories in `/opt/finanzas-api/releases/`
- **When** the retention cleanup step runs
- **Then** the 5 newest release directories MUST be preserved and older directories MUST be deleted via `xargs -r rm -rf`.

#### Scenario: Fewer than 5 releases present
- **Given** successful health verification and 5 or fewer directories in `/opt/finanzas-api/releases/`
- **When** the retention cleanup step executes
- **Then** no release directories SHALL be deleted.

## MODIFIED Requirements

### Requirement: Rsync Synchronization and Secret Preservation
The deployment pipeline MUST synchronize build artifacts to a newly created, immutable timestamped directory `/opt/finanzas-api/releases/<timestamp>/` using `rsync`, and SHALL create a symbolic link from canonical `/opt/finanzas-api/shared/.env` to `/opt/finanzas-api/releases/<timestamp>/.env`.

*(Previously: Synchronized code in-place to `/opt/finanzas-api/api/` excluding `.env`)*

#### Scenario: Isolated release synchronization and secret symlink
- **Given** verified build artifacts on the runner and canonical `/opt/finanzas-api/shared/.env` on the target host
- **When** the rsync step deploys to `/opt/finanzas-api/releases/<timestamp>/`
- **Then** application artifacts MUST be copied to the isolated release directory, and `/opt/finanzas-api/releases/<timestamp>/.env` MUST be symlinked to `/opt/finanzas-api/shared/.env`.

#### Scenario: Missing shared environment configuration
- **Given** canonical file `/opt/finanzas-api/shared/.env` is absent on the target server
- **When** the environment preparation step runs
- **Then** the deployment pipeline MUST abort before service restart and log an error.

### Requirement: Service Reload and Healthcheck Verification
The deployment pipeline MUST atomically repoint `/opt/finanzas-api/current` to `/opt/finanzas-api/releases/<timestamp>/` using `ln -sfn`, restart `bun-api.service`, and poll `GET http://localhost:3000/health`.

*(Previously: Reloaded service directly on `/opt/finanzas-api/api`)*

#### Scenario: Atomic cutover and successful health verification
- **Given** an isolated release directory with linked `.env` and `bun-api.service` configured with `WorkingDirectory=/opt/finanzas-api/current`
- **When** `ln -sfn /opt/finanzas-api/releases/<timestamp> /opt/finanzas-api/current` executes and `bun-api.service` restarts
- **Then** polling `GET http://localhost:3000/health` MUST return HTTP 200 within 3 retry attempts (5s timeout each), marking the deployment successful.

#### Scenario: Healthcheck failure initiates rollback
- **Given** the new release fails to return HTTP 200 after 3 attempts
- **When** the healthcheck polling times out
- **Then** the verification step MUST fail and trigger automated rollback.

### Requirement: Automated Rollback on Verification Failure
Upon health verification failure, the pipeline MUST immediately repoint `/opt/finanzas-api/current` to the previous valid release using `ln -sfn`, restart `bun-api.service`, delete the failed release directory, and exit with status 1.

*(Previously: Rsynced files from `/opt/backups/` back to `/opt/finanzas-api/api/`)*

#### Scenario: Instant pointer rollback and failed release cleanup
- **Given** a failed healthcheck and an identified previous release in `/opt/finanzas-api/releases/`
- **When** the rollback step executes
- **Then** `/opt/finanzas-api/current` MUST be repointed to the previous release via `ln -sfn`, `bun-api.service` MUST restart, the failed release directory MUST be removed, and the workflow MUST terminate with failure.

#### Scenario: Rollback with no previous release
- **Given** a failed healthcheck where no prior release directory exists
- **When** the rollback step executes
- **Then** the step MUST log an error stating no previous release is available, remove the failed release, and exit with status 1.

## REMOVED Requirements

### Requirement: Pre-Deployment Backup Creation
- **Reason**: Isolated release directories in `/opt/finanzas-api/releases/<timestamp>` are inherently immutable, rendering separate backup copying redundant.
- **Migration**: Rollback now reads from the previous release in `/opt/finanzas-api/releases/` instead of `/opt/backups/finanzas-api/`.
