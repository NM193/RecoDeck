// Taste Profile Builder
//
// Aggregates library statistics from the database into a structured JSON
// snapshot that can be injected into AI prompts to give the model
// context about the user's musical taste.

use crate::db::Database;
use serde::Serialize;

/// Top genre with track count
#[derive(Serialize)]
pub struct GenreEntry {
    pub genre: String,
    pub count: i64,
}

/// Top artist with track count
#[derive(Serialize)]
pub struct ArtistEntry {
    pub artist: String,
    pub count: i64,
}

/// BPM distribution statistics
#[derive(Serialize)]
pub struct BpmRange {
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub avg: Option<f64>,
}

/// Track summary used for most-played and top-rated lists
#[derive(Serialize)]
pub struct TrackEntry {
    pub id: i64,
    pub title: String,
    pub artist: String,
    pub value: i64, // play_count or rating depending on context
}

/// Tag with usage count
#[derive(Serialize)]
pub struct TagEntry {
    pub name: String,
    pub category: String,
    pub count: i64,
}

/// Full taste profile snapshot for the current library
#[derive(Serialize)]
pub struct TasteProfile {
    pub total_tracks: i64,
    pub top_genres: Vec<GenreEntry>,
    pub top_artists: Vec<ArtistEntry>,
    pub bpm_range: BpmRange,
    pub most_played: Vec<TrackEntry>,
    pub top_rated: Vec<TrackEntry>,
    pub top_tags: Vec<TagEntry>,
}

/// Build a taste profile JSON string from the current library state.
///
/// Aggregates up to 10 entries each for genres, artists, most-played
/// tracks, top-rated tracks, and tags, plus a BPM distribution summary.
/// Returns a serialized JSON string suitable for embedding in an AI prompt.
pub fn build_taste_profile(db: &Database) -> Result<String, String> {
    let total_tracks = db
        .count_tracks()
        .map_err(|e| format!("count_tracks failed: {}", e))?;

    let top_genres = db
        .get_top_genres(10)
        .map_err(|e| format!("get_top_genres failed: {}", e))?
        .into_iter()
        .map(|(genre, count)| GenreEntry { genre, count })
        .collect();

    let top_artists = db
        .get_top_artists(10)
        .map_err(|e| format!("get_top_artists failed: {}", e))?
        .into_iter()
        .map(|(artist, count)| ArtistEntry { artist, count })
        .collect();

    let (bpm_min, bpm_max, bpm_avg) = db
        .get_bpm_distribution()
        .map_err(|e| format!("get_bpm_distribution failed: {}", e))?;

    let bpm_range = BpmRange {
        min: bpm_min,
        max: bpm_max,
        avg: bpm_avg,
    };

    let most_played = db
        .get_most_played_tracks(10)
        .map_err(|e| format!("get_most_played_tracks failed: {}", e))?
        .into_iter()
        .map(|(id, title, artist, play_count)| TrackEntry {
            id,
            title,
            artist,
            value: play_count,
        })
        .collect();

    let top_rated = db
        .get_top_rated_tracks(10)
        .map_err(|e| format!("get_top_rated_tracks failed: {}", e))?
        .into_iter()
        .map(|(id, title, artist, rating)| TrackEntry {
            id,
            title,
            artist,
            value: rating,
        })
        .collect();

    let top_tags = db
        .get_tag_usage(10)
        .map_err(|e| format!("get_tag_usage failed: {}", e))?
        .into_iter()
        .map(|(name, category, count)| TagEntry {
            name,
            category,
            count,
        })
        .collect();

    let profile = TasteProfile {
        total_tracks,
        top_genres,
        top_artists,
        bpm_range,
        most_played,
        top_rated,
        top_tags,
    };

    serde_json::to_string(&profile).map_err(|e| format!("serialization failed: {}", e))
}
