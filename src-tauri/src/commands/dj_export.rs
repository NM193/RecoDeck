// src-tauri/src/commands/dj_export.rs
// Export to DJ software (spec: docs/superpowers/specs/2026-10-09-dj-export-design.md):
// what the dialog opens with, and the export itself: Rekordbox XML and
// Traktor NML. Serato comes in phase 3.

use crate::commands::library::AppState;
use crate::error::AppError;
use crate::db::Database;
use crate::formats::{self, rekordbox, traktor, volumes, ExportLibrary};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DjTarget {
    Rekordbox,
    Traktor,
    Serato,
}

impl DjTarget {
    fn label(self) -> &'static str {
        match self {
            Self::Rekordbox => "Rekordbox",
            Self::Traktor => "Traktor",
            Self::Serato => "Serato",
        }
    }

    /// Where its choice is remembered in the settings table.
    fn setting_key(self) -> String {
        format!("dj_export.{}", self.label().to_ascii_lowercase())
    }
}

/// The program exported to last: the dialog opens on its tab.
const LAST_TARGET_KEY: &str = "dj_export.last_target";

/// What is remembered per program: the playlists and where the file went.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DjExportChoice {
    pub playlist_ids: Vec<i64>,
    pub path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DjExportDefaults {
    pub path: String,
    pub exists: bool,
    pub playlist_ids: Vec<i64>,
    /// Exported to this program before (the dialog then shortens its how-to).
    pub remembered: bool,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct SkippedTrack {
    pub artist: String,
    pub title: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
pub struct DjExportResult {
    pub playlists: usize,
    pub tracks: usize,
    pub skipped: Vec<SkippedTrack>,
    pub written: Vec<String>,
}

/// A remembered choice; anything unreadable counts as none.
fn parse_choice(raw: Option<&str>) -> Option<DjExportChoice> {
    raw.and_then(|r| serde_json::from_str(r).ok())
}

/// Where a program's file goes when nothing is remembered.
fn default_file(music_dir: &Path, target: DjTarget) -> Option<PathBuf> {
    let name = match target {
        DjTarget::Rekordbox => "RecoDeck.xml",
        DjTarget::Traktor => "RecoDeck.nml",
        DjTarget::Serato => return None,
    };
    Some(music_dir.join("RecoDeck").join(name))
}

/// Writes a synced temp file (named with the process id) beside the target, then
/// renames it over, so a failed write or a crash leaves the previous export whole.
/// Creates the folders on the way.
fn write_atomically(target: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let name = target
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "export".to_string());
    let temp = target.with_file_name(format!(".{name}.{}.tmp", std::process::id()));
    let written = std::fs::File::create(&temp).and_then(|mut f| {
        f.write_all(bytes)?;
        f.sync_all()
    });
    if let Err(e) = written.and_then(|_| std::fs::rename(&temp, target)) {
        let _ = std::fs::remove_file(&temp);
        return Err(e);
    }
    Ok(())
}

fn skipped(lib: &ExportLibrary) -> Vec<SkippedTrack> {
    lib.missing()
        .into_iter()
        .map(|t| SkippedTrack {
            artist: t.artist.clone().unwrap_or_default(),
            title: t.title.clone().unwrap_or_default(),
            path: t.path.clone(),
        })
        .collect()
}

/// The user's Music folder (~/Music, %USERPROFILE%\Music).
fn music_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .audio_dir()
        .or_else(|_| app.path().home_dir().map(|home| home.join("Music")))
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn not_yet(target: DjTarget) -> AppError {
    AppError::Validation(format!("{} export is not available yet", target.label()))
}

/// What the dialog opens with for a program: the remembered playlists, and the
/// remembered or default file and whether it exists. Async, so looking at a
/// remembered file on a sleeping drive does not hold the main thread.
#[tauri::command]
pub async fn dj_export_defaults(
    target: DjTarget,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<DjExportDefaults, AppError> {
    let raw = {
        let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
        db.get_setting(&target.setting_key())
            .map_err(|e| AppError::Database(format!("Failed to read the export settings: {e}")))?
    };
    let choice = parse_choice(raw.as_deref());
    let path = chosen_file(choice.as_ref(), &music_dir(&app), target).ok_or_else(|| not_yet(target))?;
    Ok(DjExportDefaults {
        exists: path.is_file(),
        path: path.to_string_lossy().to_string(),
        playlist_ids: choice.as_ref().map(|c| c.playlist_ids.clone()).unwrap_or_default(),
        remembered: choice.is_some(),
    })
}

/// The remembered file if it is an absolute path (export_to_dj refuses any
/// other), else the default file.
fn chosen_file(choice: Option<&DjExportChoice>, music_dir: &Path, target: DjTarget) -> Option<PathBuf> {
    choice
        .and_then(|c| c.path.as_deref())
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| default_file(music_dir, target))
}

/// Saves a program's choice in the settings table.
fn remember(state: &AppState, target: DjTarget, choice: &DjExportChoice) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|_| "State lock failed".to_string())?;
    let db = db_lock.as_ref().ok_or_else(|| "Database not initialized".to_string())?;
    save_choice(db, target, choice)
}

/// The program's choice, and that it is the program used last (as JSON: "traktor").
fn save_choice(db: &Database, target: DjTarget, choice: &DjExportChoice) -> Result<(), String> {
    let raw = serde_json::to_string(choice).map_err(|e| e.to_string())?;
    db.set_setting(&target.setting_key(), &raw).map_err(|e| e.to_string())?;
    let last = serde_json::to_string(&target).map_err(|e| e.to_string())?;
    db.set_setting(LAST_TARGET_KEY, &last).map_err(|e| e.to_string())
}

/// Writes the picked playlists for a program and remembers the choice.
#[tauri::command]
pub async fn export_to_dj(
    target: DjTarget,
    playlist_ids: Vec<i64>,
    path: String,
    state: State<'_, AppState>,
) -> Result<DjExportResult, AppError> {
    if target == DjTarget::Serato {
        return Err(not_yet(target));
    }
    if playlist_ids.is_empty() {
        return Err(AppError::Validation("Choose at least one playlist".to_string()));
    }
    let path = path.trim().to_string();
    if path.is_empty() || !Path::new(&path).is_absolute() {
        return Err(AppError::Validation("Choose where to save the file".to_string()));
    }

    // Read under the lock, then let it go before touching the disk.
    let mut lib = {
        let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
        formats::collect(db, &playlist_ids)
            .map_err(|e| AppError::Database(format!("Failed to read the playlists: {e}")))?
    };
    if lib.playlist_count() == 0 {
        return Err(AppError::Validation("The chosen playlists no longer exist".to_string()));
    }
    formats::mark_missing(&mut lib);

    let file = PathBuf::from(&path);
    let content = match target {
        DjTarget::Rekordbox => rekordbox::write(&lib, env!("CARGO_PKG_VERSION")),
        DjTarget::Traktor => traktor::write(&lib, &volumes::boot_volume_name()),
        DjTarget::Serato => return Err(not_yet(target)),
    };
    write_atomically(&file, content.as_bytes())
        .map_err(|e| AppError::Internal(format!("Couldn't write {}: {e}", file.display())))?;

    let choice = DjExportChoice { playlist_ids, path: Some(path.clone()) };
    // The file is written: failing to remember the choice must not turn that into an error.
    if let Err(e) = remember(&state, target, &choice) {
        eprintln!("[export_to_dj] Couldn't remember the export: {e}");
    }

    Ok(DjExportResult {
        playlists: lib.playlist_count(),
        tracks: lib.present().len(),
        skipped: skipped(&lib),
        written: vec![path],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_target_reads_as_its_lowercase_name() {
        let target: DjTarget = serde_json::from_str("\"rekordbox\"").unwrap();
        assert_eq!(target, DjTarget::Rekordbox);
        assert_eq!(DjTarget::Serato.setting_key(), "dj_export.serato");
    }

    #[test]
    fn a_remembered_path_is_kept_only_when_absolute() {
        let dir = Path::new("/Users/dj/Music");
        let default = PathBuf::from("/Users/dj/Music/RecoDeck/RecoDeck.xml");
        let abs = DjExportChoice { playlist_ids: vec![], path: Some("/x/My.xml".into()) };
        let rel = DjExportChoice { playlist_ids: vec![], path: Some("RecoDeck.xml".into()) };
        assert_eq!(chosen_file(Some(&abs), dir, DjTarget::Rekordbox), Some(PathBuf::from("/x/My.xml")));
        assert_eq!(chosen_file(Some(&rel), dir, DjTarget::Rekordbox), Some(default.clone()));
        assert_eq!(chosen_file(None, dir, DjTarget::Rekordbox), Some(default));
    }

    #[test]
    fn a_remembered_choice_round_trips_and_garbage_reads_as_none() {
        let choice = DjExportChoice { playlist_ids: vec![3, 1], path: Some("/x/RecoDeck.xml".into()) };
        let raw = serde_json::to_string(&choice).unwrap();
        assert_eq!(raw, r#"{"playlistIds":[3,1],"path":"/x/RecoDeck.xml"}"#);
        assert_eq!(parse_choice(Some(&raw)), Some(choice));
        assert_eq!(parse_choice(Some("not json")), None);
        assert_eq!(parse_choice(None), None);
        assert_eq!(parse_choice(Some("{}")), Some(DjExportChoice::default()));
    }

    #[test]
    fn files_go_to_a_recodeck_folder_in_music() {
        let music = Path::new("/Users/dj/Music");
        assert_eq!(
            default_file(music, DjTarget::Rekordbox),
            Some(PathBuf::from("/Users/dj/Music/RecoDeck/RecoDeck.xml"))
        );
        assert_eq!(
            default_file(music, DjTarget::Traktor),
            Some(PathBuf::from("/Users/dj/Music/RecoDeck/RecoDeck.nml"))
        );
        assert_eq!(default_file(music, DjTarget::Serato), None);
    }

    #[test]
    fn a_write_replaces_the_file_whole_and_leaves_no_temp_behind() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("nested").join("RecoDeck.xml");
        write_atomically(&target, b"first").unwrap();
        write_atomically(&target, b"second").unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), b"second");
        let names: Vec<String> = std::fs::read_dir(target.parent().unwrap())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        assert_eq!(names, vec!["RecoDeck.xml".to_string()]);
    }

    #[test]
    fn a_failed_write_leaves_no_temp_behind() {
        let dir = tempfile::tempdir().unwrap();
        // A non-empty folder where the file should go: the rename fails.
        let target = dir.path().join("RecoDeck.xml");
        std::fs::create_dir(&target).unwrap();
        std::fs::write(target.join("inside"), b"x").unwrap();
        assert!(write_atomically(&target, b"data").is_err());
        let leftovers: Vec<String> = std::fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .filter(|n| n.starts_with(".RecoDeck.xml."))
            .collect();
        assert!(leftovers.is_empty(), "temp left behind: {leftovers:?}");
    }

    #[test]
    fn a_failed_write_keeps_the_previous_file() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("RecoDeck.xml");
        std::fs::write(&target, b"first").unwrap();
        // A folder where the temp file would go: creating it fails.
        std::fs::create_dir(dir.path().join(format!(".RecoDeck.xml.{}.tmp", std::process::id()))).unwrap();
        assert!(write_atomically(&target, b"second").is_err());
        assert_eq!(std::fs::read(&target).unwrap(), b"first");
    }

    #[test]
    fn the_missing_tracks_are_reported_with_what_is_known() {
        let lib = ExportLibrary {
            tracks: vec![formats::ExportTrack {
                id: 7,
                path: "/gone.mp3".into(),
                exists: false,
                artist: Some("DJ".into()),
                ..Default::default()
            }],
            tree: vec![],
        };
        assert_eq!(
            skipped(&lib),
            vec![SkippedTrack { artist: "DJ".into(), title: String::new(), path: "/gone.mp3".into() }]
        );
    }

    #[test]
    fn a_saved_choice_names_its_program_as_the_last_one() {
        let db = crate::db::Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        let choice = DjExportChoice { playlist_ids: vec![2], path: Some("/x/RecoDeck.nml".into()) };
        save_choice(&db, DjTarget::Traktor, &choice).unwrap();
        // The dialog reads this through get_setting and opens on Traktor's tab.
        assert_eq!(db.get_setting("dj_export.last_target").unwrap().as_deref(), Some("\"traktor\""));
        assert_eq!(parse_choice(db.get_setting("dj_export.traktor").unwrap().as_deref()), Some(choice));
    }
}
