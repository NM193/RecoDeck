#!/bin/bash
set -e

DMG_PATH="$1"
BUNDLE_ID="com.nemanjamarjanovic.recodeck"

if [ -z "$DMG_PATH" ]; then
  echo "Usage: ./notarize.sh <path-to-dmg>"
  exit 1
fi

if [ ! -f "$DMG_PATH" ]; then
  echo "Error: DMG file not found: $DMG_PATH"
  exit 1
fi

# Check for required environment variables
if [ -z "$APPLE_ID" ] || [ -z "$APPLE_PASSWORD" ] || [ -z "$APPLE_TEAM_ID" ]; then
  echo "Error: Missing required environment variables"
  echo "Please set the following:"
  echo "  - APPLE_ID: Your Apple ID email"
  echo "  - APPLE_PASSWORD: App-specific password from appleid.apple.com"
  echo "  - APPLE_TEAM_ID: Your 10-character Team ID"
  exit 1
fi

echo "📦 Submitting $DMG_PATH for notarization..."
echo "   Bundle ID: $BUNDLE_ID"
echo "   Apple ID: $APPLE_ID"
echo "   Team ID: $APPLE_TEAM_ID"
echo ""

# Submit to Apple for notarization
xcrun notarytool submit "$DMG_PATH" \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait

if [ $? -eq 0 ]; then
  echo ""
  echo "✓ Notarization complete"

  # Staple the notarization ticket to the DMG
  echo "📌 Stapling notarization ticket..."
  xcrun stapler staple "$DMG_PATH"

  if [ $? -eq 0 ]; then
    echo ""
    echo "✅ DMG is notarized and stapled"
    echo "   File: $DMG_PATH"
  else
    echo "⚠️  Notarization succeeded but stapling failed"
    echo "   The DMG is still notarized but users may need internet to verify"
  fi
else
  echo ""
  echo "❌ Notarization failed"
  exit 1
fi
