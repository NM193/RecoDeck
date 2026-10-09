// Moving tracks into another library folder (track table spec, Move to
// folder): each file moves on disk, keeping its name, and only the track's
// file_path changes — its id, and with it its analysis, history, playlists
// and cues, stay. The database lock is taken per file and never held during a
// copy: almost every database command runs on the main thread, so a long hold
// would freeze the window. Every move checks the name is free and renames
// under that lock, so two moves at once never replace each other's files
// (a rename replaces an existing file, on macOS even one whose name differs
// only in case).

use crate::commands::library::{assert_within_library_roots, library_roots, AppState};
use crate::db::Database;
use crate::error::AppError;
use serde::Serialize;
use std::collections::HashMap;
use std::ffi::OsString;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;

/// Added to a file's name while it is copied across disks. The name then has
/// no audio extension, so the watcher and the scanner pass it over.
const MOVING_SUFFIX: &str = ".recodeck-moving";

/// Where files moved this session went, old path → new. The player may ask
/// for a moved file by its old path: a track it loads while a move runs, or
/// the one it streams as its original goes. The stream handler follows.
static MOVED: LazyLock<Mutex<HashMap<String, String>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

fn record_move(old: &str, new: &str) {
    if let Ok(mut moved) = MOVED.lock() {
        // Moved back (Undo): the old path holds the file again.
        moved.remove(new);
        moved.insert(old.to_string(), new.to_string());
    }
}

/// Where the file once at `old` is now, following moves after moves; None
/// when it never moved this session or is gone.
pub fn moved_to(old: &str) -> Option<String> {
    let moved = MOVED.lock().ok()?;
    let mut path = moved.get(old)?;
    // A few hops at most; the bound only guards against a cycle.
    for _ in 0..16 {
        if Path::new(path).is_file() {
            return Some(path.clone());
        }
        path = moved.get(path)?;
    }
    None
}

/// A folder of the library: its path as tracks store it, and a label such
/// as "Music / House / Deep".
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct LibraryFolder {
    pub path: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MovedTrack {
    pub id: i64,
    pub new_path: String,
}

/// Why a track was not moved.
#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SkipReason {
    /// Its file is in that folder already.
    AlreadyThere,
    /// A file with its name is in that folder.
    NameTaken,
    /// Its file is not on disk (or the track is gone).
    Missing,
    /// The disk or the database refused; the file stays where it was.
    Failed,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct SkippedTrack {
    pub id: i64,
    pub reason: SkipReason,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
pub struct MoveReport {
    pub moved: Vec<MovedTrack>,
    pub skipped: Vec<SkippedTrack>,
}

/// A path as tracks store it: forward slashes on Windows too (as the scanner
/// stores them).
fn stored_path(path: &Path) -> String {
    let text = path.to_string_lossy().into_owned();
    if cfg!(windows) {
        text.replace('\\', "/")
    } else {
        text
    }
}

/// Every folder of the library, the roots included, hidden folders left out,
/// sorted by label. A linked folder that leads outside the library is left
/// out too: a move refuses it.
pub fn library_folders(roots: &[String]) -> Vec<LibraryFolder> {
    let canonical_roots: Vec<PathBuf> = roots.iter().filter_map(|root| fs::canonicalize(root).ok()).collect();
    // Only a link can lead out; what is under a root or a link kept is inside.
    let inside = |path: &Path| {
        fs::canonicalize(path).is_ok_and(|path| canonical_roots.iter().any(|root| path.starts_with(root)))
    };
    let mut folders = Vec::new();
    for root in roots {
        let root_path = Path::new(root);
        if !root_path.is_dir() {
            continue;
        }
        let root_name = root_path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| root.clone());
        let walk = WalkDir::new(root_path)
            .follow_links(true)
            .into_iter()
            .filter_entry(|e| {
                e.depth() == 0
                    || (!e.file_name().to_string_lossy().starts_with('.')
                        && (!e.path_is_symlink() || inside(e.path())))
            });
        for entry in walk.filter_map(Result::ok).filter(|e| e.file_type().is_dir()) {
            let mut label = root_name.clone();
            if let Ok(relative) = entry.path().strip_prefix(root_path) {
                for part in relative.components() {
                    label.push_str(" / ");
                    label.push_str(&part.as_os_str().to_string_lossy());
                }
            }
            folders.push(LibraryFolder { path: stored_path(entry.path()), label });
        }
    }
    folders.sort_by_key(|folder| folder.label.to_lowercase());
    folders
}

/// The temporary name of a file being copied across disks.
fn moving_path(target: &Path) -> PathBuf {
    let mut name: OsString = target.file_name().unwrap_or_default().to_os_string();
    name.push(MOVING_SUFFIX);
    target.with_file_name(name)
}

fn same_folder(a: &Path, b: &Path) -> bool {
    match (fs::canonicalize(a), fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

/// Runs `write` on the database, under its lock.
fn with_db<T>(db: &Mutex<Option<Database>>, write: impl FnOnce(&Database) -> Option<T>) -> Option<T> {
    let guard = db.lock().ok()?;
    write(guard.as_ref()?)
}

/// Moves each track's file into `folder`, keeping its name. `tracks` are ids
/// with their stored paths (None: the track is gone).
pub fn move_tracks(
    db: &Mutex<Option<Database>>,
    tracks: &[(i64, Option<String>)],
    folder: &Path,
) -> MoveReport {
    let mut report = MoveReport::default();
    for (id, path) in tracks {
        let result = match path {
            Some(path) => move_one(db, *id, Path::new(path), folder, true),
            None => Err(SkipReason::Missing),
        };
        match result {
            Ok(new_path) => report.moved.push(MovedTrack { id: *id, new_path }),
            Err(reason) => report.skipped.push(SkippedTrack { id: *id, reason }),
        }
    }
    report
}

/// One file. On the same disk: check its name is free, rename it into place
/// and update its path, all under the lock, and rename it back if the update
/// fails. Across disks (or with `try_rename` false): copy it, outside the lock.
fn move_one(
    db: &Mutex<Option<Database>>,
    id: i64,
    source: &Path,
    folder: &Path,
    try_rename: bool,
) -> Result<String, SkipReason> {
    if !source.is_file() {
        return Err(SkipReason::Missing);
    }
    let name = source.file_name().ok_or(SkipReason::Failed)?;
    if source.parent().is_some_and(|parent| same_folder(parent, folder)) {
        return Err(SkipReason::AlreadyThere);
    }
    let target = folder.join(name);
    // Checked again under the lock; here it spares a copy that could not land.
    if target.exists() {
        return Err(SkipReason::NameTaken);
    }
    let old_path = stored_path(source);
    let new_path = stored_path(&target);

    if try_rename {
        let renamed = with_db(db, |db| {
            if target.exists() {
                return Some(Err(SkipReason::NameTaken));
            }
            Some(match fs::rename(source, &target) {
                Ok(()) => {
                    if db.set_track_file_path(id, &new_path).is_ok() {
                        record_move(&old_path, &new_path);
                        Ok(true)
                    } else {
                        let _ = fs::rename(&target, source);
                        Err(SkipReason::Failed)
                    }
                }
                // Another disk: copy below, once the lock is released.
                Err(e) if e.kind() == io::ErrorKind::CrossesDevices => Ok(false),
                Err(_) => Err(SkipReason::Failed),
            })
        })
        .unwrap_or(Err(SkipReason::Failed))?;
        if renamed {
            return Ok(new_path);
        }
    }
    copy_across(db, id, source, &target, &old_path, &new_path)
}

/// Across disks: copy to a temporary name, write it through to the disk and
/// check its size, outside the lock; then, under the lock, give it its name,
/// update the path and delete the original. If anything fails, the copy goes
/// and the original stays, keeping its path.
fn copy_across(
    db: &Mutex<Option<Database>>,
    id: i64,
    source: &Path,
    target: &Path,
    old_path: &str,
    new_path: &str,
) -> Result<String, SkipReason> {
    let temp = moving_path(target);
    let size = fs::metadata(source).map(|m| m.len()).map_err(|_| SkipReason::Failed)?;
    if fs::copy(source, &temp).ok() != Some(size) || !written_through(&temp) {
        let _ = fs::remove_file(&temp);
        return Err(SkipReason::Failed);
    }
    let placed = with_db(db, |db| {
        if target.exists() {
            return Some(Err(SkipReason::NameTaken));
        }
        if fs::rename(&temp, target).is_err() {
            return Some(Err(SkipReason::Failed));
        }
        if db.set_track_file_path(id, new_path).is_err() {
            let _ = fs::remove_file(target);
            return Some(Err(SkipReason::Failed));
        }
        // The original goes last. If it will not, the track keeps it and the
        // copy goes (unless the path will not go back: then the track keeps
        // the copy, and the original stays as a duplicate a scan passes over).
        if fs::remove_file(source).is_err() && db.set_track_file_path(id, old_path).is_ok() {
            let _ = fs::remove_file(target);
            return Some(Err(SkipReason::Failed));
        }
        record_move(old_path, new_path);
        Some(Ok(()))
    })
    .unwrap_or(Err(SkipReason::Failed));
    if let Err(reason) = placed {
        let _ = fs::remove_file(&temp);
        return Err(reason);
    }
    Ok(new_path.to_string())
}

/// Writes a copy's bytes through to the disk before its original goes, so a
/// drive pulled out right after a move still holds the whole file.
fn written_through(path: &Path) -> bool {
    fs::OpenOptions::new().write(true).open(path).and_then(|file| file.sync_all()).is_ok()
}

/// Every folder of the library, for Move to folder ▸.
#[tauri::command]
pub async fn list_library_folders(app: AppHandle) -> Result<Vec<LibraryFolder>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let roots = {
            let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
            let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
            library_roots(db)?
        };
        Ok(library_folders(&roots))
    })
    .await
    .map_err(|e| AppError::Internal(format!("Listing folders failed: {}", e)))?
}

/// Moves the tracks' files into `folder`, which must be inside a library
/// folder. The file work runs off the main thread, so a copy across disks
/// does not freeze the window.
#[tauri::command]
pub async fn move_tracks_to_folder(
    app: AppHandle,
    track_ids: Vec<i64>,
    folder: String,
) -> Result<MoveReport, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let folder = PathBuf::from(&folder);
        let tracks: Vec<(i64, Option<String>)> = {
            let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
            let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
            assert_within_library_roots(db, &folder)?;
            track_ids
                .iter()
                .map(|&id| (id, db.get_track(id).ok().map(|t| t.file_path)))
                .collect()
        };
        Ok(move_tracks(&state.db, &tracks, &folder))
    })
    .await
    .map_err(|e| AppError::Internal(format!("Moving tracks failed: {}", e)))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Track;
    use tempfile::TempDir;

    // A library root with the folders House and Techno, and tracks' files in House.
    struct Library {
        _dir: TempDir,
        root: PathBuf,
        db: Mutex<Option<Database>>,
    }

    fn library() -> Library {
        let dir = TempDir::new().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap().join("Music");
        fs::create_dir_all(root.join("House")).unwrap();
        fs::create_dir_all(root.join("Techno")).unwrap();
        fs::create_dir_all(root.join(".hidden")).unwrap();
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        Library { _dir: dir, root, db: Mutex::new(Some(db)) }
    }

    impl Library {
        // A track whose file is in `folder`, with these bytes.
        fn track(&self, folder: &str, name: &str, bytes: &[u8]) -> (i64, String) {
            let path = self.root.join(folder).join(name);
            fs::write(&path, bytes).unwrap();
            let path = stored_path(&path);
            let track = Track {
                id: None,
                file_path: path.clone(),
                file_hash: name.to_string(),
                title: Some(name.to_string()),
                artist: None,
                album: None,
                album_artist: None,
                track_number: None,
                year: None,
                label: None,
                duration_ms: None,
                file_format: None,
                bitrate: None,
                sample_rate: None,
                file_size: None,
                date_added: None,
                date_modified: None,
                play_count: 0,
                rating: 0,
                comment: None,
                artwork_path: None,
                genre: None,
                genre_source: None,
            };
            let id = with_db(&self.db, |db| db.create_track(&track).ok()).unwrap();
            (id, path)
        }

        fn stored(&self, id: i64) -> String {
            with_db(&self.db, |db| db.get_track(id).ok()).unwrap().file_path
        }
    }

    #[test]
    fn moves_the_files_and_updates_their_paths_keeping_the_ids_and_analysis() {
        let lib = library();
        let (a, a_path) = lib.track("House", "a.mp3", b"aaaa");
        let (b, _) = lib.track("House", "b.flac", b"bbbbbb");
        with_db(&lib.db, |db| db.save_bpm_analysis(a, 126.0, 0.9).ok()).unwrap();

        let report = move_tracks(
            &lib.db,
            &[(a, Some(a_path.clone())), (b, Some(lib.stored(b)))],
            &lib.root.join("Techno"),
        );

        let a_new = stored_path(&lib.root.join("Techno").join("a.mp3"));
        assert_eq!(report.skipped, vec![]);
        assert_eq!(report.moved[0], MovedTrack { id: a, new_path: a_new.clone() });
        assert_eq!(lib.stored(a), a_new);
        assert_eq!(fs::read(&a_new).unwrap(), b"aaaa");
        assert!(!Path::new(&a_path).exists());
        let analysis = with_db(&lib.db, |db| db.get_track_analysis(a).ok()).unwrap().unwrap();
        assert_eq!(analysis.bpm, Some(126.0));
    }

    #[test]
    fn skips_a_track_already_there_a_name_taken_and_a_missing_file() {
        let lib = library();
        let (here, here_path) = lib.track("Techno", "here.mp3", b"1");
        let (clash, clash_path) = lib.track("House", "same.mp3", b"2");
        fs::write(lib.root.join("Techno").join("same.mp3"), b"other").unwrap();
        let (gone, gone_path) = lib.track("House", "gone.mp3", b"3");
        fs::remove_file(&gone_path).unwrap();

        let report = move_tracks(
            &lib.db,
            &[(here, Some(here_path.clone())), (clash, Some(clash_path.clone())), (gone, Some(gone_path)), (99, None)],
            &lib.root.join("Techno"),
        );

        assert_eq!(report.moved, vec![]);
        let reasons: Vec<_> = report.skipped.iter().map(|s| (s.id, s.reason)).collect();
        assert_eq!(
            reasons,
            vec![
                (here, SkipReason::AlreadyThere),
                (clash, SkipReason::NameTaken),
                (gone, SkipReason::Missing),
                (99, SkipReason::Missing),
            ]
        );
        assert_eq!(fs::read(&clash_path).unwrap(), b"2");
        assert_eq!(lib.stored(clash), clash_path);
    }

    #[test]
    fn puts_a_file_back_when_its_path_cannot_be_updated() {
        let lib = library();
        let (a, a_path) = lib.track("House", "a.mp3", b"aaaa");
        // A stale track already holds the path the file would get.
        let (stale, stale_path) = lib.track("Techno", "a.mp3", b"x");
        fs::remove_file(&stale_path).unwrap();

        let report = move_tracks(&lib.db, &[(a, Some(a_path.clone()))], &lib.root.join("Techno"));

        assert_eq!(report.skipped, vec![SkippedTrack { id: a, reason: SkipReason::Failed }]);
        assert_eq!(fs::read(&a_path).unwrap(), b"aaaa");
        assert!(!Path::new(&stale_path).exists());
        assert_eq!(lib.stored(a), a_path);
        assert_eq!(lib.stored(stale), stale_path);
    }

    #[test]
    fn across_disks_copies_to_a_name_no_scanner_reads_then_renames() {
        let lib = library();
        let (a, a_path) = lib.track("House", "a.mp3", b"aaaa");
        let target = lib.root.join("Techno").join("a.mp3");
        let temp = moving_path(&target);
        assert_eq!(temp.extension().unwrap(), "recodeck-moving");

        let new_path = move_one(&lib.db, a, Path::new(&a_path), &lib.root.join("Techno"), false).unwrap();

        assert_eq!(new_path, stored_path(&target));
        assert_eq!(fs::read(&target).unwrap(), b"aaaa");
        assert!(!temp.exists());
        assert!(!Path::new(&a_path).exists());
        assert_eq!(lib.stored(a), new_path);
    }

    #[test]
    fn across_disks_a_failed_update_leaves_the_original_and_no_copy() {
        let lib = library();
        let (a, a_path) = lib.track("House", "a.mp3", b"aaaa");
        let (_, stale_path) = lib.track("Techno", "a.mp3", b"x");
        fs::remove_file(&stale_path).unwrap();
        let target = lib.root.join("Techno").join("a.mp3");

        let result = move_one(&lib.db, a, Path::new(&a_path), &lib.root.join("Techno"), false);

        assert_eq!(result, Err(SkipReason::Failed));
        assert_eq!(fs::read(&a_path).unwrap(), b"aaaa");
        assert!(!target.exists());
        assert!(!moving_path(&target).exists());
    }

    #[cfg(unix)]
    #[test]
    fn across_disks_an_original_that_will_not_go_keeps_its_path_and_the_copy_goes() {
        use std::os::unix::fs::PermissionsExt;
        let lib = library();
        let (a, a_path) = lib.track("House", "a.mp3", b"aaaa");
        let target = lib.root.join("Techno").join("a.mp3");
        // A file cannot be deleted from a folder that cannot be written.
        fs::set_permissions(lib.root.join("House"), fs::Permissions::from_mode(0o555)).unwrap();

        let result = move_one(&lib.db, a, Path::new(&a_path), &lib.root.join("Techno"), false);

        fs::set_permissions(lib.root.join("House"), fs::Permissions::from_mode(0o755)).unwrap();
        assert_eq!(result, Err(SkipReason::Failed));
        assert_eq!(fs::read(&a_path).unwrap(), b"aaaa");
        assert_eq!(lib.stored(a), a_path);
        assert!(!target.exists());
        assert!(!moving_path(&target).exists());
    }

    #[test]
    fn a_moved_file_is_found_by_its_old_path_after_moves_after_moves() {
        let lib = library();
        fs::create_dir_all(lib.root.join("House").join("Deep")).unwrap();
        let (a, a_path) = lib.track("House", "a.mp3", b"aaaa");
        let techno = stored_path(&lib.root.join("Techno").join("a.mp3"));
        let deep = stored_path(&lib.root.join("House").join("Deep").join("a.mp3"));

        move_tracks(&lib.db, &[(a, Some(a_path.clone()))], &lib.root.join("Techno"));
        assert_eq!(moved_to(&a_path), Some(techno.clone()));
        move_tracks(&lib.db, &[(a, Some(techno.clone()))], &lib.root.join("House").join("Deep"));

        assert_eq!(moved_to(&a_path), Some(deep.clone()));
        assert_eq!(moved_to(&techno), Some(deep));
        assert_eq!(moved_to(&stored_path(&lib.root.join("never.mp3"))), None);
    }

    #[test]
    fn refuses_a_folder_outside_the_library() {
        let lib = library();
        let outside = TempDir::new().unwrap();
        let roots = serde_json::to_string(&vec![stored_path(&lib.root)]).unwrap();
        with_db(&lib.db, |db| db.set_setting("library_folders", &roots).ok()).unwrap();

        let inside = with_db(&lib.db, |db| Some(assert_within_library_roots(db, &lib.root.join("Techno")).is_ok()));
        let refused = with_db(&lib.db, |db| Some(assert_within_library_roots(db, outside.path()).is_err()));

        assert_eq!(inside, Some(true));
        assert_eq!(refused, Some(true));
    }

    #[test]
    fn lists_every_folder_with_its_label_hidden_ones_left_out() {
        let lib = library();
        fs::create_dir_all(lib.root.join("House").join("Deep")).unwrap();
        let folders = library_folders(&[stored_path(&lib.root)]);
        let labels: Vec<_> = folders.iter().map(|f| f.label.as_str()).collect();
        assert_eq!(labels, vec!["Music", "Music / House", "Music / House / Deep", "Music / Techno"]);
        assert_eq!(folders[2].path, stored_path(&lib.root.join("House").join("Deep")));
    }

    #[cfg(unix)]
    #[test]
    fn lists_no_linked_folder_that_leads_outside_the_library() {
        let lib = library();
        let outside = TempDir::new().unwrap();
        std::os::unix::fs::symlink(outside.path(), lib.root.join("Elsewhere")).unwrap();
        std::os::unix::fs::symlink(lib.root.join("Techno"), lib.root.join("House").join("Techno link")).unwrap();
        let folders = library_folders(&[stored_path(&lib.root)]);
        let labels: Vec<_> = folders.iter().map(|f| f.label.as_str()).collect();
        assert_eq!(labels, vec!["Music", "Music / House", "Music / House / Techno link", "Music / Techno"]);
    }
}
