# RecoDeck macOS Distribution & Auto-Update Implementation Plan

## Context

RecoDeck is currently at version 0.1.0 with a basic Tauri v2 development setup. The project needs a complete production distribution system for macOS that includes:
- Professional app bundling and signing
- Automatic update delivery to users
- Seamless update experience similar to commercial macOS apps

**Current State:**
- ✅ Tauri v2 project with React frontend
- ✅ macOS icon assets (icon.icns) ready
- ✅ Basic bundle configuration
- ❌ No updater plugin or configuration
- ❌ No code signing or notarization setup
- ❌ No CI/CD workflows
- ❌ No release infrastructure

**Goal:** Transform RecoDeck into a production-ready macOS app with automatic updates, proper code signing, notarization, and professional distribution workflows.

---

## Phase 1: Foundation - Versioning & Build Scripts

### 1.1 Version Management Strategy

**Single Source of Truth:** Use `package.json` as the canonical version source.

**Sync Script:** Create `scripts/sync-version.js`
```javascript
// Reads version from package.json and updates tauri.conf.json + Cargo.toml
const fs = require('fs');
const path = require('path');

const packageJson = require('../package.json');
const version = packageJson.version;

// Update tauri.conf.json
const tauriConfigPath = path.join(__dirname, '../src-tauri/tauri.conf.json');
const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf8'));
tauriConfig.version = version;
fs.writeFileSync(tauriConfigPath, JSON.stringify(tauriConfig, null, 2));

// Update Cargo.toml
const cargoTomlPath = path.join(__dirname, '../src-tauri/Cargo.toml');
let cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
cargoToml = cargoToml.replace(/^version = ".*"/m, `version = "${version}"`);
fs.writeFileSync(cargoTomlPath, cargoToml);

console.log(`✓ Synced version ${version} across all files`);
```

**npm Scripts to Add:**
```json
{
  "scripts": {
    "version:sync": "node scripts/sync-version.js",
    "version:patch": "npm version patch && npm run version:sync",
    "version:minor": "npm version minor && npm run version:sync",
    "version:major": "npm version major && npm run version:sync",
    "build:mac": "npm run version:sync && tauri build --target universal-apple-darwin",
    "build:dev": "tauri build --debug"
  }
}
```

**Semantic Versioning Strategy:**
- MAJOR: Breaking changes (1.0.0, 2.0.0)
- MINOR: New features (0.2.0, 0.3.0)
- PATCH: Bug fixes (0.1.1, 0.1.2)
- Use `npm run version:patch` before each release

---

## Phase 2: Updater Plugin Integration

### 2.1 Install Updater Dependencies

**Cargo.toml additions:**
```toml
[dependencies]
tauri-plugin-updater = "2"

[build-dependencies]
tauri-build = { version = "2", features = [] }
```

**npm package (if TypeScript support needed):**
```bash
npm install @tauri-apps/plugin-updater
```

### 2.2 Configure Updater in tauri.conf.json

Add updater configuration:
```json
{
  "plugins": {
    "updater": {
      "active": true,
      "endpoints": [
        "https://github.com/YourUsername/RecoDeck/releases/latest/download/latest.json"
      ],
      "dialog": true,
      "pubkey": "YOUR_PUBLIC_KEY_HERE"
    }
  }
}
```

**Updater Workflow:**
1. App checks endpoint for `latest.json` on startup
2. Compares remote version with current version
3. If newer, shows dialog: "Update Available: v0.2.0 → Download now?"
4. Downloads `.tar.gz` signature-verified update
5. Installs and prompts restart

### 2.3 Frontend Update UI (Optional Enhancement)

Create `src/components/UpdateNotification.tsx`:
```tsx
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [version, setVersion] = useState('');

  useEffect(() => {
    checkForUpdates();
  }, []);

  async function checkForUpdates() {
    const update = await check();
    if (update?.available) {
      setUpdateAvailable(true);
      setVersion(update.version);
    }
  }

  async function installUpdate() {
    const update = await check();
    if (update?.available) {
      await update.downloadAndInstall();
      await relaunch();
    }
  }

  if (!updateAvailable) return null;

  return (
    <div className="update-banner">
      <p>New version {version} available!</p>
      <button onClick={installUpdate}>Update Now</button>
    </div>
  );
}
```

**Note:** Tauri's built-in dialog (`"dialog": true`) handles this automatically, but custom UI provides more control.

---

## Phase 3: Code Signing & Notarization

### 3.1 Apple Developer Requirements

**Prerequisites:**
1. **Apple Developer Account** ($99/year)
   - Enroll at https://developer.apple.com/programs/

2. **Developer ID Application Certificate**
   - Log in to Apple Developer → Certificates
   - Create "Developer ID Application" certificate
   - Download `.cer` file
   - Import to Keychain Access (creates private key)

3. **Team ID**
   - Found at https://developer.apple.com/account/ (top right)
   - 10-character alphanumeric (e.g., `A1B2C3D4E5`)

4. **App-Specific Password (for notarization)**
   - Go to https://appleid.apple.com/
   - Sign in → Security → App-Specific Passwords
   - Generate with label "RecoDeck Notarization"
   - Save securely (needed for CI/CD)

### 3.2 Configure Signing in tauri.conf.json

```json
{
  "bundle": {
    "active": true,
    "targets": "dmg",
    "identifier": "com.nemanjamarjanovic.recodeck",
    "macOS": {
      "minimumSystemVersion": "10.15",
      "signingIdentity": "Developer ID Application: Your Name (TEAM_ID)",
      "entitlements": "src-tauri/entitlements.plist",
      "exceptionDomain": null,
      "frameworks": [],
      "providerShortName": "TEAM_ID"
    }
  }
}
```

**Key Fields:**
- `signingIdentity`: Exact name from Keychain (match certificate)
- `providerShortName`: Your Apple Team ID
- `targets`: Use `"dmg"` for distribution (not `"app"` alone)

### 3.3 Create Entitlements File

Create `src-tauri/entitlements.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
  <key>com.apple.security.automation.apple-events</key>
  <true/>
  <key>com.apple.security.network.client</key>
  <true/>
</dict>
</plist>
```

**Entitlements Explained:**
- `allow-jit`: Required for web content rendering
- `network.client`: Allow internet access (for updates)
- `automation.apple-events`: macOS app automation
- Adjust based on app features (audio, camera, etc.)

### 3.4 Notarization Configuration

**Environment Variables (local development):**
```bash
export APPLE_ID="your-apple-id@example.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"  # App-specific password
export APPLE_TEAM_ID="A1B2C3D4E5"
```

**Notarization Script:** Create `scripts/notarize.sh`
```bash
#!/bin/bash
set -e

DMG_PATH="$1"
BUNDLE_ID="com.nemanjamarjanovic.recodeck"

echo "📦 Submitting $DMG_PATH for notarization..."

# Submit to Apple
xcrun notarytool submit "$DMG_PATH" \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait

echo "✓ Notarization complete"

# Staple the ticket
echo "📌 Stapling notarization ticket..."
xcrun stapler staple "$DMG_PATH"

echo "✅ DMG is notarized and stapled"
```

**Usage:**
```bash
chmod +x scripts/notarize.sh
./scripts/notarize.sh "src-tauri/target/release/bundle/dmg/recodeck_0.1.0_universal.dmg"
```

**Notarization Timeline:**
- Fast: 2-5 minutes (typical)
- Slow: 15-30 minutes (Apple server load)
- `--wait` flag pauses until complete

---

## Phase 4: Update Signature Generation

### 4.1 Generate Signing Keypair

```bash
npm run tauri signer generate -- -w ~/.tauri/recodeck.key
```

**Output:**
- Private key: `~/.tauri/recodeck.key` (KEEP SECRET)
- Public key: Printed to console (add to tauri.conf.json)

**Security:**
```bash
chmod 600 ~/.tauri/recodeck.key  # Restrict permissions
```

### 4.2 Update tauri.conf.json with Public Key

```json
{
  "plugins": {
    "updater": {
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEFCQ0RFRjEyMzQ1Njc4OTAKUldRNU9...(LONG_STRING)"
    }
  }
}
```

### 4.3 Sign Update Bundles

**Manual Signing:**
```bash
npm run tauri signer sign \
  "src-tauri/target/release/bundle/macos/recodeck.app.tar.gz" \
  -k ~/.tauri/recodeck.key
```

**Output:**
- `recodeck.app.tar.gz.sig` (signature file)
- Upload both `.tar.gz` + `.sig` to release server

---

## Phase 5: Release Infrastructure

### 5.1 Recommended Hosting: GitHub Releases

**Advantages:**
- Free for public repos
- Built-in versioning via Git tags
- Reliable CDN
- API for automation
- Tauri updater natively supports it

**Alternatives:**
- **AWS S3**: Better for private repos, costs ~$0.02/GB
- **Cloudflare R2**: S3-compatible, no egress fees
- **Tauri Cloud**: Official paid service (beta)

**We'll use GitHub Releases** (standard for open-source).

### 5.2 Release File Structure

Each release needs these files on GitHub:

```
Release v0.2.0
├── recodeck_0.2.0_universal.dmg (notarized installer)
├── recodeck_0.2.0_universal.dmg.sig (updater signature)
├── recodeck.app.tar.gz (update bundle)
├── recodeck.app.tar.gz.sig (update signature)
└── latest.json (update manifest)
```

### 5.3 Generate latest.json

**Manual Script:** Create `scripts/generate-update-manifest.js`
```javascript
const fs = require('fs');
const crypto = require('crypto');
const packageJson = require('../package.json');

const version = packageJson.version;
const tarballPath = `src-tauri/target/release/bundle/macos/recodeck.app.tar.gz`;

// Calculate SHA256
const fileBuffer = fs.readFileSync(tarballPath);
const hashSum = crypto.createHash('sha256');
hashSum.update(fileBuffer);
const sha256 = hashSum.digest('hex');

const manifest = {
  version: version,
  notes: `Release ${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    "darwin-universal": {
      signature: fs.readFileSync(`${tarballPath}.sig`, 'utf8'),
      url: `https://github.com/YourUsername/RecoDeck/releases/download/v${version}/recodeck.app.tar.gz`,
      sha256: sha256
    }
  }
};

fs.writeFileSync('latest.json', JSON.stringify(manifest, null, 2));
console.log('✓ Generated latest.json');
```

**npm script:**
```json
{
  "scripts": {
    "release:manifest": "node scripts/generate-update-manifest.js"
  }
}
```

---

## Phase 6: CI/CD Automation

### 6.1 GitHub Actions Workflow

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build-macos:
    runs-on: macos-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-darwin,x86_64-apple-darwin

      - name: Install dependencies
        run: npm ci

      - name: Sync versions
        run: npm run version:sync

      - name: Import Apple Certificate
        env:
          CERTIFICATE_BASE64: ${{ secrets.APPLE_CERTIFICATE }}
          CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
        run: |
          echo "$CERTIFICATE_BASE64" | base64 --decode > certificate.p12
          security create-keychain -p actions temp.keychain
          security default-keychain -s temp.keychain
          security unlock-keychain -p actions temp.keychain
          security import certificate.p12 -k temp.keychain -P "$CERTIFICATE_PASSWORD" -T /usr/bin/codesign
          security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k actions temp.keychain

      - name: Build app
        run: npm run build:mac

      - name: Notarize DMG
        env:
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        run: |
          chmod +x scripts/notarize.sh
          ./scripts/notarize.sh "src-tauri/target/release/bundle/dmg/recodeck_*_universal.dmg"

      - name: Sign update bundle
        env:
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
        run: |
          echo "$TAURI_SIGNING_PRIVATE_KEY" > private.key
          npm run tauri signer sign \
            "src-tauri/target/release/bundle/macos/recodeck.app.tar.gz" \
            -k private.key

      - name: Generate update manifest
        run: npm run release:manifest

      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            src-tauri/target/release/bundle/dmg/*.dmg
            src-tauri/target/release/bundle/macos/recodeck.app.tar.gz
            src-tauri/target/release/bundle/macos/recodeck.app.tar.gz.sig
            latest.json
          body: |
            ## What's Changed
            - Feature/fix descriptions here

            ## Installation
            Download `recodeck_*_universal.dmg` and drag to Applications folder.
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 6.2 Required GitHub Secrets

Navigate to **Settings → Secrets and variables → Actions** and add:

1. **APPLE_CERTIFICATE**
   - Export certificate from Keychain as `.p12`
   - Encode: `base64 -i certificate.p12 | pbcopy`
   - Paste base64 string

2. **APPLE_CERTIFICATE_PASSWORD**
   - Password used when exporting `.p12`

3. **APPLE_ID**
   - Your Apple ID email

4. **APPLE_PASSWORD**
   - App-specific password from appleid.apple.com

5. **APPLE_TEAM_ID**
   - 10-character team ID

6. **TAURI_SIGNING_PRIVATE_KEY**
   - Contents of `~/.tauri/recodeck.key`
   - Copy: `cat ~/.tauri/recodeck.key | pbcopy`

### 6.3 Trigger Release

```bash
# Bump version
npm run version:patch  # Creates v0.1.1

# Commit version changes
git add .
git commit -m "chore: bump version to 0.1.1"

# Create and push tag
git tag v0.1.1
git push origin main --tags

# GitHub Actions automatically:
# 1. Builds universal binary
# 2. Signs with your certificate
# 3. Notarizes DMG
# 4. Signs update tarball
# 5. Generates latest.json
# 6. Creates GitHub release
```

---

## Phase 7: Security Considerations

### 7.1 Private Key Management

**Critical Rules:**
1. **NEVER commit** `~/.tauri/recodeck.key` to git
2. Add to `.gitignore`: `*.key`
3. Store in GitHub Secrets for CI/CD
4. Use different keys for staging/production
5. Rotate keys annually

### 7.2 Certificate Security

- Export certificate as password-protected `.p12`
- Use strong password (min 16 chars)
- Store in 1Password/Bitwarden
- Revoke compromised certificates immediately via Apple Developer

### 7.3 Update Endpoint Security

**Current Config:**
```json
"endpoints": [
  "https://github.com/YourUsername/RecoDeck/releases/latest/download/latest.json"
]
```

**Security Measures:**
- HTTPS only (enforced by Tauri)
- Signature verification prevents MITM attacks
- GitHub's CDN provides DDoS protection
- Fallback endpoints: Add multiple URLs for redundancy

**Optional: Backup Endpoint**
```json
"endpoints": [
  "https://github.com/YourUsername/RecoDeck/releases/latest/download/latest.json",
  "https://recodeck.com/updates/latest.json"
]
```

### 7.4 Hardened Runtime

Tauri automatically enables **Hardened Runtime** when signing. This includes:
- Library validation
- Disable executable memory writes
- Runtime code signing validation

**Verify after build:**
```bash
codesign -dvvv src-tauri/target/release/bundle/macos/recodeck.app
# Should show: flags=0x10000(runtime)
```

### 7.5 Update Validation

**Automatic Checks by Tauri Updater:**
1. Signature verification (prevents tampered updates)
2. Version comparison (semantic versioning)
3. Platform matching (prevents wrong OS updates)
4. SHA256 checksum (detects corruption)

**User-facing:**
- Show release notes before install
- Require explicit user consent
- Preserve user data during updates

---

## Phase 8: macOS-Specific Pitfalls & Solutions

### 8.1 Gatekeeper Issues

**Problem:** "App is damaged and can't be opened" on first launch

**Causes:**
- Missing notarization
- Unsigned DMG
- Downloaded via insecure method

**Solutions:**
1. Always notarize + staple
2. Sign DMG itself (not just .app)
3. Test with: `spctl -a -vv recodeck.app`

### 8.2 Universal Binary Build Failures

**Problem:** Build fails for `universal-apple-darwin` target

**Solutions:**
```bash
# Install both targets explicitly
rustup target add x86_64-apple-darwin
rustup target add aarch64-apple-darwin

# Build with explicit target
tauri build --target universal-apple-darwin
```

**Verify binary:**
```bash
lipo -archs src-tauri/target/release/bundle/macos/recodeck.app/Contents/MacOS/recodeck
# Should output: x86_64 arm64
```

### 8.3 Notarization Timeout

**Problem:** `xcrun notarytool submit` hangs or times out

**Solutions:**
1. Check Apple System Status: https://developer.apple.com/system-status/
2. Use `--wait --timeout 1800` (30 min max)
3. Poll status manually if timeout:
   ```bash
   xcrun notarytool submit ... --no-wait
   # Returns request ID
   xcrun notarytool wait <request-id> --apple-id ... --password ...
   ```

### 8.4 Entitlements Too Restrictive

**Problem:** App crashes or features don't work

**Solutions:**
- Add required entitlements for audio: `com.apple.security.device.audio-input`
- For camera: `com.apple.security.device.camera`
- For network: `com.apple.security.network.server` (if hosting local server)

**Debug:**
```bash
codesign -d --entitlements :- recodeck.app
# Shows active entitlements
```

### 8.5 Update Installation Requires Admin

**Problem:** Users prompted for admin password during update

**Cause:** App installed in `/Applications` (system folder)

**Solutions:**
1. Install to `~/Applications` (user folder, no admin needed)
2. Or: Keep in `/Applications` and document admin requirement
3. Tauri updater handles permissions automatically if app is in user-writable location

### 8.6 DMG Mount Issues

**Problem:** DMG fails to mount or shows "Resource busy"

**Solutions:**
```bash
# Unmount any previous mounts
hdiutil detach /Volumes/recodeck

# Rebuild DMG with verification
hdiutil create -volname "RecoDeck" -srcfolder recodeck.app -ov -format UDZO recodeck.dmg
```

### 8.7 Version Comparison Failures

**Problem:** Updater says "No updates" even with newer version

**Cause:** Invalid semantic version format

**Solutions:**
- Always use `X.Y.Z` format (not `vX.Y.Z` or `X.Y`)
- Don't use pre-release tags in production (`1.0.0-beta` < `1.0.0`)
- Ensure `latest.json` version matches Git tag

---

## Phase 9: Testing Strategy

### 9.1 Pre-Release Testing Checklist

**Local Build Verification:**
```bash
# 1. Build production binary
npm run build:mac

# 2. Verify signing
codesign -dvvv src-tauri/target/release/bundle/macos/recodeck.app
# Check: Authority=Developer ID Application: Your Name

# 3. Verify universal binary
lipo -archs src-tauri/target/release/bundle/macos/recodeck.app/Contents/MacOS/recodeck
# Should show: x86_64 arm64

# 4. Check entitlements
codesign -d --entitlements :- src-tauri/target/release/bundle/macos/recodeck.app
# Verify all expected entitlements present

# 5. Test Gatekeeper acceptance
spctl -a -vv src-tauri/target/release/bundle/macos/recodeck.app
# Should show: accepted
```

### 9.2 Notarization Verification

```bash
# After notarization
stapler validate src-tauri/target/release/bundle/dmg/recodeck_*.dmg
# Should output: The validate action worked!

# Check notarization ticket
spctl -a -vv --type install src-tauri/target/release/bundle/dmg/recodeck_*.dmg
# Should show: accepted with notarization ticket
```

### 9.3 Update Flow Testing

**Test Matrix:**

| Test Case | Steps | Expected Outcome |
|-----------|-------|------------------|
| Fresh install | Download DMG → Mount → Drag to Applications → Launch | App opens without Gatekeeper warning |
| Update check (current) | Launch v0.1.0 with no new release | "No updates available" |
| Update check (outdated) | Launch v0.1.0 with v0.2.0 released | "Update available" dialog |
| Update download | Click "Download" in dialog | Progress bar → Success |
| Update install | After download completes | App restarts → Shows v0.2.0 in About |
| Update signature fail | Tamper with .tar.gz | Update rejected, error logged |
| Network failure | Disconnect internet during update | Graceful error, retry option |

**Automated Test Script:** `scripts/test-update.sh`
```bash
#!/bin/bash

# 1. Build old version (0.1.0)
git checkout v0.1.0
npm run build:mac

# 2. Install and run
open src-tauri/target/release/bundle/dmg/*.dmg
echo "Install app, then press Enter..."
read

# 3. Build new version (0.2.0)
git checkout v0.2.0
npm run build:mac

# 4. Upload to test GitHub release
gh release create v0.2.0-test --prerelease \
  src-tauri/target/release/bundle/macos/recodeck.app.tar.gz \
  latest.json

# 5. Launch old version and check for update
open /Applications/recodeck.app
echo "Check if update notification appears..."
```

### 9.4 Cross-Device Testing

**Devices to Test:**
1. **Intel Mac** (macOS 12+)
   - Verify x86_64 slice runs

2. **Apple Silicon Mac** (macOS 12+)
   - Verify arm64 slice runs

3. **Minimum macOS Version** (10.15 per config)
   - Test on Catalina VM or old Mac

**Cloud Testing (if no devices):**
- AWS EC2 Mac Instances (paid)
- MacStadium (paid)
- GitHub Actions runners (free for testing)

### 9.5 Regression Testing

**Before Each Release:**
1. Fresh install test
2. Update from previous version
3. Update from 2 versions back
4. Rollback scenario (install old version over new)

**Automated with CI:**
```yaml
# Add to .github/workflows/test.yml
jobs:
  integration-test:
    runs-on: macos-latest
    steps:
      - name: Build and test update flow
        run: |
          npm run build:mac
          # Run automated update test script
          ./scripts/test-update.sh
```

---

## Phase 10: Release Workflow (Production)

### 10.1 Complete Release Checklist

**Pre-Release (1 day before):**
- [ ] Review all changes since last release
- [ ] Update CHANGELOG.md with user-facing changes
- [ ] Run full test suite locally
- [ ] Test build on Intel and Apple Silicon Macs
- [ ] Verify all environment variables/secrets are current

**Release Day:**

**Step 1: Version Bump**
```bash
npm run version:patch  # or minor/major
```

**Step 2: Update Changelog**
```markdown
## [0.2.0] - 2026-02-15

### Added
- Feature X

### Fixed
- Bug Y

### Changed
- Improvement Z
```

**Step 3: Commit and Tag**
```bash
git add .
git commit -m "chore: release v0.2.0"
git tag v0.2.0
git push origin main --tags
```

**Step 4: Monitor CI/CD**
- Watch GitHub Actions workflow
- Check for build failures
- Verify notarization succeeds (usually 5-10 min)

**Step 5: Verify Release Artifacts**
```bash
# Download from GitHub Releases
gh release download v0.2.0

# Verify files present:
ls -lh
# - recodeck_0.2.0_universal.dmg
# - recodeck.app.tar.gz
# - recodeck.app.tar.gz.sig
# - latest.json

# Test DMG
open recodeck_0.2.0_universal.dmg
# Drag to Applications → Launch → Should open without warning
```

**Step 6: Announcement**
- Post release notes to Discord/Twitter/Blog
- Notify beta testers
- Monitor for user-reported issues

### 10.2 Rollback Procedure

**If critical bug found in v0.2.0:**

**Option A: Quick Patch**
```bash
# Fix bug
npm run version:patch  # → 0.2.1
git commit -m "fix: critical bug in audio module"
git tag v0.2.1
git push origin main --tags
# Wait for CI/CD to build and release
```

**Option B: Rollback to Previous Version**
```bash
# Delete bad release
gh release delete v0.2.0 --yes

# Re-release previous version as latest
gh release create v0.1.0 --latest \
  src-tauri/target/release/bundle/dmg/recodeck_0.1.0_universal.dmg \
  # ... other files

# Update latest.json to point to 0.1.0
# Users who haven't updated stay safe
# Users who updated will not downgrade (Tauri prevents)
```

**Note:** Tauri updater will not auto-downgrade. Users on v0.2.0 stay on v0.2.0 until v0.2.1+ is released.

### 10.3 Folder Structure for Releases

**Recommended Project Layout:**
```
RecoDeck/
├── .github/
│   └── workflows/
│       └── release.yml (CI/CD)
├── scripts/
│   ├── sync-version.js
│   ├── generate-update-manifest.js
│   ├── notarize.sh
│   └── test-update.sh
├── src-tauri/
│   ├── entitlements.plist
│   ├── tauri.conf.json (updater config)
│   ├── Cargo.toml (updater plugin)
│   └── icons/
│       └── icon.icns
├── package.json (version source of truth)
├── CHANGELOG.md
└── .gitignore (add *.key, *.p12)
```

**Release Artifacts Location (GitHub):**
```
https://github.com/YourUsername/RecoDeck/releases/tag/v0.2.0
├── recodeck_0.2.0_universal.dmg (275 MB) - User downloads this
├── recodeck.app.tar.gz (50 MB) - Auto-updater downloads this
├── recodeck.app.tar.gz.sig - Signature for verification
└── latest.json - Update manifest
```

---

## Phase 11: First Release (v0.1.0 → v1.0.0)

### 11.1 Pre-1.0 Checklist

**Before declaring production-ready:**
- [ ] All core features implemented and tested
- [ ] No critical bugs in issue tracker
- [ ] Documentation complete (README, user guide)
- [ ] Update flow tested end-to-end
- [ ] Performance acceptable on all supported macOS versions
- [ ] Code signing and notarization working smoothly
- [ ] Crash reporting implemented (optional: Sentry)
- [ ] Privacy policy published (if collecting analytics)

### 11.2 v1.0.0 Release Plan

```bash
# Major version bump
npm run version:major  # 0.1.0 → 1.0.0

# Update tauri.conf.json
# Change minimum macOS version if needed
{
  "bundle": {
    "macOS": {
      "minimumSystemVersion": "11.0"  // Big Sur+
    }
  }
}

# Create release
git commit -m "chore: release v1.0.0 - production ready"
git tag v1.0.0
git push origin main --tags
```

**Announcement Template:**
```markdown
# RecoDeck v1.0.0 - Production Release 🎉

We're excited to announce RecoDeck v1.0.0, the first stable release!

## What's New
- [Feature list]

## Download
[Download for macOS](https://github.com/YourUsername/RecoDeck/releases/download/v1.0.0/recodeck_1.0.0_universal.dmg)

**Requirements:** macOS 11.0 or later (Intel & Apple Silicon)

## Automatic Updates
RecoDeck will automatically check for updates and notify you when new versions are available.
```

---

## Phase 12: Ongoing Maintenance

### 12.1 Update Cadence Recommendations

**Patch Releases (X.Y.Z):**
- Frequency: As needed for bugs
- Release time: 1-2 days after bug fix
- Testing: Minimal (focused on fix)

**Minor Releases (X.Y.0):**
- Frequency: Every 2-4 weeks
- Release time: 1 week after feature complete
- Testing: Full regression suite

**Major Releases (X.0.0):**
- Frequency: Every 6-12 months
- Release time: 2+ weeks after feature freeze
- Testing: Extensive beta program

### 12.2 Monitoring Post-Release

**Key Metrics:**
1. Update adoption rate
   - Track via analytics (optional)
   - GitHub release download counts

2. Update failures
   - Implement error logging in updater
   - Monitor GitHub Issues for update problems

3. Platform distribution
   - Intel vs Apple Silicon usage
   - macOS version distribution

**Error Logging (Optional):**
```rust
// In src-tauri/src/main.rs
use tauri_plugin_updater::UpdaterExt;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match handle.updater().check().await {
                    Ok(Some(update)) => {
                        println!("Update available: {}", update.version);
                    }
                    Err(e) => {
                        eprintln!("Update check failed: {}", e);
                        // Send to error tracking service
                    }
                    _ => {}
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 12.3 Certificate Renewal

**Apple Certificates Expire Annually**

**3 Months Before Expiration:**
1. Log in to Apple Developer
2. Renew "Developer ID Application" certificate
3. Download new `.cer` file
4. Import to Keychain Access
5. Export as `.p12` with new password
6. Update GitHub Secrets:
   - `APPLE_CERTIFICATE` (new base64)
   - `APPLE_CERTIFICATE_PASSWORD` (new password)

**Test new certificate:**
```bash
# Build with new cert
npm run build:mac

# Verify signature
codesign -dvvv src-tauri/target/release/bundle/macos/recodeck.app
# Should show new certificate validity dates
```

---

## Implementation Timeline

**Week 1: Foundation**
- Set up version management script
- Add updater plugin to Cargo.toml
- Configure updater in tauri.conf.json
- Create npm build scripts

**Week 2: Signing & Notarization**
- Enroll in Apple Developer Program
- Generate certificates
- Create entitlements.plist
- Configure signing in tauri.conf.json
- Test manual signing and notarization

**Week 3: Update Infrastructure**
- Generate updater keypair
- Create update manifest script
- Test local update flow
- Set up GitHub repository

**Week 4: CI/CD**
- Write GitHub Actions workflow
- Add all secrets to GitHub
- Test automated release (v0.1.1)
- Verify notarization in CI

**Week 5: Testing & Polish**
- Cross-device testing (Intel + Apple Silicon)
- Update flow testing
- Create documentation
- Prepare v1.0.0 release

**Week 6: Production Release**
- Final testing
- Release v1.0.0
- Announce to users
- Monitor for issues

---

## Critical Files Summary

**Files to Create:**
1. `scripts/sync-version.js` - Version synchronization
2. `scripts/generate-update-manifest.js` - latest.json generator
3. `scripts/notarize.sh` - Notarization automation
4. `src-tauri/entitlements.plist` - macOS entitlements
5. `.github/workflows/release.yml` - CI/CD pipeline

**Files to Modify:**
1. `package.json` - Add build scripts
2. `src-tauri/tauri.conf.json` - Add updater, signing config
3. `src-tauri/Cargo.toml` - Add updater plugin
4. `.gitignore` - Exclude secrets (*.key, *.p12)

**Files to Secure:**
1. `~/.tauri/recodeck.key` - Private signing key
2. `certificate.p12` - Apple certificate export
3. GitHub Secrets - Store credentials

---

## Success Criteria

After implementation, you should be able to:

✅ Run `npm run version:patch` → auto-bumps version everywhere
✅ Run `npm run build:mac` → produces signed universal binary
✅ Push Git tag → triggers CI/CD → auto-releases to GitHub
✅ Users download DMG → drag to Applications → opens without Gatekeeper warning
✅ App checks for updates on startup
✅ New version appears in update dialog
✅ Users click "Update" → downloads, installs, restarts seamlessly
✅ All updates are cryptographically verified
✅ DMG is notarized and stapled by Apple
✅ Process works on both Intel and Apple Silicon Macs

---

## Resources & Documentation

**Official Docs:**
- Tauri Updater: https://v2.tauri.app/plugin/updater/
- Tauri macOS Signing: https://v2.tauri.app/distribute/sign/macos/
- Apple Notarization: https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution

**Tools:**
- Tauri CLI: `npm install -g @tauri-apps/cli`
- GitHub CLI: `brew install gh`
- Xcode Command Line Tools: `xcode-select --install`

**Community:**
- Tauri Discord: https://discord.gg/tauri
- GitHub Discussions: https://github.com/tauri-apps/tauri/discussions

---

## Next Steps

1. **Immediate:** Set up version management (Phase 1)
2. **This Week:** Configure updater plugin (Phase 2)
3. **Next Week:** Enroll in Apple Developer Program (Phase 3)
4. **Within 2 Weeks:** Test manual signing and notarization
5. **Within 1 Month:** Complete CI/CD setup and release v0.2.0 as test
6. **Target:** v1.0.0 production release in 6 weeks
