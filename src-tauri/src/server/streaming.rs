// Secure audio streaming handler for the mobile companion server
// - Ticket-based auth (multi-use for Range requests, 10min expiry)
// - Stream by track ID only (no file paths from client)
// - Path validation against library roots
// - Full Range header support (200/206/416)
// - Concurrent stream limiting
// - No sensitive data in logs
// - Efficient file seeking (only reads requested bytes, not entire file)

use axum::{
    Router,
    body::Body,
    extract::{Path, Query, State},
    http::{HeaderMap, HeaderValue, Response, StatusCode},
    routing::get,
};
use std::io::{Read, Seek, SeekFrom};
use std::sync::atomic::Ordering;
use std::sync::Arc;

use super::CompanionServerState;

#[derive(serde::Deserialize)]
pub struct StreamQuery {
    pub ticket: Option<String>,
}

/// RAII guard that decrements the active stream counter on drop
struct StreamGuard(Arc<CompanionServerState>);

impl Drop for StreamGuard {
    fn drop(&mut self) {
        self.0.active_streams.fetch_sub(1, Ordering::Relaxed);
    }
}

pub fn stream_routes() -> Router<Arc<CompanionServerState>> {
    Router::new().route("/stream/{track_id}", get(stream_track))
}

async fn stream_track(
    State(state): State<Arc<CompanionServerState>>,
    Path(track_id): Path<i64>,
    Query(query): Query<StreamQuery>,
    headers: HeaderMap,
) -> Result<Response<Body>, StatusCode> {
    // 1. Validate ticket (multi-use for Range requests — browser may seek/buffer)
    let ticket = query.ticket.ok_or(StatusCode::UNAUTHORIZED)?;
    let ticket_track_id = state
        .validate_ticket(&ticket)
        .ok_or(StatusCode::UNAUTHORIZED)?;

    // Ticket must match the requested track
    if ticket_track_id != track_id {
        return Err(StatusCode::UNAUTHORIZED);
    }

    // 2. Check concurrent stream limit
    let current = state.active_streams.load(Ordering::Relaxed);
    if current >= state.max_streams {
        let mut resp = Response::new(Body::from("Too many active streams"));
        *resp.status_mut() = StatusCode::SERVICE_UNAVAILABLE;
        resp.headers_mut()
            .insert("Retry-After", HeaderValue::from_static("5"));
        return Ok(resp);
    }

    // Increment and create drop guard (decrements on function exit)
    state.active_streams.fetch_add(1, Ordering::Relaxed);
    let _stream_guard = StreamGuard(state.clone());

    // 3. Look up file path from database
    let file_path = {
        let db_lock = state
            .db
            .lock()
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let db = db_lock.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
        let track = db.get_track(track_id).map_err(|_| StatusCode::NOT_FOUND)?;
        track.file_path
    };

    // 4. Validate path is within a library root folder (canonicalized)
    let canonical_path =
        std::fs::canonicalize(&file_path).map_err(|_| StatusCode::NOT_FOUND)?;
    let canonical_str = canonical_path.to_string_lossy().to_string();

    let is_within_library = {
        let folders = state
            .library_folders
            .lock()
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        folders.iter().any(|folder| {
            if let Ok(canonical_folder) = std::fs::canonicalize(folder) {
                canonical_str.starts_with(&canonical_folder.to_string_lossy().to_string())
            } else {
                false
            }
        })
    };

    if !is_within_library {
        eprintln!(
            "[companion] Stream rejected: track {} not within library roots",
            track_id
        );
        return Err(StatusCode::FORBIDDEN);
    }

    // 5. Open file and get total size (without reading entire file into memory)
    let mut file =
        std::fs::File::open(&canonical_path).map_err(|_| StatusCode::NOT_FOUND)?;
    let metadata = file
        .metadata()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let total_len = metadata.len() as usize;
    let mime = audio_mime_type(&canonical_str);

    // Log without sensitive info
    eprintln!(
        "[companion] Streaming track {} ({} bytes, {})",
        track_id, total_len, mime
    );

    // 6. Handle Range header — only read the requested bytes
    let range_header = headers.get("range").and_then(|v| v.to_str().ok());

    match range_header.and_then(|s| parse_range(s, total_len)) {
        Some((start, end)) => {
            // Seek to start position and read only the needed bytes
            let read_len = end - start;
            file.seek(SeekFrom::Start(start as u64))
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            let mut buf = vec![0u8; read_len];
            file.read_exact(&mut buf)
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

            let content_range = format!(
                "bytes {}-{}/{}",
                start,
                end.saturating_sub(1),
                total_len
            );

            Response::builder()
                .status(StatusCode::PARTIAL_CONTENT)
                .header("Content-Type", mime)
                .header("Content-Length", read_len.to_string())
                .header("Accept-Ranges", "bytes")
                .header("Content-Range", content_range)
                .header("Referrer-Policy", "no-referrer")
                .header("Cache-Control", "no-store")
                .body(Body::from(buf))
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
        }
        None => {
            // If Range header was present but unparseable → 416
            if range_header.is_some() {
                let mut resp = Response::new(Body::empty());
                *resp.status_mut() = StatusCode::RANGE_NOT_SATISFIABLE;
                resp.headers_mut().insert(
                    "Content-Range",
                    HeaderValue::from_str(&format!("bytes */{}", total_len))
                        .unwrap(),
                );
                return Ok(resp);
            }

            // No Range header — read full file
            let mut buf = Vec::with_capacity(total_len);
            file.read_to_end(&mut buf)
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

            Response::builder()
                .status(StatusCode::OK)
                .header("Content-Type", mime)
                .header("Content-Length", total_len.to_string())
                .header("Accept-Ranges", "bytes")
                .header("Referrer-Policy", "no-referrer")
                .header("Cache-Control", "no-store")
                .body(Body::from(buf))
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

/// Parse Range header (e.g. "bytes=0-1023" or "bytes=0-")
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
        end_str
            .parse()
            .ok()
            .map(|e: usize| (e + 1).min(total_len))?
    };
    if start >= total_len || start >= end {
        return None;
    }
    Some((start, end.min(total_len)))
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
