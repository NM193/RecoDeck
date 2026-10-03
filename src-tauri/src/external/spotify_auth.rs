// src-tauri/src/external/spotify_auth.rs
//! Signing in to Spotify: Authorization Code with PKCE. No client secret
//! exists anywhere — the user's own Client ID plus a one-off verifier stand in
//! for it, which is what lets a desktop app hold no secret.

use crate::external::spotify::{api_error, SpotifyError};
use rand::{distributions::Alphanumeric, Rng};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::time::Duration;
use axum::{
    extract::{Query, State},
    response::Html,
    routing::get,
    Router,
};
use std::sync::{Arc, Mutex};
use tokio::net::TcpListener;
use tokio::sync::oneshot;

pub const AUTHORIZE_URL: &str = "https://accounts.spotify.com/authorize";
pub const TOKEN_URL: &str = "https://accounts.spotify.com/api/token";
/// Fixed, so the instructions can name one URI to register. Loopback must be
/// an explicit IP: Spotify refuses `localhost`.
pub const REDIRECT_PORT: u16 = 47816;
pub const REDIRECT_URI: &str = "http://127.0.0.1:47816/callback";
pub const SCOPES: &str = "user-library-read playlist-read-private playlist-read-collaborative user-read-playback-state user-modify-playback-state";

/// RFC 4648 base64url without padding — what PKCE's S256 challenge is written in.
pub fn base64url(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        // 1 byte → 2 characters, 2 → 3, 3 → 4.
        for i in 0..=chunk.len() {
            out.push(ALPHABET[((n >> (18 - 6 * i)) & 63) as usize] as char);
        }
    }
    out
}

/// Letters and digits — inside PKCE's allowed set, and safe in a URL.
pub fn random_string(len: usize) -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(len)
        .map(char::from)
        .collect()
}

pub fn code_challenge(verifier: &str) -> String {
    base64url(&Sha256::digest(verifier.as_bytes()))
}

pub fn authorize_url(client_id: &str, challenge: &str, state: &str) -> String {
    format!(
        "{AUTHORIZE_URL}?response_type=code&client_id={}&scope={}&redirect_uri={}&code_challenge_method=S256&code_challenge={}&state={}",
        urlencoding::encode(client_id),
        urlencoding::encode(SCOPES),
        urlencoding::encode(REDIRECT_URI),
        urlencoding::encode(challenge),
        urlencoding::encode(state),
    )
}

#[derive(Clone, PartialEq)]
pub struct TokenSet {
    pub access_token: String,
    /// Seconds.
    pub expires_in: i64,
    /// Present on a login. On a refresh only when Spotify rotates it — then
    /// the new one replaces the stored one.
    pub refresh_token: Option<String>,
}

/// Tokens never reach a log or an error message.
impl std::fmt::Debug for TokenSet {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TokenSet")
            .field("access_token", &"[redacted]")
            .field("expires_in", &self.expires_in)
            .field("refresh_token", &self.refresh_token.as_ref().map(|_| "[redacted]"))
            .finish()
    }
}

/// The token endpoint's answer. `invalid_grant` on a refresh means the
/// refresh token was revoked or expired: the user has to sign in again.
pub fn parse_token_response(status: u16, body: &str) -> Result<TokenSet, SpotifyError> {
    if !(200..300).contains(&status) {
        let flat = serde_json::from_str::<Value>(body)
            .ok()
            .and_then(|v| v.get("error").and_then(Value::as_str).map(str::to_string));
        if flat.as_deref() == Some("invalid_grant") {
            return Err(SpotifyError::Reconnect);
        }
        return Err(api_error(status, body));
    }

    let value: Value = serde_json::from_str(body).map_err(|e| {
        SpotifyError::Network(format!("Spotify sent an unreadable token response: {e}"))
    })?;
    let access_token = value
        .get("access_token")
        .and_then(Value::as_str)
        .ok_or_else(|| SpotifyError::Network("Spotify sent no access token".to_string()))?
        .to_string();
    Ok(TokenSet {
        access_token,
        expires_in: value.get("expires_in").and_then(Value::as_i64).unwrap_or(3600),
        refresh_token: value.get("refresh_token").and_then(Value::as_str).map(str::to_string),
    })
}

async fn post_token(form: &[(&str, &str)]) -> Result<TokenSet, SpotifyError> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| SpotifyError::Network(format!("Could not build HTTP client: {e}")))?;
    let response = client
        .post(TOKEN_URL)
        .form(form)
        .send()
        .await
        .map_err(|e| SpotifyError::Network(format!("Could not reach Spotify: {e}")))?;
    let status = response.status().as_u16();
    let body = response
        .text()
        .await
        .map_err(|e| SpotifyError::Network(format!("Could not read Spotify's answer: {e}")))?;
    parse_token_response(status, &body)
}

pub async fn exchange_code(client_id: &str, code: &str, verifier: &str) -> Result<TokenSet, SpotifyError> {
    post_token(&[
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", REDIRECT_URI),
        ("client_id", client_id),
        ("code_verifier", verifier),
    ])
    .await
}

pub async fn refresh(client_id: &str, refresh_token: &str) -> Result<TokenSet, SpotifyError> {
    post_token(&[
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("client_id", client_id),
    ])
    .await
}

/// The code the browser brought back, if it belongs to this login.
pub fn code_from_callback(params: &HashMap<String, String>, expected_state: &str) -> Result<String, String> {
    if params.get("state").map(String::as_str) != Some(expected_state) {
        return Err("The sign-in answer did not match this login — press Connect to try again".to_string());
    }
    if let Some(error) = params.get("error") {
        return Err(if error == "access_denied" {
            "Spotify sign-in was cancelled".to_string()
        } else {
            format!("Spotify refused the sign-in: {error}")
        });
    }
    params
        .get("code")
        .filter(|code| !code.is_empty())
        .cloned()
        .ok_or_else(|| "Spotify sent no sign-in code — press Connect to try again".to_string())
}

// --- the loopback redirect --------------------------------------------

/// How long a login waits for the browser.
pub const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);

/// Shown for every answer — a refused or mismatched login too, and before the
/// code is exchanged — so it claims nothing; RecoDeck says how it went.
const CLOSE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>RecoDeck</title>\
<body style=\"font-family:-apple-system,sans-serif;background:#121212;color:#fff;\
display:grid;place-items:center;height:100vh;margin:0\">\
<p>You can close this tab and go back to RecoDeck.</p>";

type Reply = Arc<Mutex<Option<oneshot::Sender<HashMap<String, String>>>>>;

/// Binds the redirect port, or says in one line why it cannot.
pub async fn bind_listener(port: u16) -> Result<TcpListener, String> {
    TcpListener::bind(("127.0.0.1", port)).await.map_err(|_| {
        format!(
            "Port {port} is in use by another app, so Spotify cannot hand the login back — close that app and press Connect again"
        )
    })
}

async fn callback(
    State(reply): State<Reply>,
    Query(params): Query<HashMap<String, String>>,
) -> Html<&'static str> {
    if let Some(sender) = reply.lock().ok().and_then(|mut slot| slot.take()) {
        let _ = sender.send(params);
    }
    Html(CLOSE_PAGE)
}

/// Serves one redirect on `listener`, then stops listening. Answers with the
/// query parameters Spotify sent back.
pub async fn wait_for_callback(
    listener: TcpListener,
    timeout: Duration,
) -> Result<HashMap<String, String>, String> {
    let (sender, receiver) = oneshot::channel();
    let reply: Reply = Arc::new(Mutex::new(Some(sender)));
    let (stop, stopped) = oneshot::channel::<()>();

    let app = Router::new().route("/callback", get(callback)).with_state(reply);
    let mut server = tokio::spawn(async move {
        let _ = axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = stopped.await;
            })
            .await;
    });

    let answer = tokio::time::timeout(timeout, receiver).await;

    let _ = stop.send(());
    // Let the page reach the browser and the port close, but never hang on
    // it: a browser holding a keep-alive connection open is cut off.
    if tokio::time::timeout(Duration::from_secs(2), &mut server).await.is_err() {
        server.abort();
    }

    match answer {
        Ok(Ok(params)) => Ok(params),
        Ok(Err(_)) => Err("The sign-in listener stopped unexpectedly — press Connect to try again".to_string()),
        Err(_) => Err("No answer from the browser — press Connect to try again".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64url_follows_rfc_4648_without_padding() {
        let cases = [
            ("", ""),
            ("f", "Zg"),
            ("fo", "Zm8"),
            ("foo", "Zm9v"),
            ("foob", "Zm9vYg"),
            ("fooba", "Zm9vYmE"),
            ("foobar", "Zm9vYmFy"),
        ];
        for (input, expected) in cases {
            assert_eq!(base64url(input.as_bytes()), expected, "for {input:?}");
        }
        // The URL-safe alphabet: 62 and 63 are '-' and '_'.
        assert_eq!(base64url(&[0xfb, 0xff]), "-_8");
    }

    #[test]
    fn the_challenge_matches_rfc_7636_appendix_b() {
        assert_eq!(
            code_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn a_verifier_is_long_enough_and_uses_only_allowed_characters() {
        let verifier = random_string(64);
        assert_eq!(verifier.len(), 64);
        assert!(verifier.chars().all(|c| c.is_ascii_alphanumeric()));
        assert_ne!(verifier, random_string(64));
    }

    #[test]
    fn the_authorize_url_carries_everything_spotify_asks_for() {
        let url = authorize_url("abc123", "CH", "ST");
        assert!(url.starts_with("https://accounts.spotify.com/authorize?"));
        for part in [
            "response_type=code",
            "client_id=abc123",
            "redirect_uri=http%3A%2F%2F127.0.0.1%3A47816%2Fcallback",
            "code_challenge_method=S256",
            "code_challenge=CH",
            "state=ST",
            "scope=user-library-read%20playlist-read-private%20playlist-read-collaborative%20user-read-playback-state%20user-modify-playback-state",
        ] {
            assert!(url.contains(part), "{url} lacks {part}");
        }
    }

    #[test]
    fn reads_a_token_response() {
        let body = r#"{"access_token":"AT","token_type":"Bearer","scope":"x","expires_in":3600,"refresh_token":"RT"}"#;
        assert_eq!(
            parse_token_response(200, body),
            Ok(TokenSet { access_token: "AT".into(), expires_in: 3600, refresh_token: Some("RT".into()) })
        );
    }

    #[test]
    fn a_refresh_without_a_new_refresh_token_keeps_the_old_one() {
        let body = r#"{"access_token":"AT2","token_type":"Bearer","expires_in":3600}"#;
        assert_eq!(parse_token_response(200, body).unwrap().refresh_token, None);
    }

    #[test]
    fn a_revoked_refresh_token_means_signing_in_again() {
        let body = r#"{"error":"invalid_grant","error_description":"Refresh token revoked"}"#;
        assert_eq!(parse_token_response(400, body), Err(SpotifyError::Reconnect));
    }

    #[test]
    fn other_token_errors_are_reported_as_spotify_said_them() {
        let body = r#"{"error":"invalid_client","error_description":"Invalid client"}"#;
        assert_eq!(
            parse_token_response(400, body),
            Err(SpotifyError::Api { status: 400, message: "Invalid client".into(), reason: None })
        );
    }

    fn params(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn the_code_comes_back_with_this_logins_state() {
        assert_eq!(code_from_callback(&params(&[("code", "C"), ("state", "S")]), "S"), Ok("C".into()));
    }

    #[test]
    fn an_answer_for_another_login_is_refused() {
        let err = code_from_callback(&params(&[("code", "C"), ("state", "X")]), "S").unwrap_err();
        assert!(err.contains("did not match"));
    }

    #[test]
    fn a_cancelled_sign_in_says_so() {
        assert_eq!(
            code_from_callback(&params(&[("error", "access_denied"), ("state", "S")]), "S"),
            Err("Spotify sign-in was cancelled".into())
        );
    }

    #[test]
    fn no_code_is_an_error() {
        assert!(code_from_callback(&params(&[("state", "S")]), "S").is_err());
    }

    use tokio::net::TcpListener;

    #[tokio::test]
    async fn the_listener_hands_back_what_the_browser_brought() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let waiting = tokio::spawn(wait_for_callback(listener, Duration::from_secs(5)));

        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        let page = client
            .get(format!("http://127.0.0.1:{port}/callback?code=C&state=S"))
            .send()
            .await
            .unwrap();
        assert_eq!(page.status().as_u16(), 200);
        assert!(page.text().await.unwrap().contains("close this tab"));

        let params = waiting.await.unwrap().unwrap();
        assert_eq!(params.get("code").map(String::as_str), Some("C"));
        assert_eq!(params.get("state").map(String::as_str), Some("S"));
    }

    #[tokio::test]
    async fn a_favicon_request_does_not_use_up_the_reply() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let waiting = tokio::spawn(wait_for_callback(listener, Duration::from_secs(5)));

        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        let icon = client.get(format!("http://127.0.0.1:{port}/favicon.ico")).send().await.unwrap();
        assert_eq!(icon.status().as_u16(), 404);
        assert!(!waiting.is_finished());

        client
            .get(format!("http://127.0.0.1:{port}/callback?code=C&state=S"))
            .send()
            .await
            .unwrap();
        let params = waiting.await.unwrap().unwrap();
        assert_eq!(params.get("code").map(String::as_str), Some("C"));
    }

    #[tokio::test]
    async fn the_port_is_free_again_once_the_login_is_over() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let waiting = tokio::spawn(wait_for_callback(listener, Duration::from_secs(5)));

        // A client that keeps its connection open, as a browser does.
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        client
            .get(format!("http://127.0.0.1:{port}/callback?code=C&state=S"))
            .send()
            .await
            .unwrap();
        waiting.await.unwrap().unwrap();

        assert!(bind_listener(port).await.is_ok());
    }

    #[test]
    fn tokens_are_redacted_when_printed() {
        let tokens = TokenSet { access_token: "AT-secret".into(), expires_in: 3600, refresh_token: Some("RT-secret".into()) };
        let printed = format!("{tokens:?}");
        assert!(!printed.contains("secret"), "{printed}");
        assert!(printed.contains("3600"));
    }

    #[tokio::test]
    async fn the_listener_gives_up_after_the_timeout() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let err = wait_for_callback(listener, Duration::from_millis(50)).await.unwrap_err();
        assert!(err.contains("No answer"));
    }

    #[tokio::test]
    async fn a_taken_port_is_said_in_one_line() {
        let holder = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = holder.local_addr().unwrap().port();
        let err = bind_listener(port).await.unwrap_err();
        assert!(err.contains(&port.to_string()));
        assert!(!err.contains('\n'));
    }
}
