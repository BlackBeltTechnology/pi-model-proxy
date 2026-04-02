## Why

The project had no CI/CD pipeline or npm publishing setup. Code was developed locally with no automated testing on push, no way to publish releases, and no clear installation path for end users. The package name was unscoped (`pi-model-proxy`), dependencies used wildcard versions (`"*"`), and the README only described running from source — not installing as a pi package.

## What Changes

- **GitHub Actions CI workflow**: Automated typecheck and test on push/PR to main, across Node 20 and 22
- **GitHub Actions release workflow**: Tag-based release pipeline — push `v*` tag triggers typecheck, test, npm publish, and GitHub Release creation
- **npm packaging**: Scoped package name `@blackbelt-technology/pi-model-proxy`, `peerDependencies` for pi-ai and pi-coding-agent, `files` field to control published contents, `keywords` for discoverability
- **README updates**: Installation section (pi install from npm/GitHub), releasing section with tag-based workflow and semver convention, development section for contributors
- **AGENTS.md updates**: Added pi install command and typecheck script to commands section

## Capabilities

### New Capabilities

- `ci-pipeline`: GitHub Actions CI/CD — continuous integration on push/PR, tag-based npm release with automated versioning

### Modified Capabilities

_(none)_

## Impact

- **`.github/workflows/ci.yml`**: New file — CI workflow
- **`.github/workflows/release.yml`**: New file — release workflow
- **`package.json`**: Scoped name, peerDependencies, files, keywords, repository metadata, typecheck script
- **`README.md`**: Installation, releasing, and development sections rewritten
- **`AGENTS.md`**: Commands section updated
- **No runtime code changes**: This is purely packaging and CI/CD infrastructure
