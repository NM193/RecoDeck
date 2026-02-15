// Track context builder for AI consumption
//
// Prepares optimized JSON representation of the music library
// for Claude API with intelligent filtering and token optimization

use crate::db::{Track, TrackAnalysis};
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
    ) -> Result<String, String> {
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
            .map_err(|e| format!("Failed to serialize context: {}", e))
    }

    /// Build smart context with filtering based on prompt keywords
    /// For large libraries (>5K tracks), this intelligently filters tracks
    pub fn build_smart_context(
        tracks: &[(Track, Option<TrackAnalysis>)],
        prompt: &str,
    ) -> Result<String, String> {
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
        let tracks_to_use = if filtered_tracks.len() < tracks.len() / 2 && filtered_tracks.len() > 0 {
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
        if let Some(ref a) = analysis {
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
