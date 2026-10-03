// src-tauri/src/commands/youtube_music.rs
//! Tauri commands for the YouTube Music section, and the loop that keeps it in sync.
//!
//! YouTube is read, never written: no likes, no playlist edits. The client
//! file's two values, the refresh token and the email live in the settings
//! table, like Spotify's; access tokens only in memory, refreshed when they
//! run out. Every call is counted in the shared YouTube quota.

use std::collections::HashSet;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::oneshot;

use crate::commands::library::AppState;
use crate::commands::spotify::now_ms;
use crate::commands::youtube::{record_spend, with_db};
use crate::db::youtube_music::{SyncBaseline, SyncChanges, YtmLibraryDump, LIKED_MUSIC_ID};
use crate::db::Database;
use crate::error::AppError;
use crate::external::spotify_auth::{self, CallbackError};
use crate::external::youtube_auth::{self, ClientFile, GoogleTokens};
use crate::external::youtube_music::{self as web_api, LiveApi, YtmError};
use crate::external::youtube_time::{now_unix, pacific_day};

const CLIENT_ID_SETTING: &str = "youtube_music_client_id";
const CLIENT_SECRET_SETTING: &str = "youtube_music_client_secret";
const REFRESH_TOKEN_SETTING: &str = "youtube_music_refresh_token";
/// Who signed in, for showing only.
const EMAIL_SETTING: &str = "youtube_music_email";
/// "0" hides the section and pauses the loop. Absent, it shows.
const SHOW_IN_SIDEBAR_SETTING: &str = "youtube_music_show_in_sidebar";
const LAST_SYNCED_SETTING: &str = "youtube_music_last_synced_at";
const LAST_ERROR_SETTING: &str = "youtube_music_last_error";
const LAST_ERROR_KIND_SETTING: &str = "youtube_music_last_error_kind";
const NEEDS_RECONNECT_SETTING: &str = "youtube_music_needs_reconnect";
/// The Pacific day YouTube answered `quotaExceeded`: the loop waits for the next.
const QUOTA_DAY_SETTING: &str = "youtube_music_quota_day";

pub const SYNCED_EVENT: &str = "youtube-music-synced";
/// Spotify's loop runs every 10 minutes. This one shares the day's quota with Sets.
const SYNC_INTERVAL: Duration = Duration::from_secs(30 * 60);
/// How often the loop looks for the database before the frontend has opened it.
const DB_POLL: Duration = Duration::from_secs(5);
/// An access token with less than this left is refreshed first.
const TOKEN_MARGIN_MS: i64 = 60_000;

#[derive(Clone)]
struct AccessToken {
    token: String,
    expires_at_ms: i64,
}

/// In-memory YouTube Music state, managed by Tauri.
#[derive(Default)]
pub struct YouTubeMusicState {
    access: Mutex<Option<AccessToken>>,
    /// One token refresh at a time.
    refresh: tokio::sync::Mutex<()>,
    /// One sync at a time: the loop, the "synced …" click, a fresh login and
    /// adding a playlist share it.
    sync_lock: tokio::sync::Mutex<()>,
    /// One login at a time.
    login: tokio::sync::Mutex<()>,
    /// Fired to cancel the sign-in waiting in the browser, if there is one.
    pending_login: Mutex<Option<oneshot::Sender<()>>>,
    /// Bumped by every new login and every cancel (a newer Connect, a new
    /// client file, Disconnect). A login saves only while its number is current.
    login_generation: AtomicU64,
}

/// Why a sync failed, in the few kinds the view words differently.
#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum SyncErrorKind {
    /// YouTube or Google could not be reached.
    Network,
    /// The day's units are used up: "resumes after midnight Pacific".
    QuotaExceeded,
    Other,
}

impl SyncErrorKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Network => "network",
            Self::QuotaExceeded => "quotaExceeded",
            Self::Other => "other",
        }
    }

    fn parse(raw: &str) -> Option<Self> {
        [Self::Network, Self::QuotaExceeded, Self::Other]
            .into_iter()
            .find(|kind| kind.as_str() == raw)
    }

    fn of(err: &YtmError) -> Self {
        match err {
            YtmError::Network(_) => Self::Network,
            YtmError::QuotaExceeded => Self::QuotaExceeded,
            _ => Self::Other,
        }
    }
}

/// A failed sync step: the error, its kind, and whether the user has to sign in again.
#[derive(Debug)]
struct SyncFailure {
    error: AppError,
    kind: SyncErrorKind,
    needs_reconnect: bool,
}

impl From<AppError> for SyncFailure {
    fn from(error: AppError) -> Self {
        let needs_reconnect = matches!(error, AppError::YouTubeMusicReconnect);
        Self { error, kind: SyncErrorKind::Other, needs_reconnect }
    }
}

impl From<YtmError> for SyncFailure {
    fn from(err: YtmError) -> Self {
        let kind = SyncErrorKind::of(&err);
        Self { kind, ..AppError::from(err).into() }
    }
}

/// The `youtube-music-synced` payload, shaped like `spotify-synced`.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyncedPayload {
    pub changed: bool,
    /// Unix ms of the last successful sync — on a failure, the previous one.
    pub last_synced_at: Option<i64>,
    pub error: Option<String>,
    /// Set with `error`.
    pub error_kind: Option<SyncErrorKind>,
    pub needs_reconnect: bool,
}

impl SyncedPayload {
    /// The account went or changed: the sidebar and the view reload.
    fn cleared() -> Self {
        Self { changed: true, last_synced_at: None, error: None, error_kind: None, needs_reconnect: false }
    }

    /// Not a sync — a playlist added or removed, the switch — but the status
    /// or the rows changed: everyone reads them again.
    fn from_status(status: &YouTubeMusicStatusDTO, changed: bool) -> Self {
        Self {
            changed,
            last_synced_at: status.last_synced_at,
            error: status.last_error.clone(),
            error_kind: status.last_error_kind,
            needs_reconnect: status.needs_reconnect,
        }
    }
}

fn db_err(e: rusqlite::Error) -> AppError {
    AppError::Database(e.to_string())
}

/// A setting, with an empty value read as absent — clearing writes "".
fn setting(db: &Database, key: &str) -> Result<Option<String>, AppError> {
    Ok(db.get_setting(key).map_err(db_err)?.filter(|v| !v.trim().is_empty()))
}

/// The quota's Pacific day, now.
fn today() -> String {
    pacific_day(now_unix())
}

fn shows_in_sidebar(db: &Database) -> bool {
    !matches!(setting(db, SHOW_IN_SIDEBAR_SETTING), Ok(Some(value)) if value == "0")
}

/// Connected, not waiting for a new sign-in, in the sidebar, and not on a day
/// YouTube already said the quota is used up.
fn should_sync(db: &Database, today: &str) -> bool {
    matches!(setting(db, REFRESH_TOKEN_SETTING), Ok(Some(_)))
        && matches!(setting(db, NEEDS_RECONNECT_SETTING), Ok(None))
        && shows_in_sidebar(db)
        && !matches!(setting(db, QUOTA_DAY_SETTING), Ok(Some(day)) if day == today)
}

/// Both values of the chosen client file, or None until one was chosen.
fn client_file(db: &Database) -> Result<Option<ClientFile>, AppError> {
    Ok(match (setting(db, CLIENT_ID_SETTING)?, setting(db, CLIENT_SECRET_SETTING)?) {
        (Some(client_id), Some(client_secret)) => Some(ClientFile { client_id, client_secret }),
        _ => None,
    })
}

fn remember_access(ytm: &YouTubeMusicState, tokens: &GoogleTokens) {
    if let Ok(mut slot) = ytm.access.lock() {
        *slot = Some(AccessToken {
            token: tokens.access_token.clone(),
            expires_at_ms: now_ms() + tokens.expires_in * 1000,
        });
    }
}

fn cached_access(ytm: &YouTubeMusicState) -> Option<String> {
    let cached = ytm.access.lock().ok()?.clone()?;
    (cached.expires_at_ms - now_ms() > TOKEN_MARGIN_MS).then_some(cached.token)
}

fn forget_access(ytm: &YouTubeMusicState) {
    if let Ok(mut slot) = ytm.access.lock() {
        *slot = None;
    }
}

/// Runs `write` only while `used` is still the stored refresh token — not after
/// a disconnect, a new client file or a newer login replaced it.
fn if_signed_in_with<T>(
    db: &Database,
    used: &str,
    write: impl FnOnce(&Database) -> Result<T, AppError>,
) -> Result<Option<T>, AppError> {
    if setting(db, REFRESH_TOKEN_SETTING)?.as_deref() != Some(used) {
        return Ok(None);
    }
    write(db).map(Some)
}

/// A usable access token, refreshing it when it is about to run out.
async fn access_token(app_state: &AppState, ytm: &YouTubeMusicState) -> Result<String, SyncFailure> {
    if let Some(token) = cached_access(ytm) {
        return Ok(token);
    }
    let _refreshing = ytm.refresh.lock().await;
    // Whoever held the lock may have refreshed already.
    if let Some(token) = cached_access(ytm) {
        return Ok(token);
    }

    let (client, refresh_token) =
        with_db(app_state, |db| Ok((client_file(db)?, setting(db, REFRESH_TOKEN_SETTING)?)))?;
    let (Some(client), Some(refresh_token)) = (client, refresh_token) else {
        return Err(AppError::YouTubeMusicNotConnected.into());
    };

    let tokens = match youtube_auth::refresh(&client, &refresh_token).await {
        Ok(tokens) => tokens,
        Err(err) => {
            let failure = refresh_failure(err);
            if failure.needs_reconnect {
                let _ = with_db(app_state, |db| {
                    if_signed_in_with(db, &refresh_token, |db| {
                        db.set_setting(NEEDS_RECONNECT_SETTING, "1").map_err(db_err)
                    })
                });
            }
            return Err(failure);
        }
    };

    let kept = with_db(app_state, |db| {
        if_signed_in_with(db, &refresh_token, |db| {
            if let Some(rotated) = &tokens.refresh_token {
                db.set_setting(REFRESH_TOKEN_SETTING, rotated).map_err(db_err)?;
            }
            // Cached under the database lock, as disconnecting clears it there.
            remember_access(ytm, &tokens);
            Ok(())
        })
    })?;
    if kept.is_none() {
        return Err(AppError::YouTubeMusicNotConnected.into());
    }
    Ok(tokens.access_token)
}

/// A failed refresh. `invalid_grant` (revoked, or expired while the Google
/// app is in Testing) and `invalid_client` (the client deleted) both put up
/// the Reconnect bar.
fn refresh_failure(err: YtmError) -> SyncFailure {
    if youtube_auth::is_invalid_client(&err) {
        return SyncFailure {
            error: AppError::YouTubeMusic(
                "Google does not know this OAuth client any more — choose the client file again in Settings, then reconnect"
                    .to_string(),
            ),
            kind: SyncErrorKind::Other,
            needs_reconnect: true,
        };
    }
    err.into()
}

/// The outer error is about getting a token; the inner one is YouTube's answer.
/// The units go to the shared counter either way: Google bills the attempt.
async fn fetch_with_token(
    app_state: &AppState,
    ytm: &YouTubeMusicState,
    baseline: &SyncBaseline,
    now: i64,
) -> Result<Result<SyncChanges, YtmError>, SyncFailure> {
    let live = LiveApi::new(access_token(app_state, ytm).await?)?;
    let fetched = web_api::fetch_changes(&live, baseline, now).await;
    if live.spent() > 0 {
        let _ = record_spend(app_state, live.spent());
    }
    Ok(fetched)
}

async fn sync_once(app_state: &AppState, ytm: &YouTubeMusicState, now: i64) -> Result<bool, SyncFailure> {
    let baseline = with_db(app_state, |db| db.ytm_baseline().map_err(db_err))?;
    let mut fetched = fetch_with_token(app_state, ytm, &baseline, now).await?;
    // A revoked grant kills the access token before it expires: drop it and
    // refresh once, which then answers invalid_grant.
    if token_went_stale(&fetched) {
        forget_access(ytm);
        fetched = fetch_with_token(app_state, ytm, &baseline, now).await?;
    }
    let changes = fetched?;
    Ok(with_db(app_state, |db| db.apply_ytm_sync(&changes, now).map_err(db_err))?)
}

/// What a successful sync leaves in settings.
fn record_success(db: &Database, now: i64) -> Result<(), AppError> {
    db.set_setting(LAST_SYNCED_SETTING, &now.to_string()).map_err(db_err)?;
    for key in [LAST_ERROR_SETTING, LAST_ERROR_KIND_SETTING, NEEDS_RECONNECT_SETTING, QUOTA_DAY_SETTING] {
        db.set_setting(key, "").map_err(db_err)?;
    }
    Ok(())
}

/// What a failed sync leaves in settings. Answers the last good sync's time,
/// for the event.
fn record_failure(
    db: &Database,
    message: &str,
    kind: SyncErrorKind,
    today: &str,
) -> Result<Option<i64>, AppError> {
    db.set_setting(LAST_ERROR_SETTING, message).map_err(db_err)?;
    db.set_setting(LAST_ERROR_KIND_SETTING, kind.as_str()).map_err(db_err)?;
    if kind == SyncErrorKind::QuotaExceeded {
        db.set_setting(QUOTA_DAY_SETTING, today).map_err(db_err)?;
    }
    Ok(setting(db, LAST_SYNCED_SETTING)?.and_then(|v| v.parse().ok()))
}

/// One sync, shared by the loop, the "synced …" click and the switch turned
/// back on. Emits `youtube-music-synced` afterwards, changed or not, and on
/// failure. Returns None, without emitting, when another sync is running (it
/// will report) or no account is connected.
pub async fn run_sync(app: &AppHandle) -> Option<SyncedPayload> {
    let ytm = app.state::<YouTubeMusicState>();
    let Ok(_running) = ytm.sync_lock.try_lock() else {
        return None;
    };
    sync_and_report(app).await
}

/// One sync and its event. The caller holds the sync lock.
async fn sync_and_report(app: &AppHandle) -> Option<SyncedPayload> {
    let app_state = app.state::<AppState>();
    let ytm = app.state::<YouTubeMusicState>();

    // Read once, before the network: a sync that starts at 23:59 Pacific and
    // fails after midnight still stamps the day it started.
    let now = now_ms();
    let day = today();
    let payload = match sync_once(&app_state, &ytm, now).await {
        Ok(changed) => {
            let _ = with_db(&app_state, |db| record_success(db, now));
            SyncedPayload { changed, last_synced_at: Some(now), error: None, error_kind: None, needs_reconnect: false }
        }
        Err(SyncFailure { error: AppError::YouTubeMusicNotConnected, .. }) => return None,
        Err(failure) => {
            let message = failure.error.to_string();
            let last_synced_at = with_db(&app_state, |db| record_failure(db, &message, failure.kind, &day))
                .ok()
                .flatten();
            SyncedPayload {
                changed: false,
                last_synced_at,
                error: Some(message),
                error_kind: Some(failure.kind),
                needs_reconnect: failure.needs_reconnect,
            }
        }
    };

    let _ = app.emit(SYNCED_EVENT, &payload);
    Some(payload)
}

fn db_ready(app: &AppHandle) -> bool {
    app.state::<AppState>().db.lock().map(|db| db.is_some()).unwrap_or(false)
}

fn sync_due(app: &AppHandle) -> bool {
    with_db(&app.state::<AppState>(), |db| Ok(should_sync(db, &today()))).unwrap_or(false)
}

/// Syncs at start-up and every 30 minutes while the app is open — when
/// connected, shown, and not waiting for tomorrow's quota.
pub fn spawn_youtube_music_sync_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        while !db_ready(&app) {
            tokio::time::sleep(DB_POLL).await;
        }
        loop {
            if sync_due(&app) {
                let _ = run_sync(&app).await;
            }
            tokio::time::sleep(SYNC_INTERVAL).await;
        }
    });
}

/// Like `run_sync`, but waits for a running sync instead of skipping: a fresh
/// login's first sync must not be lost to the loop's.
async fn run_sync_after_others(app: &AppHandle) -> Option<SyncedPayload> {
    let ytm = app.state::<YouTubeMusicState>();
    let _running = ytm.sync_lock.lock().await;
    sync_and_report(app).await
}

/// Cancels the sign-in waiting in the browser, if any; its listener stops and
/// frees the port. A login already past the browser finds its generation stale.
fn cancel_pending_login(ytm: &YouTubeMusicState) {
    ytm.login_generation.fetch_add(1, Ordering::SeqCst);
    if let Some(cancel) = ytm.pending_login.lock().ok().and_then(|mut slot| slot.take()) {
        let _ = cancel.send(());
    }
}

/// Starts a login: it now holds the newest generation.
fn begin_login(ytm: &YouTubeMusicState) -> u64 {
    ytm.login_generation.fetch_add(1, Ordering::SeqCst) + 1
}

fn login_is_current(ytm: &YouTubeMusicState, generation: u64) -> bool {
    ytm.login_generation.load(Ordering::SeqCst) == generation
}

/// Everything about the account and every synced video, pair and verdict.
/// The client file's values stay, and so do the playlists added by link (with
/// their sync state cleared) and the switch.
fn forget_account(db: &Database) -> Result<(), AppError> {
    for key in [
        REFRESH_TOKEN_SETTING,
        EMAIL_SETTING,
        LAST_SYNCED_SETTING,
        LAST_ERROR_SETTING,
        LAST_ERROR_KIND_SETTING,
        NEEDS_RECONNECT_SETTING,
        QUOTA_DAY_SETTING,
    ] {
        db.delete_setting(key).map_err(db_err)?;
    }
    db.clear_ytm_account().map_err(db_err)
}

/// A client file is a few hundred bytes; anything this big is something else.
const MAX_CLIENT_FILE_BYTES: u64 = 64 * 1024;

/// Reads the client file the user chose. Only its two values are kept; the
/// file is not copied anywhere.
fn read_client_file(path: &Path) -> Result<ClientFile, AppError> {
    let unreadable = |e: std::io::Error| AppError::Validation(format!("Could not read that file: {e}"));
    if std::fs::metadata(path).map_err(unreadable)?.len() > MAX_CLIENT_FILE_BYTES {
        return Err(AppError::Validation(youtube_auth::NOT_A_CLIENT_FILE.to_string()));
    }
    let raw = std::fs::read_to_string(path).map_err(unreadable)?;
    youtube_auth::parse_client_file(&raw).map_err(AppError::Validation)
}

/// The playlist id a link names, checked before any unit is spent.
fn playlist_to_add(link: &str) -> Result<String, AppError> {
    let id = web_api::playlist_id_from_link(link).ok_or_else(|| {
        AppError::Validation("Paste a playlist link (…?list=…) or a playlist id".to_string())
    })?;
    match id.as_str() {
        LIKED_MUSIC_ID => Err(AppError::Validation("Liked music is already in the sidebar".to_string())),
        "LL" => Err(AppError::Validation(
            "Liked videos mixes in videos that are not music — RecoDeck reads Liked music instead".to_string(),
        )),
        _ => Ok(id),
    }
}

/// Said under the + Add playlist field when YouTube shows no such playlist.
const NOT_FOUND: &str = "Not found — private playlists work only from the account that owns them";

/// A 401 means the access token died before its time — the grant was revoked
/// at Google. Drop it and refresh once; the refresh then answers
/// `invalid_grant`, which puts up the Reconnect bar.
fn token_went_stale<T>(fetched: &Result<T, YtmError>) -> bool {
    matches!(fetched, Err(YtmError::Api { status: 401, .. }))
}

/// What a failed call outside a sync (adding a playlist) leaves in settings:
/// a used-up quota pauses the loop until the next Pacific day, as a failed
/// sync's does.
fn note_failed_call(db: &Database, err: &YtmError, today: &str) -> Result<(), AppError> {
    if *err == YtmError::QuotaExceeded {
        db.set_setting(QUOTA_DAY_SETTING, today).map_err(db_err)?;
    }
    Ok(())
}

/// Adding a playlist, with a token: like `fetch_with_token`, the outer error is
/// about the token, the inner one YouTube's answer, and the units are counted.
async fn fetch_new_with_token(
    app_state: &AppState,
    ytm: &YouTubeMusicState,
    id: &str,
    known: &HashSet<String>,
    now: i64,
) -> Result<Result<Option<(String, SyncChanges)>, YtmError>, SyncFailure> {
    let live = LiveApi::new(access_token(app_state, ytm).await?)?;
    let fetched = web_api::fetch_new_playlist(&live, id, known, now).await;
    if live.spent() > 0 {
        let _ = record_spend(app_state, live.spent());
    }
    Ok(fetched)
}

/// Tells the sidebar, the view and Settings to read the status (and, when
/// `changed`, the rows) again.
fn emit_status(app: &AppHandle, state: &AppState, changed: bool) {
    if let Ok(status) = with_db(state, |db| read_status(db, &today())) {
        let _ = app.emit(SYNCED_EVENT, &SyncedPayload::from_status(&status, changed));
    }
}

// --- commands ----------------------------------------------------------

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct YouTubeMusicStatusDTO {
    /// A client file was chosen: Connect can work.
    pub has_client: bool,
    pub connected: bool,
    pub email: Option<String>,
    pub needs_reconnect: bool,
    /// Settings → YouTube Music → Show in sidebar.
    pub show_in_sidebar: bool,
    pub last_synced_at: Option<i64>,
    pub last_error: Option<String>,
    /// Set with `last_error`.
    pub last_error_kind: Option<SyncErrorKind>,
    /// YouTube said the quota is used up today (Pacific): the loop waits.
    pub quota_used_up: bool,
}

fn read_status(db: &Database, today: &str) -> Result<YouTubeMusicStatusDTO, AppError> {
    Ok(YouTubeMusicStatusDTO {
        has_client: client_file(db)?.is_some(),
        connected: setting(db, REFRESH_TOKEN_SETTING)?.is_some(),
        email: setting(db, EMAIL_SETTING)?,
        needs_reconnect: setting(db, NEEDS_RECONNECT_SETTING)?.is_some(),
        show_in_sidebar: shows_in_sidebar(db),
        last_synced_at: setting(db, LAST_SYNCED_SETTING)?.and_then(|v| v.parse().ok()),
        last_error: setting(db, LAST_ERROR_SETTING)?,
        last_error_kind: setting(db, LAST_ERROR_SETTING)?
            .and(setting(db, LAST_ERROR_KIND_SETTING)?)
            .and_then(|raw| SyncErrorKind::parse(&raw)),
        quota_used_up: setting(db, QUOTA_DAY_SETTING)?.as_deref() == Some(today),
    })
}

#[tauri::command]
pub async fn get_youtube_music_status(state: State<'_, AppState>) -> Result<YouTubeMusicStatusDTO, AppError> {
    with_db(&state, |db| read_status(db, &today()))
}

/// The result arrives as a `youtube-music-synced` event.
#[tauri::command]
pub async fn sync_youtube_music_now(app: AppHandle) -> Result<(), AppError> {
    let _ = run_sync(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn get_youtube_music_library(state: State<'_, AppState>) -> Result<YtmLibraryDump, AppError> {
    with_db(&state, |db| db.get_ytm_library().map_err(db_err))
}

/// Answers the time written, so the frontend can update its copy exactly.
#[tauri::command]
pub async fn mark_youtube_music_list_opened(state: State<'_, AppState>, list_id: String) -> Result<i64, AppError> {
    let now = now_ms();
    with_db(&state, |db| db.mark_ytm_list_opened(&list_id, now).map_err(db_err))?;
    Ok(now)
}

#[tauri::command]
pub async fn set_youtube_music_verdict(
    state: State<'_, AppState>,
    video_id: String,
    library_track_id: i64,
    verdict: String,
) -> Result<(), AppError> {
    if verdict != "yes" && verdict != "no" {
        return Err(AppError::Validation(format!("Unknown answer: {verdict}")));
    }
    with_db(&state, |db| db.set_ytm_verdict(&video_id, library_track_id, &verdict).map_err(db_err))
}

/// Choose client file…: reads `client_id` and `client_secret` from the
/// Desktop client's JSON. A different client signs the account out (its
/// refresh token belongs to the old client) but keeps the rows.
#[tauri::command]
pub async fn set_youtube_music_client_file(
    app: AppHandle,
    state: State<'_, AppState>,
    ytm: State<'_, YouTubeMusicState>,
    path: String,
) -> Result<YouTubeMusicStatusDTO, AppError> {
    let client = read_client_file(Path::new(&path))?;
    let different =
        with_db(&state, |db| Ok(setting(db, CLIENT_ID_SETTING)?.as_deref() != Some(client.client_id.as_str())))?;
    if different {
        // A sign-in still waiting in the browser was for the old client.
        cancel_pending_login(&ytm);
    }
    // A sync running now must not write over the sign-out.
    let _running = if different { Some(ytm.sync_lock.lock().await) } else { None };
    with_db(&state, |db| {
        db.set_setting(CLIENT_ID_SETTING, &client.client_id).map_err(db_err)?;
        db.set_setting(CLIENT_SECRET_SETTING, &client.client_secret).map_err(db_err)?;
        if different {
            for key in [REFRESH_TOKEN_SETTING, NEEDS_RECONNECT_SETTING] {
                db.delete_setting(key).map_err(db_err)?;
            }
            forget_access(&ytm);
        }
        Ok(())
    })?;
    if different {
        // The sidebar and the view go until the account is connected again.
        let _ = app.emit(SYNCED_EVENT, &SyncedPayload::cleared());
    }
    with_db(&state, |db| read_status(db, &today()))
}

#[tauri::command]
pub async fn connect_youtube_music(
    app: AppHandle,
    state: State<'_, AppState>,
    ytm: State<'_, YouTubeMusicState>,
) -> Result<YouTubeMusicStatusDTO, AppError> {
    // The newest Connect wins: a sign-in still waiting in the browser is
    // cancelled, and this one waits for its listener to stop.
    let (cancel, cancelled) = oneshot::channel();
    if let Ok(mut slot) = ytm.pending_login.lock() {
        if let Some(previous) = slot.replace(cancel) {
            let _ = previous.send(());
        }
    }
    let generation = begin_login(&ytm);
    let _login = ytm.login.lock().await;
    let mut cancelled = cancelled;
    // An even newer Connect came while this one waited.
    if !matches!(cancelled.try_recv(), Err(oneshot::error::TryRecvError::Empty)) {
        return Err(AppError::YouTubeMusicLoginCancelled);
    }
    let client = with_db(&state, client_file)?
        .ok_or_else(|| AppError::Validation("Choose your client file first".to_string()))?;

    // Port 0: whatever the OS gives. Google accepts any loopback port for a
    // Desktop client, so nothing was registered.
    let listener = spotify_auth::bind_listener(0, youtube_auth::SERVICE)
        .await
        .map_err(AppError::YouTubeMusic)?;
    let port = listener
        .local_addr()
        .map_err(|e| AppError::Internal(format!("Could not read the sign-in port: {e}")))?
        .port();
    let redirect_uri = youtube_auth::redirect_uri(port);
    let verifier = spotify_auth::random_string(64);
    let login_state = spotify_auth::random_string(32);
    let url = youtube_auth::authorize_url(
        &client.client_id,
        &redirect_uri,
        &spotify_auth::code_challenge(&verifier),
        &login_state,
    );
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| AppError::Internal(format!("Could not open the browser: {e}")))?;

    let params = spotify_auth::wait_for_callback(listener, spotify_auth::LOGIN_TIMEOUT, cancelled)
        .await
        .map_err(|err| match err {
            CallbackError::Cancelled => AppError::YouTubeMusicLoginCancelled,
            CallbackError::Failed(message) => AppError::YouTubeMusic(message),
        })?;
    let code = spotify_auth::code_from_callback(&params, &login_state, youtube_auth::SERVICE)
        .map_err(AppError::YouTubeMusic)?;
    let tokens = youtube_auth::exchange_code(&client, &code, &verifier, &redirect_uri)
        .await
        .map_err(|err| match err {
            // Here invalid_grant means the sign-in itself failed (a used or expired code).
            YtmError::Reconnect => AppError::YouTubeMusic("Google refused the sign-in — try Connect again".to_string()),
            other => other.into(),
        })?;
    let refresh_token = tokens.refresh_token.clone().ok_or_else(|| {
        AppError::YouTubeMusic("Google signed you in but sent no refresh token — press Connect again".to_string())
    })?;
    let email = tokens
        .id_token
        .as_deref()
        .and_then(youtube_auth::email_from_id_token)
        .unwrap_or_else(|| "your Google account".to_string());

    {
        // As in disconnect: a sync running now must not write over this.
        let _running = ytm.sync_lock.lock().await;
        with_db(&state, |db| {
            // A new client file or a Disconnect while this login was in the browser.
            let same_client =
                client_file(db)?.is_some_and(|stored| stored.client_id == client.client_id);
            if !login_is_current(&ytm, generation) || !same_client {
                return Err(AppError::YouTubeMusicLoginCancelled);
            }
            db.set_setting(REFRESH_TOKEN_SETTING, &refresh_token).map_err(db_err)?;
            db.set_setting(EMAIL_SETTING, &email).map_err(db_err)?;
            db.set_setting(NEEDS_RECONNECT_SETTING, "").map_err(db_err)?;
            db.set_setting(LAST_ERROR_SETTING, "").map_err(db_err)?;
            remember_access(&ytm, &tokens);
            Ok(())
        })?;
    }

    // The first sync starts now, not in 30 minutes. It reports through the event.
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = run_sync_after_others(&handle).await;
    });

    with_db(&state, |db| read_status(db, &today()))
}

#[tauri::command]
pub async fn disconnect_youtube_music(
    app: AppHandle,
    state: State<'_, AppState>,
    ytm: State<'_, YouTubeMusicState>,
) -> Result<YouTubeMusicStatusDTO, AppError> {
    // A sign-in still waiting in the browser would connect the account again.
    cancel_pending_login(&ytm);
    // A sync running now would write its rows back after the clear.
    let _running = ytm.sync_lock.lock().await;
    with_db(&state, |db| {
        forget_account(db)?;
        // Under the database lock, so a refresh finishing now cannot cache again.
        forget_access(&ytm);
        Ok(())
    })?;
    let _ = app.emit(SYNCED_EVENT, &SyncedPayload::cleared());
    with_db(&state, |db| read_status(db, &today()))
}

/// + Add playlist: a link or an id. The name costs 1 unit; then the playlist
/// is read in full at once, and that read is its "new" baseline. Nothing is
/// stored for a playlist YouTube does not show this account.
#[tauri::command]
pub async fn add_youtube_music_playlist(
    app: AppHandle,
    state: State<'_, AppState>,
    ytm: State<'_, YouTubeMusicState>,
    link: String,
) -> Result<(), AppError> {
    let id = playlist_to_add(&link)?;
    if with_db(&state, |db| db.has_ytm_list(&id).map_err(db_err))? {
        return Err(AppError::Validation("This playlist is already in the sidebar".to_string()));
    }

    // A loop run must not write this list at the same time; it only tries the
    // lock, so it skips this round.
    let _running = ytm.sync_lock.lock().await;
    let now = now_ms();
    let known = with_db(&state, |db| db.ytm_known_ids().map_err(db_err))?;
    // Errors go the way a sync's do: a dead access token is refreshed and
    // tried once more; a revoked grant (the refresh's invalid_grant) has
    // the failure says needs-reconnect, and the bar shows; a used-up quota
    // pauses the loop until the next Pacific day.
    let mut fetched = fetch_new_with_token(&state, &ytm, &id, &known, now).await;
    if matches!(&fetched, Ok(answer) if token_went_stale(answer)) {
        forget_access(&ytm);
        fetched = fetch_new_with_token(&state, &ytm, &id, &known, now).await;
    }
    let answer = match fetched {
        Ok(answer) => answer,
        Err(failure) => {
            if failure.needs_reconnect {
                emit_status(&app, &state, false);
            }
            return Err(failure.error);
        }
    };
    let found = match answer {
        Ok(found) => found,
        Err(err) => {
            let _ = with_db(&state, |db| note_failed_call(db, &err, &today()));
            if err == YtmError::QuotaExceeded {
                emit_status(&app, &state, false);
            }
            return Err(err.into());
        }
    };
    let (name, changes) = found.ok_or_else(|| AppError::YouTubeMusic(NOT_FOUND.to_string()))?;

    with_db(&state, |db| {
        db.add_ytm_list(&id, &name, now).map_err(db_err)?;
        db.apply_ytm_sync(&changes, now).map_err(db_err)
    })?;
    emit_status(&app, &state, true);
    Ok(())
}

/// Right-click → Remove. Liked music cannot be removed.
#[tauri::command]
pub async fn remove_youtube_music_playlist(
    app: AppHandle,
    state: State<'_, AppState>,
    ytm: State<'_, YouTubeMusicState>,
    list_id: String,
) -> Result<(), AppError> {
    if list_id == LIKED_MUSIC_ID {
        return Err(AppError::Validation("Liked music cannot be removed".to_string()));
    }
    let _running = ytm.sync_lock.lock().await;
    with_db(&state, |db| db.remove_ytm_list(&list_id).map_err(db_err))?;
    emit_status(&app, &state, true);
    Ok(())
}

/// Show in sidebar. Off hides the section and pauses the loop; the sign-in and
/// the stored rows stay. On again shows them at once and syncs.
#[tauri::command]
pub async fn set_youtube_music_show_in_sidebar(
    app: AppHandle,
    state: State<'_, AppState>,
    show: bool,
) -> Result<YouTubeMusicStatusDTO, AppError> {
    let status = with_db(&state, |db| {
        db.set_setting(SHOW_IN_SIDEBAR_SETTING, if show { "1" } else { "0" }).map_err(db_err)?;
        read_status(db, &today())
    })?;
    let _ = app.emit(SYNCED_EVENT, &SyncedPayload::from_status(&status, false));
    if show && status.connected {
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = run_sync(&handle).await;
        });
    }
    Ok(status)
}

#[cfg(test)]
mod tests {
    use super::*;

    const DAY: &str = "2026-10-03";

    fn fresh() -> Database {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");
        db
    }

    fn tokens(access: &str, expires_in: i64) -> GoogleTokens {
        GoogleTokens { access_token: access.into(), expires_in, refresh_token: None, id_token: None }
    }

    #[test]
    fn the_synced_event_reads_as_the_frontend_expects() {
        let payload = SyncedPayload {
            changed: true,
            last_synced_at: Some(5),
            error: None,
            error_kind: None,
            needs_reconnect: false,
        };
        assert_eq!(
            serde_json::to_value(payload).unwrap(),
            serde_json::json!({
                "changed": true, "lastSyncedAt": 5, "error": null, "errorKind": null, "needsReconnect": false
            })
        );
        let failed = SyncedPayload {
            error: Some("x".into()),
            error_kind: Some(SyncErrorKind::QuotaExceeded),
            ..SyncedPayload::cleared()
        };
        assert_eq!(serde_json::to_value(failed).unwrap()["errorKind"], "quotaExceeded");
    }

    #[test]
    fn youtube_music_errors_keep_their_meaning_across_ipc() {
        assert!(matches!(AppError::from(YtmError::Reconnect), AppError::YouTubeMusicReconnect));
        assert!(matches!(AppError::from(YtmError::NotConnected), AppError::YouTubeMusicNotConnected));
        assert!(matches!(AppError::from(YtmError::QuotaExceeded), AppError::YtQuotaExceeded));
        assert!(matches!(
            AppError::from(YtmError::Network("offline".into())),
            AppError::YouTubeMusic(message) if message == "offline"
        ));
    }

    #[test]
    fn the_loop_syncs_only_a_connected_shown_account_with_quota_left() {
        let db = fresh();
        assert!(!should_sync(&db, DAY));

        db.set_setting(REFRESH_TOKEN_SETTING, "rt").unwrap();
        assert!(should_sync(&db, DAY));

        db.set_setting(NEEDS_RECONNECT_SETTING, "1").unwrap();
        assert!(!should_sync(&db, DAY));
        db.set_setting(NEEDS_RECONNECT_SETTING, "").unwrap();

        // Hidden: the loop skips, and the sign-in and the rows stay.
        db.set_setting(SHOW_IN_SIDEBAR_SETTING, "0").unwrap();
        assert!(!should_sync(&db, DAY));
        assert!(read_status(&db, DAY).unwrap().connected);
        db.set_setting(SHOW_IN_SIDEBAR_SETTING, "1").unwrap();
        assert!(should_sync(&db, DAY));
    }

    #[test]
    fn a_used_up_quota_pauses_the_loop_until_the_next_pacific_day() {
        let db = fresh();
        db.set_setting(REFRESH_TOKEN_SETTING, "rt").unwrap();
        db.set_setting(LAST_SYNCED_SETTING, "42").unwrap();

        let last = record_failure(&db, "quota", SyncErrorKind::QuotaExceeded, DAY).unwrap();
        assert_eq!(last, Some(42), "the event carries the last good sync");
        assert!(!should_sync(&db, DAY));
        assert!(read_status(&db, DAY).unwrap().quota_used_up);
        assert!(should_sync(&db, "2026-10-04"));
        assert!(!read_status(&db, "2026-10-04").unwrap().quota_used_up);

        // Any other failure leaves the loop running.
        let db = fresh();
        db.set_setting(REFRESH_TOKEN_SETTING, "rt").unwrap();
        record_failure(&db, "offline", SyncErrorKind::Network, DAY).unwrap();
        assert!(should_sync(&db, DAY));

        // A good sync clears what a failure left.
        record_failure(&db, "quota", SyncErrorKind::QuotaExceeded, DAY).unwrap();
        record_success(&db, 99).unwrap();
        let status = read_status(&db, DAY).unwrap();
        assert!(!status.quota_used_up);
        assert_eq!(status.last_error, None);
        assert_eq!(status.last_synced_at, Some(99));
    }

    #[test]
    fn a_cached_token_is_used_until_a_minute_before_it_runs_out() {
        let ytm = YouTubeMusicState::default();
        assert_eq!(cached_access(&ytm), None);
        remember_access(&ytm, &tokens("AT", 3599));
        assert_eq!(cached_access(&ytm).as_deref(), Some("AT"));
        remember_access(&ytm, &tokens("OLD", 30));
        assert_eq!(cached_access(&ytm), None);
        remember_access(&ytm, &tokens("AT", 3599));
        forget_access(&ytm);
        assert_eq!(cached_access(&ytm), None);
    }

    #[test]
    fn a_fresh_install_is_not_connected_and_shows_in_the_sidebar() {
        assert_eq!(
            read_status(&fresh(), DAY).unwrap(),
            YouTubeMusicStatusDTO {
                has_client: false,
                connected: false,
                email: None,
                needs_reconnect: false,
                show_in_sidebar: true,
                last_synced_at: None,
                last_error: None,
                last_error_kind: None,
                quota_used_up: false,
            }
        );
    }

    #[test]
    fn the_status_reads_what_was_saved() {
        let db = fresh();
        for (key, value) in [
            (CLIENT_ID_SETTING, "cid"),
            (CLIENT_SECRET_SETTING, "secret"),
            (REFRESH_TOKEN_SETTING, "rt"),
            (EMAIL_SETTING, "dj@example.com"),
            (LAST_SYNCED_SETTING, "1700000000000"),
            (LAST_ERROR_SETTING, "Could not reach YouTube"),
            (LAST_ERROR_KIND_SETTING, "network"),
            (NEEDS_RECONNECT_SETTING, "1"),
        ] {
            db.set_setting(key, value).unwrap();
        }
        let status = read_status(&db, DAY).unwrap();
        assert!(status.has_client);
        assert!(status.connected);
        assert_eq!(status.email.as_deref(), Some("dj@example.com"));
        assert!(status.needs_reconnect);
        assert_eq!(status.last_synced_at, Some(1_700_000_000_000));
        assert_eq!(status.last_error.as_deref(), Some("Could not reach YouTube"));
        assert_eq!(status.last_error_kind, Some(SyncErrorKind::Network));

        // A client id without its secret is not a client.
        db.set_setting(CLIENT_SECRET_SETTING, "").unwrap();
        assert!(!read_status(&db, DAY).unwrap().has_client);
        // No error, no kind — even if a stale kind were left behind.
        db.set_setting(LAST_ERROR_SETTING, "").unwrap();
        assert_eq!(read_status(&db, DAY).unwrap().last_error_kind, None);
    }

    #[test]
    fn sync_failures_are_sorted_into_the_kinds_the_view_words() {
        assert_eq!(SyncErrorKind::of(&YtmError::Network("offline".into())), SyncErrorKind::Network);
        assert_eq!(SyncErrorKind::of(&YtmError::QuotaExceeded), SyncErrorKind::QuotaExceeded);
        let api = YtmError::Api { status: 500, message: String::new(), reason: None };
        assert_eq!(SyncErrorKind::of(&api), SyncErrorKind::Other);
        for kind in [SyncErrorKind::Network, SyncErrorKind::QuotaExceeded, SyncErrorKind::Other] {
            assert_eq!(SyncErrorKind::parse(kind.as_str()), Some(kind));
            assert_eq!(serde_json::to_value(kind).unwrap(), kind.as_str());
        }
        let failure = SyncFailure::from(YtmError::QuotaExceeded);
        assert_eq!(failure.kind, SyncErrorKind::QuotaExceeded);
        assert!(!failure.needs_reconnect);
        assert!(SyncFailure::from(YtmError::Reconnect).needs_reconnect);
    }

    #[test]
    fn an_unknown_client_on_refresh_asks_to_reconnect_like_a_revoked_token() {
        let revoked = refresh_failure(YtmError::Reconnect);
        assert!(revoked.needs_reconnect);
        assert!(matches!(revoked.error, AppError::YouTubeMusicReconnect));

        let deleted = refresh_failure(YtmError::Api {
            status: 401,
            message: "The OAuth client was not found.".into(),
            reason: Some("invalid_client".into()),
        });
        assert!(deleted.needs_reconnect);
        assert!(deleted.error.to_string().contains("client file"));

        let other = refresh_failure(YtmError::Network("offline".into()));
        assert!(!other.needs_reconnect);
        assert_eq!(other.kind, SyncErrorKind::Network);
    }

    #[test]
    fn writes_after_a_refresh_happen_only_while_its_token_is_still_stored() {
        let db = fresh();
        db.set_setting(REFRESH_TOKEN_SETTING, "rt1").unwrap();
        let wrote = if_signed_in_with(&db, "rt1", |db| {
            db.set_setting(REFRESH_TOKEN_SETTING, "rt2").map_err(db_err)
        })
        .unwrap();
        assert_eq!(wrote, Some(()));

        let late = if_signed_in_with(&db, "rt1", |db| {
            db.set_setting(NEEDS_RECONNECT_SETTING, "1").map_err(db_err)
        })
        .unwrap();
        assert_eq!(late, None);
        assert_eq!(setting(&db, NEEDS_RECONNECT_SETTING).unwrap(), None);
    }

    #[test]
    fn disconnecting_keeps_the_client_the_playlists_and_the_switch() {
        let db = fresh();
        for (key, value) in [
            (CLIENT_ID_SETTING, "cid"),
            (CLIENT_SECRET_SETTING, "secret"),
            (REFRESH_TOKEN_SETTING, "rt"),
            (EMAIL_SETTING, "dj@example.com"),
            (LAST_SYNCED_SETTING, "1"),
            (QUOTA_DAY_SETTING, DAY),
            (SHOW_IN_SIDEBAR_SETTING, "0"),
        ] {
            db.set_setting(key, value).unwrap();
        }
        db.add_ytm_list("PL1", "Deep", 1).unwrap();

        forget_account(&db).unwrap();

        let status = read_status(&db, DAY).unwrap();
        assert!(!status.connected);
        assert_eq!(status.email, None);
        assert_eq!(status.last_synced_at, None);
        assert!(!status.quota_used_up);
        assert!(status.has_client, "connecting again needs no new file");
        assert!(!status.show_in_sidebar, "a preference, not part of the account");
        assert!(db.has_ytm_list("PL1").unwrap(), "added playlists cannot come back on their own");
    }

    #[test]
    fn the_newest_login_wins_and_a_disconnect_cancels_one_past_the_browser() {
        let ytm = YouTubeMusicState::default();
        let first = begin_login(&ytm);
        assert!(login_is_current(&ytm, first));
        let second = begin_login(&ytm);
        assert!(!login_is_current(&ytm, first));
        assert!(login_is_current(&ytm, second));

        let (cancel, mut cancelled) = tokio::sync::oneshot::channel();
        *ytm.pending_login.lock().unwrap() = Some(cancel);
        cancel_pending_login(&ytm);
        assert_eq!(cancelled.try_recv(), Ok(()));
        assert!(ytm.pending_login.lock().unwrap().is_none());
        assert!(!login_is_current(&ytm, second));
        cancel_pending_login(&ytm); // nothing waiting: nothing happens
    }

    #[test]
    fn a_client_file_is_read_from_disk_and_only_its_two_values_kept() {
        let dir = tempfile::tempdir().unwrap();

        let desktop = dir.path().join("client_secret_desktop.json");
        std::fs::write(
            &desktop,
            r#"{"installed":{"client_id":"cid.apps.googleusercontent.com","client_secret":"GOCSPX-x"}}"#,
        )
        .unwrap();
        assert_eq!(
            read_client_file(&desktop).unwrap(),
            ClientFile { client_id: "cid.apps.googleusercontent.com".into(), client_secret: "GOCSPX-x".into() }
        );

        let web = dir.path().join("client_secret_web.json");
        std::fs::write(&web, r#"{"web":{"client_id":"w","client_secret":"s"}}"#).unwrap();
        assert!(matches!(read_client_file(&web), Err(AppError::Validation(m)) if m.contains("Desktop app")));

        let big = dir.path().join("big.json");
        std::fs::write(&big, "x".repeat(70 * 1024)).unwrap();
        assert!(matches!(read_client_file(&big), Err(AppError::Validation(_))));

        assert!(matches!(read_client_file(&dir.path().join("missing.json")), Err(AppError::Validation(_))));
    }

    #[test]
    fn a_dead_access_token_is_refreshed_and_tried_once_more() {
        let revoked: Result<(), YtmError> =
            Err(YtmError::Api { status: 401, message: String::new(), reason: None });
        assert!(token_went_stale(&revoked));
        let forbidden: Result<(), YtmError> =
            Err(YtmError::Api { status: 403, message: String::new(), reason: None });
        assert!(!token_went_stale(&forbidden));
        assert!(!token_went_stale(&Err::<(), _>(YtmError::QuotaExceeded)));
        assert!(!token_went_stale(&Ok::<(), YtmError>(())));
    }

    #[test]
    fn a_used_up_quota_while_adding_a_playlist_pauses_the_loop_as_a_sync_does() {
        let db = fresh();
        db.set_setting(REFRESH_TOKEN_SETTING, "rt").unwrap();
        note_failed_call(&db, &YtmError::Network("offline".into()), DAY).unwrap();
        assert!(should_sync(&db, DAY), "only the quota pauses the loop");

        note_failed_call(&db, &YtmError::QuotaExceeded, DAY).unwrap();
        assert!(!should_sync(&db, DAY));
        assert!(read_status(&db, DAY).unwrap().quota_used_up);
        assert!(should_sync(&db, "2026-10-04"));
    }

    #[test]
    fn a_link_to_add_is_checked_before_anything_is_spent() {
        assert_eq!(playlist_to_add("https://music.youtube.com/playlist?list=PL123").unwrap(), "PL123");
        for refused in [
            "https://music.youtube.com/playlist?list=LM",
            "https://www.youtube.com/playlist?list=LL",
            "not a link",
            "",
        ] {
            assert!(matches!(playlist_to_add(refused), Err(AppError::Validation(_))), "{refused}");
        }
    }
}
