// Library scanner - Find and extract metadata from audio files

use crate::db::{Database, Track};
use lofty::prelude::*;
use lofty::read_from_path;
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
    pub errors: Vec<ScanError>,
}

/// Errors that can occur during scanning
#[derive(Debug)]
pub struct ScanError {
    pub file_path: PathBuf,
    pub error: String,
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
    /// Returns the track, an optional BPM, and an optional Genre if present in file tags.
    pub fn extract_metadata(path: &Path) -> Result<(Track, Option<f64>, Option<String>), String> {
        // Read file with lofty
        let tagged_file = read_from_path(path)
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

        let (title, artist, album, album_artist, track_number, year, label, comment, tag_bpm, tag_genre) = if let Some(tag) = tag {
            // BPM from file tags (ID3 TBPM, etc.) so we match Traktor/Rekordbox when they wrote it
            let bpm_str = tag.get_string(&ItemKey::Bpm)
                .or_else(|| tag.get_string(&ItemKey::IntegerBpm));
            let bpm = bpm_str.and_then(|s| s.trim().parse::<f64>().ok())
                .filter(|&b| b >= 40.0 && b <= 300.0);

            // Genre from file tags (ID3 TCON, Vorbis GENRE, etc.)
            let genre = tag.genre().as_deref().map(|s| s.to_string());

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
            )
        } else {
            (None, None, None, None, None, None, None, None, None, None)
        };

        // Fallback: use filename (without extension) as title if tags are missing
        let title = title.or_else(|| {
            path.file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.to_string())
        });

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
        fn normalize_scanned_path(input: &str) -> String {
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
        }, tag_bpm, tag_genre))
    }

    /// Import a single file into the database.
    /// If the file has BPM in its tags (e.g. from Traktor), it is saved to track_analysis so RecoDeck matches.
    /// If the file has Genre in its tags, it is saved with source='tag'.
    /// Skips files whose content hash already exists (prevents duplicate content at different paths).
    pub fn import_file(db: &Database, path: &Path) -> Result<i64, String> {
        let (track, tag_bpm, tag_genre) = Self::extract_metadata(path)?;

        // Skip if a track with the same content hash already exists (different path, same file)
        if track.file_hash != "unknown" {
            if db.track_exists_with_hash(&track.file_hash)
                .map_err(|e| format!("Database error: {}", e))? {
                return Err("DUPLICATE_HASH".to_string());
            }
        }

        let id = db.create_track(&track)
            .map_err(|e| format!("Database error: {}", e))?;

        // If file has BPM in tags (e.g. Traktor wrote TBPM), store it so we match when user checks in Traktor
        if let Some(bpm) = tag_bpm {
            let _ = db.save_bpm_analysis(id, bpm, 0.99);
        }

        // If file has Genre in tags (ID3 TCON, Vorbis GENRE, etc.), save it with source='tag'
        // This will NOT overwrite any user-assigned genre (priority: user > tag > ai)
        if let Some(genre) = tag_genre {
            let _ = db.save_track_genre(id, &genre, "tag");
        }

        Ok(id)
    }

    /// Import all files from a directory
    pub fn import_directory(db: &Database, path: &Path) -> ScanResult {
        let files = Self::scan_directory(path);
        let total_files = files.len();
        let mut imported = 0;
        let mut skipped = 0;
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
                Ok(_) => imported += 1,
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
            errors,
        }
    }
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
}
