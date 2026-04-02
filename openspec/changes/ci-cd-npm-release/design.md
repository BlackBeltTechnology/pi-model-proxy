## Context

The project is a pi extension (`@blackbelt-technology/pi-model-proxy`) hosted at `github.com/BlackBeltTechnology/pi-model-proxy`. Both runtime dependencies (`@mariozechner/pi-ai` and `@mariozechner/pi-coding-agent`) are published on npm. The extension is loaded by pi at runtime from raw TypeScript — no build/compile step is needed.

## Goals / Non-Goals

**Goals:**
- Automated CI: typecheck + test on every push/PR to main
- Automated release: push a git tag → publish to npm + create GitHub Release
- Correct npm packaging: scoped name, peerDependencies, controlled file list
- Clear installation docs for end users (pi install from npm or GitHub)
- Clear contribution docs (clone, install, test, typecheck)

**Non-Goals:**
- TypeScript compilation to JS (pi loads `.ts` directly)
- Semantic-release or conventional commits automation (tag-based is simpler)
- Trusted publishing via OIDC (covered by separate `trusted-publishing` change)
- E2E tests in CI (require real pi instance with auth)

## Decisions

### 1. Tag-based versioning

**Decision:** Version is derived from git tags (`v1.2.3` → `1.2.3`). The release workflow extracts the version from the tag and sets it in `package.json` via `npm version --no-git-tag-version` before publishing. The version in `package.json` on main stays at `0.0.0`.

**Rationale:** Simplest approach — no extra tooling, no conventional commit enforcement, no changelog generation. A developer pushes a tag, the pipeline does the rest.

**Alternatives:** semantic-release (too complex for a small project), manual version bumps in package.json (error-prone, version can drift).

### 2. peerDependencies for pi-ai and pi-coding-agent

**Decision:** Move `@mariozechner/pi-ai` and `@mariozechner/pi-coding-agent` to `peerDependencies` with `>=0.60.0`. Keep them in `devDependencies` as `"*"` for local development.

**Rationale:** This is a pi extension — pi provides these packages at runtime. Using peerDependencies avoids version conflicts and signals to consumers that these are runtime requirements provided by the host. The `>=0.60.0` floor is conservative (current version is 0.64.0).

**Alternatives:** Pinned dependencies (`^0.64.0`) — rejected because it would conflict with pi's own versions.

### 3. Publish raw TypeScript (no build step)

**Decision:** Publish `.ts` source files directly. No `tsc` compilation, no `dist/` directory.

**Rationale:** Pi loads extensions from raw TypeScript. Adding a build step would add complexity with no benefit for the primary consumer (pi). CI runs `tsc --noEmit` for type checking only.

### 4. CI matrix: Node 20 and 22

**Decision:** Test on both Node.js 20 (LTS) and 22 (current).

**Rationale:** Covers the two most common Node.js versions in the ecosystem. Node 20 is still in LTS maintenance, Node 22 is the active LTS.

### 5. npm package scope: @blackbelt-technology

**Decision:** Use `@blackbelt-technology/pi-model-proxy` as the scoped package name.

**Rationale:** Matches the npm organization and avoids name collisions with the unscoped `pi-model-proxy`.

## Risks / Trade-offs

- **[Risk] `NPM_TOKEN` secret must be configured before first release** → The release workflow will fail if the secret is missing. Documented in README releasing section.
- **[Trade-off] Version `0.0.0` in package.json on main** → The committed version is meaningless; the real version comes from the git tag. This is intentional but may confuse contributors who look at package.json.
- **[Trade-off] No E2E tests in CI** → E2E requires a real pi instance with provider auth. Not feasible in GitHub Actions without complex setup. Unit + integration tests provide sufficient coverage.
