//! Tauri commands for the YouTube side of the tracklist feature.
//!
//! Every user brings their own API key: the free allowance of 10,000 units a
//! day is charged per key, so a key shipped inside the app would be a single
//! budget shared by everyone (one search alone costs 100 units), and a key in a
//! binary is trivially extracted.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::commands::library::AppState;
use crate::db::{
    Database, YtChannel, YtDjFind, YtSavedTrack, YtSet, YtTrack, YtTrackEcho, YtWatchedDj,
};
use crate::error::AppError;
use crate::external::youtube::{self, ChannelInfo, RawSet, SetSearchHit, DAILY_QUOTA};
use crate::external::youtube_time::{self, now_unix, pacific_day, seconds_until_pacific_midnight};

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
///
/// It takes `&AppState` rather than `&State<AppState>` so the automatic check,
/// which has an `AppHandle` and no command state, can use the same path.
/// Command call sites are unchanged — `State` derefs to it.
fn with_db<T>(
    state: &AppState,
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

fn read_key(state: &AppState) -> Result<String, AppError> {
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
fn record_spend(state: &AppState, units: u32) -> Result<QuotaStatus, AppError> {
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

/// What is left of today, without spending anything to find out.
fn get_quota(state: &AppState) -> Result<QuotaStatus, AppError> {
    let now = now_unix();
    let today = pacific_day(now);
    let quota = with_db(state, |db| Ok(load_quota(db, &today)))?;
    Ok(to_status(quota, now))
}

#[tauri::command]
pub async fn get_youtube_quota(state: State<'_, AppState>) -> Result<QuotaStatus, AppError> {
    get_quota(&state)
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
    let mut hits = match youtube::search_sets(&key, query.trim(), max.unwrap_or(12), &mut spent).await
    {
        Ok(hits) => hits,
        Err(e) => {
            let _ = record_spend(&state, spent);
            return Err(e);
        }
    };

    // One more unit, for up to fifty videos, buys the full description of every
    // hit — enough to say which of them actually carries a tracklist before the
    // user spends 5-7 opening one. Against the hundred just spent on the
    // search, refusing to spend it would be an odd economy. A failure here
    // costs nothing but the extra information.
    let _ = youtube::fill_details(&key, &mut hits, &mut spent).await;

    let _ = record_spend(&state, spent);
    Ok(hits)
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

/// Hands playback to the app's own player. Two audible at once is not something
/// anyone wants.
#[tauri::command]
pub async fn pause_youtube_panel() -> Result<(), AppError> {
    crate::server::routes::request_pause();
    Ok(())
}

#[tauri::command]
pub async fn play_youtube_panel() -> Result<(), AppError> {
    crate::server::routes::request_play();
    Ok(())
}

/// Where the video is, as the panel last reported it.
#[derive(Debug, Serialize)]
pub struct PanelStateDTO {
    pub position_ms: u64,
    pub duration_ms: u64,
    /// YouTube's numbering: -1 unstarted, 0 ended, 1 playing, 2 paused,
    /// 3 buffering, 5 cued.
    pub player_state: i32,
}

#[tauri::command]
pub async fn youtube_panel_state() -> Result<PanelStateDTO, AppError> {
    let (position_ms, duration_ms, player_state) = crate::server::routes::read_panel_state();
    Ok(PanelStateDTO {
        position_ms,
        duration_ms,
        player_state,
    })
}

#[tauri::command]
pub async fn close_youtube_panel(app: tauri::AppHandle) -> Result<(), AppError> {
    if let Some(panel) = app.get_webview(PANEL_LABEL) {
        let _ = panel.close();
    }
    // A closed panel must not leave a stale position for the next set to draw.
    crate::server::routes::clear_panel_state();
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

/// The same record, found in another set that knows where it sits.
#[derive(Debug, Serialize)]
pub struct TrackEchoDTO {
    pub position: i64,
    pub video_id: String,
    pub set_title: Option<String>,
    pub cue_ms: i64,
    pub cue: Option<String>,
}

/// Where else the records of this set turn up, with a timestamp. Costs nothing:
/// it is a question about what is already stored.
#[tauri::command]
pub async fn youtube_track_echoes(
    state: State<'_, AppState>,
    video_id: String,
) -> Result<Vec<TrackEchoDTO>, AppError> {
    with_db(&state, |db| {
        db.find_yt_track_echoes(&video_id)
            .map(|echoes| {
                echoes
                    .into_iter()
                    .map(|e: YtTrackEcho| TrackEchoDTO {
                        position: e.position,
                        video_id: e.video_id,
                        set_title: e.set_title,
                        cue_ms: e.cue_ms,
                        cue: e.cue,
                    })
                    .collect()
            })
            .map_err(|e| AppError::Database(format!("Failed to look across sets: {e}")))
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
    pub check_interval_hours: i64,
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
        // Nothing starts spending quota because it was followed.
        check_interval_hours: 0,
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
                        check_interval_hours: c.check_interval_hours,
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
    /// A channel's UC id, or `dj:<name>` for a watched DJ.
    pub channel_id: String,
    pub title: Option<String>,
    /// "channel" or "dj" — they cost two orders of magnitude apart, and only a
    /// channel has a last-seen marker to move.
    pub source: String,
    /// The user asked for these to be fetched and stored without being asked
    /// again. Only ever true for a watched DJ who has it switched on.
    pub auto_import: bool,
    /// Long uploads newer than the last one seen.
    pub new_sets: Vec<ChannelUploadDTO>,
}

/// Whether a channel is due for an automatic check.
///
/// A pure function of (interval, last_checked, now) so the rule can be tested
/// without a clock, a database or a network — which is the whole of what makes
/// automatic checking safe to leave running.
///
/// An interval of 0 means never. A channel that has never been checked is due
/// at once. An unreadable `last_checked` counts as never checked: doing the
/// work is the recoverable mistake, skipping a channel forever is not.
pub fn is_due(interval_hours: i64, last_checked: Option<&str>, now: i64) -> bool {
    if interval_hours <= 0 {
        return false;
    }
    match last_checked.and_then(youtube_time::unix_from_iso) {
        Some(then) => now.saturating_sub(then) >= interval_hours * 3_600,
        None => true,
    }
}

/// The body of a check, shared by the button and by the automatic run.
///
/// `due_only` is what separates them: the button checks everything the user is
/// following, the timer only what its own interval says is due.
///
/// `last_checked` is written per channel, and only when the channel was
/// actually reached. A channel that is temporarily unreachable stays due, or a
/// network blip would silently skip it for a whole day.
async fn run_channel_check(
    state: &AppState,
    due_only: bool,
    now: i64,
) -> Result<Vec<ChannelNewsDTO>, AppError> {
    let key = read_key(state)?;

    let channels = with_db(state, |db| {
        db.list_yt_channels()
            .map_err(|e| AppError::Database(format!("Failed to list channels: {e}")))
    })?;

    let channels: Vec<YtChannel> = if due_only {
        channels
            .into_iter()
            .filter(|c| is_due(c.check_interval_hours, c.last_checked.as_deref(), now))
            .collect()
    } else {
        channels
    };

    if channels.is_empty() {
        return Ok(Vec::new());
    }

    let stored: Vec<String> = with_db(state, |db| {
        db.list_yt_sets()
            .map(|sets| sets.into_iter().map(|s| s.video_id).collect())
            .map_err(|e| AppError::Database(format!("Failed to read the library: {e}")))
    })?;

    let mut news = Vec::new();
    let mut spent = 0u32;
    let mut checked: Vec<String> = Vec::new();

    for channel in channels {
        let Some(uploads_id) = channel.uploads_id.clone() else {
            continue;
        };

        let mut items = match youtube::channel_uploads(&key, &uploads_id, 10, &mut spent).await {
            Ok(items) => items,
            // One unreachable channel must not sink the whole check.
            Err(_) => continue,
        };

        // Reached, so the interval starts again from here — whether or not
        // anything new turned up.
        checked.push(channel.channel_id.clone());

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
                source: "channel".to_string(),
                auto_import: false,
                new_sets,
            });
        }
    }

    let _ = record_spend(state, spent);

    if !checked.is_empty() {
        let stamp = youtube_time::iso_now();
        let _ = with_db(state, |db| {
            for channel_id in &checked {
                let _ = db.touch_yt_channel_checked(channel_id, &stamp);
            }
            Ok(())
        });
    }

    Ok(news)
}

/// Checks every followed channel for sets that were not there last time.
/// One to two units per channel.
#[tauri::command]
pub async fn check_youtube_channels(
    state: State<'_, AppState>,
) -> Result<Vec<ChannelNewsDTO>, AppError> {
    run_channel_check(&state, false, now_unix()).await
}

/// How often a channel is checked on its own. 0 never, 24 daily, 168 weekly.
#[tauri::command]
pub async fn set_youtube_channel_interval(
    state: State<'_, AppState>,
    channel_id: String,
    hours: i64,
) -> Result<(), AppError> {
    with_db(&state, |db| {
        db.set_yt_channel_interval(&channel_id, hours)
            .map_err(|e| AppError::Database(format!("Failed to set the interval: {e}")))
    })
}

// --- watched DJs -------------------------------------------------------
//
// A DJ is not a channel, and the difference is not cosmetic. A channel's new
// uploads are a listing, at a unit or two. A DJ's new set may appear on a
// channel nobody follows, and the only call that finds it is `search`, at 100
// units — a hundred times more, out of the same ten thousand a day.
//
// So this half is built around that number: Never is the default, the interval
// is per DJ, and the automatic run stops before it can eat the day.

/// What the automatic run refuses to spend below.
///
/// One DJ search is 100 units. Left alone, a handful of daily watches on a day
/// when something also went wrong could work through the whole allowance while
/// the user was not looking, and the first they would know of it is a set they
/// could not open. The reserve is what the app will not touch on its own; the
/// buttons remain free to spend it, because a button was asked for.
const AUTOMATIC_QUOTA_RESERVE: u32 = 2_000;

/// How far back a DJ watched for the first time looks.
///
/// Without a floor the first check would ask for everything ever published and
/// report a decade of sets as new. A month is enough to be useful and short
/// enough to be read.
const FIRST_DJ_LOOKBACK_SECS: i64 = 30 * 86_400;

/// How far back before the last check a search still reaches.
///
/// YouTube's publish time and the moment a set becomes findable are not the
/// same instant, so a window that starts exactly where the last one ended can
/// step over a set. Overlapping is free — the search costs 100 units either
/// way — and `yt_dj_finds` makes the repeats harmless.
const DJ_OVERLAP_SECS: i64 = 2 * 86_400;

#[derive(Debug, Serialize)]
pub struct WatchedDjDTO {
    pub name_key: String,
    pub display_name: String,
    pub check_interval_hours: i64,
    pub last_checked: Option<String>,
    pub auto_import: bool,
}

/// "Solomun" and "solomun" are the same DJ.
fn dj_key(name: &str) -> String {
    name.trim().to_lowercase()
}

#[tauri::command]
pub async fn watch_youtube_dj(state: State<'_, AppState>, name: String) -> Result<(), AppError> {
    let display_name = name.trim().to_string();
    if display_name.len() < 2 {
        return Err(AppError::Validation("Type a DJ's name to watch".to_string()));
    }

    let dj = YtWatchedDj {
        name_key: dj_key(&display_name),
        display_name,
        // Watching alone must never start spending 100 units a day.
        check_interval_hours: 0,
        last_checked: None,
        auto_import: false,
    };

    with_db(&state, |db| {
        db.save_yt_watched_dj(&dj)
            .map_err(|e| AppError::Database(format!("Failed to watch that DJ: {e}")))
    })
}

#[tauri::command]
pub async fn list_youtube_djs(state: State<'_, AppState>) -> Result<Vec<WatchedDjDTO>, AppError> {
    with_db(&state, |db| {
        db.list_yt_watched_djs()
            .map(|djs| {
                djs.into_iter()
                    .map(|d| WatchedDjDTO {
                        name_key: d.name_key,
                        display_name: d.display_name,
                        check_interval_hours: d.check_interval_hours,
                        last_checked: d.last_checked,
                        auto_import: d.auto_import,
                    })
                    .collect()
            })
            .map_err(|e| AppError::Database(format!("Failed to list watched DJs: {e}")))
    })
}

#[tauri::command]
pub async fn unwatch_youtube_dj(
    state: State<'_, AppState>,
    name_key: String,
) -> Result<(), AppError> {
    with_db(&state, |db| {
        db.delete_yt_watched_dj(&name_key)
            .map_err(|e| AppError::Database(format!("Failed to stop watching: {e}")))?;
        // Their history goes with them, so watching again starts clean rather
        // than silently suppressing everything found the last time.
        db.delete_yt_dj_finds(&name_key)
            .map_err(|e| AppError::Database(format!("Failed to clear the history: {e}")))
    })
}

/// Everything a DJ's searches have turned up, at no quota cost.
#[tauri::command]
pub async fn list_youtube_dj_finds(
    state: State<'_, AppState>,
    name_key: String,
) -> Result<Vec<ChannelUploadDTO>, AppError> {
    let stored: Vec<String> = with_db(&state, |db| {
        db.list_yt_sets()
            .map(|sets| sets.into_iter().map(|s| s.video_id).collect())
            .map_err(|e| AppError::Database(format!("Failed to read the library: {e}")))
    })?;

    with_db(&state, |db| {
        db.list_yt_dj_finds(&name_key)
            .map(|finds| {
                finds
                    .into_iter()
                    .map(|f| ChannelUploadDTO {
                        already_stored: stored.contains(&f.video_id),
                        video_id: f.video_id,
                        title: f.title,
                        published_at: f.published_at.unwrap_or_default(),
                        duration_ms: None,
                    })
                    .collect()
            })
            .map_err(|e| AppError::Database(format!("Failed to read what was found: {e}")))
    })
}

/// How often a DJ is searched for on their own. 0 never, 24 daily, 168 weekly.
#[tauri::command]
pub async fn set_youtube_dj_interval(
    state: State<'_, AppState>,
    name_key: String,
    hours: i64,
) -> Result<(), AppError> {
    with_db(&state, |db| {
        db.set_yt_dj_interval(&name_key, hours)
            .map_err(|e| AppError::Database(format!("Failed to set the interval: {e}")))
    })
}

/// Does this title actually name the DJ, or merely mention them?
///
/// Searching a name matches descriptions and tags too, so the title has to be
/// checked. The obvious check — does the title contain the name as typed — is
/// too brittle to ship: "Josep Capriati" is not a substring of "JOSEPH
/// CAPRIATI closing set", so a single missing letter silently discards every
/// real result while the app reports, truthfully and uselessly, that it found
/// nothing.
///
/// Requiring every word instead survives a typo, a reordering, and anything
/// inserted between the words. It is looser, and deliberately so: the cost of
/// being strict here is invisible, and the cost of being loose is one extra row
/// the user can see and ignore.
fn title_mentions(name: &str, title: &str) -> bool {
    let haystack = title.to_lowercase();
    let words: Vec<String> = name
        .split_whitespace()
        // Single characters match almost anything and carry no information.
        .filter(|word| word.chars().count() >= 2)
        .map(|word| word.to_lowercase())
        .collect();

    if words.is_empty() {
        return haystack.contains(&name.to_lowercase());
    }
    words.iter().all(|word| haystack.contains(word.as_str()))
}

/// Whether a DJ's new sets are fetched and stored without being asked.
#[tauri::command]
pub async fn set_youtube_dj_auto_import(
    state: State<'_, AppState>,
    name_key: String,
    enabled: bool,
) -> Result<(), AppError> {
    with_db(&state, |db| {
        db.set_yt_dj_auto_import(&name_key, enabled)
            .map_err(|e| AppError::Database(format!("Failed to set automatic import: {e}")))
    })
}

/// Which watched DJs an automatic run may search for, in order, given what is
/// left of today's quota.
///
/// Pure, because this is where 100 units a call meets a 10,000-unit day and the
/// arithmetic has to be right whether or not anyone is watching. The reserve is
/// never crossed, so a long list of daily watches spends what it can and leaves
/// the rest of the day intact rather than failing halfway through.
fn djs_within_budget(
    due: Vec<YtWatchedDj>,
    remaining_quota: u32,
    reserve: u32,
) -> Vec<YtWatchedDj> {
    let spendable = remaining_quota.saturating_sub(reserve);
    let affordable = (spendable / youtube::unit_cost("search")) as usize;
    due.into_iter().take(affordable).collect()
}

/// The body of a DJ check, shared by the button and by the automatic run.
///
/// `budget` caps how much the run may spend. The button passes `None` — a
/// person asking is allowed to spend what they have.
async fn run_dj_check(
    state: &AppState,
    due_only: bool,
    now: i64,
    budget: Option<u32>,
) -> Result<Vec<ChannelNewsDTO>, AppError> {
    let key = read_key(state)?;

    let djs = with_db(state, |db| {
        db.list_yt_watched_djs()
            .map_err(|e| AppError::Database(format!("Failed to list watched DJs: {e}")))
    })?;

    let mut djs: Vec<YtWatchedDj> = if due_only {
        djs.into_iter()
            .filter(|d| is_due(d.check_interval_hours, d.last_checked.as_deref(), now))
            .collect()
    } else {
        djs
    };

    if let Some(remaining) = budget {
        djs = djs_within_budget(djs, remaining, AUTOMATIC_QUOTA_RESERVE);
    }

    if djs.is_empty() {
        return Ok(Vec::new());
    }

    let stored: Vec<String> = with_db(state, |db| {
        db.list_yt_sets()
            .map(|sets| sets.into_iter().map(|s| s.video_id).collect())
            .map_err(|e| AppError::Database(format!("Failed to read the library: {e}")))
    })?;

    let mut news = Vec::new();
    let mut spent = 0u32;
    let mut checked: Vec<String> = Vec::new();

    for dj in djs {
        // A DJ watched for the first time looks back a month, not forever; after
        // that the window reaches a little behind the last check.
        let since = dj
            .last_checked
            .as_deref()
            .and_then(youtube_time::unix_from_iso)
            .map(|then| then - DJ_OVERLAP_SECS)
            .unwrap_or(now - FIRST_DJ_LOOKBACK_SECS);

        let hits = match youtube::search_sets_since(
            &key,
            &dj.display_name,
            &youtube_time::iso_seconds(since),
            10,
            &mut spent,
        )
        .await
        {
            Ok(hits) => hits,
            // One failed search must not sink the rest, and must not count as
            // a check — 100 units is too much to silently waste a day over.
            Err(_) => continue,
        };

        checked.push(dj.name_key.clone());

        // A set that does not name them in its title is somebody talking about
        // them, not a set of theirs.
        let relevant: Vec<_> = hits
            .into_iter()
            .filter(|hit| title_mentions(&dj.name_key, &hit.title))
            .collect();

        // Everything the search returned is remembered against this DJ, and the
        // insert itself says which of them had never been seen before. A set
        // found last week and not imported is therefore not announced twice,
        // and is still there to go back to.
        let first_sightings = with_db(state, |db| {
            let mut fresh = Vec::new();
            for hit in &relevant {
                let is_new = db
                    .record_yt_dj_find(&YtDjFind {
                        name_key: dj.name_key.clone(),
                        video_id: hit.video_id.clone(),
                        title: hit.title.clone(),
                        channel: Some(hit.channel.clone()),
                        published_at: Some(hit.published_at.clone()),
                    })
                    .unwrap_or(false);
                if is_new {
                    fresh.push(hit.video_id.clone());
                }
            }
            Ok(fresh)
        })
        .unwrap_or_default();

        let new_sets: Vec<ChannelUploadDTO> = relevant
            .into_iter()
            .filter(|hit| first_sightings.contains(&hit.video_id))
            .filter(|hit| !stored.contains(&hit.video_id))
            .map(|hit| ChannelUploadDTO {
                video_id: hit.video_id,
                title: hit.title,
                published_at: hit.published_at,
                // Search does not report duration, and asking would cost more.
                // `videoDuration=long` has already excluded anything short.
                duration_ms: None,
                already_stored: false,
            })
            .collect();

        if !new_sets.is_empty() {
            news.push(ChannelNewsDTO {
                channel_id: format!("dj:{}", dj.name_key),
                title: Some(dj.display_name),
                source: "dj".to_string(),
                auto_import: dj.auto_import,
                new_sets,
            });
        }
    }

    let _ = record_spend(state, spent);

    if !checked.is_empty() {
        let stamp = youtube_time::iso_now();
        let _ = with_db(state, |db| {
            for name_key in &checked {
                let _ = db.touch_yt_dj_checked(name_key, &stamp);
            }
            Ok(())
        });
    }

    Ok(news)
}

/// Searches for every watched DJ. 100 units each, and the button says so.
#[tauri::command]
pub async fn check_youtube_djs(
    state: State<'_, AppState>,
) -> Result<Vec<ChannelNewsDTO>, AppError> {
    run_dj_check(&state, false, now_unix(), None).await
}

// --- automatic checking ------------------------------------------------
//
// The timer is deliberately dumb: it wakes on a fixed tick and asks the pure
// `is_due` rule which channels have waited long enough. Nothing is scheduled
// per channel, so following, unfollowing or changing an interval needs no
// bookkeeping — the next tick simply reads the new answer.

/// How often the app looks for channels that are due.
///
/// Well below the shortest interval on offer (daily), so a check lands within
/// a quarter of an hour of when it is due, and rare enough that the tick itself
/// costs nothing: a wake with nothing due does not touch the network at all.
const WATCH_TICK_SECS: u64 = 15 * 60;

/// The database is opened by the frontend, not at startup, so the first tick
/// waits for it rather than racing it.
const WATCH_FIRST_TICK_SECS: u64 = 90;

/// What the frontend is told when the automatic check finds something.
pub const NEW_SETS_EVENT: &str = "yt-new-sets";

/// Starts the background check. Called once, from the app's setup.
///
/// Every failure here is silent on purpose: no API key, no database yet, quota
/// gone, no network. None of them is something to interrupt someone's evening
/// over, and all of them fix themselves by the next tick.
pub fn spawn_channel_watcher(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(WATCH_FIRST_TICK_SECS)).await;

        loop {
            let state = app.state::<AppState>();
            let now = now_unix();

            let mut news = run_channel_check(&state, true, now).await.unwrap_or_default();

            // Only what is left after the channel checks may go on searches,
            // and only down to the reserve.
            let remaining = get_quota(&state).map(|q| q.remaining).unwrap_or(0);
            if let Ok(dj_news) = run_dj_check(&state, true, now, Some(remaining)).await {
                news.extend(dj_news);
            }

            if !news.is_empty() {
                let _ = app.emit(NEW_SETS_EVENT, &news);
            }
            drop(state);

            tokio::time::sleep(std::time::Duration::from_secs(WATCH_TICK_SECS)).await;
        }
    });
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

    /// 2026-01-15 12:00:00 UTC, the same instant DAY_ONE names.
    const DAY_ONE_ISO: &str = "2026-01-15T12:00:00.000Z";

    #[test]
    fn never_means_never_however_long_it_has_been() {
        assert!(!is_due(0, None, DAY_ONE));
        assert!(!is_due(0, Some(DAY_ONE_ISO), DAY_ONE + 365 * 86_400));
        // A negative interval is not a shorter one.
        assert!(!is_due(-24, None, DAY_ONE));
    }

    #[test]
    fn a_channel_never_checked_is_due_at_once() {
        assert!(is_due(24, None, DAY_ONE));
        assert!(is_due(168, None, DAY_ONE));
    }

    #[test]
    fn the_interval_is_honoured_to_the_hour() {
        // Daily: not at 23 hours, yes at exactly 24.
        assert!(!is_due(24, Some(DAY_ONE_ISO), DAY_ONE + 23 * 3_600));
        assert!(is_due(24, Some(DAY_ONE_ISO), DAY_ONE + 24 * 3_600));
        // Weekly.
        assert!(!is_due(168, Some(DAY_ONE_ISO), DAY_ONE + 6 * 86_400));
        assert!(is_due(168, Some(DAY_ONE_ISO), DAY_ONE + 7 * 86_400));
    }

    #[test]
    fn a_manual_check_a_minute_ago_counts() {
        // The button writes last_checked too, so the timer must not repeat it.
        assert!(!is_due(24, Some(DAY_ONE_ISO), DAY_ONE + 60));
    }

    #[test]
    fn an_unreadable_timestamp_is_treated_as_never_checked() {
        // Doing the work again costs a unit. Skipping a channel forever does not
        // announce itself, so the cheap mistake is the one to make.
        assert!(is_due(24, Some("whenever"), DAY_ONE));
        assert!(is_due(24, Some(""), DAY_ONE));
    }

    #[test]
    fn a_clock_that_went_backwards_does_not_make_everything_due() {
        // saturating_sub, not a negative that would compare as "not yet".
        assert!(!is_due(24, Some(DAY_ONE_ISO), DAY_ONE - 3_600));
    }

    #[test]
    fn the_interval_survives_a_round_trip_through_the_database() {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");

        db.save_yt_channel(&YtChannel {
            channel_id: "UC1".to_string(),
            handle: Some("cercle".to_string()),
            title: Some("Cercle".to_string()),
            uploads_id: Some("UU1".to_string()),
            last_checked: None,
            last_seen_video: None,
            check_interval_hours: 0,
        })
        .expect("follow");

        // Following alone must never start spending quota.
        let stored = db.list_yt_channels().expect("list");
        assert_eq!(stored[0].check_interval_hours, 0);
        assert!(!is_due(stored[0].check_interval_hours, None, DAY_ONE));

        db.set_yt_channel_interval("UC1", 24).expect("set interval");
        let stored = db.list_yt_channels().expect("list");
        assert_eq!(stored[0].check_interval_hours, 24);
        assert!(is_due(stored[0].check_interval_hours, stored[0].last_checked.as_deref(), DAY_ONE));

        db.touch_yt_channel_checked("UC1", DAY_ONE_ISO).expect("touch");
        let stored = db.list_yt_channels().expect("list");
        assert_eq!(stored[0].last_checked.as_deref(), Some(DAY_ONE_ISO));
        // Touching records the check without disturbing anything else.
        assert_eq!(stored[0].check_interval_hours, 24);
        assert_eq!(stored[0].last_seen_video, None);
        assert!(!is_due(24, stored[0].last_checked.as_deref(), DAY_ONE + 3_600));
        assert!(is_due(24, stored[0].last_checked.as_deref(), DAY_TWO));
    }

    fn watched(name: &str, hours: i64) -> YtWatchedDj {
        YtWatchedDj {
            name_key: dj_key(name),
            display_name: name.to_string(),
            check_interval_hours: hours,
            last_checked: None,
            auto_import: false,
        }
    }

    #[test]
    fn a_dj_search_costs_a_hundred_times_a_channel_check() {
        // The number the whole DJ half is designed around.
        assert_eq!(youtube::unit_cost("search"), 100);
        assert_eq!(youtube::unit_cost("playlistItems"), 1);
    }

    #[test]
    fn the_automatic_run_never_spends_into_the_reserve() {
        let due: Vec<YtWatchedDj> = (0..10).map(|i| watched(&format!("dj{i}"), 24)).collect();

        // A full day: 10,000 less the 2,000 reserve is 8,000, which buys 80 —
        // more than are due, so all ten run.
        assert_eq!(djs_within_budget(due.clone(), 10_000, 2_000).len(), 10);

        // Down to the reserve exactly: nothing may run.
        assert_eq!(djs_within_budget(due.clone(), 2_000, 2_000).len(), 0);
        // Below it, after the buttons have spent the day: still nothing, and no
        // underflow panic on the subtraction.
        assert_eq!(djs_within_budget(due.clone(), 0, 2_000).len(), 0);
        assert_eq!(djs_within_budget(due.clone(), 500, 2_000).len(), 0);

        // 2,350 leaves 350 spendable, which buys three searches, not four.
        assert_eq!(djs_within_budget(due, 2_350, 2_000).len(), 3);
    }

    #[test]
    fn watching_a_dj_does_not_start_searching_for_them() {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");

        db.save_yt_watched_dj(&watched("Solomun", 0)).expect("watch");

        let stored = db.list_yt_watched_djs().expect("list");
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0].display_name, "Solomun");
        assert_eq!(stored[0].check_interval_hours, 0);
        // Never, whatever the budget says.
        assert!(!is_due(stored[0].check_interval_hours, None, DAY_ONE));
        assert_eq!(djs_within_budget(stored, 10_000, 2_000).len(), 1);
    }

    #[test]
    fn automatic_import_is_off_until_it_is_asked_for() {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");

        db.save_yt_watched_dj(&watched("Solomun", 24)).expect("watch");
        assert!(!db.list_yt_watched_djs().unwrap()[0].auto_import);

        db.set_yt_dj_auto_import("solomun", true).expect("enable");
        assert!(db.list_yt_watched_djs().unwrap()[0].auto_import);
        // And switching it off again really switches it off.
        db.set_yt_dj_auto_import("solomun", false).expect("disable");
        assert!(!db.list_yt_watched_djs().unwrap()[0].auto_import);
    }

    #[test]
    fn the_same_dj_is_not_watched_twice_under_a_different_case() {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");

        db.save_yt_watched_dj(&watched("Solomun", 0)).expect("watch");
        db.save_yt_watched_dj(&watched("solomun", 168)).expect("watch again");

        let stored = db.list_yt_watched_djs().expect("list");
        assert_eq!(stored.len(), 1, "one DJ, however it was typed");
        assert_eq!(stored[0].check_interval_hours, 168);
    }

    #[test]
    fn a_dj_interval_and_check_round_trip_through_the_database() {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");

        db.save_yt_watched_dj(&watched("Hot Since 82", 0)).expect("watch");
        db.set_yt_dj_interval("hot since 82", 168).expect("interval");

        let stored = db.list_yt_watched_djs().expect("list");
        assert_eq!(stored[0].check_interval_hours, 168);
        // Never checked, so a weekly watch is due at once.
        assert!(is_due(168, stored[0].last_checked.as_deref(), DAY_ONE));

        db.touch_yt_dj_checked("hot since 82", DAY_ONE_ISO).expect("touch");
        let stored = db.list_yt_watched_djs().expect("list");
        assert!(!is_due(168, stored[0].last_checked.as_deref(), DAY_TWO));
        assert!(is_due(168, stored[0].last_checked.as_deref(), DAY_ONE + 7 * 86_400));

        db.delete_yt_watched_dj("hot since 82").expect("unwatch");
        assert!(db.list_yt_watched_djs().expect("list").is_empty());
    }

    fn find(name_key: &str, video_id: &str) -> YtDjFind {
        YtDjFind {
            name_key: name_key.to_string(),
            video_id: video_id.to_string(),
            title: format!("A set {video_id}"),
            channel: Some("cosmobeat".to_string()),
            published_at: Some(DAY_ONE_ISO.to_string()),
        }
    }

    /// The point of remembering: a set is news exactly once, whether or not the
    /// user did anything about it, and whether or not a later search returns it
    /// again from the overlapping window.
    #[test]
    fn a_set_a_search_already_turned_up_is_not_news_twice() {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");

        assert!(db.record_yt_dj_find(&find("solomun", "abc")).unwrap(), "first sighting is news");
        assert!(!db.record_yt_dj_find(&find("solomun", "abc")).unwrap(), "the same set is not");
        assert!(db.record_yt_dj_find(&find("solomun", "def")).unwrap(), "a different set is");

        // Another DJ's search finding the same video is news for that DJ.
        assert!(db.record_yt_dj_find(&find("hot since 82", "abc")).unwrap());

        let solomun = db.list_yt_dj_finds("solomun").unwrap();
        assert_eq!(solomun.len(), 2);
        assert!(solomun.iter().all(|f| f.name_key == "solomun"));
    }

    /// Watching again must start clean, or everything found the first time
    /// would be silently suppressed forever.
    #[test]
    fn unwatching_a_dj_forgets_what_was_found_for_them() {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");

        db.record_yt_dj_find(&find("solomun", "abc")).unwrap();
        db.record_yt_dj_find(&find("hot since 82", "xyz")).unwrap();

        db.delete_yt_dj_finds("solomun").unwrap();

        assert!(db.list_yt_dj_finds("solomun").unwrap().is_empty());
        // And only theirs.
        assert_eq!(db.list_yt_dj_finds("hot since 82").unwrap().len(), 1);
        assert!(db.record_yt_dj_find(&find("solomun", "abc")).unwrap(), "news again after a reset");
    }

    /// The case that exposed this: the name was typed "Josep Capriati", and a
    /// plain substring test threw away every genuine result for a missing "h".
    #[test]
    fn a_misspelled_name_still_finds_the_dj() {
        let title = "JOSEPH CAPRIATI closing set @ AMNESIA IBIZA opening party 2024 by LUCA DEA";
        assert!(title_mentions("josep capriati", title));
        assert!(title_mentions("joseph capriati", title));
        // What the old rule did, kept here so the regression is unmistakable.
        assert!(!title.to_lowercase().contains("josep capriati"));
    }

    #[test]
    fn the_words_may_be_reordered_or_interrupted() {
        assert!(title_mentions(
            "hot since 82",
            "Hot Since 82 (UK) @ BBC Radio 1 Essential Mix 05.09.2026"
        ));
        assert!(title_mentions(
            "solomun",
            "Solomun @ Théâtre Antique d'Orange in France for Cercle"
        ));
        // Every word has to be there, not just one of them.
        assert!(!title_mentions("hot since 82", "Hot Since 91 live in Berlin"));
        assert!(!title_mentions("joseph capriati", "Adam Beyer b2b Joseph"));
    }

    #[test]
    fn somebody_talking_about_a_dj_is_not_a_set_by_them() {
        assert!(!title_mentions(
            "solomun",
            "My top 10 tracks of 2026 — deep house selection"
        ));
    }

    fn stored_track(video_id: &str, position: i64, cue_ms: i64, artist: &str, title: &str) -> YtTrack {
        YtTrack {
            video_id: video_id.to_string(),
            position,
            cue_ms,
            cue: if cue_ms > 0 { Some("1:00".to_string()) } else { None },
            artist: Some(artist.to_string()),
            title: title.to_string(),
            mix: None,
            is_unknown: false,
            votes: Some(1),
            source_count: Some(1),
            artist_norm: Some(artist.to_lowercase()),
            title_norm: Some(title.to_lowercase()),
            set_title: None,
        }
    }

    fn stored_set(video_id: &str, title: &str) -> YtSet {
        YtSet {
            video_id: video_id.to_string(),
            url: format!("https://youtu.be/{video_id}"),
            title: title.to_string(),
            channel: Some("A Channel".to_string()),
            published_at: None,
            duration_ms: Some(7_200_000),
            fetched_at: None,
            status: Some("ok".to_string()),
            confidence: Some(0.9),
            source_count: Some(1),
            track_count: Some(2),
            added_at: None,
        }
    }

    /// A tracklist with no timestamps says what was played and not when. The
    /// same record in a set that was written out properly does know, and a row
    /// with nowhere to go can point there instead.
    #[test]
    fn a_row_with_no_timestamp_finds_one_in_another_set() {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");

        db.save_yt_set(&stored_set("untimed", "The numbered one"), "{}").unwrap();
        db.save_yt_set(&stored_set("timed", "Hot Since 82 | Mixmag Lab London"), "{}").unwrap();

        db.replace_yt_tracks(
            "untimed",
            &[
                stored_track("untimed", 1, 0, "Blaze", "Lovelee Dae"),
                stored_track("untimed", 2, 0, "Nobody Else", "Never Heard Of It"),
            ],
        )
        .unwrap();
        db.replace_yt_tracks(
            "timed",
            &[stored_track("timed", 7, 4_500_000, "Blaze", "Lovelee Dae")],
        )
        .unwrap();

        let echoes = db.find_yt_track_echoes("untimed").unwrap();

        assert_eq!(echoes.len(), 1, "only the record that turns up elsewhere");
        assert_eq!(echoes[0].position, 1);
        assert_eq!(echoes[0].video_id, "timed");
        assert_eq!(echoes[0].cue_ms, 4_500_000);
        assert_eq!(echoes[0].set_title.as_deref(), Some("Hot Since 82 | Mixmag Lab London"));
    }

    #[test]
    fn a_set_never_points_at_itself_or_at_a_row_with_no_timestamp() {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");

        db.save_yt_set(&stored_set("a", "One"), "{}").unwrap();
        db.save_yt_set(&stored_set("b", "Two"), "{}").unwrap();

        // The same record twice inside one set, and once in another that also
        // has no timestamp: neither is somewhere to send anybody.
        db.replace_yt_tracks(
            "a",
            &[
                stored_track("a", 1, 0, "Blaze", "Lovelee Dae"),
                stored_track("a", 9, 3_000_000, "Blaze", "Lovelee Dae"),
            ],
        )
        .unwrap();
        db.replace_yt_tracks("b", &[stored_track("b", 1, 0, "Blaze", "Lovelee Dae")]).unwrap();

        let echoes = db.find_yt_track_echoes("a").unwrap();
        assert!(
            echoes.iter().all(|e| e.video_id != "a"),
            "a set pointing at itself tells nobody anything"
        );
        assert!(echoes.iter().all(|e| e.cue_ms > 0), "a row with no cue is not a destination");
        assert!(echoes.is_empty());
    }

    /// Dozens of records are called "Lost" or "Jolene". Pointing at the wrong
    /// one is worse than pointing nowhere.
    #[test]
    fn a_record_with_no_artist_is_not_matched_on_its_title() {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");

        db.save_yt_set(&stored_set("a", "One"), "{}").unwrap();
        db.save_yt_set(&stored_set("b", "Two"), "{}").unwrap();

        let mut nameless = stored_track("a", 1, 0, "", "Lost");
        nameless.artist = None;
        nameless.artist_norm = None;
        db.replace_yt_tracks("a", &[nameless]).unwrap();

        let mut other = stored_track("b", 3, 2_000_000, "", "Lost");
        other.artist = None;
        other.artist_norm = None;
        db.replace_yt_tracks("b", &[other]).unwrap();

        assert!(db.find_yt_track_echoes("a").unwrap().is_empty());
    }

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
