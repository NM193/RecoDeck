// Tauri commands for the mobile companion server lifecycle

use crate::commands::library::AppState;
use crate::db::share::{ShareLink, SHARE_LINK_DAYS};
use crate::db::Database;
use crate::error::AppError;
use crate::server::{self, RunningServer};
use serde::Serialize;
use std::net::IpAddr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::path::BaseDirectory;
use tauri::{Emitter, Manager, State};

/// Result type for start_companion_internal: (token, port, db_arc)
type CompanionStartResult = (String, u16, Arc<Mutex<Option<Database>>>);

/// Get LAN IP suitable for QR code -- avoids 127.0.0.1 so phone can reach desktop.
fn get_lan_ip_for_qr() -> String {
    // Try local_ip() first
    if let Ok(ip) = local_ip_address::local_ip() {
        if !ip.is_loopback() {
            return ip.to_string();
        }
    }
    // Fallback: scan interfaces for first non-loopback IPv4
    if let Ok(ifas) = local_ip_address::list_afinet_netifas() {
        for (_name, ip) in ifas {
            if !ip.is_loopback() {
                if let IpAddr::V4(v4) = ip {
                    return v4.to_string();
                }
            }
        }
    }
    // Last resort -- 127.0.0.1 won't work for phone scanning, but at least URL/token copy works
    eprintln!("[companion] Could not detect LAN IP, using 127.0.0.1 -- QR scan from phone will not work");
    "127.0.0.1".to_string()
}

/// Managed state for the companion server
pub struct CompanionState {
    pub running_server: Mutex<Option<RunningServer>>,
    /// Shared reference to library folders (kept in sync with settings)
    pub library_folders: Arc<Mutex<Vec<String>>>,
    /// Prevents concurrent auto-start attempts (React StrictMode calls init twice)
    auto_starting: AtomicBool,
}

impl Default for CompanionState {
    fn default() -> Self {
        Self::new()
    }
}

impl CompanionState {
    pub fn new() -> Self {
        CompanionState {
            running_server: Mutex::new(None),
            library_folders: Arc::new(Mutex::new(Vec::new())),
            auto_starting: AtomicBool::new(false),
        }
    }
}

#[derive(Serialize)]
pub struct CompanionServerInfo {
    pub running: bool,
    pub url: Option<String>,
    pub token: Option<String>,
    pub port: Option<u16>,
    pub active_streams: usize,
}

/// A playlist share link (spec docs/superpowers/specs/2026-10-16-share-links-design.md).
/// The frontend builds the URL: `<companion url>/?share=<token>`.
#[derive(Debug, Serialize)]
pub struct ShareLinkDTO {
    pub token: String,
    pub playlist_id: i64,
    pub playlist_name: String,
    /// The duration last picked: 1, 7 or 30.
    pub days: i64,
    /// Unix seconds.
    pub created_at: i64,
    /// Unix seconds.
    pub expires_at: i64,
}

impl From<ShareLink> for ShareLinkDTO {
    fn from(link: ShareLink) -> Self {
        ShareLinkDTO {
            token: link.token,
            playlist_id: link.playlist_id,
            playlist_name: link.playlist_name,
            days: link.days,
            created_at: link.created_at,
            expires_at: link.expires_at,
        }
    }
}

/// Find the mobile PWA dist directory.
/// In dev: <project_root>/mobile/dist
/// In production: uses Tauri PathResolver (Resource) when app_handle given
fn find_mobile_dist(app: Option<&tauri::AppHandle>) -> Option<PathBuf> {
    // 1. Production: Tauri resource dir (bundled app) -- most reliable
    if let Some(handle) = app {
        if let Ok(path) = handle.path().resolve("mobile-dist", BaseDirectory::Resource) {
            if path.join("index.html").exists() {
                eprintln!("[companion] Found mobile PWA at {:?} (Resource)", path);
                return Some(path);
            }
        }
    }

    // 2. Dev mode: project_root/mobile/dist
    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.join("mobile").join("dist"));
    if let Some(ref p) = dev_path {
        if p.join("index.html").exists() {
            eprintln!("[companion] Found mobile PWA at {:?} (dev)", p);
            return dev_path;
        }
    }

    // 3. Fallback: manual exe-relative (legacy)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(macos_dir) = exe.parent() {
            let resources = macos_dir
                .parent()
                .map(|contents| contents.join("Resources").join("mobile-dist"));
            if let Some(ref p) = resources {
                if p.join("index.html").exists() {
                    eprintln!("[companion] Found mobile PWA at {:?} (exe-relative)", p);
                    return resources;
                }
            }
        }
    }

    eprintln!("[companion] No mobile PWA dist found -- API-only mode");
    None
}

/// Internal helper to start the companion server with explicit params.
/// Used by both the Tauri command and auto-start logic.
fn start_companion_internal(
    app_state: &AppState,
    companion_state: &CompanionState,
    port: Option<u16>,
) -> Result<CompanionStartResult, AppError> {
    // Load library folders from settings
    {
        let db_lock = app_state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        if let Some(db) = db_lock.as_ref() {
            if let Ok(Some(json_str)) = db.get_setting("library_folders") {
                if let Ok(folders) = serde_json::from_str::<Vec<String>>(&json_str) {
                    let mut lf = companion_state
                        .library_folders
                        .lock()
                        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
                    *lf = folders;
                }
            }
        }
    }

    // Determine token: reuse persisted one or generate new
    let token = {
        let db_lock = app_state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        if let Some(db) = db_lock.as_ref() {
            if let Ok(Some(saved_token)) = db.get_setting("companion_token") {
                if !saved_token.is_empty() {
                    saved_token
                } else {
                    server::generate_token()
                }
            } else {
                server::generate_token()
            }
        } else {
            server::generate_token()
        }
    };

    // Determine port: use provided, or persisted, or default 8384
    let port = port.unwrap_or_else(|| {
        let db_lock = app_state.db.lock().ok();
        db_lock
            .as_ref()
            .and_then(|lock| lock.as_ref())
            .and_then(|db| db.get_setting("companion_port").ok().flatten())
            .and_then(|p| p.parse::<u16>().ok())
            .unwrap_or(8384)
    });

    // Open a separate database connection for the companion server.
    let db_arc = Arc::new(Mutex::new(None));
    {
        let db_path_lock = app_state.db_path.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        let db_path = db_path_lock
            .as_ref()
            .ok_or_else(|| AppError::Database("Database not initialized (no path)".to_string()))?;

        let new_db = Database::new(std::path::Path::new(db_path))
            .map_err(|e| AppError::Database(format!("Failed to open database for companion: {}", e)))?;
        let mut db_arc_lock = db_arc.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        *db_arc_lock = Some(new_db);
    }

    Ok((token, port, db_arc))
}

/// Persist companion server settings after successful start
fn persist_companion_settings(app_state: &AppState, token: &str, port: u16) {
    let db_lock = app_state.db.lock().ok();
    if let Some(Some(db)) = db_lock.as_ref().map(|l| l.as_ref()) {
        let _ = db.set_setting("companion_token", token);
        let _ = db.set_setting("companion_port", &port.to_string());
        let _ = db.set_setting("companion_autostart", "true");
    }
}

/// Start the companion server. Returns connection info.
#[tauri::command]
pub async fn start_companion_server(
    app: tauri::AppHandle,
    app_state: State<'_, AppState>,
    companion_state: State<'_, CompanionState>,
    port: Option<u16>,
) -> Result<CompanionServerInfo, AppError> {
    // Check if already running
    {
        let lock = companion_state
            .running_server
            .lock()
            .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        if lock.is_some() {
            return Err(AppError::Validation("Companion server is already running".to_string()));
        }
    }

    let (token, port, db_arc) =
        start_companion_internal(&app_state, &companion_state, port)?;

    let library_folders = companion_state.library_folders.clone();

    let mobile_dist = find_mobile_dist(Some(&app));
    let running = server::start_server(port, token, db_arc, library_folders, 3, mobile_dist)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to start companion server: {}", e)))?;

    // Persist token, port, and autostart setting
    persist_companion_settings(&app_state, &running.token, running.addr.port());

    let lan_ip = get_lan_ip_for_qr();

    let url = format!("http://{}:{}", lan_ip, running.addr.port());
    let active_streams = running.server_state.active_stream_count();
    let info = CompanionServerInfo {
        running: true,
        url: Some(url),
        token: Some(running.token.clone()),
        port: Some(running.addr.port()),
        active_streams,
    };

    let mut lock = companion_state
        .running_server
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    *lock = Some(running);

    // Notify frontend so UI updates (e.g. Settings panel, auto-start)
    let _ = app.emit("companion-started", &info);

    Ok(info)
}

/// Stop the companion server
#[tauri::command]
pub async fn stop_companion_server(
    companion_state: State<'_, CompanionState>,
) -> Result<(), AppError> {
    let mut lock = companion_state
        .running_server
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;

    match lock.take() {
        Some(server) => {
            let _ = server.shutdown_tx.send(());
            eprintln!("[companion] Server shutdown initiated");
            Ok(())
        }
        None => Err(AppError::Validation("Companion server is not running".to_string())),
    }
}

/// Get current companion server status
#[tauri::command]
pub fn get_companion_status(
    companion_state: State<'_, CompanionState>,
) -> Result<CompanionServerInfo, AppError> {
    let lock = companion_state
        .running_server
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;

    match lock.as_ref() {
        Some(server) => {
            let lan_ip = get_lan_ip_for_qr();

            Ok(CompanionServerInfo {
                running: true,
                url: Some(format!("http://{}:{}", lan_ip, server.addr.port())),
                token: Some(server.token.clone()),
                port: Some(server.addr.port()),
                active_streams: server.server_state.active_stream_count(),
            })
        }
        None => Ok(CompanionServerInfo {
            running: false,
            url: None,
            token: None,
            port: None,
            active_streams: 0,
        }),
    }
}

/// Regenerate the auth token, invalidating all active sessions
#[tauri::command]
pub async fn regenerate_companion_token(
    app: tauri::AppHandle,
    app_state: State<'_, AppState>,
    companion_state: State<'_, CompanionState>,
) -> Result<CompanionServerInfo, AppError> {
    // Stop existing server
    {
        let mut lock = companion_state
            .running_server
            .lock()
            .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        if let Some(server) = lock.take() {
            let _ = server.shutdown_tx.send(());
        }
    }

    // Clear persisted token so a fresh one is generated
    {
        let db_lock = app_state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        if let Some(db) = db_lock.as_ref() {
            let _ = db.set_setting("companion_token", "");
        }
    }

    // Brief pause for port release
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    // Restart with new token (start_companion_server will generate fresh + persist)
    start_companion_server(app, app_state, companion_state, None).await
}

/// Auto-start the companion server if `companion_autostart` is enabled.
/// Called from `init_database` after the DB is ready.
pub async fn auto_start_companion(app_handle: tauri::AppHandle) {
    // Brief delay so app is fully initialized before starting server
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;

    let app_state = app_handle.state::<AppState>();
    let companion_state = app_handle.state::<CompanionState>();

    // Atomically claim the auto-start slot — prevents double-start from React StrictMode
    if companion_state.auto_starting.swap(true, Ordering::SeqCst) {
        eprintln!("[companion] Auto-start already in progress, skipping duplicate");
        return;
    }

    // Check if autostart is enabled (default: true for new users)
    let should_start = {
        let db_lock = app_state.db.lock().ok();
        if let Some(guard) = db_lock.as_ref() {
            if let Some(db) = guard.as_ref() {
                db.get_setting("companion_autostart")
                    .ok()
                    .flatten()
                    .map(|v| v == "true")
                    .unwrap_or(true) // Default to true so server auto-starts for new users
            } else {
                false
            }
        } else {
            false
        }
    };

    if !should_start {
        eprintln!("[companion] Auto-start disabled, skipping");
        return;
    }

    eprintln!("[companion] Auto-starting companion server...");

    // Check if already running
    {
        if let Ok(lock) = companion_state.running_server.lock() {
            if lock.is_some() {
                eprintln!("[companion] Already running, skipping auto-start");
                return;
            }
        }
    }

    let prep = start_companion_internal(&app_state, &companion_state, None);
    let (token, port, db_arc) = match prep {
        Ok(v) => v,
        Err(e) => {
            eprintln!("[companion] Auto-start failed (prep): {}", e);
            return;
        }
    };

    let library_folders = companion_state.library_folders.clone();
    let mobile_dist = find_mobile_dist(Some(&app_handle));

    match server::start_server(port, token, db_arc, library_folders, 3, mobile_dist).await {
        Ok(running) => {
            let port = running.addr.port();
            let token = running.token.clone();
            let active_streams = running.server_state.active_stream_count();
            persist_companion_settings(&app_state, &token, port);

            let lan_ip = get_lan_ip_for_qr();
            eprintln!(
                "[companion] Auto-started at http://{}:{}",
                lan_ip,
                port
            );

            if let Ok(mut lock) = companion_state.running_server.lock() {
                *lock = Some(running);
            } else {
                eprintln!("[companion] Failed to acquire lock for auto-start, server may not persist");
            }

            // Notify frontend so UI updates when auto-start completes
            let info = CompanionServerInfo {
                running: true,
                url: Some(format!("http://{}:{}", lan_ip, port)),
                token: Some(token),
                port: Some(port),
                active_streams,
            };
            let _ = app_handle.emit("companion-started", &info);
        }
        Err(e) => {
            eprintln!("[companion] Auto-start failed: {}", e);
        }
    }
}

// ---- Playlist share links ----

/// A share link lasts 1, 7 or 30 days.
fn check_share_days(days: i64) -> Result<(), AppError> {
    if SHARE_LINK_DAYS.contains(&days) {
        Ok(())
    } else {
        Err(AppError::Validation(format!(
            "A share link lasts 1, 7 or 30 days, not {days}"
        )))
    }
}

fn share_db_error(e: rusqlite::Error) -> AppError {
    AppError::Database(format!("Share link: {e}"))
}

/// The playlist's live share link, else a new one for 7 days.
#[tauri::command]
pub fn get_or_create_share_link(
    state: State<AppState>,
    playlist_id: i64,
) -> Result<ShareLinkDTO, AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    if let Some(link) = db.share_link_for(playlist_id).map_err(share_db_error)? {
        return Ok(link.into());
    }
    db.get_playlist(playlist_id).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            AppError::NotFound("That playlist no longer exists".to_string())
        }
        e => share_db_error(e),
    })?;
    Ok(db
        .create_share_link(playlist_id, 7)
        .map_err(share_db_error)?
        .into())
}

/// Gives a live link a new duration, counted from now.
#[tauri::command]
pub fn set_share_link_days(
    state: State<AppState>,
    token: String,
    days: i64,
) -> Result<ShareLinkDTO, AppError> {
    check_share_days(days)?;
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    db.set_share_link_days(&token, days)
        .map_err(share_db_error)?
        .map(ShareLinkDTO::from)
        .ok_or_else(|| AppError::NotFound("This share link has expired or was stopped".to_string()))
}

/// The live share links, newest first.
#[tauri::command]
pub fn list_share_links(state: State<AppState>) -> Result<Vec<ShareLinkDTO>, AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let links = db.list_share_links().map_err(share_db_error)?;
    Ok(links.into_iter().map(ShareLinkDTO::from).collect())
}

/// Drops the stream tickets that stopped share links handed out: one link's
/// with `Some(token)`, every link's with None. No running server, no tickets.
fn revoke_share_tickets(companion_state: &CompanionState, token: Option<&str>) {
    let lock = companion_state
        .running_server
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(server) = lock.as_ref() {
        match token {
            Some(token) => server.server_state.revoke_share_tickets(token),
            None => server.server_state.revoke_all_share_tickets(),
        }
    }
}

/// Stops one share link, and the stream tickets it handed out. Stopping a
/// link that is already gone is not an error.
#[tauri::command]
pub fn stop_share_link(
    state: State<AppState>,
    companion_state: State<'_, CompanionState>,
    token: String,
) -> Result<(), AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    db.delete_share_link(&token).map_err(share_db_error)?;
    drop(db_lock);
    revoke_share_tickets(&companion_state, Some(&token));
    Ok(())
}

/// Stops every share link, and their stream tickets; answers how many were live.
#[tauri::command]
pub fn stop_all_share_links(
    state: State<AppState>,
    companion_state: State<'_, CompanionState>,
) -> Result<usize, AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let stopped = db.delete_all_share_links().map_err(share_db_error)?;
    drop(db_lock);
    revoke_share_tickets(&companion_state, None);
    Ok(stopped)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_share_link_lasts_1_7_or_30_days() {
        for days in [1, 7, 30] {
            assert!(check_share_days(days).is_ok(), "{days}");
        }
        for days in [0, -1, 2, 14, 31, 365] {
            assert!(
                matches!(check_share_days(days), Err(AppError::Validation(_))),
                "{days}"
            );
        }
    }

    #[test]
    fn stopping_links_revokes_their_tickets_on_the_running_server() {
        let companion = CompanionState::new();
        // No server running: no tickets, nothing to do.
        revoke_share_tickets(&companion, Some("link-a"));

        let state = Arc::new(server::CompanionServerState::for_tests(
            Database::new_in_memory().unwrap(),
            "companion",
        ));
        let a = state.create_share_ticket(1, "link-a", server::TICKET_LIFETIME);
        let b = state.create_share_ticket(2, "link-b", server::TICKET_LIFETIME);
        let full = state.create_ticket(3);
        *companion.running_server.lock().unwrap() = Some(RunningServer {
            shutdown_tx: tokio::sync::oneshot::channel::<()>().0,
            addr: std::net::SocketAddr::from(([127, 0, 0, 1], 0)),
            token: "companion".into(),
            server_state: state.clone(),
        });

        revoke_share_tickets(&companion, Some("link-a"));
        assert_eq!(state.validate_ticket(&a), None);
        assert_eq!(state.validate_ticket(&b), Some(2));

        revoke_share_tickets(&companion, None);
        assert_eq!(state.validate_ticket(&b), None);
        assert_eq!(state.validate_ticket(&full), Some(3));
    }

    #[test]
    fn the_dto_is_snake_case() {
        let dto = ShareLinkDTO::from(ShareLink {
            token: "t".into(),
            playlist_id: 3,
            playlist_name: "P".into(),
            days: 7,
            created_at: 100,
            expires_at: 200,
        });
        assert_eq!(
            serde_json::to_value(&dto).unwrap(),
            serde_json::json!({
                "token": "t", "playlist_id": 3, "playlist_name": "P",
                "days": 7, "created_at": 100, "expires_at": 200
            })
        );
    }
}
