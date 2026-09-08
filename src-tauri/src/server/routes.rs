// REST API routes for the mobile companion server
// All responses sanitize data: no file_path, no absolute paths exposed.

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
};
use axum::extract::Request;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use super::CompanionServerState;
use crate::db::Track;

// ---- Sanitized DTOs (never expose file_path) ----

/// Track data safe for mobile clients — file_path is stripped
#[derive(Debug, Clone, Serialize)]
pub struct MobileTrackDTO {
    pub id: i64,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<i32>,
    pub year: Option<i32>,
    pub label: Option<String>,
    pub duration_ms: Option<i32>,
    pub file_format: Option<String>,
    pub bitrate: Option<i32>,
    pub sample_rate: Option<i32>,
    pub file_size: Option<i64>,
    pub play_count: i32,
    pub rating: i32,
    pub genre: Option<String>,
    pub filename: String,
    // Analysis fields
    pub bpm: Option<f64>,
    pub musical_key: Option<String>,
}

impl MobileTrackDTO {
    fn from_track(track: Track) -> Self {
        let filename = std::path::Path::new(&track.file_path)
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_default();

        MobileTrackDTO {
            id: track.id.unwrap_or(0),
            title: track.title,
            artist: track.artist,
            album: track.album,
            album_artist: track.album_artist,
            track_number: track.track_number,
            year: track.year,
            label: track.label,
            duration_ms: track.duration_ms,
            file_format: track.file_format,
            bitrate: track.bitrate,
            sample_rate: track.sample_rate,
            file_size: track.file_size,
            play_count: track.play_count,
            rating: track.rating,
            genre: track.genre,
            filename,
            bpm: None,
            musical_key: None,
        }
    }

    fn from_track_with_analysis(
        track: Track,
        bpm: Option<f64>,
        musical_key: Option<String>,
    ) -> Self {
        let mut dto = Self::from_track(track);
        dto.bpm = bpm;
        dto.musical_key = musical_key;
        dto
    }
}

// ---- Request/Response types ----

#[derive(Deserialize)]
pub struct PaginationParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Deserialize)]
pub struct SearchParams {
    pub q: Option<String>,
}

#[derive(Serialize)]
pub struct StatusResponse {
    pub name: String,
    pub version: String,
    pub track_count: i64,
}

#[derive(Deserialize)]
pub struct StreamTicketRequest {
    pub track_id: i64,
}

#[derive(Serialize)]
pub struct StreamTicketResponse {
    pub ticket: String,
    pub expires_in: u64,
    pub stream_url: String,
}

#[derive(Serialize)]
pub struct SelfUrlResponse {
    pub url: String,
}

// ---- Route registration ----

pub fn api_routes() -> Router<Arc<CompanionServerState>> {
    Router::new()
        .route("/api/self", get(get_self_url))
        .route("/api/status", get(get_status))
        .route("/api/tracks", get(get_tracks))
        .route("/api/tracks/search", get(search_tracks))
        .route("/api/playlists/{id}/tracks", get(get_playlist_tracks))
        .route("/api/stream-ticket", post(create_stream_ticket))
}


// ---- YouTube player page ----
//
// The player has to be reached through a page served over http, not loaded
// straight into the webview: a top-level navigation to youtube.com/embed sends
// no Referer, and the player refuses with error 153. Wrapping it in an iframe
// on a page served from here gives it the Referer it wants — which is exactly
// why the same embed works in an ordinary browser.
//
// Public on purpose: it carries no library data, only a video id the user just
// typed in themselves.

#[derive(Debug, Deserialize)]
pub struct PlayerQuery {
    /// YouTube video id.
    pub v: String,
    /// Start offset in seconds.
    pub t: Option<u64>,
}

async fn yt_player(Query(query): Query<PlayerQuery>) -> impl IntoResponse {
    // Rebuilt from allowed characters rather than escaped, so nothing the user
    // pasted can reach the page as markup.
    let video_id: String = query
        .v
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(11)
        .collect();
    let start = query.t.unwrap_or(0);

    // The player is asked to report back: a webview has no console anyone can
    // read, and "unavailable" on screen does not say which of several causes it
    // is. The handshake below is YouTube's own postMessage protocol.
    let html = format!(
        r#"<!doctype html>
<html><head><meta charset="utf-8"><title>Player</title>
<style>
  html,body{{margin:0;height:100%;background:#000;overflow:hidden}}
  iframe{{border:0;width:100%;height:100%;display:block}}
</style></head>
<body>
<iframe id="p"
  src="https://www.youtube.com/embed/{video_id}?autoplay=1&mute=1&rel=0&start={start}&enablejsapi=1"
  allow="autoplay; encrypted-media; fullscreen"
  allowfullscreen></iframe>
<script>
  var report = function (what) {{
    try {{ fetch('/yt-report?m=' + encodeURIComponent(what)); }} catch (e) {{}}
  }};
  report('page loaded, referrer=' + document.referrer + ' origin=' + location.origin);

  var frame = document.getElementById('p');
  var send = function (func, args) {{
    try {{
      frame.contentWindow.postMessage(
        JSON.stringify({{ event: 'command', func: func, args: args || [] }}),
        '*'
      );
    }} catch (e) {{}}
  }};
  // Registering as a listener is what makes the player send events back.
  var handshake = setInterval(function () {{
    try {{
      frame.contentWindow.postMessage(
        JSON.stringify({{ event: 'listening', id: 1, channel: 'widget' }}),
        '*'
      );
    }} catch (e) {{}}
  }}, 500);

  window.addEventListener('message', function (e) {{
    if (typeof e.data !== 'string' || e.origin.indexOf('youtube.com') === -1) return;
    var data;
    try {{ data = JSON.parse(e.data); }} catch (err) {{ return; }}
    if (data.event === 'onReady' || data.event === 'initialDelivery') clearInterval(handshake);
    if (data.event === 'onError') report('PLAYER ERROR ' + data.info);
    else if (data.event === 'onReady') {{
      report('PLAYER READY');
      // Autoplay with sound needs a gesture, and the user's click landed in a
      // different webview entirely. Muted autoplay is allowed, so it starts
      // muted and the sound is turned on a moment later.
      send('playVideo');
      setTimeout(function () {{ send('unMute'); send('setVolume', [100]); }}, 800);
    }} else if (data.event === 'onStateChange' && data.info === 1) report('PLAYING');
  }});

  setTimeout(function () {{ clearInterval(handshake); }}, 15000);

  // Jumping between tracks: the app records where to go, the page picks it up
  // and seeks in place, so the video never reloads.
  var lastSeq = null;
  setInterval(function () {{
    fetch('/yt-seek')
      .then(function (r) {{ return r.json(); }})
      .then(function (data) {{
        if (lastSeq === null) {{ lastSeq = data.seq; return; }}
        if (data.seq === lastSeq) return;
        lastSeq = data.seq;
        send('seekTo', [data.t, true]);
        send('playVideo');
        // A seek is also the moment to make sure it is audible.
        send('unMute');
      }})
      .catch(function () {{}});
  }}, 400);
</script>
</body></html>"#
    );

    (
        [(axum::http::header::CONTENT_TYPE, "text/html; charset=utf-8")],
        html,
    )
}

#[derive(Debug, Deserialize)]
pub struct ReportQuery {
    pub m: String,
}

// The panel is a webview of its own, so the app cannot talk to it directly.
// Instead the player page asks here whether it should jump, which turns a seek
// into a smooth in-place move rather than a page reload and a rebuffer.
static SEEK: std::sync::OnceLock<std::sync::Mutex<(u64, u64)>> = std::sync::OnceLock::new();

fn seek_state() -> &'static std::sync::Mutex<(u64, u64)> {
    SEEK.get_or_init(|| std::sync::Mutex::new((0, 0)))
}

/// Called from the Tauri command when the user clicks a cue.
pub fn request_seek(seconds: u64) {
    if let Ok(mut state) = seek_state().lock() {
        // The counter is what the page watches; the same second twice still
        // has to register as a new instruction.
        state.0 += 1;
        state.1 = seconds;
    }
}

/// Polled by the player page a few times a second.
async fn yt_seek() -> Json<serde_json::Value> {
    let (seq, seconds) = seek_state().lock().map(|s| *s).unwrap_or((0, 0));
    Json(serde_json::json!({ "seq": seq, "t": seconds }))
}

/// The player panel has no console anyone can read, so it reports here and the
/// message lands in the app's own log.
async fn yt_report(Query(query): Query<ReportQuery>) -> StatusCode {
    let message: String = query.m.chars().take(300).collect();
    eprintln!("[yt-player] {message}");
    StatusCode::NO_CONTENT
}

/// Unauthenticated routes: a local HTML wrapper, no library data.
pub fn player_routes() -> Router<Arc<CompanionServerState>> {
    Router::new()
        .route("/yt-player", get(yt_player))
        .route("/yt-report", get(yt_report))
        .route("/yt-seek", get(yt_seek))
}

// ---- Handlers ----

async fn get_self_url(request: Request) -> Json<SelfUrlResponse> {
    let host = request
        .headers()
        .get("host")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("localhost:8384");
    let scheme = request
        .headers()
        .get("x-forwarded-proto")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("http");
    let url = format!("{}://{}", scheme, host);
    Json(SelfUrlResponse { url })
}

async fn get_status(
    State(state): State<Arc<CompanionServerState>>,
) -> Result<Json<StatusResponse>, StatusCode> {
    let db_lock = state.db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let db = db_lock.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let track_count = db.count_tracks().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(StatusResponse {
        name: "RecoDeck".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        track_count,
    }))
}

async fn get_tracks(
    State(state): State<Arc<CompanionServerState>>,
    Query(params): Query<PaginationParams>,
) -> Result<Json<Vec<MobileTrackDTO>>, StatusCode> {
    let limit = params.limit.unwrap_or(50).min(500);
    let offset = params.offset.unwrap_or(0);

    let db_lock = state.db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let db = db_lock.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let rows = db
        .get_tracks_with_analysis_paginated(limit, offset)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let tracks: Vec<MobileTrackDTO> = rows
        .into_iter()
        .map(|(track, bpm, _bpm_conf, key, _key_conf)| {
            MobileTrackDTO::from_track_with_analysis(track, bpm, key)
        })
        .collect();

    Ok(Json(tracks))
}

async fn search_tracks(
    State(state): State<Arc<CompanionServerState>>,
    Query(params): Query<SearchParams>,
) -> Result<Json<Vec<MobileTrackDTO>>, StatusCode> {
    let query = params.q.unwrap_or_default();
    if query.is_empty() {
        return Ok(Json(Vec::new()));
    }

    let db_lock = state.db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let db = db_lock.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let rows = db
        .search_tracks_with_analysis(&query)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mobile_tracks: Vec<MobileTrackDTO> = rows
        .into_iter()
        .map(|(track, bpm, _bpm_conf, key, _key_conf)| {
            MobileTrackDTO::from_track_with_analysis(track, bpm, key)
        })
        .collect();

    Ok(Json(mobile_tracks))
}

async fn get_playlist_tracks(
    State(state): State<Arc<CompanionServerState>>,
    Path(playlist_id): Path<i64>,
) -> Result<Json<Vec<MobileTrackDTO>>, StatusCode> {
    let db_lock = state.db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let db = db_lock.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let rows = db
        .get_playlist_tracks(playlist_id)
        .map_err(|_| StatusCode::NOT_FOUND)?;

    let tracks: Vec<MobileTrackDTO> = rows
        .into_iter()
        .map(|(track, bpm, _bpm_conf, key, _key_conf)| {
            MobileTrackDTO::from_track_with_analysis(track, bpm, key)
        })
        .collect();

    Ok(Json(tracks))
}

async fn create_stream_ticket(
    State(state): State<Arc<CompanionServerState>>,
    Json(body): Json<StreamTicketRequest>,
) -> Result<Json<StreamTicketResponse>, StatusCode> {
    // Verify the track exists
    let db_lock = state.db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let db = db_lock.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let _track = db.get_track(body.track_id).map_err(|_| StatusCode::NOT_FOUND)?;
    drop(db_lock);

    let ticket = state.create_ticket(body.track_id);
    let stream_url = format!("/stream/{}", body.track_id);

    Ok(Json(StreamTicketResponse {
        ticket,
        expires_in: 600,
        stream_url,
    }))
}
