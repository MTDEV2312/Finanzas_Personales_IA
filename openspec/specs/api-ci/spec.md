# Specification: api-ci

## Purpose
Defines the continuous integration requirements for validating API code quality, static type safety, and core endpoint functionality prior to merging or deploying changes.

## Requirements

### Requirement: Path-Filtered CI Triggering
The CI workflow MUST trigger exclusively on pull requests and push events targeting the `main` branch when changes affect the API codebase or CI definitions. Changes restricted outside these paths SHALL NOT trigger the workflow. All CI validation jobs for both push and pull request events MUST execute on GitHub-hosted cloud runners (`ubuntu-latest`), strictly isolating untrusted public pull request code and dependencies from internal self-hosted runners and the private local area network (LAN).

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

---

### Requirement: Automated Type Checking
The CI pipeline MUST execute static TypeScript compilation checks without emitting JavaScript artifacts. Any type error SHALL cause the CI job to fail immediately and block branch merging.

#### Scenario: Valid TypeScript codebase passes type check
- **Given** an API changeset with valid TypeScript definitions and compliant syntax
- **When** the CI runner executes `bunx tsc --noEmit` within the `api/` directory
- **Then** the process MUST exit with code 0 and the typecheck step MUST succeed.

#### Scenario: Type error aborts CI job
- **Given** an API changeset containing a TypeScript compile-time type mismatch or syntax error
- **When** the CI runner executes `bunx tsc --noEmit` within the `api/` directory
- **Then** the process MUST exit with a non-zero exit code, error details MUST be logged in the workflow output, and the CI run MUST fail.

---

### Requirement: Automated Unit Testing
The CI pipeline MUST execute automated unit tests using the Bun test runner. All test suites, including health check assertions, SHALL pass before the CI stage is marked successful.

#### Scenario: Health endpoint unit test passes
- **Given** a healthy API application where `GET /health` returns HTTP status 200 and `{ "status": "ok" }`
- **When** the CI runner executes `bun test` within the `api/` directory
- **Then** all test suites MUST exit with code 0 and report passing status.

#### Scenario: Broken endpoint logic fails test suite
- **Given** a regression in API route logic that produces an invalid status code, unexpected payload, or uncaught exception
- **When** the CI runner executes `bun test` within the `api/` directory
- **Then** the test runner MUST exit with a non-zero exit code and the CI workflow MUST fail.

---

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
