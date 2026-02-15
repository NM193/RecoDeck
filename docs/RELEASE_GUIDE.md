# RecoDeck Release Guide

This guide covers the complete process for releasing new versions of RecoDeck with automatic updates.

## Prerequisites

Before you can create releases, you need:

### 1. Apple Developer Account
- Enroll at https://developer.apple.com/programs/ ($99/year)
- Create a "Developer ID Application" certificate
- Note your Team ID (10-character alphanumeric)
- Generate an app-specific password at https://appleid.apple.com/

### 2. GitHub Repository Setup
- Update the GitHub username in `src-tauri/tauri.conf.json`:
  ```json
  "endpoints": [
    "https://github.com/YOUR_ACTUAL_USERNAME/RecoDeck/releases/latest/download/latest.json"
  ]
  ```
- Update the URL in `scripts/generate-update-manifest.js` (same username)

### 3. GitHub Secrets Configuration

Go to **Settings → Secrets and variables → Actions** and add:

| Secret Name | Description | How to Get It |
|-------------|-------------|---------------|
| `APPLE_CERTIFICATE` | Base64-encoded .p12 certificate | Export from Keychain: `base64 -i certificate.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | Password for .p12 file | Password you used when exporting |
| `APPLE_ID` | Your Apple ID email | Your developer account email |
| `APPLE_PASSWORD` | App-specific password | From appleid.apple.com → Security |
| `APPLE_TEAM_ID` | 10-character Team ID | From developer.apple.com/account |
| `TAURI_SIGNING_PRIVATE_KEY` | Updater private key | `cat ~/.tauri/recodeck.key \| pbcopy` |

## Release Process

### Step 1: Prepare the Release

1. **Update CHANGELOG.md**
   ```markdown
   ## [0.2.0] - 2026-02-20

   ### Added
   - New feature X

   ### Fixed
   - Bug Y

   ### Changed
   - Improvement Z
   ```

2. **Test locally**
   ```bash
   npm run build:mac
   ```

3. **Verify the build works**
   ```bash
   open src-tauri/target/release/bundle/dmg/*.dmg
   ```

### Step 2: Version Bump

Choose the appropriate version bump:

```bash
# For bug fixes (0.1.0 → 0.1.1)
npm run version:patch

# For new features (0.1.0 → 0.2.0)
npm run version:minor

# For breaking changes (0.1.0 → 1.0.0)
npm run version:major
```

This automatically:
- Updates `package.json`
- Syncs version to `src-tauri/tauri.conf.json`
- Syncs version to `src-tauri/Cargo.toml`
- Creates a git commit

### Step 3: Create and Push Tag

```bash
# The version bump created a commit, now tag it
VERSION=$(node -p "require('./package.json').version")
git tag "v$VERSION"

# Push both commit and tag
git push origin main --tags
```

### Step 4: Monitor GitHub Actions

1. Go to your repository → **Actions** tab
2. Watch the "Release" workflow run
3. It will:
   - ✅ Build universal macOS binary (Intel + Apple Silicon)
   - ✅ Sign the app with your Apple certificate
   - ✅ Notarize the DMG with Apple (5-10 min)
   - ✅ Sign the update bundle with your Tauri key
   - ✅ Generate `latest.json` manifest
   - ✅ Create GitHub Release with all files

### Step 5: Verify the Release

1. **Check GitHub Releases**
   - Go to `https://github.com/YOURUSERNAME/RecoDeck/releases`
   - Verify all files are attached:
     - `recodeck_X.Y.Z_universal.dmg` (installer)
     - `recodeck.app.tar.gz` (update bundle)
     - `recodeck.app.tar.gz.sig` (signature)
     - `latest.json` (update manifest)

2. **Test the DMG**
   ```bash
   # Download and test
   gh release download v0.2.0
   open recodeck_0.2.0_universal.dmg
   ```

3. **Verify notarization**
   ```bash
   spctl -a -vv --type install recodeck_0.2.0_universal.dmg
   # Should show: "accepted" with notarization ticket
   ```

## Testing Auto-Updates

### Test Update Flow

1. **Install old version**
   - Build and install v0.1.0
   - Open the app

2. **Release new version**
   - Follow release process above for v0.2.0

3. **Check for updates**
   - The app should automatically detect the update on startup
   - User will see update notification dialog
   - Click "Download" to install
   - App restarts with new version

### Manual Update Check

You can also test manually:
```typescript
import { check } from '@tauri-apps/plugin-updater';

const update = await check();
if (update?.available) {
  console.log(`Update available: ${update.version}`);
  await update.downloadAndInstall();
}
```

## Manual Release (Without CI/CD)

If you need to release manually:

```bash
# 1. Build
npm run build:mac

# 2. Sign update bundle
npm run release:sign

# 3. Generate manifest
npm run release:manifest

# 4. Notarize DMG (requires env vars)
export APPLE_ID="your@email.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="ABCDE12345"
./scripts/notarize.sh src-tauri/target/release/bundle/dmg/recodeck_*.dmg

# 5. Create GitHub release manually
gh release create v0.2.0 \
  src-tauri/target/release/bundle/dmg/*.dmg \
  src-tauri/target/release/bundle/macos/recodeck.app.tar.gz \
  src-tauri/target/release/bundle/macos/recodeck.app.tar.gz.sig \
  latest.json \
  --title "RecoDeck v0.2.0" \
  --notes "See CHANGELOG.md"
```

## Rollback Procedure

If you need to rollback a bad release:

### Option A: Quick Patch
```bash
# Fix the issue
git commit -m "fix: critical bug"

# Release patch version
npm run version:patch
git push origin main --tags
```

### Option B: Delete Bad Release
```bash
# Delete the release and tag
gh release delete v0.2.0 --yes
git tag -d v0.2.0
git push origin :refs/tags/v0.2.0

# Users on v0.2.0 will stay on it (no auto-downgrade)
# Wait for v0.2.1 to update them
```

## Troubleshooting

### Notarization Failed

**Check Apple System Status**: https://developer.apple.com/system-status/

**View notarization log**:
```bash
# Get request ID from the error message
xcrun notarytool log <request-id> \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_PASSWORD" \
  --team-id "$APPLE_TEAM_ID"
```

### Build Failed on GitHub Actions

**Common issues**:
- Missing or incorrect GitHub Secrets
- Certificate expired
- Node/Rust version mismatch

**Debug**:
1. Check Actions logs
2. Verify all secrets are set correctly
3. Test build locally first

### Update Not Showing

**Checklist**:
- [ ] `latest.json` is uploaded to GitHub Releases
- [ ] Version in `latest.json` matches the tag
- [ ] Endpoint URL in `tauri.conf.json` is correct
- [ ] Signature file was generated correctly
- [ ] User has internet connection

## Version Strategy

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0 → 2.0.0): Breaking changes, incompatible API changes
- **MINOR** (0.1.0 → 0.2.0): New features, backward compatible
- **PATCH** (0.1.0 → 0.1.1): Bug fixes, backward compatible

### Pre-Release Versions

For beta testing:
```bash
npm version 0.2.0-beta.1
git tag v0.2.0-beta.1
git push origin main --tags
```

Note: The updater will not auto-update to pre-release versions unless configured.

## Security Notes

- 🔒 **Private Key**: Never commit `~/.tauri/recodeck.key` to git
- 🔒 **Certificate**: Store Apple certificate securely (1Password, etc.)
- 🔒 **Secrets**: Rotate GitHub secrets annually
- 🔒 **Certificate Expiry**: Renew Apple certificates before expiration (they last 1 year)

## Release Checklist

Use this checklist for every release:

- [ ] All features tested locally
- [ ] CHANGELOG.md updated
- [ ] Version bumped with npm script
- [ ] Tag created and pushed
- [ ] GitHub Actions workflow succeeded
- [ ] All release artifacts present
- [ ] DMG notarization verified
- [ ] Update tested from previous version
- [ ] Release notes published
- [ ] Users notified (Discord/Twitter/etc.)

## Support

For issues with the release process:
- Check [MACOS_DISTRIBUTION.md](./MACOS_DISTRIBUTION.md) for detailed setup
- Review [Tauri Updater Docs](https://v2.tauri.app/plugin/updater/)
- File an issue on GitHub
