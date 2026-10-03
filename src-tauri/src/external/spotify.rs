// src-tauri/src/external/spotify.rs
//! Spotify Web API: paging, parsing, and the rule that keeps a sync cheap —
//! read Liked Songs newest-first and stop at the first track already known.
//!
//! The network sits behind `SpotifyApi` (Task 9) so the sync can be tested on
//! hand-written JSON. Captured responses contain someone's library and are
//! never committed — the same rule as the YouTube fixtures.
//!
//! Since February 2026 a playlist's contents are `GET /playlists/{id}/items`,
//! each item carries its track under `item` (`track` is a deprecated alias),
//! and a playlist's count is `items.total` (formerly `tracks.total`). Both
//! spellings are read.

use crate::db::spotify::{LikedChange, ListEntry, PlaylistMeta, SpotifyTrack, SyncBaseline, SyncChanges};
use serde_json::Value;
use std::collections::HashMap;
use std::future::Future;
use std::time::Duration;

pub const API_BASE: &str = "https://api.spotify.com/v1";
/// Spotify's largest page on every endpoint used here.
pub const PAGE_LIMIT: u32 = 50;

#[derive(Debug, Clone, PartialEq)]
pub enum SpotifyError {
    /// No account connected.
    NotConnected,
    /// The refresh token was revoked or expired (`invalid_grant`): sign in again.
    Reconnect,
    /// Spotify could not be reached, or answered with something unreadable.
    Network(String),
    /// Spotify answered with an error status.
    Api { status: u16, message: String, reason: Option<String> },
    /// A 429 whose Retry-After is longer than a sync waits.
    RateLimited { retry_after_secs: u64 },
}

impl std::fmt::Display for SpotifyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotConnected => write!(f, "Spotify is not connected"),
            Self::Reconnect => write!(f, "Spotify needs you to sign in again"),
            Self::Network(message) => write!(f, "{message}"),
            // A body that was not Spotify's JSON leaves only the status.
            Self::Api { status, message, .. } if *message == generic_api_message(*status) => {
                write!(f, "{message}")
            }
            Self::Api { status, message, .. } => write!(f, "Spotify answered {status}: {message}"),
            Self::RateLimited { retry_after_secs } => write!(
                f,
                "Spotify asked to wait {retry_after_secs} s before more requests — the next sync will try again"
            ),
        }
    }
}

impl std::error::Error for SpotifyError {}

fn generic_api_message(status: u16) -> String {
    format!("Spotify answered {status}")
}

/// The most pages one listing is read to: 50,000 tracks or playlists.
pub const MAX_PAGES: usize = 1_000;

/// The next page to read, after `pages_read` pages. Only a URL on the Web API
/// is followed (the token goes with every request), and a listing that never
/// ends is an error rather than a hang.
fn next_page(next: Option<String>, pages_read: usize) -> Result<Option<String>, SpotifyError> {
    let Some(next) = next else { return Ok(None) };
    if !next.starts_with(&format!("{API_BASE}/")) {
        return Err(SpotifyError::Network(
            "Spotify pointed the next page somewhere other than its Web API".to_string(),
        ));
    }
    if pages_read >= MAX_PAGES {
        return Err(SpotifyError::Network(format!(
            "A Spotify listing ran past {MAX_PAGES} pages"
        )));
    }
    Ok(Some(next))
}

pub fn liked_url() -> String {
    format!("{API_BASE}/me/tracks?limit={PAGE_LIMIT}")
}

pub fn playlists_url() -> String {
    format!("{API_BASE}/me/playlists?limit={PAGE_LIMIT}")
}

pub fn playlist_items_url(playlist_id: &str) -> String {
    format!("{API_BASE}/playlists/{playlist_id}/items?limit={PAGE_LIMIT}&additional_types=track")
}

/// One page of a paging object.
#[derive(Debug, Clone, PartialEq)]
pub struct Page<T> {
    pub items: Vec<T>,
    /// The URL of the next page, exactly as Spotify gives it.
    pub next: Option<String>,
    /// What Spotify says the whole list holds.
    pub total: i64,
}

fn text(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_string)
}

fn page_of<T>(page: &Value, parse: impl Fn(&Value) -> Option<T>) -> Page<T> {
    Page {
        items: page
            .get("items")
            .and_then(Value::as_array)
            .map(|items| items.iter().filter_map(&parse).collect())
            .unwrap_or_default(),
        next: text(page, "next"),
        total: page.get("total").and_then(Value::as_i64).unwrap_or(0),
    }
}

/// An entry of Liked Songs or of a playlist, or None for what this section
/// skips: podcast episodes, local files (no Spotify id), and removed tracks
/// (null).
pub fn parse_entry(item: &Value) -> Option<ListEntry> {
    let track = item
        .get("item")
        .filter(|v| v.is_object())
        .or_else(|| item.get("track").filter(|v| v.is_object()))?;

    let local = |v: &Value| v.get("is_local").and_then(Value::as_bool).unwrap_or(false);
    if local(item) || local(track) {
        return None;
    }
    if track.get("type").and_then(Value::as_str).unwrap_or("track") != "track" {
        return None;
    }
    let id = track.get("id").and_then(Value::as_str).filter(|id| !id.is_empty())?;

    let artists = track
        .get("artists")
        .and_then(Value::as_array)
        .map(|artists| {
            artists
                .iter()
                .filter_map(|a| a.get("name").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_default();

    Some(ListEntry {
        track: SpotifyTrack {
            spotify_id: id.to_string(),
            title: text(track, "name").unwrap_or_default(),
            artists,
            album: track.pointer("/album/name").and_then(Value::as_str).map(str::to_string),
            duration_ms: track.get("duration_ms").and_then(Value::as_i64),
        },
        added_at: text(item, "added_at"),
    })
}

pub fn parse_entry_page(page: &Value) -> Page<ListEntry> {
    page_of(page, parse_entry)
}

fn parse_playlist(item: &Value) -> Option<PlaylistMeta> {
    let total = item
        .pointer("/items/total")
        .or_else(|| item.pointer("/tracks/total"))
        .and_then(Value::as_i64)
        .unwrap_or(0);
    Some(PlaylistMeta {
        id: text(item, "id")?,
        name: text(item, "name").unwrap_or_default(),
        snapshot_id: text(item, "snapshot_id")?,
        total,
    })
}

pub fn parse_playlist_page(page: &Value) -> Page<PlaylistMeta> {
    page_of(page, parse_playlist)
}

/// Spotify's error body, `{"error":{"status":404,"message":"…","reason":"…"}}`,
/// or the accounts service's flat OAuth one, `{"error":"…","error_description":"…"}`.
pub fn api_error(status: u16, body: &str) -> SpotifyError {
    let parsed: Option<Value> = serde_json::from_str(body).ok();
    let nested = parsed.as_ref().and_then(|v| v.get("error")).filter(|e| e.is_object());
    let message = nested
        .and_then(|e| e.get("message"))
        .or_else(|| parsed.as_ref().and_then(|v| v.get("error_description")))
        .and_then(Value::as_str)
        .map(str::to_string)
        // Not Spotify's JSON (a proxy's HTML page, say): the body is not shown.
        .unwrap_or_else(|| generic_api_message(status));
    let reason = nested.and_then(|e| text(e, "reason"));
    SpotifyError::Api { status, message, reason }
}

/// A playlist Spotify will not share: 403 for playlists the user neither owns
/// nor collaborates on (development-mode apps, since February 2026), 404 for
/// editorial and algorithmic ones (since November 2024).
pub fn is_refusal(err: &SpotifyError) -> bool {
    matches!(err, SpotifyError::Api { status: 403 | 404, .. })
}

/// Whether a failed play should open the track in the Spotify app instead.
///
/// The reasons are documented by name; their statuses (404 for no active
/// device, 403 for no Premium) only by the community, so a bare 403 / 404
/// counts too. With no working sign-in, the app can still play it.
pub fn should_open_app(err: &SpotifyError) -> bool {
    match err {
        SpotifyError::Api { reason: Some(reason), .. }
            if reason == "NO_ACTIVE_DEVICE" || reason == "PREMIUM_REQUIRED" =>
        {
            true
        }
        SpotifyError::Api { status: 403 | 404, .. } => true,
        SpotifyError::NotConnected | SpotifyError::Reconnect => true,
        _ => false,
    }
}

/// Seconds from a Retry-After header. Spotify sends whole seconds.
pub fn retry_after_secs(header: Option<&str>) -> u64 {
    header.and_then(|v| v.trim().parse().ok()).unwrap_or(1)
}

/// The name Settings shows: `display_name`, which may be null, else the id.
pub fn profile_name(me: &Value) -> String {
    text(me, "display_name")
        .filter(|name| !name.trim().is_empty())
        .or_else(|| text(me, "id"))
        .unwrap_or_else(|| "your Spotify account".to_string())
}

// --- what a sync fetches ----------------------------------------------

/// One GET against the Web API, answering with the JSON body. The live client
/// adds the token and waits out 429s; tests replay hand-written pages.
pub trait SpotifyApi {
    fn get_json(&self, url: &str) -> impl Future<Output = Result<Value, SpotifyError>> + Send;
}

/// Every page from `first_url` on. The total is the first page's.
async fn fetch_all<A: SpotifyApi + Sync>(
    api: &A,
    first_url: String,
) -> Result<(Vec<ListEntry>, i64), SpotifyError> {
    let mut entries = Vec::new();
    let mut total = None;
    let mut url = Some(first_url);
    let mut pages = 0;
    while let Some(current) = url {
        let page = parse_entry_page(&api.get_json(&current).await?);
        pages += 1;
        total.get_or_insert(page.total);
        entries.extend(page.items);
        url = next_page(page.next, pages)?;
    }
    Ok((entries, total.unwrap_or(0)))
}

async fn fetch_liked<A: SpotifyApi + Sync>(
    api: &A,
    base: &SyncBaseline,
) -> Result<LikedChange, SpotifyError> {
    let Some(stored_total) = base.liked_total else {
        let (entries, total) = fetch_all(api, liked_url()).await?;
        return Ok(LikedChange::Full { entries, total });
    };

    let mut fresh = Vec::new();
    let mut total = None;
    let mut reached_known = false;
    let mut url = Some(liked_url());
    let mut pages = 0;
    'pages: while let Some(current) = url.take() {
        let page = parse_entry_page(&api.get_json(&current).await?);
        pages += 1;
        total.get_or_insert(page.total);
        for entry in page.items {
            if base.liked_known.contains(&entry.track.spotify_id) {
                reached_known = true;
                break 'pages;
            }
            fresh.push(entry);
        }
        url = next_page(page.next, pages)?;
    }
    let total = total.unwrap_or(0);

    // Read to the end without meeting a known track: what was read is all of it.
    if !reached_known {
        return Ok(LikedChange::Full { entries: fresh, total });
    }
    if stored_total + fresh.len() as i64 == total {
        return Ok(if fresh.is_empty() {
            LikedChange::Unchanged { total }
        } else {
            LikedChange::Prepend { entries: fresh, total }
        });
    }

    // The total no longer adds up: something was unliked, which reading
    // newest-first cannot see. Read it all again.
    let (entries, total) = fetch_all(api, liked_url()).await?;
    Ok(LikedChange::Full { entries, total })
}

pub async fn fetch_changes<A: SpotifyApi + Sync>(
    api: &A,
    base: &SyncBaseline,
) -> Result<SyncChanges, SpotifyError> {
    let liked = fetch_liked(api, base).await?;

    let mut listed = Vec::new();
    let mut url = Some(playlists_url());
    let mut pages = 0;
    while let Some(current) = url {
        let page = parse_playlist_page(&api.get_json(&current).await?);
        pages += 1;
        listed.extend(page.items);
        url = next_page(page.next, pages)?;
    }

    let mut playlists = Vec::new();
    let mut refetched = HashMap::new();
    let mut refused = Vec::new();
    let mut unreadable = Vec::new();
    for meta in listed {
        if base.snapshots.get(&meta.id) == Some(&meta.snapshot_id) {
            playlists.push(meta);
            continue;
        }
        if base.refused.get(&meta.id) == Some(&meta.snapshot_id) {
            refused.push(meta);
            continue;
        }
        match fetch_all(api, playlist_items_url(&meta.id)).await {
            Ok((entries, _)) => {
                refetched.insert(meta.id.clone(), entries);
                playlists.push(meta);
            }
            Err(err) if is_refusal(&err) => refused.push(meta),
            // One broken playlist must not stop the rest: it keeps its stored
            // rows and snapshot (no refetch), so the next sync reads it again.
            Err(err) if is_skippable(&err) => {
                unreadable.push(meta.clone());
                playlists.push(meta);
            }
            Err(err) => return Err(err),
        }
    }

    Ok(SyncChanges { liked, playlists, refetched, refused, unreadable })
}

/// A playlist whose items Spotify failed to send (a lasting 5xx, a 400) is
/// skipped for this sync. A lost sign-in (401), a rate limit and a network
/// failure still fail the whole sync: every other playlist would fail too.
pub fn is_skippable(err: &SpotifyError) -> bool {
    matches!(err, SpotifyError::Api { status, .. } if *status != 401 && *status != 429)
}

// --- the live client ----------------------------------------------------

/// The longest Retry-After a sync waits out. A development-mode quota can ask
/// for hours; then this sync gives up and the next 10-minute run tries again.
pub const MAX_RETRY_WAIT_SECS: u64 = 60;
const MAX_ATTEMPTS: usize = 4;

fn http_client() -> Result<reqwest::Client, SpotifyError> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| SpotifyError::Network(format!("Could not build HTTP client: {e}")))
}

fn network(e: reqwest::Error) -> SpotifyError {
    if e.is_timeout() {
        SpotifyError::Network("Spotify did not answer in 30 seconds".to_string())
    } else {
        SpotifyError::Network(format!("Could not reach Spotify: {e}"))
    }
}

pub struct LiveApi {
    http: reqwest::Client,
    token: String,
}

impl LiveApi {
    pub fn new(token: String) -> Result<Self, SpotifyError> {
        Ok(Self { http: http_client()?, token })
    }
}

impl SpotifyApi for LiveApi {
    fn get_json(&self, url: &str) -> impl Future<Output = Result<Value, SpotifyError>> + Send {
        let url = url.to_string();
        async move {
            for attempt in 1..=MAX_ATTEMPTS {
                let response = self.http.get(&url).bearer_auth(&self.token).send().await.map_err(network)?;
                let status = response.status().as_u16();

                if status == 429 {
                    let wait = retry_after_secs(
                        response.headers().get("retry-after").and_then(|v| v.to_str().ok()),
                    );
                    // Waiting before giving up anyway would only delay the error.
                    if wait > MAX_RETRY_WAIT_SECS || attempt == MAX_ATTEMPTS {
                        return Err(SpotifyError::RateLimited { retry_after_secs: wait });
                    }
                    tokio::time::sleep(Duration::from_secs(wait)).await;
                    continue;
                }

                let body = response.text().await.map_err(network)?;
                if !(200..300).contains(&status) {
                    return Err(api_error(status, &body));
                }
                return serde_json::from_str(&body)
                    .map_err(|e| SpotifyError::Network(format!("Spotify sent unreadable JSON: {e}")));
            }
            Err(SpotifyError::RateLimited { retry_after_secs: MAX_RETRY_WAIT_SECS })
        }
    }
}

/// Plays one track on the user's active device. 204 is success.
pub async fn play_track(token: &str, spotify_id: &str) -> Result<(), SpotifyError> {
    let response = http_client()?
        .put(format!("{API_BASE}/me/player/play"))
        .bearer_auth(token)
        .json(&serde_json::json!({ "uris": [format!("spotify:track:{spotify_id}")] }))
        .send()
        .await
        .map_err(network)?;
    let status = response.status().as_u16();
    if (200..300).contains(&status) {
        return Ok(());
    }
    let body = response.text().await.unwrap_or_default();
    Err(api_error(status, &body))
}

/// Who signed in: the Spotify user id, which never changes and tells one
/// account from another, and the name Settings shows, which the user can edit.
#[derive(Debug, Clone, PartialEq)]
pub struct Profile {
    pub id: String,
    pub name: String,
}

pub fn parse_profile(me: &Value) -> Result<Profile, SpotifyError> {
    let id = text(me, "id")
        .filter(|id| !id.is_empty())
        .ok_or_else(|| SpotifyError::Network("Spotify sent no account id".to_string()))?;
    Ok(Profile { id, name: profile_name(me) })
}

/// The connected account, from `/v1/me`.
pub async fn fetch_profile(token: &str) -> Result<Profile, SpotifyError> {
    let api = LiveApi::new(token.to_string())?;
    let me = api.get_json(&format!("{API_BASE}/me")).await?;
    parse_profile(&me)
}

impl From<SpotifyError> for crate::error::AppError {
    fn from(err: SpotifyError) -> Self {
        use crate::error::AppError;
        match err {
            SpotifyError::NotConnected => AppError::SpotifyNotConnected,
            SpotifyError::Reconnect => AppError::SpotifyReconnect,
            other => AppError::Spotify(other.to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    pub(super) fn track_json(id: &str, name: &str) -> Value {
        json!({
            "id": id, "name": name, "type": "track", "is_local": false,
            "duration_ms": 412000,
            "artists": [{ "name": "Moreno & Prieto" }, { "name": "Sortech" }],
            "album": { "name": "300 Cash EP" }
        })
    }

    fn ids(entries: &[ListEntry]) -> Vec<&str> {
        entries.iter().map(|e| e.track.spotify_id.as_str()).collect()
    }

    #[test]
    fn reads_a_page_of_liked_songs() {
        let page = json!({
            "href": "https://api.spotify.com/v1/me/tracks?offset=0&limit=50",
            "limit": 50, "offset": 0, "previous": null, "total": 731,
            "next": "https://api.spotify.com/v1/me/tracks?offset=50&limit=50",
            "items": [{ "added_at": "2026-10-03T07:12:00Z", "track": track_json("sp1", "300 Cash") }]
        });
        let parsed = parse_entry_page(&page);
        assert_eq!(parsed.total, 731);
        assert_eq!(
            parsed.next.as_deref(),
            Some("https://api.spotify.com/v1/me/tracks?offset=50&limit=50")
        );
        assert_eq!(
            parsed.items,
            vec![ListEntry {
                track: SpotifyTrack {
                    spotify_id: "sp1".to_string(),
                    title: "300 Cash".to_string(),
                    artists: "Moreno & Prieto, Sortech".to_string(),
                    album: Some("300 Cash EP".to_string()),
                    duration_ms: Some(412000),
                },
                added_at: Some("2026-10-03T07:12:00Z".to_string()),
            }]
        );
    }

    #[test]
    fn reads_playlist_items_under_item_and_under_the_deprecated_track() {
        let page = json!({ "total": 2, "next": null, "items": [
            { "added_at": "2026-09-01T00:00:00Z", "is_local": false, "item": track_json("sp1", "A") },
            { "added_at": "2026-09-02T00:00:00Z", "is_local": false, "track": track_json("sp2", "B") }
        ]});
        let parsed = parse_entry_page(&page);
        assert_eq!(ids(&parsed.items), ["sp1", "sp2"]);
        assert_eq!(parsed.next, None);
    }

    #[test]
    fn skips_episodes_local_files_and_removed_tracks() {
        let page = json!({ "total": 4, "next": null, "items": [
            { "added_at": "2026-09-01T00:00:00Z", "item": { "id": "ep1", "type": "episode", "name": "A podcast" } },
            { "added_at": "2026-09-01T00:00:00Z", "is_local": true,
              "item": { "id": null, "type": "track", "name": "My own file", "is_local": true } },
            { "added_at": "2026-09-01T00:00:00Z", "item": null, "track": null },
            { "added_at": "2026-09-01T00:00:00Z", "item": track_json("sp9", "Kept") }
        ]});
        let parsed = parse_entry_page(&page);
        assert_eq!(ids(&parsed.items), ["sp9"]);
        assert_eq!(parsed.total, 4, "the total still counts what was skipped");
    }

    #[test]
    fn reads_playlists_and_their_totals_under_either_name() {
        let page = json!({ "total": 4, "next": null, "items": [
            { "id": "p1", "name": "Tech House", "snapshot_id": "s1", "items": { "href": "x", "total": 281 } },
            { "id": "p2", "name": "Old", "snapshot_id": "s2", "tracks": { "total": 12 } },
            { "id": "p3", "name": "No count", "snapshot_id": "s3" },
            { "id": "p4", "name": "No snapshot" }
        ]});
        let parsed = parse_playlist_page(&page);
        assert_eq!(
            parsed.items,
            vec![
                PlaylistMeta { id: "p1".into(), name: "Tech House".into(), snapshot_id: "s1".into(), total: 281 },
                PlaylistMeta { id: "p2".into(), name: "Old".into(), snapshot_id: "s2".into(), total: 12 },
                PlaylistMeta { id: "p3".into(), name: "No count".into(), snapshot_id: "s3".into(), total: 0 },
            ]
        );
    }

    #[test]
    fn reads_spotify_error_bodies() {
        assert_eq!(
            api_error(
                404,
                r#"{"error":{"status":404,"message":"Player command failed: No active device found","reason":"NO_ACTIVE_DEVICE"}}"#
            ),
            SpotifyError::Api {
                status: 404,
                message: "Player command failed: No active device found".to_string(),
                reason: Some("NO_ACTIVE_DEVICE".to_string()),
            }
        );
        assert_eq!(
            api_error(400, r#"{"error":"invalid_client","error_description":"Invalid client"}"#),
            SpotifyError::Api { status: 400, message: "Invalid client".to_string(), reason: None }
        );
        assert_eq!(
            api_error(502, "<html>Bad gateway</html>"),
            SpotifyError::Api { status: 502, message: "Spotify answered 502".to_string(), reason: None }
        );
        assert_eq!(api_error(502, "<html>Bad gateway</html>").to_string(), "Spotify answered 502");
    }

    fn api(status: u16, reason: Option<&str>) -> SpotifyError {
        SpotifyError::Api { status, message: String::new(), reason: reason.map(str::to_string) }
    }

    #[test]
    fn a_playlist_is_refused_with_403_or_404() {
        assert!(is_refusal(&api(403, None)));
        assert!(is_refusal(&api(404, None)));
        assert!(!is_refusal(&api(500, None)));
        assert!(!is_refusal(&SpotifyError::Network("offline".into())));
    }

    #[test]
    fn opens_the_spotify_app_when_playing_here_cannot_work() {
        assert!(should_open_app(&api(404, Some("NO_ACTIVE_DEVICE"))));
        assert!(should_open_app(&api(403, Some("PREMIUM_REQUIRED"))));
        assert!(should_open_app(&api(404, None)));
        assert!(should_open_app(&api(403, None)));
        assert!(should_open_app(&SpotifyError::NotConnected));
        assert!(should_open_app(&SpotifyError::Reconnect));
        assert!(!should_open_app(&api(500, None)));
        assert!(!should_open_app(&api(401, None)));
        assert!(!should_open_app(&SpotifyError::Network("offline".into())));
    }

    #[test]
    fn a_profile_carries_the_account_id_apart_from_the_name() {
        assert_eq!(
            parse_profile(&json!({ "id": "nmarj", "display_name": "Nemanja" })),
            Ok(Profile { id: "nmarj".into(), name: "Nemanja".into() })
        );
        assert!(parse_profile(&json!({ "display_name": "Nemanja" })).is_err());
    }

    #[test]
    fn reads_retry_after() {
        assert_eq!(retry_after_secs(Some("7")), 7);
        assert_eq!(retry_after_secs(Some(" 30 ")), 30);
        assert_eq!(retry_after_secs(Some("soon")), 1);
        assert_eq!(retry_after_secs(None), 1);
    }

    #[test]
    fn names_the_account_by_display_name_or_id() {
        assert_eq!(profile_name(&json!({ "id": "nm93", "display_name": "Nemanja" })), "Nemanja");
        assert_eq!(profile_name(&json!({ "id": "nm93", "display_name": null })), "nm93");
        assert_eq!(profile_name(&json!({ "id": "nm93", "display_name": " " })), "nm93");
    }

    // --- what a sync fetches ------------------------------------------

    use crate::db::spotify::{LikedChange, SyncBaseline};
    use std::collections::{HashMap, HashSet};
    use std::future::Future;
    use std::sync::Mutex;

    /// Replays hand-written pages by URL and records what was asked for.
    #[derive(Default)]
    struct FakeApi {
        pages: HashMap<String, Result<Value, SpotifyError>>,
        calls: Mutex<Vec<String>>,
    }

    impl FakeApi {
        fn page(mut self, url: &str, body: Value) -> Self {
            self.pages.insert(url.to_string(), Ok(body));
            self
        }

        fn fail(mut self, url: &str, err: SpotifyError) -> Self {
            self.pages.insert(url.to_string(), Err(err));
            self
        }

        fn calls(&self) -> Vec<String> {
            self.calls.lock().unwrap().clone()
        }
    }

    impl SpotifyApi for FakeApi {
        fn get_json(&self, url: &str) -> impl Future<Output = Result<Value, SpotifyError>> + Send {
            self.calls.lock().unwrap().push(url.to_string());
            let answer = self
                .pages
                .get(url)
                .cloned()
                .unwrap_or_else(|| Err(SpotifyError::Network(format!("no page for {url}"))));
            async move { answer }
        }
    }

    const LIKED_PAGE_2: &str = "https://api.spotify.com/v1/me/tracks?offset=50&limit=50";

    fn liked_item(id: &str) -> Value {
        json!({ "added_at": "2026-10-01T00:00:00Z", "track": track_json(id, id) })
    }

    fn playlist_item(id: &str) -> Value {
        json!({ "added_at": "2026-10-01T00:00:00Z", "is_local": false, "item": track_json(id, id) })
    }

    fn page(items: Vec<Value>, next: Option<&str>, total: i64) -> Value {
        json!({ "items": items, "next": next, "total": total })
    }

    fn playlists(metas: &[(&str, &str)]) -> Value {
        page(
            metas
                .iter()
                .map(|(id, snapshot)| {
                    json!({ "id": id, "name": format!("List {id}"), "snapshot_id": snapshot, "items": { "total": 1 } })
                })
                .collect(),
            None,
            metas.len() as i64,
        )
    }

    fn known(ids: &[&str], total: i64) -> SyncBaseline {
        SyncBaseline {
            liked_known: ids.iter().map(|id| id.to_string()).collect::<HashSet<_>>(),
            liked_total: Some(total),
            ..SyncBaseline::default()
        }
    }

    #[tokio::test]
    async fn the_first_sync_reads_everything() {
        let api = FakeApi::default()
            .page(&liked_url(), page(vec![liked_item("a"), liked_item("b")], Some(LIKED_PAGE_2), 3))
            .page(LIKED_PAGE_2, page(vec![liked_item("c")], None, 3))
            .page(&playlists_url(), playlists(&[("p1", "s1")]))
            .page(&playlist_items_url("p1"), page(vec![playlist_item("b")], None, 1));

        let changes = fetch_changes(&api, &SyncBaseline::default()).await.unwrap();

        match &changes.liked {
            LikedChange::Full { entries, total } => {
                assert_eq!(ids(entries), ["a", "b", "c"]);
                assert_eq!(*total, 3);
            }
            other => panic!("expected a full read, got {other:?}"),
        }
        assert_eq!(changes.playlists.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(), ["p1"]);
        assert_eq!(ids(&changes.refetched["p1"]), ["b"]);
        assert!(changes.refused.is_empty());
    }

    #[tokio::test]
    async fn liked_songs_stop_at_the_first_known_track() {
        let api = FakeApi::default()
            .page(
                &liked_url(),
                page(vec![liked_item("new"), liked_item("a"), liked_item("b")], Some(LIKED_PAGE_2), 3),
            )
            .page(&playlists_url(), playlists(&[]));

        let changes = fetch_changes(&api, &known(&["a", "b"], 2)).await.unwrap();

        assert_eq!(
            changes.liked,
            LikedChange::Prepend { entries: vec![parse_entry(&liked_item("new")).unwrap()], total: 3 }
        );
        // The second page was never asked for.
        assert_eq!(api.calls(), vec![liked_url(), playlists_url()]);
    }

    #[tokio::test]
    async fn nothing_new_costs_one_request_for_liked_songs() {
        let api = FakeApi::default()
            .page(&liked_url(), page(vec![liked_item("a"), liked_item("b")], None, 2))
            .page(&playlists_url(), playlists(&[]));

        let changes = fetch_changes(&api, &known(&["a", "b"], 2)).await.unwrap();

        assert_eq!(changes.liked, LikedChange::Unchanged { total: 2 });
        assert_eq!(api.calls(), vec![liked_url(), playlists_url()]);
    }

    #[tokio::test]
    async fn an_unlike_makes_the_total_disagree_and_liked_songs_is_read_again_in_full() {
        let api = FakeApi::default()
            .page(&liked_url(), page(vec![liked_item("a"), liked_item("c")], None, 2))
            .page(&playlists_url(), playlists(&[]));

        let changes = fetch_changes(&api, &known(&["a", "b", "c"], 3)).await.unwrap();

        match &changes.liked {
            LikedChange::Full { entries, total } => {
                assert_eq!(ids(entries), ["a", "c"]);
                assert_eq!(*total, 2);
            }
            other => panic!("expected a full read, got {other:?}"),
        }
        assert_eq!(api.calls(), vec![liked_url(), liked_url(), playlists_url()]);
    }

    #[tokio::test]
    async fn an_unchanged_playlist_is_not_read_again() {
        let mut base = known(&["a"], 1);
        base.snapshots.insert("p1".to_string(), "s1".to_string());
        let api = FakeApi::default()
            .page(&liked_url(), page(vec![liked_item("a")], None, 1))
            .page(&playlists_url(), playlists(&[("p1", "s1"), ("p2", "s7")]))
            .page(&playlist_items_url("p2"), page(vec![playlist_item("x")], None, 1));

        let changes = fetch_changes(&api, &base).await.unwrap();

        assert_eq!(changes.playlists.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(), ["p1", "p2"]);
        assert_eq!(changes.refetched.keys().collect::<Vec<_>>(), ["p2"]);
        assert!(!api.calls().contains(&playlist_items_url("p1")));
    }

    #[tokio::test]
    async fn a_changed_playlist_is_read_in_full_across_pages() {
        let mut base = known(&["a"], 1);
        base.snapshots.insert("p1".to_string(), "s1".to_string());
        let second = "https://api.spotify.com/v1/playlists/p1/items?offset=50&limit=50";
        let api = FakeApi::default()
            .page(&liked_url(), page(vec![liked_item("a")], None, 1))
            .page(&playlists_url(), playlists(&[("p1", "s2")]))
            .page(&playlist_items_url("p1"), page(vec![playlist_item("x")], Some(second), 2))
            .page(second, page(vec![playlist_item("y")], None, 2));

        let changes = fetch_changes(&api, &base).await.unwrap();

        assert_eq!(ids(&changes.refetched["p1"]), ["x", "y"]);
    }

    #[tokio::test]
    async fn a_playlist_spotify_will_not_share_is_listed_and_not_asked_for_again() {
        let forbidden = SpotifyError::Api { status: 403, message: "Forbidden".into(), reason: None };
        let api = FakeApi::default()
            .page(&liked_url(), page(vec![liked_item("a")], None, 1))
            .page(&playlists_url(), playlists(&[("p1", "s1")]))
            .fail(&playlist_items_url("p1"), forbidden);

        let changes = fetch_changes(&api, &known(&["a"], 1)).await.unwrap();
        assert_eq!(changes.refused.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(), ["p1"]);
        assert!(changes.playlists.is_empty());
        assert!(changes.refetched.is_empty());

        // Next time, with the same snapshot, it is not asked for at all.
        let mut base = known(&["a"], 1);
        base.refused.insert("p1".to_string(), "s1".to_string());
        let again = FakeApi::default()
            .page(&liked_url(), page(vec![liked_item("a")], None, 1))
            .page(&playlists_url(), playlists(&[("p1", "s1")]));
        let changes = fetch_changes(&again, &base).await.unwrap();
        assert_eq!(changes.refused.len(), 1);
        assert!(!again.calls().contains(&playlist_items_url("p1")));
    }

    #[tokio::test]
    async fn a_broken_playlist_is_skipped_and_the_rest_still_sync() {
        let broken = SpotifyError::Api { status: 500, message: "Server error".into(), reason: None };
        let mut base = known(&["a"], 1);
        base.snapshots.insert("p1".to_string(), "s1".to_string());
        let api = FakeApi::default()
            .page(&liked_url(), page(vec![liked_item("new"), liked_item("a")], None, 2))
            .page(&playlists_url(), playlists(&[("p1", "s2"), ("p2", "s7")]))
            .fail(&playlist_items_url("p1"), broken)
            .page(&playlist_items_url("p2"), page(vec![playlist_item("x")], None, 1));

        let changes = fetch_changes(&api, &base).await.unwrap();

        // Liked Songs and p2 apply; p1 stays listed, unread, and is reported.
        assert!(matches!(changes.liked, LikedChange::Prepend { .. }));
        assert_eq!(changes.playlists.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(), ["p1", "p2"]);
        assert_eq!(changes.refetched.keys().collect::<Vec<_>>(), ["p2"]);
        assert_eq!(changes.unreadable.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(), ["p1"]);
        assert!(changes.refused.is_empty());
    }

    #[tokio::test]
    async fn a_400_on_one_playlist_is_skipped_too() {
        let bad = SpotifyError::Api { status: 400, message: "Bad request".into(), reason: None };
        let api = FakeApi::default()
            .page(&liked_url(), page(vec![liked_item("a")], None, 1))
            .page(&playlists_url(), playlists(&[("p1", "s1")]))
            .fail(&playlist_items_url("p1"), bad);

        let changes = fetch_changes(&api, &known(&["a"], 1)).await.unwrap();
        assert_eq!(changes.unreadable.len(), 1);
        assert!(changes.refetched.is_empty());
    }

    #[tokio::test]
    async fn a_lost_sign_in_a_rate_limit_or_the_network_still_fail_the_sync() {
        for err in [
            SpotifyError::Api { status: 401, message: "Expired".into(), reason: None },
            SpotifyError::RateLimited { retry_after_secs: 3600 },
            SpotifyError::Network("offline".into()),
        ] {
            let api = FakeApi::default()
                .page(&liked_url(), page(vec![liked_item("a")], None, 1))
                .page(&playlists_url(), playlists(&[("p1", "s1")]))
                .fail(&playlist_items_url("p1"), err.clone());
            assert_eq!(fetch_changes(&api, &known(&["a"], 1)).await, Err(err));
        }
    }

    #[tokio::test]
    async fn a_refused_playlist_whose_snapshot_changed_is_asked_for_again() {
        let mut base = known(&["a"], 1);
        base.refused.insert("p1".to_string(), "s1".to_string());
        let api = FakeApi::default()
            .page(&liked_url(), page(vec![liked_item("a")], None, 1))
            .page(&playlists_url(), playlists(&[("p1", "s2")]))
            .page(&playlist_items_url("p1"), page(vec![playlist_item("x")], None, 1));

        let changes = fetch_changes(&api, &base).await.unwrap();

        assert!(api.calls().contains(&playlist_items_url("p1")));
        assert!(changes.refused.is_empty());
        assert_eq!(ids(&changes.refetched["p1"]), ["x"]);
    }

    #[tokio::test]
    async fn a_404_for_a_playlist_is_a_refusal_too() {
        let missing = SpotifyError::Api { status: 404, message: "Not found".into(), reason: None };
        let api = FakeApi::default()
            .page(&liked_url(), page(vec![liked_item("a")], None, 1))
            .page(&playlists_url(), playlists(&[("p1", "s1"), ("p2", "s2")]))
            .fail(&playlist_items_url("p1"), missing)
            .page(&playlist_items_url("p2"), page(vec![playlist_item("y")], None, 1));

        let changes = fetch_changes(&api, &known(&["a"], 1)).await.unwrap();

        assert_eq!(changes.refused.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(), ["p1"]);
        assert_eq!(changes.playlists.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(), ["p2"]);
    }

    #[tokio::test]
    async fn new_likes_across_a_page_boundary_are_one_prepend() {
        let api = FakeApi::default()
            .page(&liked_url(), page(vec![liked_item("n1"), liked_item("n2")], Some(LIKED_PAGE_2), 5))
            .page(LIKED_PAGE_2, page(vec![liked_item("n3"), liked_item("a"), liked_item("b")], None, 5))
            .page(&playlists_url(), playlists(&[]));

        let changes = fetch_changes(&api, &known(&["a", "b"], 2)).await.unwrap();

        match &changes.liked {
            LikedChange::Prepend { entries, total } => {
                assert_eq!(ids(entries), ["n1", "n2", "n3"]);
                assert_eq!(*total, 5);
            }
            other => panic!("expected a prepend, got {other:?}"),
        }
        assert_eq!(api.calls(), vec![liked_url(), LIKED_PAGE_2.to_string(), playlists_url()]);
    }

    #[tokio::test]
    async fn no_known_track_in_all_of_liked_songs_is_a_full_read() {
        let api = FakeApi::default()
            .page(&liked_url(), page(vec![liked_item("a"), liked_item("b")], None, 2))
            .page(&playlists_url(), playlists(&[]));

        let changes = fetch_changes(&api, &known(&["gone"], 1)).await.unwrap();

        match &changes.liked {
            LikedChange::Full { entries, total } => {
                assert_eq!(ids(entries), ["a", "b"]);
                assert_eq!(*total, 2);
            }
            other => panic!("expected a full read, got {other:?}"),
        }
        // What was read was all of it: no second read.
        assert_eq!(api.calls(), vec![liked_url(), playlists_url()]);
    }

    #[tokio::test]
    async fn a_next_page_off_the_web_api_is_not_followed() {
        let api = FakeApi::default()
            .page(&liked_url(), page(vec![liked_item("a")], Some("https://example.com/steal"), 2))
            .page(&playlists_url(), playlists(&[]));

        assert!(matches!(
            fetch_changes(&api, &SyncBaseline::default()).await,
            Err(SpotifyError::Network(_))
        ));
        assert!(!api.calls().iter().any(|url| url.contains("example.com")));
    }

    #[tokio::test]
    async fn a_listing_that_never_ends_stops_at_the_page_cap() {
        // The first page points back at itself.
        let api = FakeApi::default()
            .page(&liked_url(), page(vec![liked_item("a")], Some(&liked_url()), 1))
            .page(&playlists_url(), playlists(&[]));

        let result = fetch_changes(&api, &SyncBaseline::default()).await;

        assert!(matches!(result, Err(SpotifyError::Network(message)) if message.contains("1000")));
        assert_eq!(api.calls().len(), MAX_PAGES);
    }
}
