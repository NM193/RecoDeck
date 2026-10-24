# Changelog

All notable changes to RecoDeck will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.11.1] - 2026-10-24

### Fixed
- With crossfade on, the next track no longer stops for a few seconds when the previous one ends

### Changed
- After a crossfade the next track keeps the tempo it was matched to until it ends, and the next crossfade matches that tempo. Tracks more than 8% apart in tempo (half and double time count, as with Master BPM) crossfade without tempo matching

## [0.11.0] - 2026-10-21

### Added
- **Better BPM and key detection**: BPM lands on the track's real tempo instead of one or two above it, and keys are read from the harmony of the music, so far fewer come out wrong. Each track also remembers where its first beat falls
- Once after this update, RecoDeck offers to re-analyze the tracks an older version analyzed, and says about how long it takes. You can keep using the app while it runs. Settings › Database › Re-analyze does the same at any time and says how many tracks still need it
- The key written in a file's tags is read on import, like its BPM

### Changed
- Analysis skips tracks the current version already analyzed. Analyze from a track's or a folder's menu still analyzes again
- Long files (DJ sets, mixes) take half the memory to analyze, and only one is analyzed at a time
- RecoDeck keeps macOS from slowing it down while an analysis runs with the window hidden

### Fixed
- Cancel shows at once and stops the analysis between a track's BPM and key
- Some MP3 files with a damaged tag at the start could not be analyzed
- A damaged spot in a file no longer shifts the beats after it
- A file that reports a wrong length can no longer crash RecoDeck during analysis
- A file that could not be read (no permission, a drive that dropped out) is tried again next time instead of being marked as analyzed
- Re-analyze can't be started twice

## [0.10.0] - 2026-10-16

### Added
- **Missing files** — Review Missing Files (Settings › Database) lists the tracks whose file was moved, renamed or deleted, with their count on the button. For each one: Relink to a same-name file found in your folders (playlists, plays, analysis and rating stay), Merge into the track that already has that file, Leave, or Remove. Locate… picks a file yourself, and Search another folder… looks outside your library and offers to add that folder
- A rescan follows moved files on its own: a file whose content matches a track that lost its file takes that track's place, with its playlists and plays ("Followed N moved files")
- **Share links for one playlist** — Share playlist now makes a link that opens that playlist only, for 24 hours, 7 days or 30 days, with Copy link. Settings › Mobile Companion lists every shared playlist, and Stop sharing ends a link at once; on the phone a stopped or expired link says so

### Changed
- The choices in Review Duplicate Tracks and Review Missing Files explain themselves in tooltips
- A file with damaged tags is imported (its title comes from the file name) instead of failing on every scan
- A copy that matches only by title and artist joins its song's duplicate group right away
- Playlist counts, Home and the play queue follow merges, removed tracks and relinked files

### Fixed
- **Security:** a shared playlist link carried the key to your whole library. Links shared before 0.10.0 still do until you press Regenerate Token in Settings › Mobile Companion
- **Security:** the shared playlist page could run code from a crafted link
- Removing a library folder removes its tracks completely; it used to stop half way
- Messages after Merge or Apply were hidden behind the window they came from
- Search another folder… never offers to add a folder that holds your library (such as your home folder)

## [0.9.0] - 2026-10-15

### Added
- **Merge duplicates** — Review Duplicate Tracks (Settings › Database) now merges copies instead of deleting them: in each group you keep one copy, and the others hand it their playlist places, plays, tags, ratings, cue points and analysis, so nothing drops out of a playlist. The app recommends which copy to keep and says why (a copy whose file is on disk first, then lossless, bitrate, analyzed, playlists, plays)
- Merged copies' files are skipped on future scans, so they don't come back; tick "Also move removed files to Trash" to clear them off the disk too (a file another track still uses is never moved)

### Changed
- The Duplicate Tracks window is wider and easier to read: each copy is one row showing only what differs from the others, with one Keep · Merge · Leave choice, and only the groups on the selected tab are merged

## [0.8.0] - 2026-10-13

### Added
- **Master BPM** — a BPM button in the player bar sets one tempo every track plays at, so you can hear how tracks sit at the tempo of the set you are planning; the pitch stays the same, a track is sped up or slowed down by at most 8%, and the button shows the tempo while it is on

### Changed
- The playlist list reloads when you come back to the window, so changes made outside the app show up on their own

### Fixed
- Searching "Artist – Title" now finds the track: every word has to match, in any field, instead of the whole text matching one field

## [0.7.0] - 2026-10-10

### Changed
- The highlight under the pointer slides from one item to the next in the track tables, lists, the sidebar, menus and dropdowns instead of jumping
- Resting on a card pops its play button up
- The player's buttons spring when you rest on them and press them, play and pause turn into each other, and the progress bar thickens under the pointer
- The stars of a rating light up in a wave
- Primary buttons have a gradient that flows when you rest on them
- Tooltips are the app's own: they show sooner, slide from one button to the next, and show a button's keyboard shortcut in chips
- The open playlist in the sidebar sits on a translucent accent instead of a solid one

## [0.6.0] - 2026-10-10

### Added
- **Export to DJ software** — right-click a playlist or a playlist folder, choose Export to DJ software…, check the playlists, and RecoDeck writes them for Rekordbox or Traktor with their tracks' BPM, key, rating, genre and comments; it remembers the playlists and the file for each program and opens on the one you used last, so exporting again is one click

## [0.5.2] - 2026-10-09

### Changed
- Sets' tabs are one bar, as on a DJ page: the selected tab sits on a highlight that glides to the tab you choose, and the arrow keys move between them
- Going between Home and Sets fades like every other page

### Fixed
- When a part of the app fails to draw, it says so in its place instead of leaving a blank window: a Home card shows the error in the card, a page offers Try again while the sidebar and the player keep working, and the whole window offers Reload and Copy error

## [0.5.1] - 2026-10-09

### Added
- **Change cover** — give a playlist an image of its own: rest on the playlist's header and choose Change cover; the image shows on the header, on Home and in Search, and Remove cover brings back the playlist's colours

### Changed
- A DJ page's tabs are one bar, and the selected tab sits on a highlight that glides to the tab you choose

### Fixed
- The track tables leave a little room between the column heads and the first row

## [0.5.0] - 2026-10-09

### Added
- **A new look across the app** — the sidebar, the track tables, Search, Home and Sets are redesigned, with the same buttons, menus, notifications and movement everywhere
- **Home** is a grid of cards you arrange with Customize: what's playing, Needs you (new likes you don't own, new sets, tracks not analyzed, the next gig of a DJ you follow), recently played and added, Last playlist, Your DJs and their upcoming gigs, BPM & key, Library stats, genres, New sets and Sets you saved lately
- **Search** shows sections before you type — recent searches, tracks played and added lately, your DJs, your genres — which you can reorder and hide in Customize; while results show, only the rows scroll
- **Track tables**: choose, order and resize the columns (Label, Added, Plays and more), artwork thumbnails, an equalizer on the track playing, a Filter panel (BPM, key, genre, rating, played or never played) and a count of what is shown
- Select several tracks (click, ⌘-click, Shift-click, ⌘A, ↑ ↓) and act on all of them from the right-click menu — add to or delete from a playlist, set or clear the genre, Move to folder — each with Undo
- **Move to folder** moves the files into any library folder (the list can be searched), and the track playing and the queue keep up
- **Drag and drop**: drag tracks onto a playlist or a library folder in the sidebar, or reorder a playlist by dragging; a closed folder opens when you rest on it
- **Sets** opens on your library: one box for a link, your sets and the tracks in them, or a YouTube search; new sets from the DJs you watch; your sets as cards. Each set has a page of its own, with a strip of its tracks and a filter for what you own, what is missing and the IDs
- The set video keeps playing in a bar above the player when you leave the set, with ⏮ ⏭ between its tracks
- **Following**: watch DJs and follow channels from one box, check one of them now, and see what each check found; Saved tracks open their set at the track; Stats as four cards
- **Keyboard shortcuts**: Space plays or pauses whichever played last, your track or the set; ⌘→ / ⌘← next and previous; ⌘K Search; ⌘F the page's search box; ⌘/ lists them all (Ctrl on Windows)
- Removing a heart from a saved track has an Undo that puts it back in its place

### Changed
- One kind of notification: toasts at the bottom, above the player, with Undo where an action can be put back; errors stay until you close them
- Menus are the same everywhere; deleting a playlist or removing a set asks in the menu itself instead of a system dialog
- The sidebar's section headers stay in view and each long list scrolls inside; the collapsed sidebar opens a section beside it
- Buttons look and behave the same on every page; a button that starts work shows a spinner and what it is doing ("Saving…", "Scanning…")
- A list that is still loading shows grey rows instead of a blank area, only when loading takes a moment
- Movement is quicker and the same everywhere, and follows the system's Reduce motion setting
- In the light Dawn theme buttons are light grey on white instead of white on white

### Fixed
- Error messages say what went wrong instead of "[object Object]"
- A playlist opens in its own order, and a third click on a column head goes back to it
- Search finds playlists made by the AI assistant too, and the player's Add to playlist offers them
- Home's Last playlist stays quick with a long playlist: it shows the first 100 tracks, with "and 1,900 more · Open the playlist" under them, and playing from it still queues the whole playlist

## [0.4.1] - 2026-10-03

### Changed
- On a DJ page the hero and the tabs stay put while the page under them scrolls; on Tracks and Plays the count, search, chips and column heads stay put too, and only the rows move
- The Overview's Tracks card lists every track, not just the first few; the Tracks and Gigs cards keep their height and scroll inside, so the wheel moves the card and not the page

### Fixed
- DJ pages open again on a library whose DJ table came from an earlier build, instead of failing with "no such column"
- The DJ's photo stands whole beside the name over a blurred copy, instead of a slice of a face stretched across the band
- The ⋯ menu on a DJ page opens below the hero again
- What they play keeps its count beside the status, instead of running under it

## [0.4.0] - 2026-10-03

### Added
- **Spotify** — connect your Spotify account and see every track in Liked Songs and your playlists marked Owned, Maybe or Missing against your library
- New likes since you last looked are counted in the sidebar, so tracks liked in the car are not forgotten again
- Each missing track is one click from SelectedRecs, a YouTube search, or your clipboard; play any track on your Spotify device
- Answer Yes or No on a Maybe once, and RecoDeck remembers it
- **YouTube Music** — sign in with your own Google client and see your Liked music checked against your library the same way
- Add any YouTube or YouTube Music playlist by its link — yours, private ones included, or anyone else's — and remove it with a right-click
- DJ sets among your likes are kept apart in a Sets group you open when you want, each one click from the Sets section
- **DJ pages** — one page per DJ: where they play next (Resident Advisor), what they released (Spotify), what they keep playing in your saved sets, and which of it you still miss
- Find DJs in Search, and open a DJ's page from any name in a set's lineup
- A customizable Overview on every DJ page: choose and arrange its cards
- **Show in sidebar** switches for Spotify and YouTube Music: hide a section without signing out
- **Collapsible sidebar** — icons only by hand or by itself on a narrow window, with a colour per section so you always see where you are

### Changed
- Sets reads a tracklist typed in the YouTube app, and no longer guesses track IDs from remarks in the comments
- Open in Sets fetches a set that was never stored, as a pasted link would

## [0.3.0] - 2026-09-08

### Added
- **Sets** — a new section under Home that reads the tracklist of any DJ set on YouTube and tells you which tracks you already own
- Paste a set link and get the full tracklist, with each track marked as in your library or missing, and agreement counts showing how many people typed the same thing
- Play your own file straight from a row, or press play on a track to jump the video to that moment
- The video plays inside the app, above the tracklist, and collapses to a small bar that keeps playing while you browse
- A library of every set you have opened — reopening one costs nothing and never touches your quota again
- Heart any track to collect it across sets, with links to Beatport, Discogs, Bandcamp and Spotify, and a button to copy the whole list
- Search every track in every set you have stored, to answer "where did I hear this?"
- Statistics: your most played labels, artists and the sets they came from
- Follow a channel — Cercle, Boiler Room, Mixmag — and see when a new set appears
- **Watch a DJ by name** and be told when a set of theirs turns up anywhere, not just on the channels you follow
- Automatic checking on a schedule you choose per channel and per DJ — daily, weekly, or never
- Optionally have a watched DJ's new sets fetched and stored for you, without being asked
- Your library of sets is filed under the DJ who played, not the channel that hosted it
- Bring your own YouTube API key in Settings, with a quota bar and a countdown to the daily reset
- The set strip carries the tempo of every record you own, so two hours of a set show their shape rather than a row of equal blocks
- The track that is playing is marked in the list and in the strip, with a bar underneath for winding through that one record
- Search results say whether a set actually holds a tracklist before you spend anything opening it
- "Look again" refetches a set — a tracklist somebody posted since is only in a fresh copy
- A track with no timestamp of its own points at another set that does know where it sits, at no cost
- Settings is a contents list: eight sections collapsed behind their headings, each saying what is inside

### Changed
- Every action that spends YouTube quota says what it costs before you click, and refuses when there is not enough left
- Nothing checks or fetches anything on its own until you switch it on — new channels and DJs start at "Never"
- Typing a DJ's name into the Follow box no longer spends 100 units resolving the wrong thing — it offers to watch them as a DJ instead

### Fixed
- A tracklist written as a numbered list with no timestamps is now read properly, instead of being ignored in favour of a stray comment
- A remix is no longer offered as the record you own when both name a different version
- A track is no longer matched on its title alone — dozens of records are called "Lost" or "Jolene"
- Someone narrating a set in the comments with timestamps is no longer mistaken for a tracklist
- Library matching now looks at your whole library rather than only the folder on screen
- Every set by one DJ is filed under one heading — "Hot Since 82 House Set" and "Hot Since 82" were two acts, and a compilation's title was read as the artist
- Automatic import no longer files a set that turned out to have no tracklist at all
- A misspelled DJ name no longer silently discards every genuine result
- The What's New window scrolls, instead of pushing its own button off the screen
- The Sets icon in the sidebar is no longer the playlists icon

## [0.2.14] - 2026-03-15

### Added
- 10-band graphic equalizer with 6 presets (Flat, Bass Boost, Treble Boost, Vocal, Electronic, Headphones)
- EQ settings persist across app restarts

### Changed
- All tracks now load at once on startup — no more paginated scrolling or "Scroll for more" prompts
- Track table footer shows clean "{count} tracks · sorted by {field}" display

### Fixed
- Sorting now operates on the full library immediately instead of a partial page

## [0.2.13] - 2026-03-15

### Fixed
- macOS auto-update now works (platform was missing from update manifest)

## [0.2.12] - 2026-03-15

### Added
- Testing auto-update flow end to end

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

[Unreleased]: https://github.com/NM193/RecoDeck/compare/v0.2.14...HEAD
[0.2.14]: https://github.com/NM193/RecoDeck/compare/v0.2.13...v0.2.14
[0.2.13]: https://github.com/NM193/RecoDeck/compare/v0.2.12...v0.2.13
[0.2.12]: https://github.com/NM193/RecoDeck/compare/v0.2.11...v0.2.12
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
