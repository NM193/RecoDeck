// src-tauri/src/db/duplicates.rs
//! What the Duplicate Tracks modal shows about each copy, and which copy it
//! recommends keeping (Duplicates Merge spec, Recommended keep).

use super::{Database, Track};
use rusqlite::Result;

/// The facts the recommendation and the modal need about one copy.
#[derive(Debug, Clone, PartialEq)]
pub struct CopyFacts {
    pub id: i64,
    pub file_format: Option<String>,
    pub bitrate: Option<i32>,
    /// Has BPM or key; a waveform-only analysis row does not count.
    pub analyzed: bool,
    /// (playlist id, name), by name.
    pub playlists: Vec<(i64, String)>,
    /// Rows in the play history (`tracks.play_count` is not kept up to date).
    pub plays: i64,
    /// The file is not on disk (a stale row, e.g. its folder was moved).
    pub file_missing: bool,
}

/// The lossless label for a copy, or None when it is lossy. `file_format`
/// holds the lowercased extension; ALAC hides in `m4a`, told from AAC by bitrate.
pub fn lossless_label(format: Option<&str>, bitrate: Option<i32>) -> Option<&'static str> {
    match format {
        Some("wav") => Some("WAV"),
        Some("aif") | Some("aiff") => Some("AIFF"),
        Some("flac") => Some("FLAC"),
        Some("m4a") if bitrate.unwrap_or(0) >= 500 => Some("ALAC"),
        _ => None,
    }
}

/// The rules as a sortable key, bigger is better. A copy whose file is gone
/// never wins over one on disk, however much history it has: the merge moves
/// that history onto the copy that can still play.
fn rank(c: &CopyFacts) -> (bool, bool, i32, bool, usize, i64) {
    (
        !c.file_missing,
        lossless_label(c.file_format.as_deref(), c.bitrate).is_some(),
        c.bitrate.unwrap_or(0),
        c.analyzed,
        c.playlists.len(),
        c.plays,
    )
}

fn counted(n: usize, one: &str, many: &str) -> String {
    if n == 1 { format!("1 {one}") } else { format!("{n} {many}") }
}

/// Every rule where the winner beats the runner-up, in rule order, the
/// first two joined with " · "; "added first" when only the id decided.
fn reason(winner: &CopyFacts, runner_up: &CopyFacts) -> String {
    let mut parts: Vec<String> = Vec::new();
    if !winner.file_missing && runner_up.file_missing {
        parts.push("file on disk".into());
    }
    let label = lossless_label(winner.file_format.as_deref(), winner.bitrate);
    let runner_up_lossless = lossless_label(runner_up.file_format.as_deref(), runner_up.bitrate).is_some();
    match label {
        Some(label) if !runner_up_lossless => parts.push(format!("{label} (lossless)")),
        _ => {
            if winner.bitrate.unwrap_or(0) > runner_up.bitrate.unwrap_or(0) {
                parts.push(format!("{} kbps", winner.bitrate.unwrap_or(0)));
            }
        }
    }
    if winner.analyzed && !runner_up.analyzed {
        parts.push("analyzed".into());
    }
    if winner.playlists.len() > runner_up.playlists.len() {
        parts.push(format!("in {}", counted(winner.playlists.len(), "playlist", "playlists")));
    }
    if winner.plays > runner_up.plays {
        parts.push(counted(winner.plays as usize, "play", "plays"));
    }
    if parts.is_empty() {
        return "added first".into();
    }
    parts.truncate(2);
    parts.join(" · ")
}

/// The copy to keep and why. None only for an empty group.
pub fn recommend(copies: &[CopyFacts]) -> Option<(i64, String)> {
    let mut sorted: Vec<&CopyFacts> = copies.iter().collect();
    sorted.sort_by(|a, b| rank(b).cmp(&rank(a)).then(a.id.cmp(&b.id)));
    let winner = *sorted.first()?;
    let why = match sorted.get(1) {
        Some(runner_up) => reason(winner, runner_up),
        None => "added first".into(),
    };
    Some((winner.id, why))
}

impl Database {
    /// The facts of each copy, in the order given.
    pub fn copy_facts(&self, tracks: &[Track]) -> Result<Vec<CopyFacts>> {
        let mut playlists_stmt = self.conn.prepare(
            "SELECT p.id, p.name FROM playlist_tracks pt JOIN playlists p ON p.id = pt.playlist_id
             WHERE pt.track_id = ?1 ORDER BY p.name COLLATE NOCASE, p.id",
        )?;
        tracks
            .iter()
            .map(|t| {
                let id = t.id.unwrap_or(0);
                let analyzed: bool = self.conn.query_row(
                    "SELECT EXISTS(SELECT 1 FROM track_analysis WHERE track_id = ?1
                       AND (bpm IS NOT NULL OR (musical_key IS NOT NULL AND musical_key <> '')))",
                    [id],
                    |row| row.get(0),
                )?;
                let plays: i64 = self.conn.query_row(
                    "SELECT COUNT(*) FROM play_history WHERE track_id = ?1",
                    [id],
                    |row| row.get(0),
                )?;
                let playlists = playlists_stmt
                    .query_map([id], |row| Ok((row.get(0)?, row.get(1)?)))?
                    .collect::<Result<Vec<(i64, String)>>>()?;
                Ok(CopyFacts {
                    id,
                    file_format: t.file_format.clone(),
                    bitrate: t.bitrate,
                    analyzed,
                    playlists,
                    plays,
                    file_missing: !std::path::Path::new(&t.file_path).exists(),
                })
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    fn copy(id: i64, format: &str, bitrate: i32, analyzed: bool, playlists: i64, plays: i64) -> CopyFacts {
        CopyFacts {
            id,
            file_format: Some(format.into()),
            bitrate: Some(bitrate),
            analyzed,
            playlists: (0..playlists).map(|i| (i, format!("P{i}"))).collect(),
            plays,
            file_missing: false,
        }
    }

    fn missing(mut c: CopyFacts) -> CopyFacts {
        c.file_missing = true;
        c
    }

    #[test]
    fn a_copy_whose_file_is_gone_never_wins() {
        let copies = [missing(copy(1, "wav", 1411, true, 3, 10)), copy(2, "mp3", 128, false, 0, 0)];
        assert_eq!(rec(&copies), (2, "file on disk".into()));
    }

    #[test]
    fn file_on_disk_comes_first_in_the_reason() {
        let copies = [missing(copy(1, "mp3", 320, false, 0, 0)), copy(2, "mp3", 320, true, 0, 0)];
        assert_eq!(rec(&copies), (2, "file on disk · analyzed".into()));
    }

    #[test]
    fn copy_facts_flags_a_file_that_is_not_on_disk() {
        let dir = tempfile::TempDir::new().unwrap();
        let here = dir.path().join("here.mp3");
        std::fs::write(&here, b"x").unwrap();
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        db.conn
            .execute(
                "INSERT INTO tracks (id, file_path, file_hash) VALUES (1, ?1, 'a'), (2, '/m/gone.mp3', 'b')",
                [here.to_string_lossy().to_string()],
            )
            .unwrap();
        let mut tracks = db.get_all_tracks().unwrap();
        tracks.sort_by_key(|t| t.id);

        let facts = db.copy_facts(&tracks).unwrap();

        assert!(!facts[0].file_missing);
        assert!(facts[1].file_missing);
    }

    fn rec(copies: &[CopyFacts]) -> (i64, String) {
        recommend(copies).unwrap()
    }

    #[test]
    fn lossless_beats_a_lossy_copy_that_is_in_more_playlists() {
        assert_eq!(rec(&[copy(1, "mp3", 320, true, 3, 10), copy(2, "wav", 1411, false, 0, 0)]), (2, "WAV (lossless)".into()));
    }

    #[test]
    fn aif_counts_as_lossless_and_reads_aiff() {
        assert_eq!(rec(&[copy(1, "mp3", 320, false, 0, 0), copy(2, "aif", 1411, false, 0, 0)]), (2, "AIFF (lossless)".into()));
    }

    #[test]
    fn m4a_is_lossless_only_at_alac_bitrates() {
        assert_eq!(rec(&[copy(1, "mp3", 320, false, 0, 0), copy(2, "m4a", 256, false, 0, 0)]), (1, "320 kbps".into()));
        assert_eq!(rec(&[copy(1, "mp3", 320, false, 0, 0), copy(2, "m4a", 900, false, 0, 0)]), (2, "ALAC (lossless)".into()));
    }

    #[test]
    fn between_lossless_copies_the_bitrate_shows() {
        assert_eq!(rec(&[copy(1, "flac", 900, false, 0, 0), copy(2, "wav", 1411, false, 0, 0)]), (2, "1411 kbps".into()));
    }

    #[test]
    fn analyzed_then_playlists_and_the_reason_shows_the_first_two() {
        assert_eq!(rec(&[copy(1, "mp3", 320, false, 0, 0), copy(2, "mp3", 320, true, 2, 9)]), (2, "analyzed · in 2 playlists".into()));
    }

    #[test]
    fn playlists_then_plays() {
        assert_eq!(rec(&[copy(1, "mp3", 320, true, 0, 0), copy(2, "mp3", 320, true, 1, 6)]), (2, "in 1 playlist · 6 plays".into()));
    }

    #[test]
    fn plays_alone_decide() {
        assert_eq!(rec(&[copy(1, "mp3", 320, true, 1, 1), copy(2, "mp3", 320, true, 1, 2)]), (2, "2 plays".into()));
    }

    #[test]
    fn the_earlier_import_wins_a_tie() {
        assert_eq!(rec(&[copy(5, "mp3", 320, true, 1, 1), copy(3, "mp3", 320, true, 1, 1)]), (3, "added first".into()));
    }

    #[test]
    fn the_reason_compares_with_the_runner_up() {
        let copies = [copy(1, "wav", 1411, true, 2, 0), copy(2, "wav", 1411, true, 1, 0), copy(3, "mp3", 128, false, 0, 0)];
        assert_eq!(rec(&copies), (1, "in 2 playlists".into()));
    }

    #[test]
    fn copy_facts_reads_playlists_by_name_analysis_and_plays() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        db.conn
            .execute_batch(
                "INSERT INTO tracks (id, file_path, file_hash, file_format, bitrate) VALUES
                   (1, '/m/a.mp3', 'a', 'mp3', 320), (2, '/m/b.wav', 'b', 'wav', 1411);
                 INSERT INTO playlists (id, name) VALUES (10, 'Zeta'), (11, 'Alpha');
                 INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (10, 1, 0), (11, 1, 0);
                 INSERT INTO track_analysis (track_id, bpm) VALUES (1, 124.0);
                 INSERT INTO track_analysis (track_id, waveform_overview) VALUES (2, x'00');",
            )
            .unwrap();
        for at in [100, 200] {
            db.conn
                .execute("INSERT INTO play_history (track_id, played_at) VALUES (1, ?1)", params![at])
                .unwrap();
        }
        let mut tracks = db.get_all_tracks().unwrap();
        tracks.sort_by_key(|t| t.id);

        let facts = db.copy_facts(&tracks).unwrap();

        assert_eq!(facts[0].playlists, vec![(11, "Alpha".to_string()), (10, "Zeta".to_string())]);
        assert!(facts[0].analyzed);
        assert_eq!(facts[0].plays, 2);
        assert!(!facts[1].analyzed);
        assert_eq!(facts[1].file_format.as_deref(), Some("wav"));
    }
}
