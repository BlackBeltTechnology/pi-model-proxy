## 1. GitHub Actions CI Workflow

- [x] 1.1 Create `.github/workflows/ci.yml` with push/PR triggers on main
- [x] 1.2 Configure Node.js matrix (20, 22) with `actions/setup-node`
- [x] 1.3 Add typecheck step (`tsc --noEmit` with project compiler options)
- [x] 1.4 Add test step (`npm test`)

## 2. GitHub Actions Release Workflow

- [x] 2.1 Create `.github/workflows/release.yml` triggered on `v*` tags
- [x] 2.2 Extract version from git tag and set in package.json via `npm version --no-git-tag-version`
- [x] 2.3 Run typecheck and tests before publish
- [x] 2.4 Publish to npm with `--access public` using `NPM_TOKEN` secret
- [x] 2.5 Create GitHub Release with auto-generated release notes via `softprops/action-gh-release`

## 3. npm Package Configuration

- [x] 3.1 Change package name to `@blackbelt-technology/pi-model-proxy`
- [x] 3.2 Move pi-ai and pi-coding-agent to peerDependencies (`>=0.60.0`), keep in devDependencies as `*`
- [x] 3.3 Add `files` field to control published contents (`index.ts`, `src/`, `README.md`, `LICENSE`)
- [x] 3.4 Add `keywords` (`pi-package`, `pi-extension`, `openai-proxy`, etc.)
- [x] 3.5 Add `repository`, `homepage`, `bugs` metadata
- [x] 3.6 Add `typecheck` script to package.json
- [x] 3.7 Set version to `0.0.0` (real version comes from git tags)

## 4. Documentation

- [x] 4.1 Update README: add Installation section with `pi install` from npm and GitHub
- [x] 4.2 Update README: add Releasing section with tag-based workflow and semver convention
- [x] 4.3 Update README: rewrite Development section for contributors (clone, install, test)
- [x] 4.4 Update README: replace static badges with CI and npm badges
- [x] 4.5 Update AGENTS.md: add `pi install` command and `typecheck` script

## 5. Repository Setup (Manual)

- [ ] 5.1 Add `NPM_TOKEN` secret to GitHub repository (Settings → Secrets → Actions)
- [ ] 5.2 Push initial commit to GitHub
- [ ] 5.3 Create first release: `git tag v1.0.0 && git push origin v1.0.0`
