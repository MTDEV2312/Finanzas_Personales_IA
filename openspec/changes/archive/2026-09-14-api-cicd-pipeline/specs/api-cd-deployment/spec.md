# Specification: api-cd-deployment

## Purpose
Defines the continuous deployment requirements for delivering verified API releases to the Proxmox LXC server, including pre-deployment backups, synchronization, health verification, and automated rollback upon failure.

## Requirements

### Requirement: Pre-Deployment Backup Creation
Prior to applying code changes to the target server, the deployment process MUST create an isolated, timestamped snapshot of the current application directory inside `/opt/backups/finanzas-api/`.

#### Scenario: Successful pre-deploy backup creation
- **Given** a valid target directory at `/opt/finanzas-api/api`
- **When** the deployment backup step executes on the target API host
- **Then** a directory matching `/opt/backups/finanzas-api/finanzas-api-<YYYYMMDD_HHMMSS>` MUST be created containing an exact copy of the current release.

#### Scenario: Deployment aborted when backup creation fails
- **Given** an environment issue such as insufficient disk space or directory permission denial
- **When** the backup command fails to create the timestamped snapshot
- **Then** the deployment workflow MUST terminate immediately without modifying the existing `/opt/finanzas-api/api` deployment.

---

### Requirement: Rsync Synchronization and Secret Preservation
The deployment process MUST synchronize repository code to `/opt/finanzas-api/api/` using `rsync`. The synchronization SHALL preserve the target host's production `.env` configuration file and MUST omit repository `.git` metadata and temporary artifacts.

#### Scenario: Clean synchronization preserving production environment
- **Given** an existing `/opt/finanzas-api/api/.env` file on the target server and verified build artifacts on the runner
- **When** `rsync` executes transfer to `/opt/finanzas-api/api/`
- **Then** new and updated application files MUST be copied, deleted source files MUST be removed from target, and the existing `.env` file MUST remain intact.

#### Scenario: Network or transfer interruption leaves existing service stable
- **Given** an SSH disconnection or transport failure during rsync transfer
- **When** the rsync process exits with a non-zero status
- **Then** the deployment pipeline MUST fail and MUST NOT proceed to service restart.

---

### Requirement: Service Reload and Healthcheck Verification
Following file synchronization, the deployment pipeline MUST restart the `bun-api.service` systemd unit and poll the `GET /health` endpoint until health is verified or retry limits are exhausted.

#### Scenario: Service restarts and healthcheck succeeds
- **Given** newly synchronized application code on the API server
- **When** `systemctl restart bun-api.service` executes and `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/health` is polled
- **Then** the endpoint MUST return HTTP 200 within 3 retry attempts (with 5-second request timeout each), marking the deployment successful.

#### Scenario: Healthcheck fails after retries
- **Given** an application startup crash or runtime regression preventing HTTP 200 responses
- **When** the healthcheck polling exceeds 3 retry attempts without receiving HTTP 200
- **Then** the healthcheck step MUST fail with a non-zero exit code and trigger rollback.

---

### Requirement: Automated Rollback on Verification Failure
If post-deployment health verification fails, the pipeline MUST automatically restore the most recent timestamped backup from `/opt/backups/finanzas-api/`, restart `bun-api.service`, and fail the workflow run.

#### Scenario: Successful automatic restoration after failed healthcheck
- **Given** a failed healthcheck and a valid timestamped backup directory in `/opt/backups/finanzas-api/`
- **When** the rollback step executes
- **Then** files in `/opt/finanzas-api/api/` MUST be replaced with the latest backup contents, `bun-api.service` MUST be restarted, and the workflow run MUST terminate in a failed state.

#### Scenario: Missing backup handling during rollback failure
- **Given** a failed deployment where no backup directory exists in `/opt/backups/finanzas-api/`
- **When** the rollback step executes
- **Then** the step MUST log an explicit error stating no backup is available, exit with status 1, and request operator intervention.
