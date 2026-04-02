## ADDED Requirements

### Requirement: Continuous integration on push and pull request
The project SHALL run automated checks on every push to main and every pull request targeting main.

#### Scenario: Push to main triggers CI
- **WHEN** code is pushed to the `main` or `master` branch
- **THEN** the CI workflow SHALL run typecheck and tests

#### Scenario: Pull request triggers CI
- **WHEN** a pull request is opened or updated targeting main
- **THEN** the CI workflow SHALL run typecheck and tests

#### Scenario: CI runs on multiple Node.js versions
- **WHEN** CI is triggered
- **THEN** it SHALL run on Node.js 20 and 22

#### Scenario: Typecheck step
- **WHEN** CI runs
- **THEN** it SHALL execute TypeScript type checking via `tsc --noEmit` with the project's compiler options

#### Scenario: Test step
- **WHEN** CI runs
- **THEN** it SHALL execute `npm test` (vitest unit + integration tests)

### Requirement: Tag-based release to npm
The project SHALL publish to npm when a version tag is pushed.

#### Scenario: Version tag triggers release
- **WHEN** a tag matching `v*` (e.g., `v1.0.0`) is pushed
- **THEN** the release workflow SHALL run typecheck, tests, and publish to npm

#### Scenario: Version extraction from tag
- **WHEN** the release workflow runs for tag `v1.2.3`
- **THEN** it SHALL set the package version to `1.2.3` before publishing

#### Scenario: npm publish with public access
- **WHEN** the package is published
- **THEN** it SHALL use `npm publish --access public` to publish the scoped package

#### Scenario: GitHub Release creation
- **WHEN** the release workflow completes successfully
- **THEN** it SHALL create a GitHub Release with auto-generated release notes

#### Scenario: Authentication via NPM_TOKEN
- **WHEN** the release workflow publishes to npm
- **THEN** it SHALL authenticate using the `NPM_TOKEN` repository secret

### Requirement: npm package configuration
The package SHALL be correctly configured for public npm distribution.

#### Scenario: Scoped package name
- **WHEN** the package is published
- **THEN** it SHALL be published as `@blackbelt-technology/pi-model-proxy`

#### Scenario: peerDependencies for pi packages
- **WHEN** a consumer installs the package
- **THEN** `@mariozechner/pi-ai` and `@mariozechner/pi-coding-agent` SHALL be listed as peerDependencies with `>=0.60.0`

#### Scenario: Controlled file list
- **WHEN** the package is published
- **THEN** only `index.ts`, `src/`, `README.md`, and `LICENSE` SHALL be included (no tests, config, or openspec files)

#### Scenario: pi package discoverability
- **WHEN** the package is published
- **THEN** it SHALL include keywords `pi-package` and `pi-extension` for discoverability

### Requirement: Installation via pi package manager
Users SHALL be able to install the extension using pi's package manager.

#### Scenario: Install from npm
- **WHEN** a user runs `pi install npm:@blackbelt-technology/pi-model-proxy`
- **THEN** the extension SHALL be installed and loaded automatically on next pi start

#### Scenario: Install from GitHub
- **WHEN** a user runs `pi install https://github.com/BlackBeltTechnology/pi-model-proxy`
- **THEN** the extension SHALL be installed from the repository
