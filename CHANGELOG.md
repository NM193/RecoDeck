# Changelog

All notable changes to RecoDeck will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.11] - 2026-03-14

### Fixed
- Regenerated update signing keys for reliable auto-updates
- Install button now directly downloads and installs updates

## [0.2.10] - 2026-03-14

### Fixed
- Install button now directly downloads and installs the update instead of navigating to Settings

## [0.2.9] - 2026-03-14

### Added
- Improved update notification reliability

### Fixed
- Minor stability improvements

## [0.2.8] - 2026-03-14

### Added
- Test update to verify auto-update flow

### Fixed
- Download links in README now point to latest release

## [0.2.7] - 2026-03-14

### Added
- Automatic update notifications — app checks for updates on launch and shows a toast
- "What's New" modal with categorized sections (New / Fixed / Changes) after updating
- Windows auto-update support (NSIS installer with signed updates)

### Changed
- Update toast shows Install / Later buttons instead of redirecting to GitHub
- Release pipeline now builds both macOS and Windows in parallel

### Fixed
- Fresh installs no longer show an empty What's New modal
- Windows updater now finds platform in latest.json

## [0.2.5] - 2026-03-06

### Added
- Waveform visualizer in the Now Playing bar
- Crossfade between tracks with adjustable duration
- "What's New" dialog on startup after updates
- Redesigned Settings with organized sections

### Changed
- More accurate key detection — re-analyze tracks to benefit
- Improved BPM detection accuracy
- Better harmonic mixing compatibility scoring

### Fixed
- Track table now fills full window width at any size

## [0.2.4] - 2026-02-16

### Added
- **Mini Player** – compact floating player view (`#mini-player`)
- **Mobile Companion** – stream music to your phone via QR code (Settings → Companion)
- Mobile companion server with token-based auth and streaming

### Changed
- Updated icons and app branding
- Improved Settings UI and organization

## [0.2.3] - 2026-02-15

### Changed
- Release workflow now uses version from Git tag for correct latest.json
- Hidden AI button until AI assistant is ready

## [0.2.2] - 2026-02-15

### Fixed
- Version sync in release builds

## [0.2.1] - 2026-02-15

### Added
- **About** tab in Settings with app version and **Check for Updates** button
- Automatic update check on app startup (checks for new versions from GitHub Releases)
- Manual "Check for Updates" so users can trigger update check anytime

### Fixed
- Update notification permissions (updater:allow-check, process:allow-restart)

## [0.2.0] - 2026-02-15

### Added
- Automatic update system for macOS
- Version synchronization across package.json, tauri.conf.json, and Cargo.toml

### Changed
- Improved build and release workflow

## [0.1.0] - 2026-02-15

### Added
- Initial release
- DJ music library management
- Audio analysis (BPM, key detection)
- Playlist management
- AI-powered features
- File watcher for automatic library updates

[Unreleased]: https://github.com/NM193/RecoDeck/compare/v0.2.11...HEAD
[0.2.11]: https://github.com/NM193/RecoDeck/compare/v0.2.10...v0.2.11
[0.2.10]: https://github.com/NM193/RecoDeck/compare/v0.2.9...v0.2.10
[0.2.9]: https://github.com/NM193/RecoDeck/compare/v0.2.8...v0.2.9
[0.2.8]: https://github.com/NM193/RecoDeck/compare/v0.2.7...v0.2.8
[0.2.7]: https://github.com/NM193/RecoDeck/compare/v0.2.5...v0.2.7
[0.2.5]: https://github.com/NM193/RecoDeck/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/NM193/RecoDeck/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/NM193/RecoDeck/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/NM193/RecoDeck/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/NM193/RecoDeck/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/NM193/RecoDeck/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/NM193/RecoDeck/releases/tag/v0.1.0
