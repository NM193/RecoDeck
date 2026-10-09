// src-tauri/src/formats/mod.rs
// Export to DJ software (docs/superpowers/specs/2026-10-09-dj-export-design.md):
// the playlists a DJ picks, with their tracks' data, as one model that each
// program's writer turns into its own format. collect reads the database,
// mark_missing looks at the disk, and the writers touch neither.

pub mod keys;
pub mod rekordbox;
mod xml;

use crate::db::{Database, Playlist, Track};
use std::collections::{HashMap, HashSet};
use std::path::Path;

/// One track as the writers need it.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct ExportTrack {
    pub id: i64,
    pub path: String,
    /// The file is on disk (mark_missing); writers leave the others out.
    pub exists: bool,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub genre: Option<String>,
    pub label: Option<String>,
    pub year: Option<i32>,
    pub track_number: Option<i32>,
    pub duration_ms: Option<i32>,
    /// kbps.
    pub bitrate: Option<i32>,
    pub sample_rate: Option<i32>,
    pub file_size: Option<i64>,
    /// "mp3", "flac", … as the scanner stores it.
    pub file_format: Option<String>,
    pub bpm: Option<f64>,
    /// Camelot ("8A"), as analysis stores it.
    pub camelot: Option<String>,
    /// 0–5 stars.
    pub rating: i32,
    pub comment: Option<String>,
    pub play_count: i32,
    /// SQLite's datetime ("2026-09-01 12:30:00").
    pub date_added: Option<String>,
}

/// A folder or a playlist, in the sidebar's order.
#[derive(Debug, Clone, PartialEq)]
pub enum ExportNode {
    Folder { name: String, children: Vec<ExportNode> },
    Playlist { name: String, track_ids: Vec<i64> },
}

/// The picked playlists, the folders on the way to them, and their tracks.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct ExportLibrary {
    /// Every track of the picked playlists, once each, in first-seen order.
    pub tracks: Vec<ExportTrack>,
    pub tree: Vec<ExportNode>,
}

impl ExportLibrary {
    /// The tracks a writer writes: their files are on disk.
    pub fn present(&self) -> HashSet<i64> {
        self.tracks.iter().filter(|t| t.exists).map(|t| t.id).collect()
    }

    /// The tracks left out because their file is gone.
    pub fn missing(&self) -> Vec<&ExportTrack> {
        self.tracks.iter().filter(|t| !t.exists).collect()
    }

    pub fn playlist_count(&self) -> usize {
        count_playlists(&self.tree)
    }
}

fn count_playlists(nodes: &[ExportNode]) -> usize {
    nodes
        .iter()
        .map(|node| match node {
            ExportNode::Folder { children, .. } => count_playlists(children),
            ExportNode::Playlist { .. } => 1,
        })
        .sum()
}

/// Deeper than this, a chain of parents is taken to be a loop.
const MAX_DEPTH: usize = 64;

/// Reads the picked playlists (folder ids and unknown ids are ignored), the
/// folders on the way to them, and their tracks with analysis. Touches no
/// file: every track starts as present until mark_missing looks.
pub fn collect(db: &Database, playlist_ids: &[i64]) -> rusqlite::Result<ExportLibrary> {
    let all = db.get_all_playlists()?;
    let wanted: HashSet<i64> = playlist_ids.iter().copied().collect();
    let selected: HashSet<i64> = all
        .iter()
        .filter(|p| p.playlist_type != "folder")
        .filter_map(|p| p.id)
        .filter(|id| wanted.contains(id))
        .collect();
    let mut collector = Collector {
        db,
        all: &all,
        needed: folders_holding(&all, &selected),
        selected,
        tracks: Vec::new(),
        seen: HashSet::new(),
    };
    let tree = collector.level(None, 0)?;
    Ok(ExportLibrary { tracks: collector.tracks, tree })
}

/// Marks the tracks whose file is gone. Run it after the database lock is let
/// go: a sleeping external drive can take seconds to answer.
pub fn mark_missing(lib: &mut ExportLibrary) {
    for track in &mut lib.tracks {
        track.exists = Path::new(&track.path).is_file();
    }
}

/// The folders on the way to the picked playlists, at any depth.
fn folders_holding(all: &[Playlist], selected: &HashSet<i64>) -> HashSet<i64> {
    let parent_of: HashMap<i64, Option<i64>> =
        all.iter().filter_map(|p| p.id.map(|id| (id, p.parent_id))).collect();
    let mut needed = HashSet::new();
    for id in selected {
        let mut at = parent_of.get(id).copied().flatten();
        for _ in 0..MAX_DEPTH {
            let Some(folder) = at else { break };
            if !needed.insert(folder) {
                break;
            }
            at = parent_of.get(&folder).copied().flatten();
        }
    }
    needed
}

struct Collector<'a> {
    db: &'a Database,
    all: &'a [Playlist],
    selected: HashSet<i64>,
    needed: HashSet<i64>,
    tracks: Vec<ExportTrack>,
    seen: HashSet<i64>,
}

impl Collector<'_> {
    /// The nodes under `parent` (None: the top level), in the sidebar's order.
    fn level(&mut self, parent: Option<i64>, depth: usize) -> rusqlite::Result<Vec<ExportNode>> {
        let mut nodes = Vec::new();
        if depth > MAX_DEPTH {
            return Ok(nodes);
        }
        let all = self.all;
        for p in all.iter().filter(|p| p.parent_id == parent) {
            let Some(id) = p.id else { continue };
            if p.playlist_type == "folder" {
                if self.needed.contains(&id) {
                    let children = self.level(Some(id), depth + 1)?;
                    nodes.push(ExportNode::Folder { name: p.name.clone(), children });
                }
            } else if self.selected.contains(&id) {
                let mut track_ids = Vec::new();
                for (track, bpm, _, camelot, _) in self.db.get_playlist_tracks(id)? {
                    let Some(track_id) = track.id else { continue };
                    track_ids.push(track_id);
                    if self.seen.insert(track_id) {
                        self.tracks.push(export_track(track_id, track, bpm, camelot));
                    }
                }
                nodes.push(ExportNode::Playlist { name: p.name.clone(), track_ids });
            }
        }
        Ok(nodes)
    }
}

fn export_track(id: i64, t: Track, bpm: Option<f64>, camelot: Option<String>) -> ExportTrack {
    ExportTrack {
        id,
        path: t.file_path,
        exists: true,
        title: t.title,
        artist: t.artist,
        album: t.album,
        genre: t.genre,
        label: t.label,
        year: t.year,
        track_number: t.track_number,
        duration_ms: t.duration_ms,
        bitrate: t.bitrate,
        sample_rate: t.sample_rate,
        file_size: t.file_size,
        file_format: t.file_format,
        bpm,
        camelot,
        rating: t.rating,
        comment: t.comment,
        play_count: t.play_count,
        date_added: t.date_added,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(path: &str, title: &str) -> Track {
        Track {
            id: None,
            file_path: path.to_string(),
            file_hash: format!("hash-{path}"),
            title: Some(title.to_string()),
            artist: Some("Artist".to_string()),
            album: None,
            album_artist: None,
            track_number: None,
            year: None,
            label: None,
            duration_ms: Some(300_000),
            file_format: Some("mp3".to_string()),
            bitrate: Some(320),
            sample_rate: Some(44_100),
            file_size: Some(1),
            date_added: None,
            date_modified: None,
            play_count: 2,
            rating: 4,
            comment: None,
            artwork_path: None,
            genre: Some("Techno".to_string()),
            genre_source: None,
        }
    }

    struct Fixture {
        db: Database,
        gigs: i64,
        friday: i64,
        warmup: i64,
        a: i64,
        b: i64,
    }

    /// Gigs (folder) › Friday [a, b]; Warm-up [b]; Unpicked [c]; Empty (folder).
    fn fixture() -> Fixture {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        let a = db.create_track(&track("/m/a.mp3", "A")).unwrap();
        let b = db.create_track(&track("/m/b.mp3", "B")).unwrap();
        let c = db.create_track(&track("/m/c.mp3", "C")).unwrap();
        db.save_bpm_analysis(a, 124.0, 0.9).unwrap();
        db.save_key_analysis(a, "8A", 0.8).unwrap();
        let gigs = db.create_playlist("Gigs", "folder", None).unwrap();
        let friday = db.create_playlist("Friday", "manual", Some(gigs)).unwrap();
        let warmup = db.create_playlist("Warm-up", "manual", None).unwrap();
        let unpicked = db.create_playlist("Unpicked", "manual", None).unwrap();
        db.create_playlist("Empty", "folder", None).unwrap();
        db.add_track_to_playlist(friday, a).unwrap();
        db.add_track_to_playlist(friday, b).unwrap();
        db.add_track_to_playlist(warmup, b).unwrap();
        db.add_track_to_playlist(unpicked, c).unwrap();
        Fixture { db, gigs, friday, warmup, a, b }
    }

    #[test]
    fn collect_keeps_the_folders_on_the_way_and_each_track_once() {
        let f = fixture();
        // A folder id among them is ignored: only playlists are picked.
        let lib = collect(&f.db, &[f.warmup, f.friday, f.gigs]).unwrap();
        assert_eq!(
            lib.tree,
            vec![
                ExportNode::Folder {
                    name: "Gigs".into(),
                    children: vec![ExportNode::Playlist { name: "Friday".into(), track_ids: vec![f.a, f.b] }],
                },
                ExportNode::Playlist { name: "Warm-up".into(), track_ids: vec![f.b] },
            ]
        );
        assert_eq!(lib.tracks.iter().map(|t| t.id).collect::<Vec<_>>(), vec![f.a, f.b]);
        assert_eq!(lib.playlist_count(), 2);
    }

    #[test]
    fn collect_carries_the_analysis_and_the_tags() {
        let f = fixture();
        let lib = collect(&f.db, &[f.friday]).unwrap();
        let a = &lib.tracks[0];
        assert_eq!(a.bpm, Some(124.0));
        assert_eq!(a.camelot.as_deref(), Some("8A"));
        assert_eq!(a.rating, 4);
        assert_eq!(a.genre.as_deref(), Some("Techno"));
        assert!(a.date_added.is_some(), "the database fills date_added");
        assert_eq!(lib.tracks[1].bpm, None);
    }

    #[test]
    fn nothing_picked_is_an_empty_export() {
        let f = fixture();
        assert_eq!(collect(&f.db, &[]).unwrap(), ExportLibrary::default());
    }

    #[test]
    fn mark_missing_finds_the_files_that_are_gone() {
        let dir = tempfile::tempdir().unwrap();
        let here = dir.path().join("here.mp3");
        std::fs::write(&here, b"x").unwrap();
        let mut lib = ExportLibrary {
            tracks: vec![
                export_track(1, track(here.to_str().unwrap(), "Here"), None, None),
                export_track(2, track(dir.path().join("gone.mp3").to_str().unwrap(), "Gone"), None, None),
            ],
            tree: vec![],
        };
        mark_missing(&mut lib);
        assert!(lib.tracks[0].exists);
        assert!(!lib.tracks[1].exists);
        assert_eq!(lib.present(), HashSet::from([1]));
        assert_eq!(lib.missing().iter().map(|t| t.id).collect::<Vec<_>>(), vec![2]);
    }

    #[test]
    fn collect_keeps_the_playlist_order_not_the_id_order() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        let first = db.create_track(&track("/m/1.mp3", "One")).unwrap();
        let second = db.create_track(&track("/m/2.mp3", "Two")).unwrap();
        let list = db.create_playlist("Set", "manual", None).unwrap();
        db.add_track_to_playlist(list, second).unwrap();
        db.add_track_to_playlist(list, first).unwrap();
        let lib = collect(&db, &[list]).unwrap();
        assert_eq!(lib.tree, vec![ExportNode::Playlist { name: "Set".into(), track_ids: vec![second, first] }]);
        assert_eq!(lib.tracks.iter().map(|t| t.id).collect::<Vec<_>>(), vec![second, first]);
    }
}
