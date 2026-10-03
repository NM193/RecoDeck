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

#[derive(Debug, Clone, PartialEq)]
pub struct TokenSet {
    pub access_token: String,
    /// Seconds.
    pub expires_in: i64,
    /// Present on a login. On a refresh only when Spotify rotates it — then
    /// the new one replaces the stored one.
    pub refresh_token: Option<String>,
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
}
