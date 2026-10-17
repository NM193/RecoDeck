// Mobile companion server - Axum HTTP server for LAN streaming
// Serves REST API + audio streaming to the mobile PWA over WiFi

pub mod routes;
pub mod streaming;

use axum::{
    body::Body,
    extract::{Extension, Path, Request},
    http::{header::CONTENT_TYPE, HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{Html, IntoResponse, Response},
    routing::get,
    Router,
};
use rand::Rng;
use rand::thread_rng;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::oneshot;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};

use crate::db::Database;

/// Stream ticket for audio playback — avoids putting the Bearer token in audio element URLs.
///
/// Design decision (MOBL-07): Tickets use 10-minute expiry and are multi-use.
/// The original requirement specified "30s single-use" but this is incompatible with
/// HTTP Range-based audio streaming. Browsers make multiple Range requests to the same
/// URL as the user plays, seeks, and buffers. A 30s single-use ticket would break
/// seeking and buffering. The 10-minute window covers full track playback with seeking.
/// Security is maintained by: binding tickets to specific track IDs, cleaning expired
/// tickets on each validation, and limiting concurrent streams.
#[derive(Debug, Clone)]
pub struct StreamTicket {
    pub track_id: i64,
    pub created_at: std::time::Instant,
    /// TICKET_LIFETIME, or less when the share link it came through expires sooner.
    pub lifetime: Duration,
    /// The share link it was issued through, so stopping the link drops it;
    /// None for the companion token.
    pub share_token: Option<String>,
}

/// How long a ticket lasts: long enough for full track playback with seeking.
pub const TICKET_LIFETIME: Duration = Duration::from_secs(600);

impl StreamTicket {
    /// Ticket expires after its lifetime (10 minutes at most).
    /// Expired tickets are cleaned on each create_ticket() and validate_ticket() call.
    pub fn is_expired(&self) -> bool {
        self.created_at.elapsed() > self.lifetime
    }
}

/// How long a ticket issued through a share link lasts: TICKET_LIFETIME at
/// most, and never past the link's expiry (unix seconds).
pub fn share_ticket_lifetime(expires_at: i64, now: i64) -> Duration {
    let left = expires_at.saturating_sub(now).max(0) as u64;
    Duration::from_secs(left).min(TICKET_LIFETIME)
}

/// Shared state for the companion server
pub struct CompanionServerState {
    /// Auth token (256-bit random, hex-encoded)
    pub token: String,
    /// Reference to the app's database
    pub db: Arc<Mutex<Option<Database>>>,
    /// Library root folders for path validation
    pub library_folders: Arc<Mutex<Vec<String>>>,
    /// Active stream tickets (ticket_string -> StreamTicket)
    pub tickets: Mutex<HashMap<String, StreamTicket>>,
    /// Number of currently active audio streams
    pub active_streams: AtomicUsize,
    /// Max concurrent streams allowed
    pub max_streams: usize,
}

impl CompanionServerState {
    /// Generate a new random stream ticket for a track
    pub fn create_ticket(&self, track_id: i64) -> String {
        self.issue_ticket(track_id, TICKET_LIFETIME, None)
    }

    /// A ticket issued through a share link: it lasts `lifetime` (10 minutes
    /// at most) and goes when the link is stopped.
    pub fn create_share_ticket(
        &self,
        track_id: i64,
        share_token: &str,
        lifetime: Duration,
    ) -> String {
        self.issue_ticket(
            track_id,
            lifetime.min(TICKET_LIFETIME),
            Some(share_token.to_string()),
        )
    }

    fn issue_ticket(
        &self,
        track_id: i64,
        lifetime: Duration,
        share_token: Option<String>,
    ) -> String {
        let ticket: String = {
            let mut rng = thread_rng();
            (0..32)
                .map(|_| format!("{:02x}", rng.gen::<u8>()))
                .collect()
        };

        let mut tickets = self.tickets.lock().unwrap();
        // Clean expired tickets on each creation
        tickets.retain(|_, t| !t.is_expired());
        tickets.insert(
            ticket.clone(),
            StreamTicket {
                track_id,
                created_at: std::time::Instant::now(),
                lifetime,
                share_token,
            },
        );
        ticket
    }

    /// Validate a ticket (multi-use for Range requests). Returns track_id if valid.
    /// Does NOT consume — browser makes multiple Range requests for seeking/buffering.
    pub fn validate_ticket(&self, ticket: &str) -> Option<i64> {
        let mut tickets = self.tickets.lock().unwrap();
        tickets.retain(|_, t| !t.is_expired());
        tickets.get(ticket).map(|t| t.track_id)
    }

    /// Invalidate all tickets (called when token is regenerated)
    pub fn invalidate_all_tickets(&self) {
        let mut tickets = self.tickets.lock().unwrap();
        tickets.clear();
    }

    /// Drops the tickets issued through a share link (it was stopped).
    pub fn revoke_share_tickets(&self, share_token: &str) {
        let mut tickets = self.tickets.lock().unwrap();
        tickets.retain(|_, t| t.share_token.as_deref() != Some(share_token));
    }

    /// Drops every ticket issued through a share link (all were stopped).
    pub fn revoke_all_share_tickets(&self) {
        let mut tickets = self.tickets.lock().unwrap();
        tickets.retain(|_, t| t.share_token.is_none());
    }

    /// Get current active stream count
    pub fn active_stream_count(&self) -> usize {
        self.active_streams.load(Ordering::Relaxed)
    }

    /// Who a Bearer token belongs to: the companion token, a live share link,
    /// or no one (unknown, expired or stopped).
    fn bearer_for(&self, provided: &str) -> Result<Bearer, StatusCode> {
        if provided.is_empty() {
            return Ok(Bearer::Unknown);
        }
        if tokens_match(provided, &self.token) {
            return Ok(Bearer::Companion);
        }
        // Anything not shaped like a share token is turned away before it can
        // take the database lock, and a clock that cannot be trusted makes
        // no link live.
        if !is_token_shaped(provided) {
            return Ok(Bearer::Unknown);
        }
        let Some(now) = crate::db::share::unix_now() else {
            return Ok(Bearer::Unknown);
        };
        let db_lock = self
            .db
            .lock()
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let db = db_lock.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
        let playlist = db
            .shared_playlist(provided, now)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        Ok(match playlist {
            Some(playlist_id) => Bearer::Share {
                playlist_id,
                token: provided.to_string(),
            },
            None => Bearer::Unknown,
        })
    }
}

/// What a request may reach. `auth_middleware` puts it in the request
/// extensions; handlers that serve share links read it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Access {
    /// The companion token: the whole library.
    Full,
    /// A live share link: one playlist only. Its token goes on the stream
    /// tickets it gets, so stopping the link drops them.
    Share { playlist_id: i64, token: String },
}

/// Who a Bearer token belongs to.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Bearer {
    Companion,
    /// A live share link of this playlist.
    Share {
        playlist_id: i64,
        token: String,
    },
    /// No token, an unknown one, or an expired or stopped share link.
    Unknown,
}

/// Whether a token is shaped like one from `generate_token`: 64 lowercase
/// hex characters.
fn is_token_shaped(token: &str) -> bool {
    token.len() == 64
        && token
            .bytes()
            .all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

/// Compares a provided token with the expected one in constant time: a
/// length mismatch fails, equal lengths are compared with a byte-wise XOR
/// fold that never stops early.
fn tokens_match(provided: &str, expected: &str) -> bool {
    let (a, b) = (provided.as_bytes(), expected.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    let diff = a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y));
    std::hint::black_box(diff) == 0
}

/// The middleware's decision for a Bearer route: the companion token reaches
/// everything; a share link reaches its status, its own playlist and stream
/// tickets (the handler checks the track is in the playlist), and nothing
/// else (403); anyone else gets 401. Paths must be exact: its playlist only
/// as `/api/playlists/<id>/tracks`, never `+5`, `05`, `%35` or a trailing `/`.
fn access_for(bearer: Bearer, path: &str, method: &Method) -> Result<Access, StatusCode> {
    let (playlist_id, token) = match bearer {
        Bearer::Unknown => return Err(StatusCode::UNAUTHORIZED),
        Bearer::Companion => return Ok(Access::Full),
        Bearer::Share { playlist_id, token } => (playlist_id, token),
    };
    let allowed = if method == Method::GET {
        path == "/api/status" || path == format!("/api/playlists/{playlist_id}/tracks")
    } else if method == Method::POST {
        path == "/api/stream-ticket"
    } else {
        false
    };
    if allowed {
        Ok(Access::Share { playlist_id, token })
    } else {
        Err(StatusCode::FORBIDDEN)
    }
}

/// Holds the running server's shutdown mechanism
pub struct RunningServer {
    pub shutdown_tx: oneshot::Sender<()>,
    pub addr: SocketAddr,
    pub token: String,
    pub server_state: Arc<CompanionServerState>,
}

/// Generate a cryptographically random 256-bit token (64 hex chars)
pub fn generate_token() -> String {
    let mut rng = thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.gen::<u8>()).collect();
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// Serves asset files (JS, CSS, etc.) with correct MIME type — avoids HTML fallback causing MIME errors
async fn serve_asset(
    Path(filename): Path<String>,
    Extension(assets_path): Extension<PathBuf>,
) -> Result<Response, StatusCode> {
    // Prevent path traversal
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return Err(StatusCode::FORBIDDEN);
    }
    let file_path = assets_path.join(&filename);
    if !file_path.starts_with(&assets_path) {
        return Err(StatusCode::FORBIDDEN);
    }
    let content = tokio::fs::read(&file_path).await.map_err(|_| StatusCode::NOT_FOUND)?;
    let mime = match file_path.extension().and_then(|e| e.to_str()) {
        Some("js") | Some("mjs") => "application/javascript",
        Some("css") => "text/css",
        Some("json") => "application/json",
        Some("woff2") => "font/woff2",
        Some("woff") => "font/woff",
        Some("ttf") => "font/ttf",
        _ => "application/octet-stream",
    };
    Response::builder()
        .status(200)
        .header(CONTENT_TYPE, mime)
        .body(Body::from(content))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

/// What a link to the page carries: a share link (`share`), or an old-style
/// link with the companion token (`token`, `playlist`, `name`).
#[derive(Debug, Default, PartialEq)]
struct IndexParams {
    token: Option<String>,
    playlist_id: Option<i64>,
    playlist_name: Option<String>,
    share: Option<String>,
}

/// Parse query params from URI (share, token, playlist, name) — used when opening shared playlist link
fn parse_share_params(query: Option<&str>) -> IndexParams {
    let query = query.unwrap_or("");
    let mut params = IndexParams::default();
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            match k {
                "token" => params.token = Some(v.to_string()),
                "playlist" => params.playlist_id = v.parse().ok(),
                "name" => params.playlist_name = Some(
                    urlencoding::decode(v).map(|c| c.into_owned()).unwrap_or_else(|_| v.to_string()),
                ),
                "share" => params.share = Some(v.to_string()),
                _ => {}
            }
        }
    }
    params
}

/// A value as a JavaScript string literal that is safe inside an inline
/// `<script>`: JSON-encoded, then `<`, `>`, `&`, U+2028 and U+2029 written as
/// `\u` escapes, so no value can end the script or the string.
fn js_string_literal(value: &str) -> String {
    serde_json::to_string(value)
        .unwrap_or_else(|_| String::from("\"\""))
        .replace('<', "\\u003c")
        .replace('>', "\\u003e")
        .replace('&', "\\u0026")
        .replace('\u{2028}', "\\u2028")
        .replace('\u{2029}', "\\u2029")
}

/// A value escaped for a double-quoted HTML attribute.
fn html_attr_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// The `<meta>` and `<script>` put into the page's `<head>`: the server URL
/// and whatever the link carries.
fn index_injection(url: &str, params: &IndexParams) -> String {
    let mut script_parts = vec![format!(
        "window.__RECODECK_SERVER_URL__={};",
        js_string_literal(url)
    )];
    if let Some(ref t) = params.token {
        script_parts.push(format!(
            "window.__RECODECK_TOKEN__={};",
            js_string_literal(t)
        ));
    }
    if let Some(pid) = params.playlist_id {
        script_parts.push(format!("window.__RECODECK_PLAYLIST_ID__={};", pid));
    }
    if let Some(ref pn) = params.playlist_name {
        script_parts.push(format!(
            "window.__RECODECK_PLAYLIST_NAME__={};",
            js_string_literal(pn)
        ));
    }
    if let Some(ref s) = params.share {
        script_parts.push(format!(
            "window.__RECODECK_SHARE__={};",
            js_string_literal(s)
        ));
    }
    format!(
        r#"<meta name="recodeck-server-url" content="{}"><script>{}</script>"#,
        html_attr_escape(url),
        script_parts.join(" ")
    )
}

/// Serves index.html with server URL injected for PWA auto-fill (window.location unreliable in standalone)
/// When URL has ?share=... (or the old ?token=...&playlist=...&name=...), injects them so mobile app can read even in PWA mode
async fn serve_index_with_url(
    Extension(index_path): Extension<PathBuf>,
    request: Request,
) -> impl IntoResponse {
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
    let params = parse_share_params(request.uri().query());

    let html = tokio::fs::read_to_string(&index_path)
        .await
        .unwrap_or_else(|_| String::from("<html><body>Error</body></html>"));

    let injection = index_injection(&url, &params);
    let html = html.replace("</head>", &format!("{}\n  </head>", injection));
    Html(html)
}

/// Auth middleware - validates Bearer token on every request.
/// Stream endpoints use ticket-based auth instead (checked in handler).
/// The companion token gets full access; a live share link gets its own
/// playlist only (see `access_for`). The `Access` goes into the extensions.
async fn auth_middleware(
    state: axum::extract::State<Arc<CompanionServerState>>,
    mut request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let path = request.uri().path();

    // Stream endpoint uses ticket auth, not Bearer token
    if path.starts_with("/stream/") {
        return Ok(next.run(request).await);
    }
    // Public: returns server URL for PWA auto-detect (window.location unreliable in standalone)
    if path == "/api/self" {
        return Ok(next.run(request).await);
    }

    // All other endpoints require Bearer token
    let provided_token = request
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|header| header.strip_prefix("Bearer "));
    let bearer = match provided_token {
        Some(token) => state.bearer_for(token)?,
        None => Bearer::Unknown,
    };

    let access = access_for(bearer, request.uri().path(), request.method())?;
    request.extensions_mut().insert(access);
    Ok(next.run(request).await)
}

/// The API and streaming routes, behind the auth middleware.
pub(crate) fn api_router(state: Arc<CompanionServerState>) -> Router {
    Router::new()
        .merge(routes::api_routes())
        .merge(streaming::stream_routes())
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ))
        .with_state(state)
}

/// Start the companion HTTP server on the given port.
/// Returns the running server handle (for shutdown) or an error.
pub async fn start_server(
    port: u16,
    token: String,
    db: Arc<Mutex<Option<Database>>>,
    library_folders: Arc<Mutex<Vec<String>>>,
    max_streams: usize,
    mobile_dist_path: Option<PathBuf>,
) -> Result<RunningServer, String> {
    let state = Arc::new(CompanionServerState {
        token: token.clone(),
        db,
        library_folders,
        tickets: Mutex::new(HashMap::new()),
        active_streams: AtomicUsize::new(0),
        max_streams,
    });

    // CORS configuration - not a security layer, auth middleware handles that
    let cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([
            "authorization".parse().unwrap(),
            "content-type".parse().unwrap(),
            "range".parse().unwrap(),
        ])
        .allow_origin("*".parse::<HeaderValue>().unwrap());

    // API + streaming routes (auth-protected)
    let api_routes = api_router(state.clone());

    // Serve mobile PWA static files (no auth needed — the app itself is public,
    // only API endpoints require authentication)
    let app = if let Some(dist_path) = mobile_dist_path.filter(|p| p.exists()) {
        let index_html = dist_path.join("index.html");
        let assets_path = dist_path.join("assets");
        eprintln!("[companion] Serving mobile PWA from {:?}", dist_path);
        let index_routes = Router::new()
            .route("/", get(serve_index_with_url))
            .route("/index.html", get(serve_index_with_url))
            .layer(Extension(index_html));
        // Serve /assets/* with correct MIME type (custom handler avoids fallback returning HTML)
        let assets_service = if assets_path.exists() {
            Router::new()
                .route("/assets/{path}", get(serve_asset))
                .layer(Extension(assets_path))
        } else {
            Router::new()
        };
        index_routes
            .merge(assets_service)
            // Public: the YouTube player wrapper, which carries no library data.
            .merge(routes::player_routes().with_state(state.clone()))
            .merge(api_routes)
            .fallback_service(ServeDir::new(&dist_path).fallback(ServeFile::new(dist_path.join("index.html"))))
            .layer(cors)
    } else {
        eprintln!("[companion] No mobile PWA dist found, API-only mode");
        routes::player_routes()
            .with_state(state.clone())
            .merge(api_routes)
            .layer(cors)
    };

    // Try to bind to the requested port, with fallback
    let addr = try_bind(port).await?;
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("Failed to bind to {}: {}", addr, e))?;
    let actual_addr = listener
        .local_addr()
        .map_err(|e| format!("Failed to get local addr: {}", e))?;

    // Log without sensitive info
    eprintln!(
        "[companion] Server starting on {}",
        actual_addr
    );

    tokio::spawn(async move {
        axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
                eprintln!("[companion] Shutdown signal received, draining connections...");
                // Give active streams 5 seconds to finish
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            })
            .await
            .unwrap_or_else(|e| eprintln!("[companion] Server error: {}", e));
        eprintln!("[companion] Server stopped");
    });

    Ok(RunningServer {
        shutdown_tx,
        addr: actual_addr,
        token,
        server_state: state,
    })
}

/// Try to bind to the given port, with fallback to nearby ports then OS-assigned
async fn try_bind(preferred_port: u16) -> Result<SocketAddr, String> {
    // Try preferred port
    let addr = SocketAddr::from(([0, 0, 0, 0], preferred_port));
    if let Ok(listener) = tokio::net::TcpListener::bind(addr).await {
        drop(listener);
        return Ok(addr);
    }

    // Try ports preferred+1 through preferred+10
    for offset in 1..=10u16 {
        let port = preferred_port.saturating_add(offset);
        let addr = SocketAddr::from(([0, 0, 0, 0], port));
        if let Ok(listener) = tokio::net::TcpListener::bind(addr).await {
            drop(listener);
            eprintln!(
                "[companion] Port {} unavailable, using {}",
                preferred_port, port
            );
            return Ok(addr);
        }
    }

    // Fall back to OS-assigned port
    let addr = SocketAddr::from(([0, 0, 0, 0], 0u16));
    if let Ok(listener) = tokio::net::TcpListener::bind(addr).await {
        let actual = listener.local_addr().map_err(|e| e.to_string())?;
        drop(listener);
        eprintln!(
            "[companion] All preferred ports unavailable, OS assigned port {}",
            actual.port()
        );
        return Ok(actual);
    }

    Err("Failed to bind to any port".to_string())
}

#[cfg(test)]
impl CompanionServerState {
    /// A server state over `db`, with `token` as the companion token.
    pub(crate) fn for_tests(db: Database, token: &str) -> Self {
        CompanionServerState {
            token: token.to_string(),
            db: Arc::new(Mutex::new(Some(db))),
            library_folders: Arc::new(Mutex::new(Vec::new())),
            tickets: Mutex::new(HashMap::new()),
            active_streams: AtomicUsize::new(0),
            max_streams: 3,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const COMPANION: &str = "c0ffee";

    // ---- constant-time token comparison ----

    #[test]
    fn tokens_match_only_on_the_same_bytes() {
        let token = generate_token();
        assert!(tokens_match(&token, &token.clone()));

        let mut last_differs = token.clone();
        last_differs.pop();
        last_differs.push(if token.ends_with('0') { '1' } else { '0' });
        assert!(!tokens_match(&last_differs, &token));

        let mut first_differs = token.clone();
        first_differs.replace_range(0..1, if token.starts_with('0') { "1" } else { "0" });
        assert!(!tokens_match(&first_differs, &token));
    }

    #[test]
    fn tokens_of_another_length_never_match() {
        let token = generate_token();
        assert!(!tokens_match(&token[..63], &token));
        assert!(!tokens_match(&format!("{token}0"), &token));
        assert!(!tokens_match("", &token));
    }

    // ---- access_for: the middleware's decision ----

    const SHARED: i64 = 5;

    fn share() -> Bearer {
        Bearer::Share {
            playlist_id: SHARED,
            token: "t".into(),
        }
    }

    #[test]
    fn an_unknown_token_is_unauthorized_everywhere() {
        for (method, path) in [
            (Method::GET, "/api/status"),
            (Method::GET, "/api/tracks"),
            (Method::GET, "/api/tracks/search"),
            (Method::GET, "/api/playlists/5/tracks"),
            (Method::POST, "/api/stream-ticket"),
        ] {
            assert_eq!(
                access_for(Bearer::Unknown, path, &method),
                Err(StatusCode::UNAUTHORIZED),
                "{path}"
            );
        }
    }

    #[test]
    fn the_companion_token_has_full_access_everywhere() {
        for (method, path) in [
            (Method::GET, "/api/status"),
            (Method::GET, "/api/tracks"),
            (Method::GET, "/api/tracks/search"),
            (Method::GET, "/api/playlists/5/tracks"),
            (Method::GET, "/api/playlists/6/tracks"),
            (Method::POST, "/api/stream-ticket"),
        ] {
            assert_eq!(
                access_for(Bearer::Companion, path, &method),
                Ok(Access::Full),
                "{path}"
            );
        }
    }

    #[test]
    fn a_share_token_gets_status_its_playlist_and_tickets() {
        let ok = Ok(Access::Share {
            playlist_id: SHARED,
            token: "t".into(),
        });
        assert_eq!(access_for(share(), "/api/status", &Method::GET), ok);
        assert_eq!(
            access_for(share(), "/api/playlists/5/tracks", &Method::GET),
            ok
        );
        assert_eq!(access_for(share(), "/api/stream-ticket", &Method::POST), ok);
    }

    #[test]
    fn a_share_token_is_forbidden_the_library_and_other_playlists() {
        for (method, path) in [
            (Method::GET, "/api/tracks"),
            (Method::GET, "/api/tracks/search"),
            (Method::GET, "/api/playlists/6/tracks"),
            (Method::GET, "/api/playlists/55/tracks"),
            (Method::GET, "/api/playlists/5"),
            (Method::GET, "/api/playlists/5/tracks/x"),
            (Method::GET, "/api/playlists/x/tracks"),
            (Method::GET, "/api/unknown"),
            // Allowed routes, wrong method.
            (Method::POST, "/api/status"),
            (Method::POST, "/api/playlists/5/tracks"),
            (Method::GET, "/api/stream-ticket"),
        ] {
            assert_eq!(
                access_for(share(), path, &method),
                Err(StatusCode::FORBIDDEN),
                "{method} {path}"
            );
        }
    }

    #[test]
    fn a_share_token_gets_only_the_canonical_path_of_its_playlist() {
        for path in [
            "/api/playlists/+5/tracks",
            "/api/playlists/05/tracks",
            "/api/playlists/%35/tracks",
            "/api/playlists/-5/tracks",
            "/api/playlists/5%20/tracks",
            "/api/playlists/5/tracks/",
            "/api/playlists//tracks",
            "/api/playlists/5//tracks",
            "//api/playlists/5/tracks",
            "/api//playlists/5/tracks",
            "/api/status/",
            "//api/status",
        ] {
            assert_eq!(
                access_for(share(), path, &Method::GET),
                Err(StatusCode::FORBIDDEN),
                "{path}"
            );
        }
    }

    #[test]
    fn a_share_token_is_forbidden_every_other_method_head_included() {
        for method in [
            Method::HEAD,
            Method::PUT,
            Method::DELETE,
            Method::PATCH,
            Method::OPTIONS,
        ] {
            for path in [
                "/api/status",
                "/api/playlists/5/tracks",
                "/api/stream-ticket",
            ] {
                assert_eq!(
                    access_for(share(), path, &method),
                    Err(StatusCode::FORBIDDEN),
                    "{method} {path}"
                );
            }
        }
    }

    // ---- who a Bearer token belongs to ----

    fn db_with_playlist() -> (Database, i64) {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        let playlist = db.create_playlist("P", "manual", None).unwrap();
        (db, playlist)
    }

    /// A server whose database is not open: any lookup answers 503.
    fn state_without_db() -> CompanionServerState {
        let state = CompanionServerState::for_tests(Database::new_in_memory().unwrap(), COMPANION);
        *state.db.lock().unwrap() = None;
        state
    }

    #[test]
    fn bearer_for_tells_the_companion_token_from_a_share_link() {
        let (db, playlist) = db_with_playlist();
        let link = db.create_share_link(playlist, 7).unwrap();
        let state = CompanionServerState::for_tests(db, COMPANION);

        assert_eq!(state.bearer_for(COMPANION), Ok(Bearer::Companion));
        assert_eq!(
            state.bearer_for(&link.token),
            Ok(Bearer::Share {
                playlist_id: playlist,
                token: link.token.clone()
            })
        );
        assert_eq!(state.bearer_for(&generate_token()), Ok(Bearer::Unknown));
        assert_eq!(state.bearer_for("not-a-token"), Ok(Bearer::Unknown));
        assert_eq!(state.bearer_for(""), Ok(Bearer::Unknown));
    }

    #[test]
    fn a_malformed_bearer_is_unknown_without_touching_the_database() {
        let state = state_without_db();
        let token = generate_token();
        let malformed = vec![
            String::new(),
            "short".to_string(),
            token[..63].to_string(),
            format!("{token}0"),
            token.to_uppercase(),
            format!("{}g", &token[..63]),
            format!(" {}", &token[1..]),
        ];
        for bad in &malformed {
            assert_eq!(state.bearer_for(bad), Ok(Bearer::Unknown), "{bad:?}");
        }
        // A well-formed one does reach the database (none here).
        assert_eq!(
            state.bearer_for(&token),
            Err(StatusCode::SERVICE_UNAVAILABLE)
        );
        // The companion token never needs it.
        assert_eq!(state.bearer_for(COMPANION), Ok(Bearer::Companion));
    }

    #[test]
    fn a_stopped_share_link_is_unknown() {
        let (db, playlist) = db_with_playlist();
        let link = db.create_share_link(playlist, 7).unwrap();
        db.delete_share_link(&link.token).unwrap();
        let state = CompanionServerState::for_tests(db, COMPANION);

        assert_eq!(state.bearer_for(&link.token), Ok(Bearer::Unknown));
    }

    #[test]
    fn on_a_broken_clock_a_share_link_is_unknown() {
        let (db, playlist) = db_with_playlist();
        let link = db.create_share_link(playlist, 7).unwrap();
        let state = CompanionServerState::for_tests(db, COMPANION);

        crate::db::share::break_clock_in_this_thread();

        assert_eq!(state.bearer_for(&link.token), Ok(Bearer::Unknown));
        assert_eq!(state.bearer_for(COMPANION), Ok(Bearer::Companion));
    }

    // ---- stream tickets issued through a share link ----

    #[test]
    fn stopping_a_link_revokes_its_tickets_only() {
        let state = state_without_db();
        let full = state.create_ticket(1);
        let a = state.create_share_ticket(2, "link-a", TICKET_LIFETIME);
        let b = state.create_share_ticket(3, "link-b", TICKET_LIFETIME);

        state.revoke_share_tickets("link-a");

        assert_eq!(state.validate_ticket(&a), None);
        assert_eq!(state.validate_ticket(&b), Some(3));
        assert_eq!(state.validate_ticket(&full), Some(1));

        state.revoke_all_share_tickets();

        assert_eq!(state.validate_ticket(&b), None);
        assert_eq!(state.validate_ticket(&full), Some(1));
    }

    #[test]
    fn a_share_ticket_ends_with_its_lifetime() {
        let state = state_without_db();
        let ticket = state.create_share_ticket(2, "link", Duration::ZERO);
        std::thread::sleep(Duration::from_millis(2));

        assert_eq!(state.validate_ticket(&ticket), None);
    }

    #[test]
    fn a_share_ticket_never_outlives_its_link() {
        let now = 1_000_000;
        assert_eq!(share_ticket_lifetime(now + 86_400, now), TICKET_LIFETIME);
        assert_eq!(
            share_ticket_lifetime(now + 30, now),
            Duration::from_secs(30)
        );
        assert_eq!(share_ticket_lifetime(now, now), Duration::ZERO);
        assert_eq!(share_ticket_lifetime(now - 5, now), Duration::ZERO);
    }

    // ---- the share page's injection ----

    const NASTY: [&str; 7] = [
        "</script><script>alert(1)</script>",
        "</SCRIPT ><img src=x onerror=alert(1)>",
        "\"; alert(1); //",
        "a\u{2028}b\u{2029}c",
        "back\\slash\\\" quote",
        "<!-- & -->",
        "line\nbreak",
    ];

    #[test]
    fn a_js_string_literal_cannot_leave_its_string_or_end_the_script() {
        for value in NASTY {
            let literal = js_string_literal(value);
            for c in ['<', '>', '&', '\u{2028}', '\u{2029}', '\n'] {
                assert!(!literal.contains(c), "{c:?} left raw in {literal}");
            }
            // One JSON string, nothing after it: it parses back to the value.
            let back: String = serde_json::from_str(&literal).unwrap();
            assert_eq!(back, value);
        }
    }

    #[test]
    fn an_attribute_value_cannot_leave_its_quotes() {
        assert_eq!(
            html_attr_escape(r#"http://h"><script>a&b"#),
            "http://h&quot;&gt;&lt;script&gt;a&amp;b"
        );
        assert_eq!(
            html_attr_escape("http://192.168.1.2:8384"),
            "http://192.168.1.2:8384"
        );
    }

    #[test]
    fn the_injection_holds_exactly_one_script_whatever_the_values() {
        for value in NASTY {
            let params = IndexParams {
                token: Some(value.to_string()),
                playlist_id: Some(7),
                playlist_name: Some(value.to_string()),
                share: Some(value.to_string()),
            };
            let injection = index_injection(&format!("http://h{value}"), &params);
            let lower = injection.to_lowercase();

            assert_eq!(lower.matches("<script").count(), 1, "{injection}");
            assert_eq!(lower.matches("</script").count(), 1, "{injection}");
            assert!(injection.ends_with("</script>"), "{injection}");
            let script = &injection[injection.find("<script>").unwrap()..];
            assert!(
                !script.contains('\u{2028}') && !script.contains('\u{2029}'),
                "{script}"
            );
            // The meta tag ends where it should: its value holds no raw quote.
            let meta_end = injection.find("\"><script>").unwrap();
            let content_start = injection.find("content=\"").unwrap() + "content=\"".len();
            assert!(
                !injection[content_start..meta_end].contains('"'),
                "{injection}"
            );
        }
    }

    #[test]
    fn the_injection_sets_every_value() {
        let params = IndexParams {
            token: Some("tok".into()),
            playlist_id: Some(7),
            playlist_name: Some("Warm up".into()),
            share: Some("abc123".into()),
        };
        let injection = index_injection("http://10.0.0.2:8384", &params);

        assert!(injection.contains(r#"content="http://10.0.0.2:8384""#));
        assert!(injection.contains(r#"window.__RECODECK_SERVER_URL__="http://10.0.0.2:8384";"#));
        assert!(injection.contains(r#"window.__RECODECK_TOKEN__="tok";"#));
        assert!(injection.contains("window.__RECODECK_PLAYLIST_ID__=7;"));
        assert!(injection.contains(r#"window.__RECODECK_PLAYLIST_NAME__="Warm up";"#));
        assert!(injection.contains(r#"window.__RECODECK_SHARE__="abc123";"#));
    }

    #[test]
    fn the_injection_leaves_out_what_the_link_does_not_carry() {
        let injection = index_injection("http://h", &IndexParams::default());
        assert!(!injection.contains("__RECODECK_TOKEN__"));
        assert!(!injection.contains("__RECODECK_SHARE__"));
        assert!(!injection.contains("__RECODECK_PLAYLIST_ID__"));
    }

    #[test]
    fn share_params_are_read_from_the_query() {
        let params = parse_share_params(Some("share=abc&token=t&playlist=5&name=My%20Mix"));
        assert_eq!(
            params,
            IndexParams {
                token: Some("t".into()),
                playlist_id: Some(5),
                playlist_name: Some("My Mix".into()),
                share: Some("abc".into()),
            }
        );
        assert_eq!(parse_share_params(None), IndexParams::default());
    }
}
