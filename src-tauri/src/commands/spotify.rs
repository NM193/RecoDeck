// src-tauri/src/commands/spotify.rs
//! Tauri commands for the Spotify section, and the loop that keeps it in sync.
//!
//! Spotify is read, never written: no likes, no playlist edits. The Client ID
//! and the refresh token live in the settings table, next to the YouTube key.
//! Access tokens live only in memory, refreshed when they run out.

use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::commands::library::AppState;
use crate::commands::youtube::with_db;
use crate::db::Database;
use crate::error::AppError;
use crate::external::spotify::{self as web_api, LiveApi};
use crate::external::spotify_auth::{self, TokenSet};

const CLIENT_ID_SETTING: &str = "spotify_client_id";
const REFRESH_TOKEN_SETTING: &str = "spotify_refresh_token";
const LAST_SYNCED_SETTING: &str = "spotify_last_synced_at";
const LAST_ERROR_SETTING: &str = "spotify_last_error";
const NEEDS_RECONNECT_SETTING: &str = "spotify_needs_reconnect";

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::external::spotify::SpotifyError;

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
}
