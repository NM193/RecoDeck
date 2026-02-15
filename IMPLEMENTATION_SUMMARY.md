# Folder-Scoped Track Views - Implementation Summary

## Completed: 2026-02-10

### Overview
Implemented shallow (non-recursive) folder queries so that:
- **All Tracks** shows all imported tracks from all library folders
- **Library root folders** show all tracks recursively (including nested subfolders)
- **Nested subfolders** show only direct tracks (non-recursive, shallow)
- **Playlists** remain unchanged (folders expand/collapse, selecting a playlist shows its tracks)

---

## Changes Made

### 1. Database Layer (`src-tauri/src/db/mod.rs`)

Added two new methods for shallow folder queries:

- `count_tracks_in_folder_shallow(folder_path: &str) -> Result<i64>`
  - Counts tracks directly in a folder (non-recursive)
  - SQL uses `instr(substr(file_path, length(prefix) + 1), '/') = 0` to ensure no nested paths

- `get_tracks_in_folder_shallow_with_analysis(folder_path: &str) -> Result<Vec<...>>`
  - Returns tracks directly in a folder with BPM/key analysis data
  - Same shallow SQL predicate as count method

Added 3 unit tests:
- `test_count_tracks_in_folder_shallow` - verifies shallow vs recursive counts
- `test_get_tracks_in_folder_shallow` - verifies shallow track retrieval
- `test_shallow_folder_with_trailing_slash` - verifies path normalization

### 2. Tauri Commands (`src-tauri/src/commands/library.rs`)

Added two new Tauri commands:
- `get_tracks_in_folder_shallow(path: String) -> Result<Vec<TrackDTO>, String>`
- `count_tracks_in_folder_shallow(path: String) -> Result<i64, String>`

Updated existing command:
- `list_subdirectories` - now uses `count_tracks_in_folder_shallow` instead of recursive count
  - This ensures folder node counts match what you see when clicking that subfolder

### 3. Command Registration (`src-tauri/src/lib.rs`)

Registered new commands in `generate_handler!`:
- `commands::library::get_tracks_in_folder_shallow`
- `commands::library::count_tracks_in_folder_shallow`

### 4. Frontend API Wrapper (`src/lib/tauri-api.ts`)

Added two new API methods:
- `getTracksInFolderShallow(path: string): Promise<Track[]>`
- `countTracksInFolderShallow(path: string): Promise<number>`

### 5. Frontend Logic (`src/App.tsx`)

Updated `loadTracks` callback:
- Added logic to check if selected folder is a library root folder
- Uses recursive query (`getTracksInFolder`) for root folders
- Uses shallow query (`getTracksInFolderShallow`) for subfolders
- Added `libraryFolders` to dependency array for proper memoization

```typescript
// Use recursive query for library root folders, shallow for subfolders
const isRootFolder = libraryFolders.includes(folder);
result = isRootFolder
  ? await tauriApi.getTracksInFolder(folder)
  : await tauriApi.getTracksInFolderShallow(folder);
```

---

## Validation

### TypeScript Compilation
✅ `npx tsc --noEmit` passes with no errors

### Expected Behavior

When you run the app and scan a library folder with nested structure like:
```
/Music/
  A.mp3
  /Subfolder1/
    B.mp3
    /Deep/
      C.mp3
```

**Clicking "All Tracks":**
- Shows: A.mp3, B.mp3, C.mp3 (all tracks)

**Clicking "/Music" (root folder):**
- Shows: A.mp3, B.mp3, C.mp3 (recursive, all tracks under root)
- Folder count next to "/Music" badge shows 3

**Clicking "/Music/Subfolder1" (nested folder):**
- Shows: B.mp3 ONLY (shallow, direct tracks only)
- Folder count next to "Subfolder1" badge shows 1 (matches what you see)

**Clicking "/Music/Subfolder1/Deep" (deeper nested folder):**
- Shows: C.mp3 ONLY (shallow, direct tracks only)
- Folder count next to "Deep" badge shows 1

---

## SQL Implementation Details

### Shallow Query Predicate
```sql
WHERE file_path LIKE '{folder}/%'
AND instr(substr(file_path, length('{folder}/') + 1), '/') = 0
```

**How it works:**
1. `file_path LIKE '{folder}/%'` - matches all tracks starting with the folder path
2. `substr(file_path, length('{folder}/') + 1)` - extracts the remainder after the folder prefix
3. `instr(..., '/') = 0` - ensures the remainder contains no slash (i.e., not in a subfolder)

**Example:**
- Folder: `/Root/Sub`
- Prefix: `/Root/Sub/`
- Track: `/Root/Sub/B.mp3` → remainder: `B.mp3` → no slash ✅ included
- Track: `/Root/Sub/Deep/C.mp3` → remainder: `Deep/C.mp3` → has slash ❌ excluded

---

## Code Quality

- ✅ All changes follow existing code patterns
- ✅ Parameterized SQL queries (no SQL injection risk)
- ✅ Proper error handling with `.map_err()`
- ✅ Type-safe Rust → TypeScript DTOs
- ✅ Unit tests added for new functionality
- ✅ TypeScript compiles without errors
- ✅ Comments added explaining shallow vs recursive behavior

---

## Next Steps

1. Run the app: `npm run tauri dev`
2. Scan a folder with nested subfolders
3. Verify the behavior matches the expected behavior above
4. If all looks good, update PROGRESS.md with completion notes

---

*Implementation completed following the plan in `.cursor/plans/folder-scoped_track_views_8a18cce4.plan.md`*
