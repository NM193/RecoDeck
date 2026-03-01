// Track context builder for AI consumption
//
// Prepares optimized JSON representation of the music library
// for Claude API with intelligent filtering and token optimization

use crate::db::{Track, TrackAnalysis};
use crate::error::AppError;
use serde::{Deserialize, Serialize};
use serde_json;

/// Condensed track representation for AI context
#[derive(Debug, Serialize, Deserialize)]
pub struct TrackContext {
    pub id: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bpm: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_s: Option<i32>,
}

/// Library statistics for AI context
#[derive(Debug, Serialize, Deserialize)]
pub struct LibraryStats {
    pub total_tracks: usize,
    pub analyzed_tracks: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bpm_range: Option<(i32, i32)>,
    pub common_keys: Vec<String>,
}

/// Complete context sent to AI
#[derive(Debug, Serialize, Deserialize)]
pub struct AIContext {
    pub library_stats: LibraryStats,
    pub tracks: Vec<TrackContext>,
}

pub struct TrackContextBuilder;

impl TrackContextBuilder {
    /// Build full context from all tracks and their analysis
    pub fn build_full_context(
        tracks: &[(Track, Option<TrackAnalysis>)]
    ) -> Result<String, AppError> {
        let track_contexts: Vec<TrackContext> = tracks
            .iter()
            .map(|(track, analysis)| Self::track_to_context(track, analysis.as_ref()))
            .collect();

        let stats = Self::calculate_stats(tracks);

        let context = AIContext {
            library_stats: stats,
            tracks: track_contexts,
        };

        serde_json::to_string_pretty(&context)
            .map_err(|e| AppError::Internal(format!("Failed to serialize context: {}", e)))
    }

    /// Build smart context with filtering based on prompt keywords
    /// For large libraries (>5K tracks), this intelligently filters tracks
    pub fn build_smart_context(
        tracks: &[(Track, Option<TrackAnalysis>)],
        prompt: &str,
    ) -> Result<String, AppError> {
        let prompt_lower = prompt.to_lowercase();

        // Extract potential filters from prompt
        let filtered_tracks: Vec<(Track, Option<TrackAnalysis>)> = tracks
            .iter()
            .filter(|(track, analysis)| {
                Self::matches_prompt_keywords(track, analysis.as_ref(), &prompt_lower)
            })
            .cloned()
            .collect();

        // If filtering reduced the set significantly, use filtered tracks
        // Otherwise, use all tracks (prompt might be too generic)
        let tracks_to_use = if filtered_tracks.len() < tracks.len() / 2 && !filtered_tracks.is_empty() {
            &filtered_tracks
        } else {
            tracks
        };

        // Limit to 5000 tracks max to stay under token limits
        let limited_tracks: Vec<(Track, Option<TrackAnalysis>)> = tracks_to_use
            .iter()
            .take(5000)
            .cloned()
            .collect();

        Self::build_full_context(&limited_tracks)
    }

    /// Build context filtered by proximity to a seed track's BPM and key.
    /// Used for structured seed-track playlist generation.
    ///
    /// Filtering strategy by energy direction:
    /// - build_up: include tracks from seed_bpm to seed_bpm + 25
    /// - wind_down: include tracks from seed_bpm - 25 to seed_bpm
    /// - maintain: include tracks within ±15 BPM of seed
    ///
    /// Key filtering: include tracks within 2 Camelot steps of seed key.
    /// Always includes the seed track itself.
    /// Falls back to full context if seed has no BPM/key data.
    pub fn build_seed_context(
        tracks: &[(Track, Option<TrackAnalysis>)],
        seed_bpm: Option<f64>,
        seed_key: Option<&str>,
        energy_direction: &str,
    ) -> Result<String, AppError> {
        // If no BPM or key info, fall back to full context (limited to 5000)
        if seed_bpm.is_none() && seed_key.is_none() {
            let limited: Vec<(Track, Option<TrackAnalysis>)> = tracks
                .iter()
                .take(5000)
                .cloned()
                .collect();
            return Self::build_full_context(&limited);
        }

        let filtered: Vec<(Track, Option<TrackAnalysis>)> = tracks
            .iter()
            .filter(|(_track, analysis)| {
                // Always include tracks even if they lack analysis (Claude can still use metadata)
                let bpm_ok = match (seed_bpm, analysis.as_ref().and_then(|a| a.bpm)) {
                    (Some(seed), Some(track_bpm)) => {
                        match energy_direction {
                            "build_up" => track_bpm >= seed - 5.0 && track_bpm <= seed + 25.0,
                            "wind_down" => track_bpm >= seed - 25.0 && track_bpm <= seed + 5.0,
                            _ => (track_bpm - seed).abs() <= 15.0, // maintain
                        }
                    }
                    (None, _) => true, // No seed BPM, include all
                    (Some(_), None) => true, // Track not analyzed, include anyway
                };

                let key_ok = match (seed_key, analysis.as_ref().and_then(|a| a.musical_key.as_deref())) {
                    (Some(seed_k), Some(track_k)) => {
                        Self::is_camelot_compatible(seed_k, track_k, 2)
                    }
                    _ => true, // No key info, include
                };

                bpm_ok || key_ok // Include if EITHER matches (not both -- too restrictive)
            })
            .take(5000)
            .cloned()
            .collect();

        // If filtering was too aggressive, fall back to broader set
        if filtered.len() < 20 {
            let broader: Vec<(Track, Option<TrackAnalysis>)> = tracks
                .iter()
                .take(5000)
                .cloned()
                .collect();
            return Self::build_full_context(&broader);
        }

        Self::build_full_context(&filtered)
    }

    /// Check if two Camelot keys are within `max_steps` of each other.
    /// Camelot keys are "NL" format: number 1-12, letter A or B.
    /// Compatible = same letter ± max_steps, or same number different letter.
    pub(crate) fn is_camelot_compatible(key_a: &str, key_b: &str, max_steps: i32) -> bool {
        let parse = |k: &str| -> Option<(i32, char)> {
            let k = k.trim();
            if k.len() < 2 || k.len() > 3 { return None; }
            let letter = k.chars().last()?;
            if letter != 'A' && letter != 'B' { return None; }
            let num: i32 = k[..k.len()-1].parse().ok()?;
            if !(1..=12).contains(&num) { return None; }
            Some((num, letter))
        };

        let (num_a, let_a) = match parse(key_a) { Some(v) => v, None => return false };
        let (num_b, let_b) = match parse(key_b) { Some(v) => v, None => return false };

        // Same number, different letter (inner/outer circle) = always compatible
        if num_a == num_b && let_a != let_b {
            return true;
        }

        // Same letter, check distance on the circular wheel (1-12)
        if let_a == let_b {
            let diff = (num_a - num_b).abs();
            let circular_diff = diff.min(12 - diff);
            return circular_diff <= max_steps;
        }

        false
    }

    /// Convert Track + TrackAnalysis to condensed TrackContext
    fn track_to_context(track: &Track, analysis: Option<&TrackAnalysis>) -> TrackContext {
        TrackContext {
            id: track.id.unwrap_or(0),
            title: track.title.clone(),
            artist: track.artist.clone(),
            album: track.album.clone(),
            label: track.label.clone(),
            year: track.year,
            bpm: analysis.and_then(|a| a.bpm).map(|b| (b * 10.0).round() / 10.0), // Round to 1 decimal
            key: analysis.and_then(|a| a.musical_key.clone()),
            duration_s: track.duration_ms.map(|ms| ms / 1000),
        }
    }

    /// Calculate library statistics
    fn calculate_stats(tracks: &[(Track, Option<TrackAnalysis>)]) -> LibraryStats {
        let total = tracks.len();
        let analyzed = tracks.iter().filter(|(_, a)| a.is_some()).count();

        // Calculate BPM range
        let bpms: Vec<i32> = tracks
            .iter()
            .filter_map(|(_, a)| a.as_ref()?.bpm.map(|b| b.round() as i32))
            .collect();

        let bpm_range = if !bpms.is_empty() {
            Some((*bpms.iter().min().unwrap(), *bpms.iter().max().unwrap()))
        } else {
            None
        };

        // Find most common keys (top 5)
        let mut key_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        for (_, analysis) in tracks {
            if let Some(ref a) = analysis {
                if let Some(ref key) = a.musical_key {
                    *key_counts.entry(key.clone()).or_insert(0) += 1;
                }
            }
        }

        let mut key_vec: Vec<(String, usize)> = key_counts.into_iter().collect();
        key_vec.sort_by(|a, b| b.1.cmp(&a.1));
        let common_keys: Vec<String> = key_vec.iter().take(5).map(|(k, _)| k.clone()).collect();

        LibraryStats {
            total_tracks: total,
            analyzed_tracks: analyzed,
            bpm_range,
            common_keys,
        }
    }

    /// Check if track matches prompt keywords
    fn matches_prompt_keywords(
        track: &Track,
        analysis: Option<&TrackAnalysis>,
        prompt_lower: &str,
    ) -> bool {
        // Check artist
        if let Some(ref artist) = track.artist {
            if prompt_lower.contains(&artist.to_lowercase()) {
                return true;
            }
        }

        // Check label
        if let Some(ref label) = track.label {
            if prompt_lower.contains(&label.to_lowercase()) {
                return true;
            }
        }

        // Check BPM range (e.g., "120 bpm", "128-130")
        if let Some(a) = analysis {
            if let Some(bpm) = a.bpm {
                let bpm_int = bpm.round() as i32;
                if prompt_lower.contains(&format!("{}", bpm_int)) {
                    return true;
                }
            }

            // Check key
            if let Some(ref key) = a.musical_key {
                if prompt_lower.contains(&key.to_lowercase()) {
                    return true;
                }
            }
        }

        // Check genre keywords in comment or title
        let genre_keywords = ["techno", "house", "trance", "progressive", "deep", "minimal"];
        for keyword in &genre_keywords {
            if prompt_lower.contains(keyword) {
                if let Some(ref title) = track.title {
                    if title.to_lowercase().contains(keyword) {
                        return true;
                    }
                }
                if let Some(ref comment) = track.comment {
                    if comment.to_lowercase().contains(keyword) {
                        return true;
                    }
                }
            }
        }

        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // -------------------------------------------------------------------------
    // Helper functions for concise test construction
    // -------------------------------------------------------------------------

    fn make_test_track(id: i64, title: &str) -> Track {
        Track {
            id: Some(id),
            file_path: format!("/test/{}.mp3", id),
            file_hash: format!("hash{}", id),
            title: Some(title.to_string()),
            artist: None,
            album: None,
            album_artist: None,
            track_number: None,
            year: None,
            label: None,
            duration_ms: Some(240000),
            file_format: Some("mp3".to_string()),
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

    fn make_test_track_with_artist(id: i64, title: &str, artist: &str) -> Track {
        Track {
            artist: Some(artist.to_string()),
            ..make_test_track(id, title)
        }
    }

    fn make_test_analysis(bpm: f64, key: &str) -> TrackAnalysis {
        TrackAnalysis {
            track_id: 0,
            bpm: Some(bpm),
            bpm_confidence: Some(0.9),
            musical_key: Some(key.to_string()),
            key_confidence: Some(0.85),
            loudness_lufs: None,
            dynamic_range: None,
            spectral_centroid: None,
            analyzed_at: None,
        }
    }

    // -------------------------------------------------------------------------
    // Existing serialization test
    // -------------------------------------------------------------------------

    #[test]
    fn test_track_context_serialization() {
        let context = TrackContext {
            id: 1,
            title: Some("Test Track".to_string()),
            artist: Some("Test Artist".to_string()),
            album: None,
            label: Some("Test Label".to_string()),
            year: Some(2023),
            bpm: Some(128.5),
            key: Some("8A".to_string()),
            duration_s: Some(300),
        };

        let json = serde_json::to_string(&context).unwrap();
        assert!(json.contains("Test Track"));
        assert!(json.contains("128.5"));
    }

    // -------------------------------------------------------------------------
    // build_full_context tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_build_full_context_empty_library() {
        let result = TrackContextBuilder::build_full_context(&[]);
        assert!(result.is_ok());
        let json_str = result.unwrap();
        let ctx: AIContext = serde_json::from_str(&json_str).unwrap();
        assert_eq!(ctx.library_stats.total_tracks, 0);
        assert!(ctx.tracks.is_empty());
    }

    #[test]
    fn test_build_full_context_with_tracks() {
        let tracks = vec![
            (make_test_track(1, "Deep Tech"), Some(make_test_analysis(128.0, "8A"))),
            (make_test_track(2, "Minimal"), None),
        ];
        let result = TrackContextBuilder::build_full_context(&tracks);
        assert!(result.is_ok());
        let json_str = result.unwrap();
        assert!(json_str.contains("Deep Tech"));
        assert!(json_str.contains("128"));
        assert!(json_str.contains("total_tracks"));
        let ctx: AIContext = serde_json::from_str(&json_str).unwrap();
        assert_eq!(ctx.library_stats.total_tracks, 2);
        assert_eq!(ctx.library_stats.analyzed_tracks, 1);
    }

    #[test]
    fn test_build_full_context_bpm_rounding() {
        let tracks = vec![
            (make_test_track(1, "Roundabout"), Some(make_test_analysis(128.456, "5A"))),
        ];
        let result = TrackContextBuilder::build_full_context(&tracks);
        assert!(result.is_ok());
        let ctx: AIContext = serde_json::from_str(&result.unwrap()).unwrap();
        assert_eq!(ctx.tracks.len(), 1);
        let bpm = ctx.tracks[0].bpm.expect("BPM should be present");
        assert!((bpm - 128.5).abs() < f64::EPSILON, "BPM should be rounded to 128.5, got {}", bpm);
    }

    // -------------------------------------------------------------------------
    // build_smart_context tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_build_smart_context_filters_by_artist() {
        // Use 4 tracks so that 1 filtered < 4/2=2 triggers the filter
        let tracks = vec![
            (make_test_track_with_artist(1, "Track A", "Boris Brejcha"), Some(make_test_analysis(128.0, "8A"))),
            (make_test_track_with_artist(2, "Track B", "Charlotte de Witte"), Some(make_test_analysis(140.0, "3A"))),
            (make_test_track_with_artist(3, "Track C", "Adam Beyer"), Some(make_test_analysis(133.0, "6A"))),
            (make_test_track_with_artist(4, "Track D", "Sven Vath"), Some(make_test_analysis(130.0, "7A"))),
        ];
        let result = TrackContextBuilder::build_smart_context(&tracks, "boris brejcha set");
        assert!(result.is_ok());
        let json_str = result.unwrap();
        assert!(json_str.contains("Boris Brejcha"));
        let ctx: AIContext = serde_json::from_str(&json_str).unwrap();
        // 1 filtered < 4/2=2, so filter applies: expect 1 track
        assert_eq!(ctx.tracks.len(), 1);
    }

    #[test]
    fn test_build_smart_context_falls_back_on_generic_prompt() {
        let tracks = vec![
            (make_test_track_with_artist(1, "Track A", "Boris Brejcha"), Some(make_test_analysis(128.0, "8A"))),
            (make_test_track_with_artist(2, "Track B", "Charlotte de Witte"), Some(make_test_analysis(140.0, "3A"))),
            (make_test_track_with_artist(3, "Track C", "Adam Beyer"), Some(make_test_analysis(133.0, "6A"))),
        ];
        let result = TrackContextBuilder::build_smart_context(&tracks, "make me a playlist");
        assert!(result.is_ok());
        let ctx: AIContext = serde_json::from_str(&result.unwrap()).unwrap();
        // No keyword matches → filtered is empty, falls back to all tracks
        assert_eq!(ctx.tracks.len(), 3);
    }

    #[test]
    fn test_build_smart_context_filters_by_genre_keyword() {
        // Use 4 tracks: 1 with "techno" in comment → 1 filtered < 4/2=2 → filter applies
        let mut track_with_comment = make_test_track(1, "Dark Room");
        track_with_comment.comment = Some("Deep progressive techno".to_string());

        let tracks = vec![
            (track_with_comment, None),
            (make_test_track(2, "Ambient Drift"), None),
            (make_test_track(3, "Jazz Funk"), None),
            (make_test_track(4, "Acoustic Blues"), None),
        ];
        let result = TrackContextBuilder::build_smart_context(&tracks, "I want techno tracks");
        assert!(result.is_ok());
        let ctx: AIContext = serde_json::from_str(&result.unwrap()).unwrap();
        // 1 filtered < 4/2=2, filter applies → only the techno-tagged track
        assert_eq!(ctx.tracks.len(), 1);
        assert_eq!(ctx.tracks[0].title.as_deref(), Some("Dark Room"));
    }

    // -------------------------------------------------------------------------
    // build_seed_context tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_build_seed_context_build_up_filters_bpm_and_key() {
        // Seed: BPM=128, key="8A", direction="build_up"
        // BPM range for build_up: seed-5 to seed+25 → 123-153
        // We need enough tracks (>=20 passing) to avoid the fallback-to-full-context (<20 filter)
        // Strategy: 20 tracks with BPM=130 and key="8A" (all pass), plus 5 excluded tracks.
        // The 5 excluded tracks have BPM=160 (out of range) and key="1A" (distance 7, incompatible)
        let mut tracks = Vec::new();
        for i in 1..=20 {
            tracks.push((make_test_track(i, "In Range"), Some(make_test_analysis(130.0, "8A"))));
        }
        for i in 21..=25 {
            tracks.push((make_test_track(i, "Excluded"), Some(make_test_analysis(160.0, "1A"))));
        }

        let result = TrackContextBuilder::build_seed_context(
            &tracks,
            Some(128.0),
            Some("8A"),
            "build_up",
        );
        assert!(result.is_ok());
        let ctx: AIContext = serde_json::from_str(&result.unwrap()).unwrap();
        // 20 tracks pass (BPM in range OR key compatible), 5 excluded (BPM=160 out of 123-153 AND key 1A incompatible with 8A at max_steps=2)
        assert_eq!(ctx.library_stats.total_tracks, 20, "Expected 20 filtered tracks, got {}", ctx.library_stats.total_tracks);
    }

    #[test]
    fn test_build_seed_context_no_seed_data_falls_back() {
        let tracks = vec![
            (make_test_track(1, "Alpha"), None),
            (make_test_track(2, "Beta"), None),
            (make_test_track(3, "Gamma"), None),
        ];
        let result = TrackContextBuilder::build_seed_context(&tracks, None, None, "maintain");
        assert!(result.is_ok());
        let ctx: AIContext = serde_json::from_str(&result.unwrap()).unwrap();
        assert_eq!(ctx.library_stats.total_tracks, 3);
    }

    // -------------------------------------------------------------------------
    // is_camelot_compatible tests (pub(crate) visibility)
    // -------------------------------------------------------------------------

    #[test]
    fn test_is_camelot_compatible_same_number_diff_letter() {
        assert!(TrackContextBuilder::is_camelot_compatible("8A", "8B", 2));
    }

    #[test]
    fn test_is_camelot_compatible_adjacent_same_letter() {
        assert!(TrackContextBuilder::is_camelot_compatible("5A", "6A", 1));
    }

    #[test]
    fn test_is_camelot_compatible_circular_wrap() {
        // 12A and 1A: circular distance = 1
        assert!(TrackContextBuilder::is_camelot_compatible("12A", "1A", 1));
    }

    #[test]
    fn test_is_camelot_compatible_incompatible() {
        // 1A and 6A: distance = 5, exceeds max_steps=2
        assert!(!TrackContextBuilder::is_camelot_compatible("1A", "6A", 2));
    }

    #[test]
    fn test_is_camelot_compatible_invalid_key() {
        assert!(!TrackContextBuilder::is_camelot_compatible("XY", "8A", 2));
        assert!(!TrackContextBuilder::is_camelot_compatible("8A", "", 2));
    }
}
