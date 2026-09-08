//! Tauri commands for the YouTube side of the tracklist feature.
//!
//! Every user brings their own API key: the free allowance of 10,000 units a
//! day is charged per key, so a key shipped inside the app would be a single
//! budget shared by everyone (one search alone costs 100 units), and a key in a
//! binary is trivially extracted.

use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

use crate::commands::library::AppState;
use crate::db::{Database, YtChannel, YtSavedTrack, YtSet, YtTrack};
use crate::error::AppError;
use crate::external::youtube::{self, ChannelInfo, RawSet, SetSearchHit, DAILY_QUOTA};
use crate::external::youtube_time::{now_unix, pacific_day, seconds_until_pacific_midnight};

const YT_API_KEY_SETTING: &str = "youtube_api_key";
const YT_QUOTA_SETTING: &str = "youtube_quota";

/// What the counter knows, persisted as JSON in the settings table.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct QuotaState {
    pacific_day: String,
    spent: u32,
}

/// What the Settings screen shows.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuotaStatus {
    pub spent: u32,
    pub remaining: u32,
    pub daily_limit: u32,
    pub pacific_day: String,
    pub seconds_until_reset: i64,
    /// True once counting alone says the day is used up. YouTube itself is the
    /// authority — this is a local estimate and can be low if the same key is
    /// also used elsewhere.
    pub exhausted: bool,
}

// --- helpers -----------------------------------------------------------

/// Runs `f` with the database, then releases the lock. Nothing awaits inside,
/// which is deliberate: a lock must never be held across a network call.
fn with_db<T>(
    state: &State<'_, AppState>,
    f: impl FnOnce(&Database) -> Result<T, AppError>,
) -> Result<T, AppError> {
    let guard = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = guard
        .as_ref()
        .ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
    f(db)
}

fn read_key(state: &State<'_, AppState>) -> Result<String, AppError> {
    let key = with_db(state, |db| {
        db.get_setting(YT_API_KEY_SETTING)
            .map_err(|e| AppError::Database(format!("Failed to read YouTube API key: {e}")))
    })?;

    match key {
        Some(k) if !k.trim().is_empty() => Ok(k),
        _ => Err(AppError::YtNoApiKey),
    }
}

fn load_quota(db: &Database, today: &str) -> QuotaState {
    let stored = db
        .get_setting(YT_QUOTA_SETTING)
        .ok()
        .flatten()
        .and_then(|raw| serde_json::from_str::<QuotaState>(&raw).ok());

    match stored {
        // A counter from an earlier Pacific day is not carried over.
        Some(state) if state.pacific_day == today => state,
        _ => QuotaState {
            pacific_day: today.to_string(),
            spent: 0,
        },
    }
}

fn to_status(state: QuotaState, now: i64) -> QuotaStatus {
    QuotaStatus {
        remaining: DAILY_QUOTA.saturating_sub(state.spent),
        exhausted: state.spent >= DAILY_QUOTA,
        spent: state.spent,
        daily_limit: DAILY_QUOTA,
        pacific_day: state.pacific_day,
        seconds_until_reset: seconds_until_pacific_midnight(now),
    }
}

/// The quota core, free of Tauri state so it can be tested against a database.
fn spend_units(db: &Database, units: u32, now: i64) -> Result<QuotaStatus, AppError> {
    let today = pacific_day(now);
    let mut quota = load_quota(db, &today);
    quota.spent = quota.spent.saturating_add(units);

    let encoded = serde_json::to_string(&quota)
        .map_err(|e| AppError::Internal(format!("Failed to encode quota: {e}")))?;
    db.set_setting(YT_QUOTA_SETTING, &encoded)
        .map_err(|e| AppError::Database(format!("Failed to save quota: {e}")))?;

    Ok(to_status(quota, now))
}

/// Add what a call cost. Called after the network work, never during it.
fn record_spend(state: &State<'_, AppState>, units: u32) -> Result<QuotaStatus, AppError> {
    let now = now_unix();
    with_db(state, |db| spend_units(db, units, now))
}

// --- commands ----------------------------------------------------------

#[tauri::command]
pub async fn set_youtube_api_key(
    state: State<'_, AppState>,
    api_key: String,
) -> Result<(), AppError> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation(
            "YouTube API key cannot be empty".to_string(),
        ));
    }

    with_db(&state, |db| {
        db.set_setting(YT_API_KEY_SETTING, trimmed)
            .map_err(|e| AppError::Database(format!("Failed to save YouTube API key: {e}")))
    })
}

#[tauri::command]
pub async fn get_youtube_api_key_status(state: State<'_, AppState>) -> Result<bool, AppError> {
    match read_key(&state) {
        Ok(_) => Ok(true),
        Err(AppError::YtNoApiKey) => Ok(false),
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub async fn delete_youtube_api_key(state: State<'_, AppState>) -> Result<(), AppError> {
    with_db(&state, |db| {
        db.set_setting(YT_API_KEY_SETTING, "")
            .map_err(|e| AppError::Database(format!("Failed to delete YouTube API key: {e}")))
    })
}

#[tauri::command]
pub async fn get_youtube_quota(state: State<'_, AppState>) -> Result<QuotaStatus, AppError> {
    let now = now_unix();
    let today = pacific_day(now);
    let quota = with_db(&state, |db| Ok(load_quota(db, &today)))?;
    Ok(to_status(quota, now))
}

/// Cheapest call there is (1 unit), so a key can be checked the moment it is
/// pasted instead of failing later on a real fetch.
#[tauri::command]
pub async fn test_youtube_api_key(state: State<'_, AppState>) -> Result<QuotaStatus, AppError> {
    let key = read_key(&state)?;

    let mut spent = 0u32;
    let result = youtube::verify_key(&key, &mut spent).await;

    // Google bills the attempt, so the spend is recorded even when the key is
    // rejected. The verification error still wins over a bookkeeping error.
    let status = record_spend(&state, spent);
    result?;
    status
}

/// Find a DJ's sets by name. **100 units** — a hundred times what a set costs —
/// so the UI says so before the click.
#[tauri::command]
pub async fn search_youtube_sets(
    state: State<'_, AppState>,
    query: String,
    max: Option<u8>,
) -> Result<Vec<SetSearchHit>, AppError> {
    if query.trim().len() < 2 {
        return Err(AppError::Validation("Type a name to search for".to_string()));
    }

    let key = read_key(&state)?;

    let mut spent = 0u32;
    let result = youtube::search_sets(&key, query.trim(), max.unwrap_or(12), &mut spent).await;

    let _ = record_spend(&state, spent);
    result
}

/// Fetch one set: description plus up to five pages of comments, 5-7 units.
/// Accepts a full URL or a bare video id.
#[tauri::command]
pub async fn fetch_youtube_set(
    state: State<'_, AppState>,
    input: String,
) -> Result<RawSet, AppError> {
    let video_id = youtube::extract_video_id(&input).ok_or_else(|| {
        AppError::Validation(format!("Could not find a YouTube video id in \"{input}\""))
    })?;

    let key = read_key(&state)?;

    let mut spent = 0u32;
    let result = youtube::fetch_set(&key, &video_id, &mut spent).await;

    let _ = record_spend(&state, spent);
    result
}

// --- in-window player panel -------------------------------------------
//
// Embedding YouTube is impossible here: a tauri:// page sends no Referer so the
// player answers with error 153, and six of seven real DJ sets refuse embedded
// playback anywhere at all (measured in a plain browser — PROGRESS.md,
// 2026-09-07). What is not blocked is the ordinary watch page, because that is
// not an embed.
//
// So the panel is a second webview placed inside the main window, showing
// youtube.com itself. It is an overlay positioned in window coordinates, not a
// DOM element: the frontend measures where it should sit and says so. That is
// why it has to live in a fixed area rather than scroll with the list.

const PANEL_LABEL: &str = "yt-panel";

#[tauri::command]
pub async fn open_youtube_panel(
    app: tauri::AppHandle,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), AppError> {
    let parsed = tauri::Url::parse(&url)
        .map_err(|e| AppError::Validation(format!("Not a usable YouTube URL: {e}")))?;

    // One panel at a time, or two copies of the set play at once.
    if let Some(existing) = app.get_webview(PANEL_LABEL) {
        let _ = existing.close();
    }

    let window = app
        .get_window("main")
        .ok_or_else(|| AppError::Internal("Main window is gone".to_string()))?;

    window
        .add_child(
            tauri::webview::WebviewBuilder::new(PANEL_LABEL, tauri::WebviewUrl::External(parsed)),
            tauri::LogicalPosition::new(x, y),
            tauri::LogicalSize::new(width, height),
        )
        .map_err(|e| AppError::Internal(format!("Could not open the player panel: {e}")))?;

    Ok(())
}

/// Called whenever the area the panel should cover moves or resizes.
#[tauri::command]
pub async fn set_youtube_panel_bounds(
    app: tauri::AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), AppError> {
    if let Some(panel) = app.get_webview(PANEL_LABEL) {
        let _ = panel.set_position(tauri::LogicalPosition::new(x, y));
        let _ = panel.set_size(tauri::LogicalSize::new(width, height));
    }
    Ok(())
}

/// Moves the already-open panel to another point in the set, without reloading
/// it. The instruction goes through the local server the panel is talking to.
#[tauri::command]
pub async fn seek_youtube_panel(seconds: u64) -> Result<(), AppError> {
    crate::server::routes::request_seek(seconds);
    Ok(())
}

#[tauri::command]
pub async fn close_youtube_panel(app: tauri::AppHandle) -> Result<(), AppError> {
    if let Some(panel) = app.get_webview(PANEL_LABEL) {
        let _ = panel.close();
    }
    Ok(())
}

// --- the set library ---------------------------------------------------
//
// A processed set is kept whole: the parsed summary for listing, and the raw
// fetch so it can be reopened at no quota cost and reparsed later by a better
// parser. This is the standalone tool's fixtures/ directory, in SQLite.

/// One parsed row, as the frontend produced it.
#[derive(Debug, Deserialize)]
pub struct ParsedTrackInput {
    pub cue_ms: i64,
    pub cue: Option<String>,
    pub artist: Option<String>,
    pub title: String,
    pub mix: Option<String>,
    pub is_unknown: bool,
    pub votes: Option<i64>,
    pub source_count: Option<i64>,
    pub artist_norm: Option<String>,
    pub title_norm: Option<String>,
}

/// What the frontend sends after parsing a freshly fetched set.
#[derive(Debug, Deserialize)]
pub struct SaveSetInput {
    /// The untouched fetch: { video, comments, fetchedAt }
    pub raw: serde_json::Value,
    pub status: String,
    pub confidence: f64,
    pub source_count: i64,
    pub track_count: i64,
    /// The parsed rows, flattened so search and statistics are queries rather
    /// than a reparse of every stored set.
    #[serde(default)]
    pub tracks: Vec<ParsedTrackInput>,
}

#[derive(Debug, Serialize)]
pub struct YtSetDTO {
    pub video_id: String,
    pub url: String,
    pub title: String,
    pub channel: Option<String>,
    pub published_at: Option<String>,
    pub duration_ms: Option<i64>,
    pub fetched_at: Option<String>,
    pub status: Option<String>,
    pub confidence: Option<f64>,
    pub source_count: Option<i64>,
    pub track_count: Option<i64>,
    pub added_at: Option<String>,
}

impl From<YtSet> for YtSetDTO {
    fn from(s: YtSet) -> Self {
        YtSetDTO {
            video_id: s.video_id,
            url: s.url,
            title: s.title,
            channel: s.channel,
            published_at: s.published_at,
            duration_ms: s.duration_ms,
            fetched_at: s.fetched_at,
            status: s.status,
            confidence: s.confidence,
            source_count: s.source_count,
            track_count: s.track_count,
            added_at: s.added_at,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SavedTrackDTO {
    pub id: Option<i64>,
    pub video_id: String,
    pub cue_ms: i64,
    pub cue: Option<String>,
    pub artist: Option<String>,
    pub title: String,
    pub mix: Option<String>,
    pub saved_at: Option<String>,
    pub set_title: Option<String>,
}

/// Pulls the video metadata out of the raw fetch, so there is one source of
/// truth for it rather than a second copy passed alongside.
fn set_from_raw(input: &SaveSetInput) -> Result<YtSet, AppError> {
    let video = input
        .raw
        .get("video")
        .ok_or_else(|| AppError::Validation("Fetched set has no video".to_string()))?;

    let text = |key: &str| video.get(key).and_then(|v| v.as_str()).map(str::to_string);
    let video_id = text("id")
        .ok_or_else(|| AppError::Validation("Fetched set has no video id".to_string()))?;

    Ok(YtSet {
        url: text("url").unwrap_or_else(|| format!("https://www.youtube.com/watch?v={video_id}")),
        title: text("title").unwrap_or_default(),
        channel: text("channel"),
        published_at: text("publishedAt"),
        duration_ms: video.get("durationMs").and_then(|v| v.as_i64()),
        fetched_at: input.raw.get("fetchedAt").and_then(|v| v.as_str()).map(str::to_string),
        status: Some(input.status.clone()),
        confidence: Some(input.confidence),
        source_count: Some(input.source_count),
        track_count: Some(input.track_count),
        added_at: None,
        video_id,
    })
}

#[tauri::command]
pub async fn save_youtube_set(
    state: State<'_, AppState>,
    input: SaveSetInput,
) -> Result<(), AppError> {
    let set = set_from_raw(&input)?;
    let raw_json = serde_json::to_string(&input.raw)
        .map_err(|e| AppError::Internal(format!("Could not store the fetch: {e}")))?;

    let video_id = set.video_id.clone();
    let tracks: Vec<YtTrack> = input
        .tracks
        .iter()
        .enumerate()
        .map(|(i, t)| YtTrack {
            video_id: video_id.clone(),
            position: i as i64 + 1,
            cue_ms: t.cue_ms,
            cue: t.cue.clone(),
            artist: t.artist.clone(),
            title: t.title.clone(),
            mix: t.mix.clone(),
            is_unknown: t.is_unknown,
            votes: t.votes,
            source_count: t.source_count,
            artist_norm: t.artist_norm.clone(),
            title_norm: t.title_norm.clone(),
            set_title: None,
        })
        .collect();

    with_db(&state, |db| {
        db.save_yt_set(&set, &raw_json)
            .map_err(|e| AppError::Database(format!("Failed to save set: {e}")))?;
        db.replace_yt_tracks(&video_id, &tracks)
            .map_err(|e| AppError::Database(format!("Failed to save set tracks: {e}")))
    })
}

#[derive(Debug, Serialize)]
pub struct YtTrackHitDTO {
    pub video_id: String,
    pub set_title: Option<String>,
    pub cue_ms: i64,
    pub cue: Option<String>,
    pub artist: Option<String>,
    pub title: String,
    pub mix: Option<String>,
}

/// "Where did I hear this?" — across every set ever processed. Costs no quota.
#[tauri::command]
pub async fn search_youtube_tracks(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<YtTrackHitDTO>, AppError> {
    if query.trim().len() < 2 {
        return Ok(Vec::new());
    }

    with_db(&state, |db| {
        db.search_yt_tracks(query.trim(), 100)
            .map(|hits| {
                hits.into_iter()
                    .map(|t| YtTrackHitDTO {
                        video_id: t.video_id,
                        set_title: t.set_title,
                        cue_ms: t.cue_ms,
                        cue: t.cue,
                        artist: t.artist,
                        title: t.title,
                        mix: t.mix,
                    })
                    .collect()
            })
            .map_err(|e| AppError::Database(format!("Search failed: {e}")))
    })
}

#[derive(Debug, Serialize)]
pub struct YtStatsDTO {
    pub sets: i64,
    pub tracks: i64,
    pub unknowns: i64,
    /// (artist, how many times they turn up)
    pub top_artists: Vec<(String, i64)>,
    /// (title, artist, in how many different sets)
    pub shared_tracks: Vec<(String, Option<String>, i64)>,
    /// (video id, set title, unnamed slots)
    pub most_unknowns: Vec<(String, String, i64)>,
    pub quota: QuotaStatus,
}

#[tauri::command]
pub async fn youtube_stats(state: State<'_, AppState>) -> Result<YtStatsDTO, AppError> {
    let now = now_unix();
    let today = pacific_day(now);

    with_db(&state, |db| {
        let (sets, tracks, unknowns) = db
            .count_yt_sets_and_tracks()
            .map_err(|e| AppError::Database(format!("Stats failed: {e}")))?;

        Ok(YtStatsDTO {
            sets,
            tracks,
            unknowns,
            top_artists: db
                .top_yt_artists(10)
                .map_err(|e| AppError::Database(format!("Stats failed: {e}")))?,
            shared_tracks: db
                .shared_yt_tracks(10)
                .map_err(|e| AppError::Database(format!("Stats failed: {e}")))?,
            most_unknowns: db
                .yt_sets_with_most_unknowns(5)
                .map_err(|e| AppError::Database(format!("Stats failed: {e}")))?,
            quota: to_status(load_quota(db, &today), now),
        })
    })
}

#[tauri::command]
pub async fn list_youtube_sets(state: State<'_, AppState>) -> Result<Vec<YtSetDTO>, AppError> {
    with_db(&state, |db| {
        db.list_yt_sets()
            .map(|sets| sets.into_iter().map(YtSetDTO::from).collect())
            .map_err(|e| AppError::Database(format!("Failed to list sets: {e}")))
    })
}

/// Reopens a stored set. Costs nothing — the fetch is already on disk.
#[tauri::command]
pub async fn get_youtube_set(
    state: State<'_, AppState>,
    video_id: String,
) -> Result<serde_json::Value, AppError> {
    let raw = with_db(&state, |db| {
        db.get_yt_set_raw(&video_id)
            .map_err(|e| AppError::Database(format!("Failed to read set: {e}")))
    })?;

    let raw = raw.ok_or_else(|| AppError::NotFound(format!("No stored set {video_id}")))?;
    serde_json::from_str(&raw)
        .map_err(|e| AppError::Internal(format!("Stored set is unreadable: {e}")))
}

#[tauri::command]
pub async fn delete_youtube_set(
    state: State<'_, AppState>,
    video_id: String,
) -> Result<(), AppError> {
    with_db(&state, |db| {
        db.delete_yt_set(&video_id)
            .map_err(|e| AppError::Database(format!("Failed to delete set: {e}")))
    })
}

#[tauri::command]
pub async fn save_youtube_track(
    state: State<'_, AppState>,
    track: SavedTrackDTO,
) -> Result<(), AppError> {
    let record = YtSavedTrack {
        id: None,
        video_id: track.video_id,
        cue_ms: track.cue_ms,
        cue: track.cue,
        artist: track.artist,
        title: track.title,
        mix: track.mix,
        saved_at: None,
        set_title: None,
    };

    with_db(&state, |db| {
        db.save_yt_track(&record)
            .map(|_| ())
            .map_err(|e| AppError::Database(format!("Failed to save track: {e}")))
    })
}

#[tauri::command]
pub async fn list_saved_youtube_tracks(
    state: State<'_, AppState>,
) -> Result<Vec<SavedTrackDTO>, AppError> {
    with_db(&state, |db| {
        db.list_saved_yt_tracks()
            .map(|tracks| {
                tracks
                    .into_iter()
                    .map(|t| SavedTrackDTO {
                        id: t.id,
                        video_id: t.video_id,
                        cue_ms: t.cue_ms,
                        cue: t.cue,
                        artist: t.artist,
                        title: t.title,
                        mix: t.mix,
                        saved_at: t.saved_at,
                        set_title: t.set_title,
                    })
                    .collect()
            })
            .map_err(|e| AppError::Database(format!("Failed to list saved tracks: {e}")))
    })
}

#[tauri::command]
pub async fn delete_saved_youtube_track(
    state: State<'_, AppState>,
    video_id: String,
    cue_ms: i64,
    title: String,
) -> Result<(), AppError> {
    with_db(&state, |db| {
        db.delete_saved_yt_track(&video_id, cue_ms, &title)
            .map_err(|e| AppError::Database(format!("Failed to remove saved track: {e}")))
    })
}

// --- channels ----------------------------------------------------------
//
// Following a channel is the cheap way to keep up: checking one costs a unit or
// two, where searching by name costs a hundred. A set is at least twenty
// minutes, so promo clips are filtered out by duration before anything is
// fetched about them.

const MIN_SET_MS: i64 = 20 * 60 * 1000;

#[derive(Debug, Serialize)]
pub struct FollowedChannelDTO {
    pub channel_id: String,
    pub handle: Option<String>,
    pub title: Option<String>,
    pub uploads_id: Option<String>,
    pub last_checked: Option<String>,
    pub last_seen_video: Option<String>,
}

#[tauri::command]
pub async fn resolve_youtube_channel(
    state: State<'_, AppState>,
    input: String,
) -> Result<ChannelInfo, AppError> {
    let key = read_key(&state)?;
    let mut spent = 0u32;
    let result = youtube::resolve_channel(&key, &input, &mut spent).await;
    let _ = record_spend(&state, spent);
    result
}

/// The newest uploads of a channel, long ones only, with the sets already in
/// the library marked so they are not fetched twice.
#[derive(Debug, Serialize)]
pub struct ChannelUploadDTO {
    pub video_id: String,
    pub title: String,
    pub published_at: String,
    pub duration_ms: Option<i64>,
    pub already_stored: bool,
}

#[tauri::command]
pub async fn list_youtube_channel_uploads(
    state: State<'_, AppState>,
    uploads_id: String,
    max: Option<u8>,
) -> Result<Vec<ChannelUploadDTO>, AppError> {
    let key = read_key(&state)?;

    let mut spent = 0u32;
    let mut items = match youtube::channel_uploads(&key, &uploads_id, max.unwrap_or(25), &mut spent)
        .await
    {
        Ok(items) => items,
        Err(e) => {
            let _ = record_spend(&state, spent);
            return Err(e);
        }
    };
    let fill = youtube::fill_durations(&key, &mut items, &mut spent).await;
    let _ = record_spend(&state, spent);
    fill?;

    let stored: Vec<String> = with_db(&state, |db| {
        db.list_yt_sets()
            .map(|sets| sets.into_iter().map(|s| s.video_id).collect())
            .map_err(|e| AppError::Database(format!("Failed to read the library: {e}")))
    })?;

    Ok(items
        .into_iter()
        .filter(|item| item.duration_ms.unwrap_or(0) >= MIN_SET_MS)
        .map(|item| ChannelUploadDTO {
            already_stored: stored.contains(&item.video_id),
            video_id: item.video_id,
            title: item.title,
            published_at: item.published_at,
            duration_ms: item.duration_ms,
        })
        .collect())
}

#[tauri::command]
pub async fn follow_youtube_channel(
    state: State<'_, AppState>,
    channel: ChannelInfo,
) -> Result<(), AppError> {
    let record = YtChannel {
        channel_id: channel.channel_id,
        handle: channel.handle,
        title: Some(channel.title),
        uploads_id: Some(channel.uploads_id),
        last_checked: None,
        last_seen_video: None,
    };

    with_db(&state, |db| {
        db.save_yt_channel(&record)
            .map_err(|e| AppError::Database(format!("Failed to follow channel: {e}")))
    })
}

#[tauri::command]
pub async fn list_youtube_channels(
    state: State<'_, AppState>,
) -> Result<Vec<FollowedChannelDTO>, AppError> {
    with_db(&state, |db| {
        db.list_yt_channels()
            .map(|channels| {
                channels
                    .into_iter()
                    .map(|c| FollowedChannelDTO {
                        channel_id: c.channel_id,
                        handle: c.handle,
                        title: c.title,
                        uploads_id: c.uploads_id,
                        last_checked: c.last_checked,
                        last_seen_video: c.last_seen_video,
                    })
                    .collect()
            })
            .map_err(|e| AppError::Database(format!("Failed to list channels: {e}")))
    })
}

#[tauri::command]
pub async fn unfollow_youtube_channel(
    state: State<'_, AppState>,
    channel_id: String,
) -> Result<(), AppError> {
    with_db(&state, |db| {
        db.delete_yt_channel(&channel_id)
            .map_err(|e| AppError::Database(format!("Failed to unfollow channel: {e}")))
    })
}

#[derive(Debug, Serialize)]
pub struct ChannelNewsDTO {
    pub channel_id: String,
    pub title: Option<String>,
    /// Long uploads newer than the last one seen.
    pub new_sets: Vec<ChannelUploadDTO>,
}

/// Checks every followed channel for sets that were not there last time.
/// One to two units per channel.
#[tauri::command]
pub async fn check_youtube_channels(
    state: State<'_, AppState>,
) -> Result<Vec<ChannelNewsDTO>, AppError> {
    let key = read_key(&state)?;

    let channels = with_db(&state, |db| {
        db.list_yt_channels()
            .map_err(|e| AppError::Database(format!("Failed to list channels: {e}")))
    })?;

    let stored: Vec<String> = with_db(&state, |db| {
        db.list_yt_sets()
            .map(|sets| sets.into_iter().map(|s| s.video_id).collect())
            .map_err(|e| AppError::Database(format!("Failed to read the library: {e}")))
    })?;

    let mut news = Vec::new();
    let mut spent = 0u32;

    for channel in channels {
        let Some(uploads_id) = channel.uploads_id.clone() else {
            continue;
        };

        let mut items = match youtube::channel_uploads(&key, &uploads_id, 10, &mut spent).await {
            Ok(items) => items,
            // One unreachable channel must not sink the whole check.
            Err(_) => continue,
        };

        // Everything up to the last one seen is old news.
        if let Some(last_seen) = channel.last_seen_video.as_ref() {
            if let Some(position) = items.iter().position(|i| &i.video_id == last_seen) {
                items.truncate(position);
            }
        }
        items.retain(|i| !stored.contains(&i.video_id));

        if items.is_empty() {
            continue;
        }

        if youtube::fill_durations(&key, &mut items, &mut spent).await.is_err() {
            continue;
        }

        let new_sets: Vec<ChannelUploadDTO> = items
            .into_iter()
            .filter(|i| i.duration_ms.unwrap_or(0) >= MIN_SET_MS)
            .map(|i| ChannelUploadDTO {
                video_id: i.video_id,
                title: i.title,
                published_at: i.published_at,
                duration_ms: i.duration_ms,
                already_stored: false,
            })
            .collect();

        if !new_sets.is_empty() {
            news.push(ChannelNewsDTO {
                channel_id: channel.channel_id,
                title: channel.title,
                new_sets,
            });
        }
    }

    let _ = record_spend(&state, spent);
    Ok(news)
}

/// Remembers what the user has already been shown, so "new" stays meaningful.
#[tauri::command]
pub async fn mark_youtube_channel_seen(
    state: State<'_, AppState>,
    channel_id: String,
    video_id: String,
) -> Result<(), AppError> {
    let now = crate::external::youtube_time::iso_now();

    with_db(&state, |db| {
        let mut channels = db
            .list_yt_channels()
            .map_err(|e| AppError::Database(format!("Failed to list channels: {e}")))?;

        let Some(channel) = channels.iter_mut().find(|c| c.channel_id == channel_id) else {
            return Ok(());
        };
        channel.last_seen_video = Some(video_id);
        channel.last_checked = Some(now);

        db.save_yt_channel(channel)
            .map_err(|e| AppError::Database(format!("Failed to update channel: {e}")))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 2026-01-15 12:00 UTC and the same instant a day later, both in PST.
    const DAY_ONE: i64 = 1_768_478_400;
    const DAY_TWO: i64 = DAY_ONE + 86_400;

    #[test]
    fn spending_accumulates_within_a_pacific_day() {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");

        let after_video = spend_units(&db, 1, DAY_ONE).unwrap();
        assert_eq!(after_video.spent, 1);

        // A set is one videos call plus up to five comment pages.
        let after_set = spend_units(&db, 6, DAY_ONE).unwrap();
        assert_eq!(after_set.spent, 7);
        assert_eq!(after_set.remaining, DAILY_QUOTA - 7);
        assert_eq!(after_set.pacific_day, "2026-01-15");
    }

    #[test]
    fn a_new_pacific_day_starts_the_counter_over() {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");

        spend_units(&db, 9_500, DAY_ONE).unwrap();
        let next_day = spend_units(&db, 5, DAY_TWO).unwrap();

        assert_eq!(next_day.spent, 5, "yesterday's spending must not carry over");
        assert_eq!(next_day.pacific_day, "2026-01-16");
    }

    fn test_db() -> Database {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");
        db
    }

    fn sample_set() -> (YtSet, &'static str) {
        let raw = r#"{"video":{"id":"bk6Xst6euQk","url":"https://youtu.be/bk6Xst6euQk","title":"Boiler Room: Tulum","channel":"Boiler Room","publishedAt":"2013-01-01T00:00:00Z","description":"","durationMs":7200000},"comments":[],"fetchedAt":"2026-09-07T00:00:00.000Z"}"#;
        let set = YtSet {
            video_id: "bk6Xst6euQk".to_string(),
            url: "https://youtu.be/bk6Xst6euQk".to_string(),
            title: "Boiler Room: Tulum".to_string(),
            channel: Some("Boiler Room".to_string()),
            published_at: Some("2013-01-01T00:00:00Z".to_string()),
            duration_ms: Some(7_200_000),
            fetched_at: Some("2026-09-07T00:00:00.000Z".to_string()),
            status: Some("ok".to_string()),
            confidence: Some(0.95),
            source_count: Some(6),
            track_count: Some(23),
            added_at: None,
        };
        (set, raw)
    }

    #[test]
    fn a_stored_set_can_be_reopened_without_the_network() {
        let db = test_db();
        let (set, raw) = sample_set();
        db.save_yt_set(&set, raw).unwrap();

        let listed = db.list_yt_sets().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].title, "Boiler Room: Tulum");
        assert_eq!(listed[0].track_count, Some(23));

        // The whole fetch comes back, which is what makes reparsing possible.
        let stored = db.get_yt_set_raw("bk6Xst6euQk").unwrap().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&stored).unwrap();
        assert_eq!(parsed["video"]["channel"], "Boiler Room");
    }

    #[test]
    fn processing_the_same_set_twice_updates_it_instead_of_duplicating() {
        let db = test_db();
        let (mut set, raw) = sample_set();
        db.save_yt_set(&set, raw).unwrap();

        // A set fetched again later usually has more comments, so more tracks.
        set.track_count = Some(28);
        db.save_yt_set(&set, raw).unwrap();

        let listed = db.list_yt_sets().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].track_count, Some(28));
    }

    #[test]
    fn saved_tracks_remember_which_set_they_came_from() {
        let db = test_db();
        let (set, raw) = sample_set();
        db.save_yt_set(&set, raw).unwrap();

        db.save_yt_track(&YtSavedTrack {
            id: None,
            video_id: "bk6Xst6euQk".to_string(),
            cue_ms: 1_260_000,
            cue: Some("21:00".to_string()),
            artist: Some("Thomas Bangalter".to_string()),
            title: "Club Soda".to_string(),
            mix: None,
            saved_at: None,
            set_title: None,
        })
        .unwrap();

        let saved = db.list_saved_yt_tracks().unwrap();
        assert_eq!(saved.len(), 1);
        assert_eq!(saved[0].title, "Club Soda");
        assert_eq!(saved[0].set_title.as_deref(), Some("Boiler Room: Tulum"));

        db.delete_saved_yt_track("bk6Xst6euQk", 1_260_000, "Club Soda")
            .unwrap();
        assert!(db.list_saved_yt_tracks().unwrap().is_empty());
    }

    fn track(video_id: &str, position: i64, artist: Option<&str>, title: &str, unknown: bool) -> YtTrack {
        YtTrack {
            video_id: video_id.to_string(),
            position,
            cue_ms: position * 60_000,
            cue: Some(format!("{position}:00")),
            artist: artist.map(str::to_string),
            title: title.to_string(),
            mix: None,
            is_unknown: unknown,
            votes: Some(3),
            source_count: Some(4),
            artist_norm: artist.map(|a| a.to_lowercase()),
            title_norm: Some(title.to_lowercase()),
            set_title: None,
        }
    }

    /// Two sets that share one record, with an unnamed slot in the second.
    fn library_with_two_sets() -> Database {
        let db = test_db();
        let (mut set, raw) = sample_set();
        db.save_yt_set(&set, raw).unwrap();
        db.replace_yt_tracks(
            "bk6Xst6euQk",
            &[
                track("bk6Xst6euQk", 1, Some("Thomas Bangalter"), "Club Soda", false),
                track("bk6Xst6euQk", 2, Some("Solomun"), "Something We All Adore", false),
            ],
        )
        .unwrap();

        set.video_id = "xJR7q0XN8oU".to_string();
        set.title = "Hot Since 82 | Mixmag".to_string();
        db.save_yt_set(&set, raw).unwrap();
        db.replace_yt_tracks(
            "xJR7q0XN8oU",
            &[
                track("xJR7q0XN8oU", 1, Some("Thomas Bangalter"), "Club Soda", false),
                track("xJR7q0XN8oU", 2, None, "ID", true),
            ],
        )
        .unwrap();
        db
    }

    #[test]
    fn search_answers_where_did_i_hear_this() {
        let db = library_with_two_sets();

        let hits = db.search_yt_tracks("club soda", 50).unwrap();
        assert_eq!(hits.len(), 2, "the record turns up in both sets");
        assert!(hits.iter().all(|h| h.title == "Club Soda"));
        assert!(hits.iter().any(|h| h.set_title.as_deref() == Some("Boiler Room: Tulum")));

        // Searching by artist works the same way.
        assert_eq!(db.search_yt_tracks("bangalter", 50).unwrap().len(), 2);
        // Unnamed slots are not results — there is nothing to find.
        assert!(db.search_yt_tracks("ID", 50).unwrap().is_empty());
    }

    #[test]
    fn reprocessing_a_set_replaces_its_tracks_rather_than_adding_to_them() {
        let db = library_with_two_sets();
        db.replace_yt_tracks(
            "bk6Xst6euQk",
            &[track("bk6Xst6euQk", 1, Some("Thomas Bangalter"), "Club Soda", false)],
        )
        .unwrap();

        let (_, tracks, _) = db.count_yt_sets_and_tracks().unwrap();
        assert_eq!(tracks, 2, "one row left in the first set, one in the second");
    }

    #[test]
    fn statistics_come_out_of_the_stored_sets() {
        let db = library_with_two_sets();

        let (sets, tracks, unknowns) = db.count_yt_sets_and_tracks().unwrap();
        assert_eq!((sets, tracks, unknowns), (2, 3, 1));

        let artists = db.top_yt_artists(10).unwrap();
        assert_eq!(artists[0], ("Thomas Bangalter".to_string(), 2));

        // The point of this one: records doing the rounds between sets.
        let shared = db.shared_yt_tracks(10).unwrap();
        assert_eq!(shared.len(), 1);
        assert_eq!(shared[0].0, "Club Soda");
        assert_eq!(shared[0].2, 2);

        let gaps = db.yt_sets_with_most_unknowns(5).unwrap();
        assert_eq!(gaps.len(), 1);
        assert_eq!(gaps[0].0, "xJR7q0XN8oU");
        assert_eq!(gaps[0].2, 1);
    }

    #[test]
    fn deleting_a_set_takes_its_tracks_with_it() {
        let db = library_with_two_sets();
        db.delete_yt_set("bk6Xst6euQk").unwrap();

        let (sets, tracks, _) = db.count_yt_sets_and_tracks().unwrap();
        assert_eq!(sets, 1);
        assert_eq!(tracks, 1);
        assert!(db.search_yt_tracks("something we all adore", 50).unwrap().is_empty());
    }

    #[test]
    fn deleting_a_set_takes_its_saved_tracks_with_it() {
        let db = test_db();
        let (set, raw) = sample_set();
        db.save_yt_set(&set, raw).unwrap();
        db.save_yt_track(&YtSavedTrack {
            id: None,
            video_id: "bk6Xst6euQk".to_string(),
            cue_ms: 0,
            cue: Some("0:00".to_string()),
            artist: None,
            title: "Intro".to_string(),
            mix: None,
            saved_at: None,
            set_title: None,
        })
        .unwrap();

        db.delete_yt_set("bk6Xst6euQk").unwrap();
        // The foreign key cascades, so no orphan rows are left behind.
        assert!(db.list_saved_yt_tracks().unwrap().is_empty());
    }

    #[test]
    fn an_expensive_search_shows_up_as_such() {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");
        let status = spend_units(&db, 100, DAY_ONE).unwrap();
        assert_eq!(status.spent, 100);
        assert_eq!(status.remaining, 9_900);
    }

    #[test]
    fn status_reports_what_is_left() {
        let status = to_status(
            QuotaState {
                pacific_day: "2026-09-07".to_string(),
                spent: 137,
            },
            1_768_478_400,
        );
        assert_eq!(status.remaining, DAILY_QUOTA - 137);
        assert_eq!(status.daily_limit, 10_000);
        assert!(!status.exhausted);
        assert!(status.seconds_until_reset > 0);
    }

    #[test]
    fn overspending_does_not_wrap_around() {
        let status = to_status(
            QuotaState {
                pacific_day: "2026-09-07".to_string(),
                spent: 10_400,
            },
            1_768_478_400,
        );
        assert_eq!(status.remaining, 0);
        assert!(status.exhausted);
    }
}
