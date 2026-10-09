// src-tauri/src/commands/dj_export.rs
// Export to DJ software (spec: docs/superpowers/specs/2026-10-09-dj-export-design.md):
// what the dialog opens with, and the export itself. Phase 1 writes Rekordbox
// XML; Traktor and Serato come in later phases.

use crate::commands::library::AppState;
use crate::error::AppError;
use crate::formats::{self, rekordbox, ExportLibrary};
use serde::{Deserialize, Serialize};
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

/// Writes beside the target, then renames over it, so a failed write leaves
/// the previous export whole. Creates the folders on the way.
fn write_atomically(target: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let name = target
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "export".to_string());
    let temp = target.with_file_name(format!(".{name}.tmp"));
    if let Err(e) = std::fs::write(&temp, bytes).and_then(|_| std::fs::rename(&temp, target)) {
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
    let path = choice
        .as_ref()
        .and_then(|c| c.path.clone())
        .map(PathBuf::from)
        .or_else(|| default_file(&music_dir(&app), target))
        .ok_or_else(|| not_yet(target))?;
    Ok(DjExportDefaults {
        exists: path.exists(),
        path: path.to_string_lossy().to_string(),
        playlist_ids: choice.as_ref().map(|c| c.playlist_ids.clone()).unwrap_or_default(),
        remembered: choice.is_some(),
    })
}

/// Writes the picked playlists for a program and remembers the choice.
#[tauri::command]
pub async fn export_to_dj(
    target: DjTarget,
    playlist_ids: Vec<i64>,
    path: String,
    state: State<'_, AppState>,
) -> Result<DjExportResult, AppError> {
    if target != DjTarget::Rekordbox {
        return Err(not_yet(target));
    }
    if playlist_ids.is_empty() {
        return Err(AppError::Validation("Choose at least one playlist".to_string()));
    }
    if path.trim().is_empty() {
        return Err(AppError::Validation("Choose where to save the file".to_string()));
    }

    // Read under the lock, then let it go before touching the disk.
    let mut lib = {
        let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
        formats::collect(db, &playlist_ids)
            .map_err(|e| AppError::Database(format!("Failed to read the playlists: {e}")))?
    };
    formats::mark_missing(&mut lib);

    let file = PathBuf::from(&path);
    let content = rekordbox::write(&lib, env!("CARGO_PKG_VERSION"));
    write_atomically(&file, content.as_bytes())
        .map_err(|e| AppError::Internal(format!("Couldn't write {}: {e}", file.display())))?;

    let choice = DjExportChoice { playlist_ids, path: Some(path.clone()) };
    {
        let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
        let raw = serde_json::to_string(&choice).map_err(|e| AppError::Internal(e.to_string()))?;
        db.set_setting(&target.setting_key(), &raw)
            .map_err(|e| AppError::Database(format!("Failed to remember the export: {e}")))?;
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
        assert!(!dir.path().join(".RecoDeck.xml.tmp").exists());
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
}
