//! Missing Files (spec docs/superpowers/specs/2026-10-15-missing-files-design.md):
//! finding tracks whose file is gone, and files that might be theirs. The
//! disk work here never touches the database, so the commands run it
//! without the DB lock and take the lock only for the `Database` steps.

use crate::db::duplicates::CopyFacts;
use crate::db::{Database, Track};
use crate::scanner::{normalize_scanned_path, Scanner};
use lofty::prelude::*;
use std::collections::{BTreeSet, HashMap};
use std::path::Path;

/// A file on disk, with what a quick read says about it.
#[derive(Debug, Clone, PartialEq)]
pub struct FoundFile {
    pub path: String,
    pub duration_ms: Option<i64>,
    pub file_size: Option<i64>,
}

/// A file that might be a missing track's file.
#[derive(Debug, Clone, PartialEq)]
pub struct Candidate {
    pub path: String,
    pub duration_ms: Option<i64>,
    pub file_size: Option<i64>,
    /// Set when the file already is a library track: the review offers Merge into it.
    pub library_track_id: Option<i64>,
}

/// A track whose file is gone, with what the review shows about it.
#[derive(Debug, Clone)]
pub struct MissingTrack {
    pub track: Track,
    pub facts: CopyFacts,
    /// The unplugged drive its file was on.
    pub drive_missing: Option<String>,
    /// Same-name files in the library folders, ordered by path.
    pub candidates: Vec<Candidate>,
}

/// What the disk says, before the database is asked (spec section 3, steps 1-4 and 6).
pub struct DiskView {
    pub missing: Vec<Track>,
    pub found: HashMap<i64, Vec<FoundFile>>,
    pub drives: HashMap<i64, String>,
}

pub fn is_missing(path: &str) -> bool {
    !Path::new(path).exists()
}

pub fn count_missing(paths: &[String]) -> usize {
    paths.iter().filter(|p| is_missing(p)).count()
}

/// The drive name when `path` is under `/Volumes/<name>/` and that drive is not mounted.
pub fn drive_missing(path: &str) -> Option<String> {
    let name = path.strip_prefix("/Volumes/")?.split('/').next()?;
    if name.is_empty() || Path::new("/Volumes").join(name).exists() {
        return None;
    }
    Some(name.to_string())
}

fn name_key(path: &str) -> String {
    path.rsplit('/').next().unwrap_or(path).to_lowercase()
}

/// Lower-cased file name → its normalized paths in `folders`, sorted, each
/// once even when folders overlap.
pub fn name_index(folders: &[String]) -> HashMap<String, Vec<String>> {
    let mut index: HashMap<String, BTreeSet<String>> = HashMap::new();
    for folder in folders {
        for file in Scanner::scan_directory(Path::new(folder)) {
            let path = normalize_scanned_path(&file.to_string_lossy());
            index.entry(name_key(&path)).or_default().insert(path);
        }
    }
    index.into_iter().map(|(name, paths)| (name, paths.into_iter().collect())).collect()
}

/// Length (lofty, no hash) and size of one file.
pub fn probe(path: &str) -> FoundFile {
    let duration_ms = lofty::read_from_path(path)
        .ok()
        .map(|file| file.properties().duration().as_millis() as i64);
    let file_size = std::fs::metadata(path).ok().map(|m| m.len() as i64);
    FoundFile { path: path.to_string(), duration_ms, file_size }
}

/// Which tracks lost their file, and the same-name files in the library
/// folders. No database access: the commands run this without the lock.
pub fn look_on_disk(tracks: Vec<Track>, folders: &[String]) -> DiskView {
    let missing: Vec<Track> = tracks.into_iter().filter(|t| is_missing(&t.file_path)).collect();
    let mut view = DiskView { missing: Vec::new(), found: HashMap::new(), drives: HashMap::new() };
    if missing.is_empty() {
        return view;
    }
    let index = name_index(folders);
    for track in &missing {
        let id = track.id.unwrap_or(0);
        if let Some(paths) = index.get(&name_key(&track.file_path)) {
            view.found.insert(id, paths.iter().map(|p| probe(p)).collect());
        }
        if let Some(drive) = drive_missing(&track.file_path) {
            view.drives.insert(id, drive);
        }
    }
    view.missing = missing;
    view
}

/// One file for one missing track, with rule 5's answer (Locate…, Other file…).
pub fn describe_file(db: &Database, track_id: i64, file: FoundFile) -> rusqlite::Result<Candidate> {
    let library_track_id = db.library_track_for(&file.path, track_id)?;
    Ok(Candidate {
        path: file.path,
        duration_ms: file.duration_ms,
        file_size: file.file_size,
        library_track_id,
    })
}

fn sort_key(value: &Option<String>) -> String {
    value.as_deref().unwrap_or("").to_lowercase()
}

/// What the database says about each missing track and its files. Sorted by
/// artist, then title.
pub fn describe(db: &Database, view: DiskView) -> rusqlite::Result<Vec<MissingTrack>> {
    let facts = db.copy_facts(&view.missing)?;
    let DiskView { missing, mut found, drives } = view;
    let mut out = Vec::with_capacity(missing.len());
    for (track, facts) in missing.into_iter().zip(facts) {
        let id = track.id.unwrap_or(0);
        let mut candidates = Vec::new();
        for file in found.remove(&id).unwrap_or_default() {
            candidates.push(describe_file(db, id, file)?);
        }
        out.push(MissingTrack { drive_missing: drives.get(&id).cloned(), track, facts, candidates });
    }
    out.sort_by_key(|m| (sort_key(&m.track.artist), sort_key(&m.track.title)));
    Ok(out)
}

/// The whole review in one call. The commands run the same steps with the
/// lock released around `look_on_disk`.
pub fn find_missing_tracks(db: &Database) -> rusqlite::Result<Vec<MissingTrack>> {
    let view = look_on_disk(db.get_all_tracks()?, &db.library_folders()?);
    describe(db, view)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::write_wav;
    use std::path::Path;
    use tempfile::TempDir;

    fn db_with_folders(folders: &[&Path]) -> Database {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        let list: Vec<String> = folders.iter().map(|f| f.to_string_lossy().to_string()).collect();
        db.set_setting("library_folders", &serde_json::to_string(&list).unwrap()).unwrap();
        db
    }

    fn add(db: &Database, path: &str, artist: &str, title: &str) -> i64 {
        db.create_track(&Track {
            id: None,
            file_path: path.into(),
            file_hash: path.into(),
            title: Some(title.into()),
            artist: Some(artist.into()),
            album: None,
            album_artist: None,
            track_number: None,
            year: None,
            label: None,
            duration_ms: Some(2000),
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
        })
        .unwrap()
    }

    fn norm(path: &Path) -> String {
        normalize_scanned_path(&path.to_string_lossy())
    }

    #[test]
    fn a_missing_track_gets_the_same_name_files_in_the_library_folders() {
        let dir = TempDir::new().unwrap();
        let lib = dir.path().join("lib");
        write_wav(&lib.join("b/Song.WAV"), 1500, 1);
        write_wav(&lib.join("a/song.wav"), 2000, 2);
        write_wav(&dir.path().join("outside/song.wav"), 2000, 3);
        let db = db_with_folders(&[&lib]);
        let id = add(&db, "/gone/song.wav", "Artist", "Song");

        let found = find_missing_tracks(&db).unwrap();

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].track.id, Some(id));
        let paths: Vec<String> = found[0].candidates.iter().map(|c| c.path.clone()).collect();
        assert_eq!(paths, vec![norm(&lib.join("a/song.wav")), norm(&lib.join("b/Song.WAV"))]);
        assert_eq!(found[0].candidates[0].duration_ms, Some(2000));
        assert_eq!(found[0].candidates[1].duration_ms, Some(1500));
        assert!(found[0].candidates.iter().all(|c| c.library_track_id.is_none()));
    }

    #[test]
    fn overlapping_library_folders_list_a_file_once() {
        let dir = TempDir::new().unwrap();
        let lib = dir.path().join("lib");
        write_wav(&lib.join("a/song.wav"), 2000, 1);
        let db = db_with_folders(&[&lib, &lib.join("a")]);
        add(&db, "/gone/song.wav", "Artist", "Song");

        let found = find_missing_tracks(&db).unwrap();

        assert_eq!(found[0].candidates.len(), 1);
    }

    #[test]
    fn a_candidate_that_is_a_library_track_carries_its_id() {
        let dir = TempDir::new().unwrap();
        let lib = dir.path().join("lib");
        let file = lib.join("a/song.wav");
        write_wav(&file, 2000, 1);
        let db = db_with_folders(&[&lib]);
        let live = add(&db, &norm(&file), "Artist", "Song (new tags)");
        add(&db, "/gone/song.wav", "Artist", "Song");

        let found = find_missing_tracks(&db).unwrap();

        assert_eq!(found.len(), 1, "the live track is not missing");
        assert_eq!(found[0].candidates[0].library_track_id, Some(live));
    }

    #[test]
    fn missing_tracks_come_sorted_by_artist_then_title() {
        let dir = TempDir::new().unwrap();
        let db = db_with_folders(&[dir.path()]);
        add(&db, "/gone/1.wav", "b", "x");
        add(&db, "/gone/2.wav", "A", "z");
        add(&db, "/gone/3.wav", "a", "y");

        let titles: Vec<String> = find_missing_tracks(&db)
            .unwrap()
            .into_iter()
            .map(|m| m.track.title.unwrap())
            .collect();

        assert_eq!(titles, vec!["y", "z", "x"]);
    }

    #[test]
    fn a_path_on_an_unplugged_drive_names_the_drive() {
        assert_eq!(
            drive_missing("/Volumes/recodeck-test-no-such-drive/a.mp3"),
            Some("recodeck-test-no-such-drive".to_string())
        );
        assert_eq!(drive_missing("/m/a.mp3"), None);
        assert_eq!(drive_missing("/Volumes/"), None);
    }

    #[test]
    fn count_missing_counts_paths_not_on_disk() {
        let dir = TempDir::new().unwrap();
        let here = dir.path().join("here.wav");
        std::fs::write(&here, b"x").unwrap();
        let paths = vec![here.to_string_lossy().to_string(), "/gone/a.wav".into(), "/gone/b.wav".into()];
        assert_eq!(count_missing(&paths), 2);
    }

    #[test]
    fn describing_a_picked_file_reads_its_length() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("pick.wav");
        write_wav(&file, 3000, 1);
        let db = db_with_folders(&[dir.path()]);
        let id = add(&db, "/gone/pick.wav", "Artist", "Pick");

        let c = describe_file(&db, id, probe(&norm(&file))).unwrap();

        assert_eq!(c.path, norm(&file));
        assert_eq!(c.duration_ms, Some(3000));
        assert!(c.file_size.unwrap() > 0);
        assert_eq!(c.library_track_id, None);
    }
}
