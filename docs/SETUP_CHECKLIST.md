# RecoDeck Setup Checklist

Use this checklist to track your progress through the Apple Developer and GitHub setup.

---

## ☑️ Apple Developer Account

- [ ] **Enrolled in Apple Developer Program** ($99/year)
  - Link: https://developer.apple.com/programs/
  - Status: Approved ✓
  - Account email: ___________________________

- [ ] **Team ID obtained**
  - Found at: https://developer.apple.com/account/
  - Team ID (10 chars): ___________________________

---

## ☑️ Certificate Setup

- [ ] **Generated Certificate Signing Request (CSR)**
  - Location: `~/Desktop/CertificateSigningRequest.certSigningRequest`

- [ ] **Created Developer ID Certificate**
  - Type: "Developer ID Application" (NOT App Store)
  - Downloaded: `developerID_application.cer`

- [ ] **Installed certificate in Keychain**
  - Keychain Access → My Certificates
  - Found: "Developer ID Application: Your Name (TEAM_ID)"
  - Has private key: Yes ✓

- [ ] **Exported as .p12 file**
  - File: `~/Desktop/recodeck-cert.p12`
  - Password set: ___________________________
  - Password saved in: ___________________________

- [ ] **Converted to base64**
  - Command: `base64 -i ~/Desktop/recodeck-cert.p12 | pbcopy`
  - Copied to clipboard: Yes ✓

---

## ☑️ App-Specific Password

- [ ] **Created app-specific password**
  - Link: https://appleid.apple.com/
  - Label: "RecoDeck Notarization"
  - Password (xxxx-xxxx-xxxx-xxxx): ___________________________
  - Password saved in: ___________________________

---

## ☑️ GitHub Secrets (6 total)

Go to: `https://github.com/YOUR_USERNAME/RecoDeck/settings/secrets/actions`

- [ ] **APPLE_CERTIFICATE**
  - Value: Base64 string from certificate
  - Length: ~2000-4000 characters
  - Status: ✓ Added

- [ ] **APPLE_CERTIFICATE_PASSWORD**
  - Value: Password from .p12 export
  - Status: ✓ Added

- [ ] **APPLE_ID**
  - Value: Your Apple ID email
  - Example: `your.email@example.com`
  - Status: ✓ Added

- [ ] **APPLE_PASSWORD**
  - Value: App-specific password (NOT your regular password)
  - Format: `xxxx-xxxx-xxxx-xxxx`
  - Status: ✓ Added

- [ ] **APPLE_TEAM_ID**
  - Value: 10-character Team ID
  - Example: `A1B2C3D4E5`
  - Status: ✓ Added

- [ ] **TAURI_SIGNING_PRIVATE_KEY**
  - Command: `cat ~/.tauri/recodeck.key | pbcopy`
  - Length: ~200-400 characters
  - Status: ✓ Added

---

## ☑️ Configuration Updates

- [ ] **Updated src-tauri/tauri.conf.json**
  - Line 39: Changed `YOURUSERNAME` to actual GitHub username
  - URL: `https://github.com/YOUR_USERNAME/RecoDeck/...`

- [ ] **Updated scripts/generate-update-manifest.js**
  - Line ~59: Changed `YOURUSERNAME` to actual GitHub username
  - URL: `https://github.com/YOUR_USERNAME/RecoDeck/...`

- [ ] **Committed changes**
  ```bash
  git add src-tauri/tauri.conf.json scripts/generate-update-manifest.js
  git commit -m "chore: update GitHub username in configs"
  git push origin main
  ```

---

## ☑️ Test Release

- [ ] **Created test tag**
  ```bash
  git tag v0.1.1
  git push origin main --tags
  ```

- [ ] **GitHub Actions triggered**
  - Link: `https://github.com/YOUR_USERNAME/RecoDeck/actions`
  - Workflow: "Release"
  - Status: ___________________________

- [ ] **Build completed**
  - Duration: ___________ minutes
  - Status: ✓ Success / ✗ Failed

- [ ] **Notarization completed**
  - Duration: ___________ minutes
  - Status: ✓ Success / ✗ Failed

- [ ] **GitHub Release created**
  - Link: `https://github.com/YOUR_USERNAME/RecoDeck/releases/tag/v0.1.1`
  - Files attached:
    - [ ] recodeck_0.1.1_universal.dmg
    - [ ] recodeck.app.tar.gz
    - [ ] recodeck.app.tar.gz.sig
    - [ ] latest.json

---

## ☑️ Verification

- [ ] **Downloaded DMG from GitHub Release**
  ```bash
  gh release download v0.1.1
  ```

- [ ] **Verified notarization**
  ```bash
  spctl -a -vv --type install recodeck_0.1.1_universal.dmg
  ```
  - Expected: "accepted"
  - Status: ___________________________

- [ ] **Tested installation**
  - Opened DMG: Yes / No
  - Gatekeeper warning: Yes / No (should be No)
  - App installed: Yes / No
  - App launches: Yes / No

---

## ☑️ Cleanup

- [ ] **Removed sensitive files from Desktop**
  ```bash
  rm ~/Desktop/recodeck-cert.p12
  rm ~/Desktop/CertificateSigningRequest.certSigningRequest
  rm ~/Downloads/developerID_application.cer
  ```

- [ ] **Backed up certificate**
  - Stored .p12 in: ___________________________
  - Password documented in: ___________________________

- [ ] **Documented credentials**
  - Apple ID: ___________________________
  - Team ID: ___________________________
  - App-specific password saved: Yes / No
  - Certificate password saved: Yes / No

---

## 📋 Final Status

**Setup Complete:** Yes / No

**Date Completed:** ___________________________

**Next Steps:**
- [ ] Create first production release (v1.0.0)
- [ ] Test auto-update flow
- [ ] Document release process for team
- [ ] Set calendar reminder for certificate renewal

---

## 🎯 Quick Test Commands

After setup is complete, test the system:

```bash
# 1. Version bump
npm run version:patch

# 2. Push tag
VERSION=$(node -p "require('./package.json').version")
git tag "v$VERSION"
git push origin main --tags

# 3. Monitor
# Go to: https://github.com/YOUR_USERNAME/RecoDeck/actions

# 4. Verify release
# Go to: https://github.com/YOUR_USERNAME/RecoDeck/releases
```

---

## 📞 Support Contacts

**Apple Developer Support:**
- https://developer.apple.com/support/

**GitHub Support:**
- https://support.github.com/

**Tauri Discord:**
- https://discord.gg/tauri

---

## 📅 Renewal Reminders

**Apple Developer Membership:**
- Enrolled: ___________________________
- Renews: ___________________________ (1 year from enrollment)
- Cost: $99/year

**Developer ID Certificate:**
- Created: ___________________________
- Expires: ___________________________ (1 year from creation)
- Renewal: Export new certificate 3 months before expiry

**Set Calendar Reminders:**
- [ ] 3 months before certificate expiry
- [ ] 1 month before membership renewal

---

## ✅ Success Criteria

You know the setup is complete when:

- ✅ All 6 GitHub Secrets are configured
- ✅ Test release (v0.1.1) built successfully
- ✅ DMG is notarized (no Gatekeeper warnings)
- ✅ App installs and runs on macOS
- ✅ Update files are attached to GitHub Release
- ✅ No errors in GitHub Actions logs

**Status: READY FOR PRODUCTION** 🚀

---

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| "Certificate not found" | Re-export .p12, ensure it includes private key |
| "Invalid credentials" | Double-check APPLE_ID and APPLE_PASSWORD |
| "Password incorrect" | Verify APPLE_CERTIFICATE_PASSWORD matches .p12 password |
| "Team ID invalid" | Check it's exactly 10 characters from developer.apple.com |
| "Notarization timeout" | Normal - can take 2-30 minutes, wait longer |
| "Build failed" | Check GitHub Actions logs for specific error |

---

**Last Updated:** ___________________________
**Reviewed By:** ___________________________
