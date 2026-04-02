## Context

The project publishes `@blackbelt-technology/pi-model-proxy` to npm via `.github/workflows/release.yml`, triggered by `v*` tags. Currently, authentication uses a long-lived `NPM_TOKEN` stored as a GitHub repository secret. npm supports Trusted Publishing via OIDC, allowing GitHub Actions to mint short-lived tokens without stored secrets.

## Goals / Non-Goals

**Goals:**
- Eliminate the long-lived `NPM_TOKEN` secret from the publish pipeline
- Enable OIDC-based authentication between GitHub Actions and npm
- Add provenance attestation to published packages for supply-chain transparency
- Document the one-time npm.com configuration steps

**Non-Goals:**
- Adding a GitHub Environment gate (can be added later if needed)
- Changing the release trigger mechanism (stays as `v*` tag push)
- Modifying the CI workflow (`ci.yml`)
- Supporting other CI providers (GitLab, Bitbucket)

## Decisions

### 1. Keep the existing `release.yml` filename

**Decision:** Modify the existing `release.yml` rather than creating a new `publish.yml`.

**Rationale:** The workflow filename is registered on npmjs.com as part of the trusted publisher configuration. Renaming would require coordinating the npm config and workflow change simultaneously. Keeping `release.yml` also preserves the GitHub Release creation step in the same workflow.

**Alternatives:** Creating a separate `publish.yml` — rejected because it splits the release process into two workflows with no benefit.

### 2. No GitHub Environment requirement

**Decision:** Omit the optional "Environment" field when configuring the trusted publisher on npm.

**Rationale:** The project has a small number of maintainers. Adding an environment gate adds ceremony (approval steps, environment creation) without proportional security benefit at this scale. Can be added later by updating npm config and adding `environment: <name>` to the workflow.

**Alternatives:** Requiring a `npm-publish` environment — deferred, not rejected.

### 3. Add `--provenance` flag

**Decision:** Include `--provenance` on the `npm publish` command.

**Rationale:** Provenance is the primary value-add of trusted publishing beyond security. It creates a verifiable link from the published package to the exact commit and CI run. No downside — it's metadata attached to the publish, not a behavioral change.

## Risks / Trade-offs

- **[One-way migration]** → Once `NPM_TOKEN` secret is deleted, the old workflow cannot publish. Mitigation: The secret can be re-created if needed, and OIDC is a well-tested npm feature.
- **[npm.com must be configured first]** → If the workflow runs before trusted publishing is configured on npm, the publish will fail with an auth error. Mitigation: Document the npm configuration as task #1 (manual step before merging workflow changes).
- **[GitHub Actions is the only supported OIDC provider]** → If the project ever moves to another CI, trusted publishing won't work. Mitigation: This is a known npm limitation; traditional tokens remain available as fallback.
