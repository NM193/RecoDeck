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
    fn is_camelot_compatible(key_a: &str, key_b: &str, max_steps: i32) -> bool {
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
}
