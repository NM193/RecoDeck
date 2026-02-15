// Modules
pub mod ai;
pub mod audio;
pub mod commands;
pub mod db;
pub mod scanner;

use commands::{library::AppState, playback::PlaybackState, watcher::WatcherState};
use std::sync::Mutex;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Percent-decode a URI path string (e.g. "%20" → " ")
fn percent_decode(input: &str) -> String {
    let mut output = Vec::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2])) {
                output.push(h * 16 + l);
                i += 3;
                continue;
            }
        }
        output.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(output).unwrap_or_else(|_| input.to_string())
}

/// Percent-decode once, and if it still looks percent-encoded, decode again.
/// This fixes old/buggy callers that double-encoded the same path.
fn percent_decode_maybe_twice(input: &str) -> String {
    let once = percent_decode(input);
    let still_encoded = once.contains("%2F")
        || once.contains("%2f")
        || once.contains("%3A")
        || once.contains("%3a")
        || once.contains("%5C")
        || once.contains("%5c");
    if still_encoded {
        percent_decode(&once)
    } else {
        once
    }
}

fn hex_val(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

/// Get MIME type for an audio file based on its extension
fn audio_mime_type(path: &str) -> &'static str {
    match std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .as_deref()
    {
        Some("mp3") => "audio/mpeg",
        Some("flac") => "audio/flac",
        Some("wav") => "audio/wav",
        Some("ogg") => "audio/ogg",
        Some("m4a") => "audio/mp4",
        Some("aac") => "audio/aac",
        Some("aiff") | Some("aif") => "audio/aiff",
        _ => "application/octet-stream",
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Custom protocol to serve local audio files to the webview.
        // macOS URL:  stream://localhost/<absolute_path>
        // Windows URL: http://stream.localhost/<absolute_path>
        .register_uri_scheme_protocol("stream", |_ctx, request| {
            /// Normalize a "local file path-ish" string into a real local path.
            /// MINIMAL normalization to preserve special characters in filenames.
            /// This function ONLY:
            /// 1. Strips file:// prefix if present
            /// 2. On Windows: converts backslash path separators to forward slashes
            /// 3. Collapses repeated slashes
            /// 4. Removes trailing slash
            /// 5. Ensures absolute path on Unix
            ///
            /// IMPORTANT: All other characters (spaces, commas, brackets, quotes, backslashes on macOS/Linux, etc.)
            /// are preserved exactly as they appear in the filesystem.
            fn normalize_local_path(input: &str) -> String {
                let mut s = input.trim().to_string();
                if s.is_empty() {
                    return s;
                }

                // Strip file:// prefix if present (file:///Users/...)
                if let Some(rest) = s.strip_prefix("file://") {
                    s = rest.to_string();
                }

                // On Windows: convert backslashes (path separators) to forward slashes
                // On macOS/Linux: preserve backslashes (they're valid in filenames)
                #[cfg(target_os = "windows")]
                {
                    s = s.replace('\\', "/");
                }

                // Collapse repeated slashes.
                // On Windows we keep leading UNC paths (//server/share) intact.
                #[cfg(target_os = "windows")]
                {
                    let keep_unc = s.starts_with("//") && !s.starts_with("///");
                    if keep_unc {
                        let trimmed = s.trim_start_matches('/');
                        // Re-add the UNC prefix and collapse internal repeats.
                        let mut out = String::from("//");
                        let mut prev_slash = false;
                        for ch in trimmed.chars() {
                            if ch == '/' {
                                if prev_slash {
                                    continue;
                                }
                                prev_slash = true;
                                out.push(ch);
                            } else {
                                prev_slash = false;
                                out.push(ch);
                            }
                        }
                        s = out;
                    } else {
                        // Non-UNC: collapse all repeats.
                        let mut out = String::with_capacity(s.len());
                        let mut prev_slash = false;
                        for ch in s.chars() {
                            if ch == '/' {
                                if prev_slash {
                                    continue;
                                }
                                prev_slash = true;
                                out.push(ch);
                            } else {
                                prev_slash = false;
                                out.push(ch);
                            }
                        }
                        s = out;
                    }
                }
                #[cfg(not(target_os = "windows"))]
                {
                    let mut out = String::with_capacity(s.len());
                    let mut prev_slash = false;
                    for ch in s.chars() {
                        if ch == '/' {
                            if prev_slash {
                                continue;
                            }
                            prev_slash = true;
                            out.push(ch);
                        } else {
                            prev_slash = false;
                            out.push(ch);
                        }
                    }
                    s = out;
                }

                // Remove trailing slash (a directory can't be played as audio).
                while s.ends_with('/') && s.len() > 1 {
                    s.pop();
                }

                // Ensure absolute path on unix-like systems.
                #[cfg(not(target_os = "windows"))]
                {
                    if !s.starts_with('/') {
                        s = format!("/{}", s);
                    }
                }

                s
            }

            // Prefer path from query param ?p= so full path (including nested folders) is always correct
            let raw_file_path = request
                .uri()
                .query()
                .and_then(|q| {
                    q.split('&')
                        .find(|part| part.starts_with("p="))
                        .map(|part| {
                            let raw = &part[2..];
                            let plus_as_space = raw.replace('+', " ");
                            percent_decode_maybe_twice(&plus_as_space)
                        })
                })
                .map(|decoded| decoded.trim().to_string())
                .filter(|s| !s.is_empty())
                .or_else(|| {
                    let uri_path = request.uri().path();
                    let path_only = uri_path.split('?').next().unwrap_or(uri_path).split('#').next().unwrap_or(uri_path);
                    let decoded = percent_decode_maybe_twice(path_only).trim().to_string();
                    if decoded.is_empty() {
                        None
                    } else {
                        Some(if decoded.starts_with('/') || cfg!(target_os = "windows") {
                            decoded
                        } else {
                            format!("/{}", decoded)
                        })
                    }
                })
                .unwrap_or_else(|| {
                    eprintln!("[stream] No path in query or URI");
                    String::new()
                });

            let file_path = normalize_local_path(&raw_file_path);
            eprintln!(
                "[stream] Requested -> raw: {:?} normalized: {:?}",
                raw_file_path, file_path
            );

            /// Normalize filename for matching: trim spaces, collapse " .ext" to ".ext".
            fn normalize_name_for_match(name: &str) -> String {
                let name = name.trim();
                if let Some(dot) = name.rfind('.') {
                    if dot > 0 && name.as_bytes().get(dot.wrapping_sub(1)) == Some(&b' ') {
                        return format!("{}.{}", name[..dot - 1].trim_end(), &name[dot + 1..]);
                    }
                }
                name.to_string()
            }

            /// Try exact path, then path with backslashes (Windows), then " .ext" -> ".ext", then dir listing match.
            fn try_read(path: &str) -> Result<Vec<u8>, std::io::Error> {
                let err = match std::fs::read(path) {
                    Ok(data) => return Ok(data),
                    Err(e) => e,
                };
                if err.kind() != std::io::ErrorKind::NotFound {
                    return Err(err);
                }
                // Fallback 0: on Windows, try with backslashes (frontend may send forward slashes)
                #[cfg(target_os = "windows")]
                {
                    let with_backslash: String = path.replace('/', "\\");
                    if with_backslash != path {
                        eprintln!("[stream] Fallback 0 (backslashes): {:?}", with_backslash);
                        if let Ok(data) = std::fs::read(&with_backslash) {
                            return Ok(data);
                        }
                    }
                }
                // Fallback 1: remove space before extension
                if let Some(dot) = path.rfind('.') {
                    if dot > 0 && path.as_bytes().get(dot.wrapping_sub(1)) == Some(&b' ') {
                        let fallback = format!("{}.{}", path[..dot - 1].trim_end(), &path[dot + 1..]);
                        eprintln!("[stream] Fallback 1 (no space before ext): {:?}", fallback);
                        if let Ok(data) = std::fs::read(&fallback) {
                            return Ok(data);
                        }
                    }
                }
                // Fallback 2: list directory and find file with matching normalized name
                let path_obj = std::path::Path::new(path);
                if let (Some(parent), Some(requested_name)) = (path_obj.parent(), path_obj.file_name()) {
                    let requested_norm = normalize_name_for_match(requested_name.to_string_lossy().as_ref());
                    if let Ok(entries) = std::fs::read_dir(parent) {
                        for entry in entries.flatten() {
                            let entry_path = entry.path();
                            if let Some(name) = entry_path.file_name() {
                                if normalize_name_for_match(name.to_string_lossy().as_ref()) == requested_norm
                                    && entry_path.is_file()
                                {
                                    eprintln!("[stream] Fallback 2 (dir match): {:?}", entry_path);
                                    return std::fs::read(&entry_path);
                                }
                            }
                        }
                    }
                }
                
                // Fallback 3: On non-Windows, if parent directory doesn't exist, it might have backslashes
                // or other special chars that were incorrectly normalized. Try to reconstruct the path.
                #[cfg(not(target_os = "windows"))]
                {
                    let path_obj = std::path::Path::new(path);
                    if let (Some(parent), Some(requested_name)) = (path_obj.parent(), path_obj.file_name()) {
                        if !parent.exists() {
                            // Walk up the path and try to find each component with special chars
                            if let Some(grandparent) = parent.parent() {
                                if grandparent.exists() {
                                    let parent_name = parent.file_name().and_then(|n| n.to_str()).unwrap_or("");
                                    if let Ok(entries) = std::fs::read_dir(grandparent) {
                                        for entry in entries.flatten() {
                                            let entry_path = entry.path();
                                            if entry_path.is_dir() {
                                                if let Some(dir_name) = entry_path.file_name().and_then(|n| n.to_str()) {
                                                    // Check if this directory name matches when backslashes are normalized
                                                    if dir_name.replace('\\', "") == parent_name || dir_name.replace('\\', "/") == parent_name {
                                                        let candidate = entry_path.join(requested_name);
                                                        eprintln!("[stream] Fallback 3 (backslash parent): {:?}", candidate);
                                                        if let Ok(data) = std::fs::read(&candidate) {
                                                            return Ok(data);
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                Err(err)
            }

            /// Parse Range header (e.g. "bytes=0-1023" or "bytes=0-") and return (start, end_exclusive).
            fn parse_range(range_header: &str, total_len: usize) -> Option<(usize, usize)> {
                let range_header = range_header.trim();
                let prefix = "bytes=";
                if !range_header.to_lowercase().starts_with(prefix) {
                    return None;
                }
                let rest = range_header[prefix.len()..].trim();
                let mut parts = rest.split('-');
                let start_str = parts.next()?.trim();
                let end_str = parts.next().unwrap_or("").trim();
                let start: usize = start_str.parse().ok()?;
                let end = if end_str.is_empty() {
                    total_len
                } else {
                    end_str.parse().ok().map(|e: usize| (e + 1).min(total_len))?
                };
                if start >= total_len || start >= end {
                    return None;
                }
                Some((start, end.min(total_len)))
            }

            match try_read(&file_path) {
                Ok(data) => {
                    let mime = audio_mime_type(&file_path);
                    let total_len = data.len();
                    eprintln!("[stream] Serving {} ({} bytes, {})", file_path, total_len, mime);

                    // Support Range requests so the browser can request byte ranges (helps some players/codecs)
                    let (status, body, content_range) = match request
                        .headers()
                        .get("range")
                        .and_then(|v| v.to_str().ok())
                        .and_then(|s| parse_range(s, total_len))
                    {
                        Some((start, end)) => {
                            let slice = data.get(start..end).unwrap_or(&data).to_vec();
                            let range_value = format!("bytes {}-{}/{}", start, end.saturating_sub(1), total_len);
                            (
                                206,
                                slice,
                                Some(range_value),
                            )
                        }
                        None => (200, data, None),
                    };

                    let body_len = body.len();
                    let mut response = http::Response::builder()
                        .status(status)
                        .header("Content-Type", mime)
                        .header("Content-Length", body_len.to_string())
                        .header("Accept-Ranges", "bytes")
                        .header("Access-Control-Allow-Origin", "*");
                    if let Some(cr) = content_range {
                        response = response.header("Content-Range", cr);
                    }
                    response.body(body).unwrap()
                }
                Err(e) => {
                    eprintln!("[stream] Error reading {}: {}", file_path, e);
                    http::Response::builder()
                        .status(404)
                        .header("Content-Type", "text/plain")
                        .body(format!("File not found: {}", e).into_bytes())
                        .unwrap()
                }
            }
        })
        .manage(AppState {
            db: Mutex::new(None),
            ai_context_cache: Mutex::new(None),
        })
        .manage(PlaybackState::new())
        .manage(WatcherState::new())
        .invoke_handler(tauri::generate_handler![
            greet,
            // Library commands
            commands::library::init_database,
            commands::library::get_all_tracks,
            commands::library::get_tracks_paginated,
            commands::library::get_track,
            commands::library::update_track,
            commands::library::delete_track,
            commands::library::count_tracks,
            commands::library::scan_directory,
            commands::library::search_tracks,
            commands::library::list_audio_files,
            commands::library::list_subdirectories,
            commands::library::get_tracks_in_folder,
            commands::library::count_tracks_in_folder,
            commands::library::get_tracks_in_folder_shallow,
            commands::library::count_tracks_in_folder_shallow,
            commands::library::cleanup_stray_tracks,
            commands::library::cleanup_duplicate_tracks,
            commands::library::normalize_file_paths,
            commands::library::get_debug_tracks,
            // Playback commands
            commands::playback::load_track,
            commands::playback::play,
            commands::playback::pause,
            commands::playback::resume,
            commands::playback::seek,
            commands::playback::stop,
            commands::playback::get_playback_status,
            // Analysis commands
            commands::analysis::analyze_bpm,
            commands::analysis::analyze_all_bpm,
            commands::analysis::analyze_key,
            commands::analysis::analyze_all_keys,
            commands::analysis::get_track_analysis,
            commands::analysis::analyze_waveform,
            commands::analysis::get_waveform,
            // Playlist commands
            commands::playlists::create_playlist,
            commands::playlists::create_playlist_folder,
            commands::playlists::get_all_playlists,
            commands::playlists::rename_playlist,
            commands::playlists::delete_playlist,
            commands::playlists::get_playlist_tracks,
            commands::playlists::add_track_to_playlist,
            commands::playlists::remove_track_from_playlist,
            // Genre commands
            commands::genre::set_track_genre,
            commands::genre::clear_track_genre,
            commands::genre::get_genres_with_counts,
            commands::genre::get_tracks_by_genre,
            commands::genre::create_genre_definition,
            commands::genre::get_genre_definitions,
            commands::genre::delete_genre_definition,
            commands::genre::rename_genre_definition,
            commands::genre::bulk_set_genre,
            // Settings commands
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::get_library_folders,
            commands::settings::add_library_folder,
            commands::settings::remove_library_folder,
            commands::settings::get_theme,
            commands::settings::set_theme,
            // File watcher commands
            commands::watcher::start_file_watcher,
            // AI commands
            commands::ai::set_ai_api_key,
            commands::ai::get_ai_api_key_status,
            commands::ai::delete_ai_api_key,
            commands::ai::rebuild_ai_context,
            commands::ai::ai_generate_playlist,
            commands::ai::ai_chat,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
