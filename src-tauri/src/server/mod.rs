// Mobile companion server - Axum HTTP server for LAN streaming
// Serves REST API + audio streaming to the mobile PWA over WiFi

pub mod routes;
pub mod streaming;

use axum::{
    Router,
    extract::{Extension, Request},
    http::{HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{Html, IntoResponse, Response},
    routing::get,
};
use rand::Rng;
use rand::thread_rng;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};

use crate::db::Database;

/// A short-lived, single-use ticket for audio streaming.
/// Avoids putting the main auth token in audio element URLs.
#[derive(Debug, Clone)]
pub struct StreamTicket {
    pub track_id: i64,
    pub created_at: std::time::Instant,
}

impl StreamTicket {
    /// Ticket valid for 10 minutes — enough for Range requests during playback
    pub fn is_expired(&self) -> bool {
        self.created_at.elapsed().as_secs() > 600
    }
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

    /// Get current active stream count
    pub fn active_stream_count(&self) -> usize {
        self.active_streams.load(Ordering::Relaxed)
    }
}

/// Holds the running server's shutdown mechanism
pub struct RunningServer {
    pub shutdown_tx: oneshot::Sender<()>,
    pub addr: SocketAddr,
    pub token: String,
}

/// Generate a cryptographically random 256-bit token (64 hex chars)
pub fn generate_token() -> String {
    let mut rng = thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.gen::<u8>()).collect();
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// Serves index.html with server URL injected for PWA auto-fill (window.location unreliable in standalone)
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
    let html = tokio::fs::read_to_string(&index_path)
        .await
        .unwrap_or_else(|_| String::from("<html><body>Error</body></html>"));
    let injection = format!(
        r#"<meta name="recodeck-server-url" content="{}"><script>window.__RECODECK_SERVER_URL__="{}";</script>"#,
        url, url
    );
    let html = html.replace("</head>", &format!("{}\n  </head>", injection));
    Html(html)
}

/// Auth middleware - validates Bearer token on every request.
/// Stream endpoints use ticket-based auth instead (checked in handler).
async fn auth_middleware(
    state: axum::extract::State<Arc<CompanionServerState>>,
    request: Request,
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
    let auth_header = request
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok());

    match auth_header {
        Some(header) if header.starts_with("Bearer ") => {
            let provided_token = &header[7..];
            if provided_token == state.token {
                Ok(next.run(request).await)
            } else {
                Err(StatusCode::UNAUTHORIZED)
            }
        }
        _ => Err(StatusCode::UNAUTHORIZED),
    }
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
    let api_routes = Router::new()
        .merge(routes::api_routes())
        .merge(streaming::stream_routes())
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ))
        .with_state(state);

    // Serve mobile PWA static files (no auth needed — the app itself is public,
    // only API endpoints require authentication)
    let app = if let Some(dist_path) = mobile_dist_path.filter(|p| p.exists()) {
        let index_html = dist_path.join("index.html");
        eprintln!("[companion] Serving mobile PWA from {:?}", dist_path);
        let index_routes = Router::new()
            .route("/", get(serve_index_with_url))
            .route("/index.html", get(serve_index_with_url))
            .layer(Extension(index_html));
        index_routes
            .merge(api_routes)
            .fallback_service(ServeDir::new(&dist_path).fallback(ServeFile::new(&dist_path.join("index.html"))))
            .layer(cors)
    } else {
        eprintln!("[companion] No mobile PWA dist found, API-only mode");
        api_routes.layer(cors)
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
