## ADDED Requirements

### Requirement: OIDC-based npm authentication
The release workflow SHALL authenticate to npm using OpenID Connect (OIDC) via GitHub Actions' `id-token: write` permission, instead of a stored `NPM_TOKEN` secret.

#### Scenario: Successful publish without stored secrets
- **WHEN** a `v*` tag is pushed to the repository
- **THEN** the release workflow MUST publish the package to npm without referencing any `NPM_TOKEN` or `NODE_AUTH_TOKEN` secret

#### Scenario: OIDC permission is declared
- **WHEN** the release job runs
- **THEN** the job MUST have `permissions.id-token` set to `write`

### Requirement: Provenance attestation
The release workflow SHALL publish packages with the `--provenance` flag, creating a verifiable link between the published package and the source commit and CI run.

#### Scenario: Package published with provenance
- **WHEN** the `npm publish` command executes in the release workflow
- **THEN** the command MUST include the `--provenance` flag

#### Scenario: Provenance is visible on npm
- **WHEN** a package version is published with provenance
- **THEN** the npm package page SHALL display provenance information linking to the GitHub repository and workflow run

### Requirement: Trusted publisher configuration on npm
The npm package `@blackbelt-technology/pi-model-proxy` SHALL have a trusted publisher configured on npmjs.com pointing to the repository's release workflow.

#### Scenario: Trusted publisher registered
- **WHEN** the trusted publisher is configured on npmjs.com
- **THEN** the configuration MUST specify the correct GitHub organization/user, repository name, and workflow filename (`release.yml`)

### Requirement: No stored npm credentials
The repository SHALL NOT contain any long-lived npm authentication tokens after migration is complete.

#### Scenario: NPM_TOKEN secret removed
- **WHEN** the trusted publishing migration is complete
- **THEN** the `NPM_TOKEN` GitHub repository secret MUST be deleted

#### Scenario: No NODE_AUTH_TOKEN in workflow
- **WHEN** the release workflow is examined
- **THEN** there SHALL be no `NODE_AUTH_TOKEN` environment variable in any step
