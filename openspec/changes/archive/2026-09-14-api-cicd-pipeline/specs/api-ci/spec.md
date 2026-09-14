# Specification: api-ci

## Purpose
Defines the continuous integration requirements for validating API code quality, static type safety, and core endpoint functionality prior to merging or deploying changes.

## Requirements

### Requirement: Path-Filtered CI Triggering
The CI workflow MUST trigger exclusively on pull requests and push events targeting the `main` branch when changes affect the API codebase or CI definitions. Changes restricted outside these paths SHALL NOT trigger the workflow.

#### Scenario: Workflow triggered by API changes
- **Given** a pull request or commit targeting the `main` branch
- **When** the changeset includes modifications within `api/**` or `.github/workflows/api.yml`
- **Then** the CI workflow MUST trigger and initiate validation jobs.

#### Scenario: Workflow ignored for non-API changes
- **Given** a pull request or commit targeting the `main` branch
- **When** the changeset is restricted entirely to paths outside `api/**` and `.github/workflows/api.yml` (such as `alexaSkill/**` or `n8n/**`)
- **Then** the CI workflow MUST NOT trigger.

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
