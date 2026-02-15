# Special Character Handling in RecoDeck

RecoDeck is designed to handle **any valid filesystem characters** in file and folder names, which is critical for DJ software where music files often have complex naming patterns.

## Supported Special Characters

RecoDeck properly handles filenames and folders containing:

### Always Supported (All Platforms)
- **Spaces**: `Artist - Track Name (Mix).mp3`
- **Commas**: `Classmatic, Mc Th - Catuca.mp3`
- **Parentheses**: `Track (Original Mix).mp3`
- **Brackets**: `Track [Label Name].mp3`
- **Ampersands**: `Artist & Artist - Track.mp3`
- **Quotes**: `Artist's "Track" Name.mp3`
- **Percent signs**: `Track 100%.mp3`
- **Plus signs**: `Artist + Artist.mp3`
- **Equals signs**: `Track=Mix.mp3`
- **Hash/Pound**: `Track #1.mp3`
- **At signs**: `Track @2024.mp3`
- **Exclamation marks**: `Track!.mp3`
- **Tildes**: `~Mix.mp3`
- **Underscores**: `Artist_Track.mp3`
- **Hyphens/Dashes**: `Artist - Track.mp3`

### Platform-Specific
- **Backslashes on macOS/Linux**: `Folder\Name` is valid (backslash is a regular character, not a path separator)
- **Forward slashes on Windows**: Converted to backslashes internally (path separator)

## How It Works

### 1. Scanner (Rust)
When scanning music folders, RecoDeck:
- Reads paths **exactly as they appear** on the filesystem
- Only performs minimal normalization:
  - Strips `file://` prefix if present
  - Collapses repeated slashes (`//` → `/`)
  - Removes trailing slash (except root)
  - On Windows only: converts `\` to `/` (path separators)
- **Preserves all other characters** exactly as-is

### 2. Database Storage
- Paths are stored with **exact character preservation**
- No encoding, escaping, or sanitization
- What's on disk = what's in database

### 3. Stream Protocol Handler (Rust)
When serving files to the player:
- URL-decodes the path from query parameter
- Applies same minimal normalization as scanner
- Has intelligent fallback logic to find files even if paths were stored incorrectly in older versions
- **Never modifies special characters** in filenames

### 4. Frontend (TypeScript)
When requesting files:
- Uses `encodeURIComponent()` to safely pass paths in URL query string
- Preserves all special characters through URL encoding
- On Windows only: normalizes backslashes to forward slashes
- On macOS/Linux: preserves backslashes as literal characters

## Examples

### Valid Filenames (All Work)
```
Artist - Track (Original Mix) [Label].mp3
Classmatic, Mc Th - Catuca (Original Mix) [Cuttin' Headz].mp3
Track "The Best" & More.mp3
100% Pure Mix.mp3
Artist + Artist = Collaboration.mp3
Folder\With\Backslashes\Track.mp3  (macOS/Linux only)
Track #1 @2024!.mp3
~Special Mix~.mp3
```

### Previously Problematic (Now Fixed)
- Folders with trailing backslashes: `Septembar\`
- Multiple special characters: `Artist, Name - Track (Mix) [2024].mp3`
- Spaces before extensions: `Track .mp3` → `Track.mp3` (auto-fixed)

## Testing

If you have music files with special characters:
1. Scan the folder containing them
2. The tracks should appear in your library
3. Double-click to play - they should load without errors

If you encounter issues:
1. Check the Tauri console for `[stream]` error messages
2. Verify the file exists at the exact path shown
3. Rescan the folder to update database paths
4. Report the issue with the exact filename/path that failed

## Technical Details

### URL Encoding
Paths are passed as query parameters: `http://stream.localhost/?p=<encoded_path>`

Example:
- Original: `/Music/Artist, Name/Track [2024].mp3`
- Encoded: `http://stream.localhost/?p=%2FMusic%2FArtist%2C%20Name%2FTrack%20%5B2024%5D.mp3`
- Backend receives: `/Music/Artist, Name/Track [2024].mp3` (decoded)

### Fallback Logic
The stream handler has multiple fallback strategies:
1. Try exact path
2. Try with space before extension removed
3. Try directory listing with fuzzy match
4. Try finding parent directories with special characters (handles old wrong paths)

This ensures maximum compatibility even with edge cases.
