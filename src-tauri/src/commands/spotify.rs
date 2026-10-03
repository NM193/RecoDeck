// src-tauri/src/commands/spotify.rs
//! Tauri commands for the Spotify section, and the loop that keeps it in sync.
//!
//! Spotify is read, never written: no likes, no playlist edits. The Client ID
//! and the refresh token live in the settings table, next to the YouTube key.
//! Access tokens live only in memory, refreshed when they run out.

use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::commands::library::AppState;
use crate::commands::youtube::with_db;
use crate::db::spotify::SpotifyLibraryDump;
use crate::db::Database;
use crate::error::AppError;
use crate::external::spotify::{self as web_api, LiveApi, SpotifyError};
use crate::external::spotify_auth::{self, TokenSet};

const CLIENT_ID_SETTING: &str = "spotify_client_id";
const REFRESH_TOKEN_SETTING: &str = "spotify_refresh_token";
const LAST_SYNCED_SETTING: &str = "spotify_last_synced_at";
const LAST_ERROR_SETTING: &str = "spotify_last_error";
const NEEDS_RECONNECT_SETTING: &str = "spotify_needs_reconnect";
const ACCOUNT_SETTING: &str = "spotify_account_name";

pub const SYNCED_EVENT: &str = "spotify-synced";
const SYNC_INTERVAL: Duration = Duration::from_secs(10 * 60);
/// How often the loop looks for the database before the frontend has opened it.
const DB_POLL: Duration = Duration::from_secs(5);
/// An access token with less than this left is refreshed first.
const TOKEN_MARGIN_MS: i64 = 60_000;

#[derive(Clone)]
struct AccessToken {
    token: String,
    expires_at_ms: i64,
}

/// In-memory Spotify state, managed by Tauri.
#[derive(Default)]
pub struct SpotifyState {
    access: Mutex<Option<AccessToken>>,
    /// One sync at a time: the loop, the "synced …" click and a fresh login share it.
    sync_lock: tokio::sync::Mutex<()>,
    /// One login at a time — the redirect port can be bound only once.
    login: tokio::sync::Mutex<()>,
}

/// The `spotify-synced` payload.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyncedPayload {
    pub changed: bool,
    /// Unix ms of the last successful sync — on a failure, the previous one.
    pub last_synced_at: Option<i64>,
    pub error: Option<String>,
    pub needs_reconnect: bool,
}

pub(crate) fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn db_err(e: rusqlite::Error) -> AppError {
    AppError::Database(e.to_string())
}

/// A setting, with an empty value read as absent — clearing writes "".
fn setting(db: &Database, key: &str) -> Result<Option<String>, AppError> {
    Ok(db.get_setting(key).map_err(db_err)?.filter(|v| !v.trim().is_empty()))
}

/// Connected, and not waiting for the user to sign in again.
fn should_sync(db: &Database) -> bool {
    matches!(setting(db, REFRESH_TOKEN_SETTING), Ok(Some(_)))
        && matches!(setting(db, NEEDS_RECONNECT_SETTING), Ok(None))
}

fn remember_access(spotify: &SpotifyState, tokens: &TokenSet) {
    if let Ok(mut slot) = spotify.access.lock() {
        *slot = Some(AccessToken {
            token: tokens.access_token.clone(),
            expires_at_ms: now_ms() + tokens.expires_in * 1000,
        });
    }
}

fn cached_access(spotify: &SpotifyState) -> Option<String> {
    let cached = spotify.access.lock().ok()?.clone()?;
    (cached.expires_at_ms - now_ms() > TOKEN_MARGIN_MS).then_some(cached.token)
}

/// A usable access token, refreshing it when it is about to run out.
async fn access_token(app_state: &AppState, spotify: &SpotifyState) -> Result<String, AppError> {
    if let Some(token) = cached_access(spotify) {
        return Ok(token);
    }

    let (client_id, refresh_token) = with_db(app_state, |db| {
        Ok((setting(db, CLIENT_ID_SETTING)?, setting(db, REFRESH_TOKEN_SETTING)?))
    })?;
    let (Some(client_id), Some(refresh_token)) = (client_id, refresh_token) else {
        return Err(AppError::SpotifyNotConnected);
    };

    let tokens = match spotify_auth::refresh(&client_id, &refresh_token).await {
        Ok(tokens) => tokens,
        Err(err) => {
            let err = AppError::from(err);
            if matches!(err, AppError::SpotifyReconnect) {
                let _ = with_db(app_state, |db| {
                    db.set_setting(NEEDS_RECONNECT_SETTING, "1").map_err(db_err)
                });
            }
            return Err(err);
        }
    };

    // Spotify may rotate the refresh token; the old one then stops working.
    if let Some(rotated) = &tokens.refresh_token {
        with_db(app_state, |db| db.set_setting(REFRESH_TOKEN_SETTING, rotated).map_err(db_err))?;
    }
    remember_access(spotify, &tokens);
    Ok(tokens.access_token)
}

fn forget_access(spotify: &SpotifyState) {
    if let Ok(mut slot) = spotify.access.lock() {
        *slot = None;
    }
}

/// The outer error is about getting a token; the inner one is Spotify's answer.
async fn fetch_with_token(
    app_state: &AppState,
    spotify: &SpotifyState,
    baseline: &crate::db::spotify::SyncBaseline,
) -> Result<Result<crate::db::spotify::SyncChanges, web_api::SpotifyError>, AppError> {
    let api = LiveApi::new(access_token(app_state, spotify).await?)?;
    Ok(web_api::fetch_changes(&api, baseline).await)
}

async fn sync_once(app_state: &AppState, spotify: &SpotifyState) -> Result<bool, AppError> {
    let baseline = with_db(app_state, |db| db.spotify_baseline().map_err(db_err))?;
    let mut fetched = fetch_with_token(app_state, spotify, &baseline).await?;
    // An access token stops working before it expires when the app is revoked
    // at spotify.com: drop it and refresh once, which then says invalid_grant.
    if matches!(fetched, Err(web_api::SpotifyError::Api { status: 401, .. })) {
        forget_access(spotify);
        fetched = fetch_with_token(app_state, spotify, &baseline).await?;
    }
    let changes = fetched?;
    with_db(app_state, |db| db.apply_spotify_sync(&changes, now_ms()).map_err(db_err))
}

/// One sync, shared by the loop, the "synced …" click and a fresh login.
///
/// Emits `spotify-synced` afterwards, whether anything changed or not, and on
/// failure. Returns None, without emitting, when another sync is already
/// running (that one will report) or no account is connected.
pub async fn run_sync(app: &AppHandle) -> Option<SyncedPayload> {
    let app_state = app.state::<AppState>();
    let spotify = app.state::<SpotifyState>();
    let Ok(_running) = spotify.sync_lock.try_lock() else {
        return None;
    };

    let payload = match sync_once(&app_state, &spotify).await {
        Ok(changed) => {
            let now = now_ms();
            let _ = with_db(&app_state, |db| {
                db.set_setting(LAST_SYNCED_SETTING, &now.to_string()).map_err(db_err)?;
                db.set_setting(LAST_ERROR_SETTING, "").map_err(db_err)?;
                db.set_setting(NEEDS_RECONNECT_SETTING, "").map_err(db_err)
            });
            SyncedPayload { changed, last_synced_at: Some(now), error: None, needs_reconnect: false }
        }
        Err(AppError::SpotifyNotConnected) => return None,
        Err(err) => {
            let message = err.to_string();
            let last_synced_at = with_db(&app_state, |db| {
                db.set_setting(LAST_ERROR_SETTING, &message).map_err(db_err)?;
                Ok(setting(db, LAST_SYNCED_SETTING)?.and_then(|v| v.parse().ok()))
            })
            .ok()
            .flatten();
            SyncedPayload {
                changed: false,
                last_synced_at,
                error: Some(message),
                needs_reconnect: matches!(err, AppError::SpotifyReconnect),
            }
        }
    };

    let _ = app.emit(SYNCED_EVENT, &payload);
    Some(payload)
}

fn db_ready(app: &AppHandle) -> bool {
    app.state::<AppState>()
        .db
        .lock()
        .map(|db| db.is_some())
        .unwrap_or(false)
}

fn sync_due(app: &AppHandle) -> bool {
    with_db(&app.state::<AppState>(), |db| Ok(should_sync(db))).unwrap_or(false)
}

/// Syncs at start-up and every ten minutes while the app is open.
pub fn spawn_spotify_sync_loop(app: AppHandle) {
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

// --- commands ----------------------------------------------------------

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyStatusDTO {
    pub client_id: Option<String>,
    pub connected: bool,
    pub account_name: Option<String>,
    pub needs_reconnect: bool,
    pub last_synced_at: Option<i64>,
    pub last_error: Option<String>,
    /// Names of the playlists Spotify would not share.
    pub refused: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum PlayOutcome {
    Played,
    OpenedApp,
}

fn read_status(db: &Database) -> Result<SpotifyStatusDTO, AppError> {
    Ok(SpotifyStatusDTO {
        client_id: setting(db, CLIENT_ID_SETTING)?,
        connected: setting(db, REFRESH_TOKEN_SETTING)?.is_some(),
        account_name: setting(db, ACCOUNT_SETTING)?,
        needs_reconnect: setting(db, NEEDS_RECONNECT_SETTING)?.is_some(),
        last_synced_at: setting(db, LAST_SYNCED_SETTING)?.and_then(|v| v.parse().ok()),
        last_error: setting(db, LAST_ERROR_SETTING)?,
        refused: db
            .spotify_refused()
            .map_err(db_err)?
            .into_iter()
            .map(|p| p.name)
            .collect(),
    })
}

/// Everything about the account, and every synced row. The Client ID stays.
fn forget_account(db: &Database) -> Result<(), AppError> {
    for key in [
        REFRESH_TOKEN_SETTING,
        ACCOUNT_SETTING,
        LAST_SYNCED_SETTING,
        LAST_ERROR_SETTING,
        NEEDS_RECONNECT_SETTING,
    ] {
        db.delete_setting(key).map_err(db_err)?;
    }
    db.clear_spotify().map_err(db_err)
}

/// A Client ID is 32 hexadecimal characters.
fn valid_client_id(id: &str) -> bool {
    id.len() == 32 && id.chars().all(|c| c.is_ascii_hexdigit())
}

/// Spotify ids are base62 — checked before one goes into a `spotify:` URI.
fn valid_spotify_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric())
}

#[tauri::command]
pub async fn get_spotify_status(state: State<'_, AppState>) -> Result<SpotifyStatusDTO, AppError> {
    with_db(&state, read_status)
}

#[tauri::command]
pub async fn set_spotify_client_id(
    app: AppHandle,
    state: State<'_, AppState>,
    spotify: State<'_, SpotifyState>,
    client_id: String,
) -> Result<SpotifyStatusDTO, AppError> {
    let client_id = client_id.trim().to_string();
    if !valid_client_id(&client_id) {
        return Err(AppError::Validation(
            "A Client ID is 32 letters and digits — copy it from your app's page on developer.spotify.com"
                .to_string(),
        ));
    }

    let different =
        with_db(&state, |db| Ok(setting(db, CLIENT_ID_SETTING)?.as_deref() != Some(client_id.as_str())))?;
    if different {
        // A refresh token belongs to the app that issued it: a new Client ID
        // means signing in again. The synced lists stay, and so does the
        // account name — connect compares it to tell a different account.
        forget_access(&spotify);
        with_db(&state, |db| {
            db.set_setting(CLIENT_ID_SETTING, &client_id).map_err(db_err)?;
            for key in [REFRESH_TOKEN_SETTING, NEEDS_RECONNECT_SETTING] {
                db.delete_setting(key).map_err(db_err)?;
            }
            Ok(())
        })?;
        // The sidebar and the view go until the account is connected again.
        let _ = app.emit(
            SYNCED_EVENT,
            &SyncedPayload { changed: true, last_synced_at: None, error: None, needs_reconnect: false },
        );
    }
    with_db(&state, read_status)
}

#[tauri::command]
pub async fn connect_spotify(
    app: AppHandle,
    state: State<'_, AppState>,
    spotify: State<'_, SpotifyState>,
) -> Result<SpotifyStatusDTO, AppError> {
    let Ok(_login) = spotify.login.try_lock() else {
        return Err(AppError::Spotify(
            "A Spotify sign-in is already waiting in your browser".to_string(),
        ));
    };
    let client_id = with_db(&state, |db| setting(db, CLIENT_ID_SETTING))?
        .ok_or_else(|| AppError::Validation("Paste your Client ID and save it first".to_string()))?;

    // Bound before the browser opens, so a taken port is reported at once.
    let listener = spotify_auth::bind_listener(spotify_auth::REDIRECT_PORT)
        .await
        .map_err(AppError::Spotify)?;
    let verifier = spotify_auth::random_string(64);
    let login_state = spotify_auth::random_string(32);
    let url = spotify_auth::authorize_url(
        &client_id,
        &spotify_auth::code_challenge(&verifier),
        &login_state,
    );
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| AppError::Internal(format!("Could not open the browser: {e}")))?;

    let params = spotify_auth::wait_for_callback(listener, spotify_auth::LOGIN_TIMEOUT)
        .await
        .map_err(AppError::Spotify)?;
    let code = spotify_auth::code_from_callback(&params, &login_state).map_err(AppError::Spotify)?;
    let tokens = spotify_auth::exchange_code(&client_id, &code, &verifier).await?;
    let refresh_token = tokens.refresh_token.clone().ok_or_else(|| {
        AppError::Spotify("Spotify signed you in but sent no refresh token — try again".to_string())
    })?;

    let account = web_api::fetch_profile_name(&tokens.access_token)
        .await
        .map_err(|err| match err {
            // A personal app signs in only the accounts listed under its User
            // Management (Spotify's development-mode rule since February 2026).
            SpotifyError::Api { status: 403, .. } => AppError::Spotify(
                "Spotify refused this account. On developer.spotify.com open your app → User Management, add your Spotify account, then connect again."
                    .to_string(),
            ),
            other => other.into(),
        })?;

    remember_access(&spotify, &tokens);
    with_db(&state, |db| {
        // Another account's lists would make this one's whole library read as new.
        if setting(db, ACCOUNT_SETTING)?.is_some_and(|previous| previous != account) {
            db.clear_spotify().map_err(db_err)?;
        }
        db.set_setting(REFRESH_TOKEN_SETTING, &refresh_token).map_err(db_err)?;
        db.set_setting(ACCOUNT_SETTING, &account).map_err(db_err)?;
        db.set_setting(NEEDS_RECONNECT_SETTING, "").map_err(db_err)?;
        db.set_setting(LAST_ERROR_SETTING, "").map_err(db_err)
    })?;

    // The first sync starts now, not in ten minutes. It reports through the event.
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = run_sync(&handle).await;
    });

    with_db(&state, read_status)
}

#[tauri::command]
pub async fn disconnect_spotify(
    app: AppHandle,
    state: State<'_, AppState>,
    spotify: State<'_, SpotifyState>,
) -> Result<SpotifyStatusDTO, AppError> {
    // A sync running now would write its rows back after the clear.
    let _running = spotify.sync_lock.lock().await;
    forget_access(&spotify);
    with_db(&state, forget_account)?;
    let _ = app.emit(
        SYNCED_EVENT,
        &SyncedPayload { changed: true, last_synced_at: None, error: None, needs_reconnect: false },
    );
    with_db(&state, read_status)
}

#[tauri::command]
pub async fn sync_spotify_now(app: AppHandle) -> Result<(), AppError> {
    let _ = run_sync(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn get_spotify_library(state: State<'_, AppState>) -> Result<SpotifyLibraryDump, AppError> {
    with_db(&state, |db| db.get_spotify_library().map_err(db_err))
}

/// Answers the time written, so the frontend can update its copy exactly.
#[tauri::command]
pub async fn mark_spotify_list_opened(state: State<'_, AppState>, list_id: String) -> Result<i64, AppError> {
    let now = now_ms();
    with_db(&state, |db| db.mark_spotify_list_opened(&list_id, now).map_err(db_err))?;
    Ok(now)
}

#[tauri::command]
pub async fn set_spotify_verdict(
    state: State<'_, AppState>,
    spotify_id: String,
    library_track_id: i64,
    verdict: String,
) -> Result<(), AppError> {
    if verdict != "yes" && verdict != "no" {
        return Err(AppError::Validation(format!("Unknown answer: {verdict}")));
    }
    with_db(&state, |db| {
        db.set_spotify_verdict(&spotify_id, library_track_id, &verdict).map_err(db_err)
    })
}

async fn play_with_token(
    state: &AppState,
    spotify: &SpotifyState,
    spotify_id: &str,
) -> Result<(), SpotifyError> {
    match access_token(state, spotify).await {
        Ok(token) => web_api::play_track(&token, spotify_id).await,
        // No working sign-in — none, revoked, or Spotify unreachable for the
        // token call. The Spotify app can still play the track.
        Err(_) => Err(SpotifyError::NotConnected),
    }
}

#[tauri::command]
pub async fn play_spotify_track(
    app: AppHandle,
    state: State<'_, AppState>,
    spotify: State<'_, SpotifyState>,
    spotify_id: String,
) -> Result<PlayOutcome, AppError> {
    if !valid_spotify_id(&spotify_id) {
        return Err(AppError::Validation("Not a Spotify track id".to_string()));
    }

    let mut played = play_with_token(&state, &spotify, &spotify_id).await;
    // A revoked app's access token fails before it expires: refresh once.
    if matches!(played, Err(SpotifyError::Api { status: 401, .. })) {
        forget_access(&spotify);
        played = play_with_token(&state, &spotify, &spotify_id).await;
    }

    match played {
        Ok(()) => Ok(PlayOutcome::Played),
        // No active device, no Premium, or no working sign-in: the Spotify app
        // can still play it. No error is shown for this.
        Err(err) if web_api::should_open_app(&err) => {
            app.opener()
                .open_url(format!("spotify:track:{spotify_id}"), None::<&str>)
                .map_err(|e| AppError::Internal(format!("Could not open Spotify: {e}")))?;
            Ok(PlayOutcome::OpenedApp)
        }
        Err(err) => Err(err.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh() -> Database {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");
        db
    }

    #[test]
    fn the_synced_event_reads_as_the_frontend_expects() {
        let payload = SyncedPayload {
            changed: true,
            last_synced_at: Some(5),
            error: None,
            needs_reconnect: false,
        };
        assert_eq!(
            serde_json::to_value(payload).unwrap(),
            serde_json::json!({ "changed": true, "lastSyncedAt": 5, "error": null, "needsReconnect": false })
        );
    }

    #[test]
    fn spotify_errors_keep_their_meaning_across_ipc() {
        assert!(matches!(AppError::from(SpotifyError::Reconnect), AppError::SpotifyReconnect));
        assert!(matches!(AppError::from(SpotifyError::NotConnected), AppError::SpotifyNotConnected));
        assert!(matches!(
            AppError::from(SpotifyError::Network("offline".into())),
            AppError::Spotify(message) if message == "offline"
        ));
    }

    #[test]
    fn the_loop_syncs_only_a_connected_account_that_needs_no_new_sign_in() {
        let db = fresh();
        assert!(!should_sync(&db));

        db.set_setting(REFRESH_TOKEN_SETTING, "rt").unwrap();
        assert!(should_sync(&db));

        db.set_setting(NEEDS_RECONNECT_SETTING, "1").unwrap();
        assert!(!should_sync(&db));

        db.set_setting(NEEDS_RECONNECT_SETTING, "").unwrap();
        assert!(should_sync(&db));
    }

    #[test]
    fn a_cached_token_is_used_until_a_minute_before_it_runs_out() {
        let spotify = SpotifyState::default();
        assert_eq!(cached_access(&spotify), None);

        remember_access(&spotify, &TokenSet { access_token: "AT".into(), expires_in: 3600, refresh_token: None });
        assert_eq!(cached_access(&spotify).as_deref(), Some("AT"));

        remember_access(&spotify, &TokenSet { access_token: "OLD".into(), expires_in: 30, refresh_token: None });
        assert_eq!(cached_access(&spotify), None);
    }

    #[test]
    fn a_fresh_install_is_not_connected() {
        assert_eq!(
            read_status(&fresh()).unwrap(),
            SpotifyStatusDTO {
                client_id: None,
                connected: false,
                account_name: None,
                needs_reconnect: false,
                last_synced_at: None,
                last_error: None,
                refused: vec![],
            }
        );
    }

    #[test]
    fn the_status_reads_what_was_saved() {
        let db = fresh();
        db.set_setting(CLIENT_ID_SETTING, "0123456789abcdef0123456789abcdef").unwrap();
        db.set_setting(REFRESH_TOKEN_SETTING, "rt").unwrap();
        db.set_setting(ACCOUNT_SETTING, "Nemanja").unwrap();
        db.set_setting(LAST_SYNCED_SETTING, "1700000000000").unwrap();
        db.set_setting(LAST_ERROR_SETTING, "").unwrap();
        db.set_setting(NEEDS_RECONNECT_SETTING, "1").unwrap();
        db.set_setting(
            crate::db::spotify::REFUSED_SETTING,
            r#"[{"id":"p9","name":"Discover Weekly","snapshotId":"s","total":30}]"#,
        )
        .unwrap();

        let status = read_status(&db).unwrap();
        assert_eq!(status.client_id.as_deref(), Some("0123456789abcdef0123456789abcdef"));
        assert!(status.connected);
        assert_eq!(status.account_name.as_deref(), Some("Nemanja"));
        assert!(status.needs_reconnect);
        assert_eq!(status.last_synced_at, Some(1_700_000_000_000));
        assert_eq!(status.last_error, None);
        assert_eq!(status.refused, vec!["Discover Weekly".to_string()]);
    }

    #[test]
    fn disconnecting_keeps_the_client_id_and_forgets_the_rest() {
        let db = fresh();
        db.set_setting(CLIENT_ID_SETTING, "0123456789abcdef0123456789abcdef").unwrap();
        db.set_setting(REFRESH_TOKEN_SETTING, "rt").unwrap();
        db.set_setting(ACCOUNT_SETTING, "Nemanja").unwrap();
        db.set_setting(LAST_SYNCED_SETTING, "1").unwrap();
        db.set_setting(crate::db::spotify::REFUSED_SETTING, "[]").unwrap();

        forget_account(&db).unwrap();

        let status = read_status(&db).unwrap();
        assert!(!status.connected);
        assert_eq!(status.account_name, None);
        assert_eq!(status.last_synced_at, None);
        assert_eq!(status.client_id.as_deref(), Some("0123456789abcdef0123456789abcdef"));
    }

    #[test]
    fn ids_are_checked_before_they_are_used() {
        assert!(valid_client_id("0123456789abcdef0123456789ABCDEF"));
        assert!(!valid_client_id("abc"));
        assert!(!valid_client_id("0123456789abcdef0123456789abcdeg"));
        assert!(valid_spotify_id("4uLU6hMCjMI75M1A2tKUQC"));
        assert!(!valid_spotify_id(""));
        assert!(!valid_spotify_id("abc:def"));
        assert!(!valid_spotify_id("../x"));
    }

    #[test]
    fn play_outcomes_read_the_same_in_typescript() {
        assert_eq!(serde_json::to_value(PlayOutcome::Played).unwrap(), serde_json::json!("played"));
        assert_eq!(serde_json::to_value(PlayOutcome::OpenedApp).unwrap(), serde_json::json!("openedApp"));
    }
}
