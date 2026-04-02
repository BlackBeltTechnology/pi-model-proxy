## Why

The current release workflow uses a long-lived `NPM_TOKEN` secret stored in GitHub to publish to npm. This token has indefinite lifetime, broad scope, requires manual rotation, and is a single point of compromise. npm now supports Trusted Publishing via OpenID Connect (OIDC), which eliminates stored secrets entirely — GitHub Actions mints a short-lived token on the fly, scoped to the specific repository and workflow. This is the industry-standard approach for secure CI/CD publishing.

## What Changes

- Replace `secrets.NPM_TOKEN` authentication in `release.yml` with OIDC-based trusted publishing
- Add `id-token: write` permission to the release job (required for OIDC handshake)
- Add `--provenance` flag to `npm publish` for supply-chain transparency (links published artifact to exact commit and workflow run)
- Remove `NODE_AUTH_TOKEN` environment variable from the publish step
- Document npm.com configuration steps for setting up the trusted publisher

## Capabilities

### New Capabilities

- `trusted-publishing`: OIDC-based npm publishing via GitHub Actions without stored secrets, including provenance attestation

### Modified Capabilities

_(none — no existing specs)_

## Impact

- **`.github/workflows/release.yml`**: Permissions block updated, publish command changed, secret reference removed
- **npmjs.com**: One-time configuration to register the GitHub Actions workflow as a trusted publisher for `@blackbelt-technology/pi-model-proxy`
- **GitHub repository secrets**: `NPM_TOKEN` secret can be deleted after migration
- **No code changes**: This is purely CI/CD infrastructure — no changes to `src/`, `test/`, or runtime behavior
