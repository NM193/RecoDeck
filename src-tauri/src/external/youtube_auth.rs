// src-tauri/src/external/youtube_auth.rs
//! Signing in to Google for the YouTube Music section.
//!
//! Authorization Code with PKCE, on a loopback port the OS picks: Google
//! accepts any loopback port for a Desktop client, so no redirect URI is
//! registered. Google also wants the client's secret in the exchange; its own
//! docs say a Desktop client's secret is not confidential. Spotify's listener
//! (`spotify_auth`) serves the redirect.

use crate::external::youtube_music::{api_error, YtmError};
use serde_json::Value;
use std::time::Duration;

pub const AUTHORIZE_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
pub const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
/// `openid email` for the address Settings shows; YouTube, read-only, for the rest.
pub const SCOPES: &str = "openid email https://www.googleapis.com/auth/youtube.readonly";
/// What the sign-in messages call it.
pub const SERVICE: &str = "YouTube Music";

pub const NOT_A_CLIENT_FILE: &str =
    "This is not a Google OAuth client file — download the JSON of a Desktop app client";
const WEB_CLIENT: &str =
    "This file is for a Web application client — create an OAuth client of type Desktop app and choose its JSON";

/// The two values RecoDeck keeps from the client file. The file itself is not kept.
#[derive(Clone, PartialEq)]
pub struct ClientFile {
    pub client_id: String,
    pub client_secret: String,
}

/// The secret never reaches a log or an error message.
impl std::fmt::Debug for ClientFile {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ClientFile")
            .field("client_id", &self.client_id)
            .field("client_secret", &"[redacted]")
            .finish()
    }
}

/// The JSON Google Cloud downloads for an OAuth client. A Desktop client keeps
/// its values under `installed`; a Web client under `web`, which this flow
/// cannot use (it would need a registered redirect URI).
pub fn parse_client_file(raw: &str) -> Result<ClientFile, String> {
    let value: Value = serde_json::from_str(raw).map_err(|_| NOT_A_CLIENT_FILE.to_string())?;
    if let Some(installed) = value.get("installed") {
        let field = |key: &str| {
            installed
                .get(key)
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .map(str::to_string)
        };
        return match (field("client_id"), field("client_secret")) {
            (Some(client_id), Some(client_secret)) => Ok(ClientFile { client_id, client_secret }),
            _ => Err(NOT_A_CLIENT_FILE.to_string()),
        };
    }
    if value.get("web").is_some() {
        return Err(WEB_CLIENT.to_string());
    }
    Err(NOT_A_CLIENT_FILE.to_string())
}

/// The redirect for a listener on `port`. It must be sent, the same, to the
/// authorize URL and to the token exchange.
pub fn redirect_uri(port: u16) -> String {
    format!("http://127.0.0.1:{port}/callback")
}

/// `access_type=offline` and `prompt=consent` make Google issue a refresh
/// token, every time.
pub fn authorize_url(client_id: &str, redirect_uri: &str, challenge: &str, state: &str) -> String {
    format!(
        "{AUTHORIZE_URL}?response_type=code&client_id={}&redirect_uri={}&scope={}&code_challenge_method=S256&code_challenge={}&state={}&access_type=offline&prompt=consent",
        urlencoding::encode(client_id),
        urlencoding::encode(redirect_uri),
        urlencoding::encode(SCOPES),
        urlencoding::encode(challenge),
        urlencoding::encode(state),
    )
}

#[derive(Clone, PartialEq)]
pub struct GoogleTokens {
    pub access_token: String,
    /// Seconds.
    pub expires_in: i64,
    /// Present on a login. Google seldom sends a new one on a refresh; when it
    /// does, it replaces the stored one.
    pub refresh_token: Option<String>,
    /// Present on a login (scope `openid`): who signed in.
    pub id_token: Option<String>,
}

/// Tokens never reach a log or an error message.
impl std::fmt::Debug for GoogleTokens {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("GoogleTokens")
            .field("access_token", &"[redacted]")
            .field("expires_in", &self.expires_in)
            .field("refresh_token", &self.refresh_token.as_ref().map(|_| "[redacted]"))
            .field("id_token", &self.id_token.as_ref().map(|_| "[redacted]"))
            .finish()
    }
}

/// The token endpoint's answer. `invalid_grant` — revoked, or the 7 days of a
/// Testing app ran out — means signing in again. `invalid_client` (the client
/// deleted) comes back as an API error with that reason.
pub fn parse_token_response(status: u16, body: &str) -> Result<GoogleTokens, YtmError> {
    if !(200..300).contains(&status) {
        let flat = serde_json::from_str::<Value>(body)
            .ok()
            .and_then(|v| v.get("error").and_then(Value::as_str).map(str::to_string));
        if flat.as_deref() == Some("invalid_grant") {
            return Err(YtmError::Reconnect);
        }
        return Err(api_error(status, body));
    }

    let value: Value = serde_json::from_str(body)
        .map_err(|e| YtmError::Network(format!("Google sent an unreadable token response: {e}")))?;
    let text = |key: &str| value.get(key).and_then(Value::as_str).map(str::to_string);
    let access_token = text("access_token")
        .ok_or_else(|| YtmError::Network("Google sent no access token".to_string()))?;
    Ok(GoogleTokens {
        access_token,
        expires_in: value.get("expires_in").and_then(Value::as_i64).unwrap_or(3600),
        refresh_token: text("refresh_token"),
        id_token: text("id_token"),
    })
}

/// Whether a token error says Google does not know this OAuth client.
pub fn is_invalid_client(err: &YtmError) -> bool {
    matches!(err, YtmError::Api { reason: Some(reason), .. } if reason == "invalid_client")
}

async fn post_token(form: &[(&str, &str)]) -> Result<GoogleTokens, YtmError> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| YtmError::Network(format!("Could not build HTTP client: {e}")))?;
    let response = client
        .post(TOKEN_URL)
        .form(form)
        .send()
        .await
        .map_err(|e| YtmError::Network(format!("Could not reach Google: {e}")))?;
    let status = response.status().as_u16();
    let body = response
        .text()
        .await
        .map_err(|e| YtmError::Network(format!("Could not read Google's answer: {e}")))?;
    parse_token_response(status, &body)
}

pub async fn exchange_code(
    client: &ClientFile,
    code: &str,
    verifier: &str,
    redirect_uri: &str,
) -> Result<GoogleTokens, YtmError> {
    post_token(&[
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("client_id", client.client_id.as_str()),
        ("client_secret", client.client_secret.as_str()),
        ("code_verifier", verifier),
    ])
    .await
}

pub async fn refresh(client: &ClientFile, refresh_token: &str) -> Result<GoogleTokens, YtmError> {
    post_token(&[
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("client_id", client.client_id.as_str()),
        ("client_secret", client.client_secret.as_str()),
    ])
    .await
}

/// base64url, as a JWT writes its parts (no padding; a trailing `=` is
/// tolerated). None for any other character.
pub fn base64url_decode(text: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(text.len() * 3 / 4);
    let mut bits: u32 = 0;
    let mut count = 0;
    for c in text.bytes() {
        let value = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'-' => 62,
            b'_' => 63,
            b'=' => break,
            _ => return None,
        };
        bits = (bits << 6) | u32::from(value);
        count += 6;
        if count >= 8 {
            count -= 8;
            out.push((bits >> count) as u8);
            bits &= (1 << count) - 1;
        }
    }
    Some(out)
}

/// The address an `id_token` was issued for. Only shown in Settings, so the
/// signature is not checked: the token came straight from Google over TLS.
pub fn email_from_id_token(id_token: &str) -> Option<String> {
    let payload = id_token.split('.').nth(1)?;
    let claims: Value = serde_json::from_slice(&base64url_decode(payload)?).ok()?;
    claims
        .get("email")
        .and_then(Value::as_str)
        .filter(|email| !email.is_empty())
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::external::spotify_auth::base64url;

    const DESKTOP: &str = r#"{"installed":{"client_id":"123-abc.apps.googleusercontent.com","project_id":"recodeck","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","client_secret":"GOCSPX-secret","redirect_uris":["http://localhost"]}}"#;

    #[test]
    fn reads_a_desktop_client_file() {
        assert_eq!(
            parse_client_file(DESKTOP),
            Ok(ClientFile {
                client_id: "123-abc.apps.googleusercontent.com".into(),
                client_secret: "GOCSPX-secret".into(),
            })
        );
    }

    #[test]
    fn a_web_client_file_is_turned_away_in_one_line() {
        let web = r#"{"web":{"client_id":"w.apps.googleusercontent.com","client_secret":"s","redirect_uris":["https://example.com"]}}"#;
        let err = parse_client_file(web).unwrap_err();
        assert!(err.contains("Desktop app"), "{err}");
        assert!(!err.contains('\n'));
    }

    #[test]
    fn anything_else_is_not_a_client_file() {
        for raw in ["", "not json", "{}", "[1,2]", r#"{"installed":{"client_id":"x"}}"#, r#"{"installed":{"client_id":"","client_secret":"s"}}"#] {
            assert_eq!(parse_client_file(raw), Err(NOT_A_CLIENT_FILE.to_string()), "{raw}");
        }
    }

    #[test]
    fn the_client_secret_is_redacted_when_printed() {
        let printed = format!("{:?}", parse_client_file(DESKTOP).unwrap());
        assert!(!printed.contains("GOCSPX"), "{printed}");
        assert!(printed.contains("123-abc"));
    }

    #[test]
    fn the_authorize_url_asks_for_offline_access_on_the_loopback_port() {
        let url = authorize_url("cid", &redirect_uri(53682), "CH", "ST");
        assert!(url.starts_with("https://accounts.google.com/o/oauth2/v2/auth?"), "{url}");
        for part in [
            "response_type=code",
            "client_id=cid",
            "redirect_uri=http%3A%2F%2F127.0.0.1%3A53682%2Fcallback",
            "scope=openid%20email%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fyoutube.readonly",
            "code_challenge_method=S256",
            "code_challenge=CH",
            "state=ST",
            "access_type=offline",
            "prompt=consent",
        ] {
            assert!(url.contains(part), "{url} lacks {part}");
        }
    }

    #[test]
    fn reads_a_token_response_with_its_id_token() {
        let body = r#"{"access_token":"AT","expires_in":3599,"refresh_token":"RT","scope":"x","token_type":"Bearer","id_token":"h.p.s"}"#;
        assert_eq!(
            parse_token_response(200, body),
            Ok(GoogleTokens {
                access_token: "AT".into(),
                expires_in: 3599,
                refresh_token: Some("RT".into()),
                id_token: Some("h.p.s".into()),
            })
        );
    }

    #[test]
    fn a_refresh_without_a_new_refresh_token_keeps_the_old_one() {
        let body = r#"{"access_token":"AT2","expires_in":3599,"token_type":"Bearer"}"#;
        assert_eq!(parse_token_response(200, body).unwrap().refresh_token, None);
    }

    #[test]
    fn a_revoked_or_expired_refresh_token_means_signing_in_again() {
        // Revoked at myaccount.google.com, or the 7 days of a Testing app ran out.
        let body = r#"{"error":"invalid_grant","error_description":"Token has been expired or revoked."}"#;
        assert_eq!(parse_token_response(400, body), Err(YtmError::Reconnect));
    }

    #[test]
    fn an_unknown_client_is_told_apart() {
        let body = r#"{"error":"invalid_client","error_description":"The OAuth client was not found."}"#;
        let err = parse_token_response(401, body).unwrap_err();
        assert!(is_invalid_client(&err));
        assert!(!is_invalid_client(&YtmError::Reconnect));
        let other = parse_token_response(400, r#"{"error":"invalid_request"}"#).unwrap_err();
        assert!(!is_invalid_client(&other));
    }

    #[test]
    fn base64url_decodes_what_spotify_auth_encodes() {
        for input in ["", "f", "fo", "foo", "foob", "fooba", "foobar", "{\"email\":\"a@b.c\"}"] {
            assert_eq!(base64url_decode(&base64url(input.as_bytes())).as_deref(), Some(input.as_bytes()), "{input}");
        }
        assert_eq!(base64url_decode("-_8"), Some(vec![0xfb, 0xff]));
        assert_eq!(base64url_decode("Zm9v="), Some(b"foo".to_vec()), "padding is tolerated");
        assert_eq!(base64url_decode("ab$c"), None);
    }

    #[test]
    fn the_email_comes_from_the_id_token() {
        let claims = base64url(br#"{"iss":"https://accounts.google.com","email":"dj@example.com","email_verified":true}"#);
        let token = format!("eyJhbGciOiJSUzI1NiJ9.{claims}.c2ln");
        assert_eq!(email_from_id_token(&token).as_deref(), Some("dj@example.com"));
        assert_eq!(email_from_id_token("not-a-jwt"), None);
        let no_email = base64url(br#"{"sub":"1"}"#);
        assert_eq!(email_from_id_token(&format!("h.{no_email}.s")), None);
    }

    #[test]
    fn tokens_are_redacted_when_printed() {
        let tokens = GoogleTokens {
            access_token: "AT-secret".into(),
            expires_in: 3599,
            refresh_token: Some("RT-secret".into()),
            id_token: Some("ID-secret".into()),
        };
        let printed = format!("{tokens:?}");
        assert!(!printed.contains("secret"), "{printed}");
        assert!(printed.contains("3599"));
    }
}
