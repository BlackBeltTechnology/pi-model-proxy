## 1. npm Configuration (Manual)

- [ ] 1.1 Configure trusted publisher on npmjs.com for `@blackbelt-technology/pi-model-proxy` — set GitHub org/user, repository, and workflow filename `release.yml`

## 2. Workflow Changes

- [ ] 2.1 Add `id-token: write` to the `permissions` block in `.github/workflows/release.yml`
- [ ] 2.2 Add `--provenance` flag to the `npm publish` command
- [ ] 2.3 Remove the `NODE_AUTH_TOKEN` environment variable from the publish step

## 3. Cleanup

- [ ] 3.1 Delete the `NPM_TOKEN` secret from the GitHub repository settings

## 4. Verification

- [ ] 4.1 Push a `v*` tag and confirm the release workflow publishes successfully via OIDC
- [ ] 4.2 Verify provenance badge appears on the npm package page
