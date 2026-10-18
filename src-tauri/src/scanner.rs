// Library scanner - Find and extract metadata from audio files

use crate::db::missing::{FileFacts, HashMatch, RelinkOutcome};
use crate::db::{Database, Track};
use lofty::config::{ParseOptions, ParsingMode};
use lofty::file::TaggedFile;
use lofty::prelude::*;
use lofty::probe::Probe;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// Supported audio file extensions
const SUPPORTED_EXTENSIONS: &[&str] = &["mp3", "flac", "wav", "aiff", "aif", "m4a", "ogg"];

/// Result of scanning a directory
#[derive(Debug)]
pub struct ScanResult {
    pub total_files: usize,
    pub imported: usize,
    pub skipped: usize,
    /// Tracks whose file was gone, now pointing at the moved file (Missing Files spec).
    pub relinked: usize,
    pub errors: Vec<ScanError>,
}

/// Errors that can occur during scanning
#[derive(Debug)]
pub struct ScanError {
    pub file_path: PathBuf,
    pub error: String,
}

/// What importing one file did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImportOutcome {
    Imported(i64),
    /// A track whose file was gone now points at this file (Missing Files spec).
    Relinked(i64),
}

/// Library scanner
pub struct Scanner;

impl Scanner {
    /// Scan a directory recursively for audio files
    pub fn scan_directory(path: &Path) -> Vec<PathBuf> {
        let mut audio_files = Vec::new();

        for entry in WalkDir::new(path)
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if let Some(ext) = path.extension() {
                let ext_str = ext.to_string_lossy().to_lowercase();
                if SUPPORTED_EXTENSIONS.contains(&ext_str.as_str()) {
                    audio_files.push(path.to_path_buf());
                }
            }
        }

        audio_files
    }

    /// Calculate SHA256 hash of a file (for change detection)
    pub fn calculate_file_hash(path: &Path) -> Result<String, std::io::Error> {
        let mut file = fs::File::open(path)?;
        let mut hasher = Sha256::new();
        let mut buffer = [0; 8192];

        loop {
            let bytes_read = file.read(&mut buffer)?;
            if bytes_read == 0 {
                break;
            }
            hasher.update(&buffer[..bytes_read]);
        }

        Ok(format!("{:x}", hasher.finalize()))
    }

    /// Extract metadata from an audio file.
    /// Returns the track, an optional BPM, an optional Genre, and an optional
    /// key (as Camelot) if present in file tags.
    pub fn extract_metadata(path: &Path) -> Result<(Track, Option<f64>, Option<String>, Option<String>), String> {
        let tagged_file = read_audio_file(path)
            .map_err(|e| format!("Failed to read file: {}", e))?;

        // Get file properties (duration, sample rate, etc.)
        let properties = tagged_file.properties();
        let duration_ms = properties.duration().as_millis() as i32;
        let sample_rate = properties.sample_rate().map(|r| r as i32);
        let bitrate = properties.audio_bitrate().map(|b| b as i32);

        // Get file size
        let file_size = fs::metadata(path)
            .ok()
            .map(|m| m.len() as i64);

        // Calculate file hash
        let file_hash = Self::calculate_file_hash(path)
            .unwrap_or_else(|_| "unknown".to_string());

        // Get format
        let file_format = path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|s| s.to_lowercase());

        // Extract tags (try primary tag first, then fallback to first available)
        let tag = tagged_file.primary_tag()
            .or_else(|| tagged_file.first_tag());

        let (title, artist, album, album_artist, track_number, year, label, comment, tag_bpm, tag_genre, tag_key) = if let Some(tag) = tag {
            // BPM from file tags (ID3 TBPM, etc.) so we match Traktor/Rekordbox when they wrote it
            let bpm_str = tag.get_string(&ItemKey::Bpm)
                .or_else(|| tag.get_string(&ItemKey::IntegerBpm));
            let bpm = bpm_str.and_then(|s| s.trim().parse::<f64>().ok())
                .filter(|&b| (40.0..=300.0).contains(&b));

            // Genre from file tags (ID3 TCON, Vorbis GENRE, etc.)
            let genre = tag.genre().as_deref().map(|s| s.to_string());

            // Key from the tags (ID3 TKEY, MP4 initialkey, Vorbis INITIALKEY/KEY), as Camelot.
            let key = tag.get_string(&ItemKey::InitialKey).and_then(crate::formats::keys::camelot_from_tag);

            (
                tag.title().as_deref().map(|s| s.to_string()),
                tag.artist().as_deref().map(|s| s.to_string()),
                tag.album().as_deref().map(|s| s.to_string()),
                tag.get_string(&ItemKey::AlbumArtist).map(|s| s.to_string()),
                tag.track().map(|t| t as i32),
                tag.year().map(|y| y as i32),
                tag.get_string(&ItemKey::Label).map(|s| s.to_string()),
                tag.comment().as_deref().map(|s| s.to_string()),
                bpm,
                genre,
                key,
            )
        } else {
            (None, None, None, None, None, None, None, None, None, None, None)
        };

        // Fallback: use filename (without extension) as title if tags are missing
        let title = title.or_else(|| {
            path.file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.to_string())
        });

        let raw_path = path.to_string_lossy().to_string();
        let normalized_path = normalize_scanned_path(&raw_path);

        Ok((Track {
            id: None,
            file_path: normalized_path,
            file_hash,
            title,
            artist,
            album,
            album_artist,
            track_number,
            year,
            label,
            duration_ms: Some(duration_ms),
            file_format,
            bitrate,
            sample_rate,
            file_size,
            date_added: None,
            date_modified: None,
            play_count: 0,
            rating: 0,
            comment,
            artwork_path: None,
            genre: None, // Genre will be set after track creation based on tag_genre and source priority
            genre_source: None,
        }, tag_bpm, tag_genre, tag_key))
    }

    /// Import a single file into the database.
    /// If the file has BPM or a key in its tags (e.g. from Traktor), they are saved to track_analysis so RecoDeck matches.
    /// If the file has Genre in its tags, it is saved with source='tag'.
    /// A file whose content is already in the library is skipped, unless every
    /// track with that content lost its file: then the lowest one follows this
    /// file (Missing Files spec, section 1).
    pub fn import_file(db: &Database, path: &Path) -> Result<ImportOutcome, String> {
        let (track, tag_bpm, tag_genre, tag_key) = Self::extract_metadata(path)?;

        match db
            .match_scanned_hash(&track.file_hash)
            .map_err(|e| format!("Database error: {}", e))?
        {
            HashMatch::Duplicate => return Err("DUPLICATE_HASH".to_string()),
            HashMatch::Moved(id) => {
                return match db
                    .relink_track(id, &FileFacts::from_track(&track))
                    .map_err(|e| format!("Database error: {}", e))?
                {
                    RelinkOutcome::Relinked | RelinkOutcome::AlreadyThere => Ok(ImportOutcome::Relinked(id)),
                    RelinkOutcome::Taken | RelinkOutcome::TrackGone => Err("DUPLICATE_HASH".to_string()),
                };
            }
            HashMatch::New => {}
        }

        let id = db.create_track(&track)
            .map_err(|e| format!("Database error: {}", e))?;

        Self::save_tag_values(db, id, tag_bpm, tag_genre, tag_key);

        Ok(ImportOutcome::Imported(id))
    }

    /// What a new track's tags give the library (spec 2026-10-17, §4). BPM
    /// and key fill in until analysis replaces them (no confidence, no
    /// version). A genre is saved with source 'tag', below anything the
    /// user set. Both import paths call this.
    pub fn save_tag_values(db: &Database, id: i64, bpm: Option<f64>, genre: Option<String>, key: Option<String>) {
        let _ = db.save_tag_analysis(id, bpm, key.as_deref());
        if let Some(genre) = genre {
            let _ = db.save_track_genre(id, &genre, "tag");
        }
    }

    /// Import all files from a directory
    pub fn import_directory(db: &Database, path: &Path) -> ScanResult {
        let files = Self::scan_directory(path);
        let total_files = files.len();
        let mut imported = 0;
        let mut skipped = 0;
        let mut relinked = 0;
        let mut errors = Vec::new();

        // Load all known paths in one query for fast lookups
        let known_paths = db.get_all_file_paths().unwrap_or_default();

        for file_path in files {
            // Fast path: skip files already in DB by path (avoids expensive hash + metadata)
            let path_str = file_path.to_string_lossy().to_string();
            if known_paths.contains(&path_str) {
                skipped += 1;
                continue;
            }

            match Self::import_file(db, &file_path) {
                Ok(ImportOutcome::Imported(_)) => imported += 1,
                Ok(ImportOutcome::Relinked(_)) => relinked += 1,
                Err(e) => {
                    // Check if it's a duplicate (unique constraint violation or same content hash)
                    if e.contains("UNIQUE constraint") || e.contains("DUPLICATE_HASH") {
                        skipped += 1;
                    } else {
                        errors.push(ScanError {
                            file_path: file_path.clone(),
                            error: e,
                        });
                    }
                }
            }
        }

        ScanResult {
            total_files,
            imported,
            skipped,
            relinked,
            errors,
        }
    }
}

/// Reads a file's tags and audio properties with lofty. A damaged tag never
/// keeps playable audio out: a normal read that fails is retried relaxed,
/// then without tags (the title then comes from the file name). The error
/// is the last read's, which is about the audio itself.
pub(crate) fn read_audio_file(path: &Path) -> lofty::error::Result<TaggedFile> {
    let read = |options: ParseOptions| Probe::open(path)?.options(options).read();
    read(ParseOptions::new())
        .or_else(|_| read(ParseOptions::new().parsing_mode(ParsingMode::Relaxed)))
        .or_else(|_| read(ParseOptions::new().read_tags(false)))
}

// Normalize file path: MINIMAL normalization to preserve special characters.
// This function ONLY:
// 1. Strips file:// prefix if present
// 2. On Windows: converts backslash path separators to forward slashes
// 3. Collapses repeated slashes (//) 
// 4. Removes trailing slash
// 5. Ensures absolute path on Unix
// 
// IMPORTANT: All other characters (spaces, commas, brackets, backslashes on macOS/Linux, etc.)
// are preserved exactly as-is. DJ music files often have special characters in names.
pub(crate) fn normalize_scanned_path(input: &str) -> String {
    let mut s = input.trim().to_string();
    if s.is_empty() {
        return s;
    }

    // Strip file:// prefix if present
    if let Some(rest) = s.strip_prefix("file://") {
        s = rest.to_string();
    }

    // On Windows: convert backslashes (path separators) to forward slashes
    // On macOS/Linux: preserve backslashes (they're valid filename characters)
    #[cfg(target_os = "windows")]
    {
        s = s.replace('\\', "/");
    }

    // Collapse repeated slashes (//) while preserving ALL other characters
    let mut out = String::with_capacity(s.len());
    let mut prev_slash = false;
    for ch in s.chars() {
        if ch == '/' {
            if prev_slash {
                continue; // Skip duplicate slash
            }
            prev_slash = true;
            out.push(ch);
        } else {
            prev_slash = false;
            out.push(ch); // Keep everything else: spaces, commas, brackets, etc.
        }
    }
    s = out;

    // Remove trailing slash (except for root /)
    while s.ends_with('/') && s.len() > 1 {
        s.pop();
    }

    // Ensure absolute path on Unix systems
    #[cfg(not(target_os = "windows"))]
    {
        if !s.starts_with('/') {
            s = format!("/{}", s);
        }
    }

    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{self, File};
    use std::io::Write;
    use tempfile::TempDir;

    fn create_temp_audio_files() -> TempDir {
        let temp_dir = TempDir::new().unwrap();
        
        // Create a subdirectory
        let subdir = temp_dir.path().join("subdir");
        fs::create_dir(&subdir).unwrap();

        // Create dummy files (not real audio, but with correct extensions)
        let files = vec![
            temp_dir.path().join("track1.mp3"),
            temp_dir.path().join("track2.flac"),
            subdir.join("track3.wav"),
            temp_dir.path().join("not_audio.txt"),
        ];

        for file in &files {
            let mut f = File::create(file).unwrap();
            f.write_all(b"dummy content").unwrap();
        }

        temp_dir
    }

    #[test]
    fn test_scan_directory_finds_audio_files() {
        let temp_dir = create_temp_audio_files();
        let audio_files = Scanner::scan_directory(temp_dir.path());

        // Should find 3 audio files (mp3, flac, wav) but not the txt file
        assert_eq!(audio_files.len(), 3);
        
        let extensions: Vec<_> = audio_files
            .iter()
            .filter_map(|p| p.extension())
            .map(|e| e.to_string_lossy().to_lowercase())
            .collect();
        
        assert!(extensions.contains(&"mp3".to_string()));
        assert!(extensions.contains(&"flac".to_string()));
        assert!(extensions.contains(&"wav".to_string()));
        assert!(!extensions.contains(&"txt".to_string()));
    }

    #[test]
    fn test_scan_empty_directory() {
        let temp_dir = TempDir::new().unwrap();
        let audio_files = Scanner::scan_directory(temp_dir.path());
        assert_eq!(audio_files.len(), 0);
    }

    #[test]
    fn test_calculate_file_hash() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");
        let mut file = File::create(&file_path).unwrap();
        file.write_all(b"test content").unwrap();

        let hash1 = Scanner::calculate_file_hash(&file_path).unwrap();
        assert_eq!(hash1.len(), 64); // SHA256 produces 64 hex characters

        // Same content should produce same hash
        let hash2 = Scanner::calculate_file_hash(&file_path).unwrap();
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_different_content_different_hash() {
        let temp_dir = TempDir::new().unwrap();
        
        let file1 = temp_dir.path().join("file1.txt");
        let mut f1 = File::create(&file1).unwrap();
        f1.write_all(b"content A").unwrap();

        let file2 = temp_dir.path().join("file2.txt");
        let mut f2 = File::create(&file2).unwrap();
        f2.write_all(b"content B").unwrap();

        let hash1 = Scanner::calculate_file_hash(&file1).unwrap();
        let hash2 = Scanner::calculate_file_hash(&file2).unwrap();

        assert_ne!(hash1, hash2);
    }

    #[test]
    fn test_supported_extensions() {
        assert!(SUPPORTED_EXTENSIONS.contains(&"mp3"));
        assert!(SUPPORTED_EXTENSIONS.contains(&"flac"));
        assert!(SUPPORTED_EXTENSIONS.contains(&"wav"));
        assert!(SUPPORTED_EXTENSIONS.contains(&"aiff"));
        assert!(!SUPPORTED_EXTENSIONS.contains(&"txt"));
    }

    #[test]
    fn test_import_directory_integration() {
        // Create in-memory database
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        // Create temp directory with dummy audio files
        let temp_dir = create_temp_audio_files();

        // Attempt to scan and import
        // Note: These are dummy files, so metadata extraction will fail,
        // but we can verify the scanning and error handling works
        let result = Scanner::import_directory(&db, temp_dir.path());

        assert_eq!(result.total_files, 3); // Found 3 audio files
        // All should error because they're not real audio files
        assert!(result.errors.len() > 0 || result.imported > 0);
        
        // Verify database is still functional after errors
        let count = db.count_tracks().unwrap();
        assert_eq!(count, result.imported as i64);
    }

    #[test]
    fn test_scan_result_counts() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let temp_dir = TempDir::new().unwrap();
        
        // Empty directory should have zero results
        let result = Scanner::import_directory(&db, temp_dir.path());
        assert_eq!(result.total_files, 0);
        assert_eq!(result.imported, 0);
        assert_eq!(result.skipped, 0);
        assert_eq!(result.errors.len(), 0);
    }

    #[test]
    fn normalize_scanned_path_collapses_slashes_and_strips_file_scheme() {
        assert_eq!(normalize_scanned_path("/m//a///b.mp3"), "/m/a/b.mp3");
        assert_eq!(normalize_scanned_path("file:///m/a.mp3"), "/m/a.mp3");
        assert_eq!(normalize_scanned_path("/m/dir/"), "/m/dir");
    }

    fn blank_track(path: &str, hash: &str) -> Track {
        Track {
            id: None,
            file_path: path.into(),
            file_hash: hash.into(),
            title: None,
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
        }
    }

    #[test]
    fn a_moved_file_with_the_same_content_relinks_its_track() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        let dir = TempDir::new().unwrap();
        let old = dir.path().join("a/song.wav");
        crate::test_support::write_wav(&old, 1000, 1);
        assert_eq!(Scanner::import_directory(&db, dir.path()).imported, 1);
        let id = db.get_all_tracks().unwrap()[0].id;

        std::fs::create_dir_all(dir.path().join("b")).unwrap();
        std::fs::rename(&old, dir.path().join("b/song.wav")).unwrap();
        let second = Scanner::import_directory(&db, dir.path());

        assert_eq!((second.imported, second.relinked, second.skipped), (0, 1, 0));
        let tracks = db.get_all_tracks().unwrap();
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].id, id);
        assert!(tracks[0].file_path.ends_with("/b/song.wav"));
    }

    #[test]
    fn a_copy_of_a_track_that_still_has_its_file_is_skipped() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        let dir = TempDir::new().unwrap();
        let original = dir.path().join("a/song.wav");
        crate::test_support::write_wav(&original, 1000, 1);
        Scanner::import_directory(&db, dir.path());

        std::fs::create_dir_all(dir.path().join("b")).unwrap();
        std::fs::copy(&original, dir.path().join("b/copy.wav")).unwrap();
        let second = Scanner::import_directory(&db, dir.path());

        assert_eq!((second.imported, second.relinked, second.skipped), (0, 0, 2));
        assert_eq!(db.count_tracks().unwrap(), 1);
    }

    #[test]
    fn of_two_stale_tracks_with_the_same_content_the_lowest_id_relinks() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("song.wav");
        crate::test_support::write_wav(&file, 1000, 1);
        let hash = Scanner::calculate_file_hash(&file).unwrap();
        let first = db.create_track(&blank_track("/gone/a.wav", &hash)).unwrap();
        let second = db.create_track(&blank_track("/gone/b.wav", &hash)).unwrap();

        let result = Scanner::import_directory(&db, dir.path());

        assert_eq!(result.relinked, 1);
        assert!(db.get_track(first).unwrap().file_path.ends_with("/song.wav"));
        assert_eq!(db.get_track(second).unwrap().file_path, "/gone/b.wav");
    }

    #[test]
    fn a_file_with_a_damaged_tag_is_still_imported_with_its_name_as_title() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("Artist - Song.wav");
        crate::test_support::write_wav_with_broken_tag(&file, 2000, 1);
        assert!(lofty::read_from_path(&file).is_err(), "the fixture must break a normal read");

        let (track, _, _, _) = Scanner::extract_metadata(&file).unwrap();

        assert_eq!(track.title.as_deref(), Some("Artist - Song"));
        assert_eq!(track.duration_ms, Some(2000));
    }

    #[test]
    fn a_key_tag_is_imported_as_camelot_without_confidence() {
        use lofty::config::WriteOptions;
        use lofty::tag::{ItemKey, Tag, TagExt, TagType};
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("keyed.wav");
        crate::test_support::write_wav(&file, 1000, 3);
        let mut tag = Tag::new(TagType::Id3v2);
        assert!(tag.insert_text(ItemKey::InitialKey, "1m".to_string()));
        tag.save_to_path(&file, WriteOptions::default()).unwrap();

        let (_, _, _, tag_key) = Scanner::extract_metadata(&file).unwrap();
        assert_eq!(tag_key.as_deref(), Some("8A"));

        let ImportOutcome::Imported(id) = Scanner::import_file(&db, &file).unwrap() else { panic!("not imported") };
        let analysis = db.get_track_analysis(id).unwrap().expect("a row");
        assert_eq!(analysis.musical_key.as_deref(), Some("8A"));
        assert_eq!(analysis.key_confidence, None);
    }
}
