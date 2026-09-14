# Specification Delta: api-ci

## Purpose
Defines continuous integration security hardening for the API workflow, enforcing least-privilege `GITHUB_TOKEN` permissions and isolating CI validation execution to GitHub-hosted cloud runners (`ubuntu-latest`) to protect self-hosted runner infrastructure and internal network assets from untrusted pull request code.

## ADDED Requirements

### Requirement: Least-Privilege Workflow Token Permissions
The CI workflow and its validation jobs MUST explicitly declare permissions constrained to `contents: read`, strictly enforcing least privilege on the automated `GITHUB_TOKEN` and disallowing write or administrative privileges across repository resources.

#### Scenario: GITHUB_TOKEN scope constrained to read-only
- **Given** a triggered CI workflow execution for a push or pull request event
- **When** the workflow or CI validation job initializes with explicit `permissions: contents: read`
- **Then** the automated `GITHUB_TOKEN` MUST possess read-only permissions for repository contents and no write or elevated administrative permissions on issues, packages, deployments, or settings.

#### Scenario: Unintended token elevation prevented
- **Given** a workflow step or third-party action attempting to write to repository contents, create releases, or mutate pull request metadata using the default `GITHUB_TOKEN`
- **When** the operation is executed within the CI job
- **Then** the GitHub API MUST reject the operation with an authorization or permission denied error, preventing unintended privilege escalation.

## MODIFIED Requirements

### Requirement: Path-Filtered CI Triggering
The CI workflow MUST trigger exclusively on pull requests and push events targeting the `main` branch when changes affect the API codebase or CI definitions. Changes restricted outside these paths SHALL NOT trigger the workflow. All CI validation jobs for both push and pull request events MUST execute on GitHub-hosted cloud runners (`ubuntu-latest`), strictly isolating untrusted public pull request code and dependencies from internal self-hosted runners and the private local area network (LAN).

*(Previously: Initiated validation jobs on self-hosted runner on pull requests and pushes without isolation)*

#### Scenario: Workflow triggered by API changes on cloud runner
- **Given** a push event or pull request targeting the `main` branch
- **When** the changeset includes modifications within `api/**` or `.github/workflows/api.yml`
- **Then** the CI workflow MUST trigger, and all validation jobs (including dependency installation, type checking, and unit testing) MUST execute exclusively on an isolated GitHub-hosted runner (`ubuntu-latest`).

#### Scenario: Workflow ignored for non-API changes
- **Given** a pull request or commit targeting the `main` branch
- **When** the changeset is restricted entirely to paths outside `api/**` and `.github/workflows/api.yml` (such as `alexaSkill/**` or `n8n/**`)
- **Then** the CI workflow MUST NOT trigger.

#### Scenario: Public pull request executes in cloud runner isolation
- **Given** an untrusted pull request submitted from a public fork or external branch
- **When** CI validation is triggered for the pull request
- **Then** the job MUST run within the ephemeral GitHub-hosted cloud runner environment without access to internal self-hosted runner infrastructure, internal LAN services, or repository deployment secrets.
