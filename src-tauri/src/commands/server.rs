// Tauri commands for the mobile companion server lifecycle

use crate::commands::library::AppState;
use crate::db::Database;
use crate::server::{self, RunningServer};
use serde::Serialize;
use std::net::IpAddr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};

/// Get LAN IP suitable for QR code — avoids 127.0.0.1 so phone can reach desktop.
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
    // Last resort — 127.0.0.1 won't work for phone scanning, but at least URL/token copy works
    eprintln!("[companion] Could not detect LAN IP, using 127.0.0.1 — QR scan from phone will not work");
    "127.0.0.1".to_string()
}

/// Managed state for the companion server
pub struct CompanionState {
    pub running_server: Mutex<Option<RunningServer>>,
    /// Shared reference to library folders (kept in sync with settings)
    pub library_folders: Arc<Mutex<Vec<String>>>,
}

impl CompanionState {
    pub fn new() -> Self {
        CompanionState {
            running_server: Mutex::new(None),
            library_folders: Arc::new(Mutex::new(Vec::new())),
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

/// Find the mobile PWA dist directory.
/// In dev: <project_root>/mobile/dist
/// In production: <app_bundle>/Contents/Resources/mobile-dist (macOS)
fn find_mobile_dist() -> Option<PathBuf> {
    // Dev mode: look relative to the cargo manifest directory
    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.join("mobile").join("dist"));
    if let Some(ref p) = dev_path {
        if p.join("index.html").exists() {
            return dev_path;
        }
    }

    // Production: look relative to the executable
    if let Ok(exe) = std::env::current_exe() {
        // macOS: .app/Contents/MacOS/recodeck -> .app/Contents/Resources/mobile-dist
        if let Some(macos_dir) = exe.parent() {
            let resources = macos_dir
                .parent()
                .map(|contents| contents.join("Resources").join("mobile-dist"));
            if let Some(ref p) = resources {
                if p.join("index.html").exists() {
                    return resources;
                }
            }
        }
    }

    None
}

/// Internal helper to start the companion server with explicit params.
/// Used by both the Tauri command and auto-start logic.
fn start_companion_internal(
    app_state: &AppState,
    companion_state: &CompanionState,
    port: Option<u16>,
) -> Result<(String, u16, Arc<Mutex<Option<Database>>>), String> {
    // Load library folders from settings
    {
        let db_lock = app_state.db.lock().map_err(|e| e.to_string())?;
        if let Some(db) = db_lock.as_ref() {
            if let Ok(Some(json_str)) = db.get_setting("library_folders") {
                if let Ok(folders) = serde_json::from_str::<Vec<String>>(&json_str) {
                    let mut lf = companion_state
                        .library_folders
                        .lock()
                        .map_err(|e| e.to_string())?;
                    *lf = folders;
                }
            }
        }
    }

    // Determine token: reuse persisted one or generate new
    let token = {
        let db_lock = app_state.db.lock().map_err(|e| e.to_string())?;
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
        let db_path_lock = app_state.db_path.lock().map_err(|e| e.to_string())?;
        let db_path = db_path_lock
            .as_ref()
            .ok_or("Database not initialized (no path)")?;

        let new_db = Database::new(std::path::Path::new(db_path))
            .map_err(|e| format!("Failed to open database for companion: {}", e))?;
        let mut db_arc_lock = db_arc.lock().map_err(|e| e.to_string())?;
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
    app_state: State<'_, AppState>,
    companion_state: State<'_, CompanionState>,
    port: Option<u16>,
) -> Result<CompanionServerInfo, String> {
    // Check if already running
    {
        let lock = companion_state
            .running_server
            .lock()
            .map_err(|e| e.to_string())?;
        if lock.is_some() {
            return Err("Companion server is already running".to_string());
        }
    }

    let (token, port, db_arc) =
        start_companion_internal(&app_state, &companion_state, port)?;

    let library_folders = companion_state.library_folders.clone();

    let mobile_dist = find_mobile_dist();
    let running = server::start_server(port, token, db_arc, library_folders, 3, mobile_dist)
        .await
        .map_err(|e| format!("Failed to start companion server: {}", e))?;

    // Persist token, port, and autostart setting
    persist_companion_settings(&app_state, &running.token, running.addr.port());

    let lan_ip = get_lan_ip_for_qr();

    let url = format!("http://{}:{}", lan_ip, running.addr.port());
    let info = CompanionServerInfo {
        running: true,
        url: Some(url),
        token: Some(running.token.clone()),
        port: Some(running.addr.port()),
        active_streams: 0,
    };

    let mut lock = companion_state
        .running_server
        .lock()
        .map_err(|e| e.to_string())?;
    *lock = Some(running);

    Ok(info)
}

/// Stop the companion server
#[tauri::command]
pub async fn stop_companion_server(
    companion_state: State<'_, CompanionState>,
) -> Result<(), String> {
    let mut lock = companion_state
        .running_server
        .lock()
        .map_err(|e| e.to_string())?;

    match lock.take() {
        Some(server) => {
            let _ = server.shutdown_tx.send(());
            eprintln!("[companion] Server shutdown initiated");
            Ok(())
        }
        None => Err("Companion server is not running".to_string()),
    }
}

/// Get current companion server status
#[tauri::command]
pub fn get_companion_status(
    companion_state: State<'_, CompanionState>,
) -> Result<CompanionServerInfo, String> {
    let lock = companion_state
        .running_server
        .lock()
        .map_err(|e| e.to_string())?;

    match lock.as_ref() {
        Some(server) => {
            let lan_ip = get_lan_ip_for_qr();

            Ok(CompanionServerInfo {
                running: true,
                url: Some(format!("http://{}:{}", lan_ip, server.addr.port())),
                token: Some(server.token.clone()),
                port: Some(server.addr.port()),
                active_streams: 0, // TODO: get from server state
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
    app_state: State<'_, AppState>,
    companion_state: State<'_, CompanionState>,
) -> Result<CompanionServerInfo, String> {
    // Stop existing server
    {
        let mut lock = companion_state
            .running_server
            .lock()
            .map_err(|e| e.to_string())?;
        if let Some(server) = lock.take() {
            let _ = server.shutdown_tx.send(());
        }
    }

    // Clear persisted token so a fresh one is generated
    {
        let db_lock = app_state.db.lock().map_err(|e| e.to_string())?;
        if let Some(db) = db_lock.as_ref() {
            let _ = db.set_setting("companion_token", "");
        }
    }

    // Brief pause for port release
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    // Restart with new token (start_companion_server will generate fresh + persist)
    start_companion_server(app_state, companion_state, None).await
}

/// Auto-start the companion server if `companion_autostart` is enabled.
/// Called from `init_database` after the DB is ready.
pub async fn auto_start_companion(app_handle: tauri::AppHandle) {
    let app_state = app_handle.state::<AppState>();
    let companion_state = app_handle.state::<CompanionState>();

    // Check if autostart is enabled
    let should_start = {
        let db_lock = app_state.db.lock().ok();
        if let Some(guard) = db_lock.as_ref() {
            if let Some(db) = guard.as_ref() {
                db.get_setting("companion_autostart")
                    .ok()
                    .flatten()
                    .map(|v| v == "true")
                    .unwrap_or(false)
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
    let mobile_dist = find_mobile_dist();

    match server::start_server(port, token, db_arc, library_folders, 3, mobile_dist).await {
        Ok(running) => {
            persist_companion_settings(&app_state, &running.token, running.addr.port());

            let lan_ip = get_lan_ip_for_qr();
            eprintln!(
                "[companion] Auto-started at http://{}:{}",
                lan_ip,
                running.addr.port()
            );

            if let Ok(mut lock) = companion_state.running_server.lock() {
                *lock = Some(running);
            } else {
                eprintln!("[companion] Failed to acquire lock for auto-start, server may not persist");
            }
        }
        Err(e) => {
            eprintln!("[companion] Auto-start failed: {}", e);
        }
    }
}
