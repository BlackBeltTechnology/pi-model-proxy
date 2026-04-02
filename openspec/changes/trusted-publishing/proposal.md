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

## How to Configure Trusted Publishing on npmjs.com

Trusted publishing is configured in **package settings** on npmjs.com, which means the package must already exist. Since `@blackbelt-technology/pi-model-proxy` has not been published yet, we first do a one-time manual publish, then configure trusted publishing for all future releases.

> **Prerequisites:**
> - npm CLI version **11.5.1 or later** and Node **22.14.0 or higher** (required for OIDC support)
> - Admin access to the `@blackbelt-technology` npm organization
> - The `repository.url` field in `package.json` must exactly match the GitHub repository URL

---

### Step 1: Verify package.json has repository URL

The `repository.url` in `package.json` **must exactly match** your GitHub repository. npm uses this to validate the trusted publisher link. Ensure it looks like:

```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/BlackBeltTechnology/pi-model-proxy.git"
  }
}
```

### Step 2: Do a one-time manual publish

This creates the package on npm so we can configure its settings:

```bash
npm login
npm version 0.1.0 --no-git-tag-version
npm publish --access public
```

Verify it exists at: https://www.npmjs.com/package/@blackbelt-technology/pi-model-proxy

### Step 3: Navigate to Trusted Publisher settings

1. Go to your package page on [npmjs.com](https://www.npmjs.com/package/@blackbelt-technology/pi-model-proxy)
2. Click the **"Settings"** tab
3. Scroll down to the **"Trusted Publisher"** section
4. Click the **"GitHub Actions"** button to select it as provider

### Step 4: Fill in the GitHub Actions trusted publisher form

| Field | Value |
|-------|-------|
| **Organization or user** | `blackbelt-technology` |
| **Repository** | `pi-model-proxy` (just the repo name, not the full URL) |
| **Workflow filename** | `release.yml` (must match the exact filename in `.github/workflows/`, include `.yml` extension) |
| **Environment name** | _(leave empty)_ |

Click **"Add"** (or **"Save"**) to save the configuration.

> **⚠️ Important:** npm does **not** validate your configuration when you save it. Double-check that the repository name, workflow filename, and org name are correct — errors will only appear when you attempt to publish.

### Step 5: Verify the trusted publisher

After saving, you should see the trusted publisher listed under the "Trusted Publisher" section with:
- The GitHub Actions icon
- Your organization, repository, and workflow filename

### Step 6: (Recommended) Restrict token access

For maximum security, after trusted publishing is working:

1. Go to package **Settings** → **Publishing access**
2. Select **"Require two-factor authentication and disallow tokens"**
3. Click **"Update Package Settings"**

This ensures only OIDC-based publishes are allowed — traditional tokens cannot be used, even if one is leaked.

> **Note:** The "disallow tokens" setting only affects traditional token authentication. Trusted publishers continue to work normally via OIDC.

### Step 7: Merge the workflow changes and test

1. Merge the updated `release.yml` (with `id-token: write` permission and `--provenance`)
2. Push a `v*` tag (e.g., `v0.2.0`) to trigger the release workflow
3. Verify the workflow completes successfully in GitHub Actions
4. Check for the **provenance badge** on the npm package page (provenance is generated automatically when publishing via OIDC from a public repository)

### Step 8: Clean up

1. Delete the `NPM_TOKEN` secret from GitHub repository settings (Settings → Secrets and variables → Actions) if one exists
2. Revoke any existing npm automation tokens from your npm account that are no longer needed

---

### Troubleshooting

- **"Unable to authenticate" (ENEEDAUTH):** Verify the workflow filename matches exactly (including `.yml`), all fields are case-sensitive, and `id-token: write` permission is set in the workflow.
- **Provenance not showing:** Provenance is only generated for public packages published from public repositories. Private repos will not get provenance attestations.
- **Using `workflow_call`:** If your publish workflow is called from another workflow, npm validates the *calling* workflow's name, not the child. The `id-token: write` permission must be set on both.
