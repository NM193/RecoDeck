// src-tauri/src/external/youtube_music.rs
//! YouTube Data API for the YouTube Music section, read with the user's OAuth
//! token: Liked music (`LM`) and the playlists added by link.
//!
//! A playlist has no snapshot id, so a list is checked with its first page
//! (`fetch_changes`). Captured responses contain someone's library and are
//! never committed; tests use small hand-written JSON.
//!
//! Every call costs 1 unit — `playlistItems`, `playlists` and `videos` alike
//! (`youtube::unit_cost`) — charged to the OAuth client's Google Cloud
//! project, which is the API key's: this section and Sets share the day.

use crate::db::youtube_music::{YtmEntry, YtmTrack};
use crate::external::youtube::parse_iso_duration;
use serde_json::Value;
use std::collections::HashMap;

pub const API_BASE: &str = "https://www.googleapis.com/youtube/v3";
/// The largest page `playlistItems` and `videos` give.
pub const PAGE_SIZE: usize = 50;

#[derive(Debug, Clone, PartialEq)]
pub enum YtmError {
    /// No account connected.
    NotConnected,
    /// The refresh token was revoked or expired (`invalid_grant`): sign in again.
    Reconnect,
    /// YouTube could not be reached, or answered with something unreadable.
    Network(String),
    /// YouTube answered with an error status.
    Api { status: u16, message: String, reason: Option<String> },
    /// `quotaExceeded`: the day's units are used up until midnight Pacific.
    QuotaExceeded,
}

impl std::fmt::Display for YtmError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotConnected => write!(f, "YouTube Music is not connected"),
            Self::Reconnect => write!(f, "YouTube Music needs you to sign in again"),
            Self::Network(message) => write!(f, "{message}"),
            // A body that was not Google's JSON leaves only the status.
            Self::Api { status, message, .. } if *message == generic_api_message(*status) => {
                write!(f, "{message}")
            }
            Self::Api { status, message, .. } => write!(f, "YouTube answered {status}: {message}"),
            Self::QuotaExceeded => write!(f, "YouTube quota used up · resumes after midnight Pacific"),
        }
    }
}

impl std::error::Error for YtmError {}

fn generic_api_message(status: u16) -> String {
    format!("YouTube answered {status}")
}

fn text(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_string)
}

/// Google's error body, `{"error":{"code":…,"message":…,"errors":[{"reason":…}]}}`,
/// or the token endpoint's flat one, `{"error":"…","error_description":"…"}`.
/// `quotaExceeded` is its own kind: the view words it, and the loop waits.
pub fn api_error(status: u16, body: &str) -> YtmError {
    let parsed: Option<Value> = serde_json::from_str(body).ok();
    let error = parsed.as_ref().and_then(|v| v.get("error"));
    let nested = error.filter(|e| e.is_object());
    let reason = nested
        .and_then(|e| e.pointer("/errors/0/reason"))
        .or_else(|| error.filter(|e| e.is_string()))
        .and_then(Value::as_str)
        .map(str::to_string);
    if matches!(reason.as_deref(), Some("quotaExceeded" | "dailyLimitExceeded")) {
        return YtmError::QuotaExceeded;
    }
    let message = nested
        .and_then(|e| e.get("message"))
        .or_else(|| parsed.as_ref().and_then(|v| v.get("error_description")))
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| generic_api_message(status));
    YtmError::Api { status, message, reason }
}

/// A stored playlist YouTube no longer shows this account: deleted, or made
/// private. It stays in the sidebar, marked, until the user removes it.
pub fn is_gone(err: &YtmError) -> bool {
    match err {
        YtmError::Api { status: 404, .. } => true,
        YtmError::Api { status: 403, reason: Some(reason), .. } => reason == "playlistItemsNotAccessible",
        _ => false,
    }
}

pub fn items_url(list_id: &str, page_token: Option<&str>) -> String {
    let mut url = format!(
        "{API_BASE}/playlistItems?part=snippet,contentDetails&maxResults={PAGE_SIZE}&playlistId={}",
        urlencoding::encode(list_id)
    );
    if let Some(token) = page_token {
        url.push_str(&format!("&pageToken={}", urlencoding::encode(token)));
    }
    url
}

/// The playlist's own record, for its name: 1 unit.
pub fn playlist_url(id: &str) -> String {
    format!("{API_BASE}/playlists?part=snippet&id={}", urlencoding::encode(id))
}

/// Lengths of up to 50 videos: 1 unit.
pub fn videos_url(ids: &[&str]) -> String {
    let ids: Vec<String> = ids.iter().map(|id| urlencoding::encode(id).into_owned()).collect();
    format!("{API_BASE}/videos?part=contentDetails&maxResults={PAGE_SIZE}&id={}", ids.join(","))
}

/// One page of `playlistItems`.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct ItemsPage {
    /// Every item's video id, in order — deleted and private ones too. Page
    /// one's ids are what the next sync compares with.
    pub ids: Vec<String>,
    /// The available items.
    pub entries: Vec<YtmEntry>,
    pub next_page_token: Option<String>,
    /// `pageInfo.totalResults`: what YouTube counts, unavailable items included.
    pub total_results: i64,
}

pub fn parse_items_page(page: &Value) -> ItemsPage {
    let mut parsed = ItemsPage {
        next_page_token: text(page, "nextPageToken"),
        total_results: page.pointer("/pageInfo/totalResults").and_then(Value::as_i64).unwrap_or(0),
        ..ItemsPage::default()
    };
    for item in page.get("items").and_then(Value::as_array).into_iter().flatten() {
        let Some(video_id) = item
            .pointer("/snippet/resourceId/videoId")
            .or_else(|| item.pointer("/contentDetails/videoId"))
            .and_then(Value::as_str)
            .filter(|id| !id.is_empty())
        else {
            continue;
        };
        parsed.ids.push(video_id.to_string());

        // Deleted and private videos have no owner channel ("Deleted video",
        // "Private video"): skipped, and counted through totalResults.
        let Some(channel) = item.pointer("/snippet/videoOwnerChannelTitle").and_then(Value::as_str) else {
            continue;
        };
        parsed.entries.push(YtmEntry {
            track: YtmTrack {
                video_id: video_id.to_string(),
                title: item.pointer("/snippet/title").and_then(Value::as_str).unwrap_or_default().to_string(),
                channel: channel.to_string(),
                duration_ms: None,
            },
            added_at: item.pointer("/snippet/publishedAt").and_then(Value::as_str).map(str::to_string),
        });
    }
    parsed
}

/// The playlist's title, or None when YouTube shows no such playlist to this
/// account (it answers with no items rather than an error).
pub fn parse_playlist_name(body: &Value) -> Option<String> {
    body.pointer("/items/0/snippet/title").and_then(Value::as_str).map(str::to_string)
}

/// Video id → length in ms. An unreadable length (a live stream's `P0D`) is
/// left out: the video then counts as a track, not a set.
pub fn parse_durations(body: &Value) -> HashMap<String, i64> {
    body.get("items")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let id = item.get("id")?.as_str()?;
            let ms = parse_iso_duration(item.pointer("/contentDetails/duration")?.as_str()?);
            (ms > 0).then(|| (id.to_string(), ms))
        })
        .collect()
}

/// A playlist link (`…?list=…` on music.youtube.com or youtube.com, a watch
/// link inside a playlist too) or a bare playlist id.
pub fn playlist_id_from_link(input: &str) -> Option<String> {
    let trimmed = input.trim();
    let candidate = ["?list=", "&list="]
        .iter()
        .find_map(|marker| trimmed.find(*marker).map(|at| &trimmed[at + marker.len()..]))
        .map(|rest| rest.split(['&', '#']).next().unwrap_or(""))
        .unwrap_or(trimmed);
    let valid = (2..=64).contains(&candidate.len())
        && candidate.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    valid.then(|| candidate.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// One `playlistItems` item. `channel` None is how YouTube writes a deleted
    /// or private video: no owner channel.
    pub(super) fn item(video_id: &str, title: &str, channel: Option<&str>) -> Value {
        let mut snippet = json!({
            "title": title,
            "publishedAt": "2026-10-03T07:12:00Z",
            "resourceId": { "kind": "youtube#video", "videoId": video_id }
        });
        if let Some(channel) = channel {
            snippet["videoOwnerChannelTitle"] = json!(channel);
        }
        json!({ "kind": "youtube#playlistItem", "snippet": snippet, "contentDetails": { "videoId": video_id } })
    }

    #[test]
    fn reads_a_page_of_playlist_items_and_skips_deleted_and_private_videos() {
        let page = json!({
            "nextPageToken": "CDIQAA",
            "pageInfo": { "totalResults": 62, "resultsPerPage": 50 },
            "items": [
                item("v1", "Soulva - Odyssey (Original Mix)", Some("Soulva")),
                item("v2", "Deleted video", None),
                item("v3", "Private video", None),
                item("v4", "Honey Hunter", Some("Extrawelt - Topic"))
            ]
        });
        let parsed = parse_items_page(&page);
        assert_eq!(parsed.ids, ["v1", "v2", "v3", "v4"], "page one's ids include the unavailable ones");
        assert_eq!(
            parsed.entries.iter().map(|e| e.track.video_id.as_str()).collect::<Vec<_>>(),
            ["v1", "v4"]
        );
        assert_eq!(
            parsed.entries[1],
            YtmEntry {
                track: YtmTrack {
                    video_id: "v4".into(),
                    title: "Honey Hunter".into(),
                    channel: "Extrawelt - Topic".into(),
                    duration_ms: None,
                },
                added_at: Some("2026-10-03T07:12:00Z".into()),
            }
        );
        assert_eq!(parsed.total_results, 62);
        assert_eq!(parsed.next_page_token.as_deref(), Some("CDIQAA"));

        let last = parse_items_page(&json!({ "pageInfo": { "totalResults": 0 }, "items": [] }));
        assert_eq!(last, ItemsPage::default());
    }

    #[test]
    fn reads_youtube_error_bodies() {
        let quota = r#"{"error":{"code":403,"message":"The request cannot be completed because you have exceeded your quota.","errors":[{"domain":"youtube.quota","reason":"quotaExceeded"}]}}"#;
        assert_eq!(api_error(403, quota), YtmError::QuotaExceeded);

        let gone = r#"{"error":{"code":404,"message":"The playlist cannot be found.","errors":[{"domain":"youtube.playlistItem","reason":"playlistNotFound"}]}}"#;
        assert_eq!(
            api_error(404, gone),
            YtmError::Api {
                status: 404,
                message: "The playlist cannot be found.".into(),
                reason: Some("playlistNotFound".into()),
            }
        );
        assert_eq!(api_error(404, gone).to_string(), "YouTube answered 404: The playlist cannot be found.");

        // Not Google's JSON (a proxy's page, say): only the status is shown.
        assert_eq!(api_error(502, "<html>Bad gateway</html>").to_string(), "YouTube answered 502");

        // The token endpoint's flat OAuth error.
        assert_eq!(
            api_error(401, r#"{"error":"invalid_client","error_description":"The OAuth client was not found."}"#),
            YtmError::Api {
                status: 401,
                message: "The OAuth client was not found.".into(),
                reason: Some("invalid_client".into()),
            }
        );
    }

    #[test]
    fn a_playlist_is_gone_on_404_or_when_its_items_are_not_accessible() {
        let api = |status, reason: Option<&str>| YtmError::Api {
            status,
            message: String::new(),
            reason: reason.map(str::to_string),
        };
        assert!(is_gone(&api(404, Some("playlistNotFound"))));
        assert!(is_gone(&api(404, None)));
        assert!(is_gone(&api(403, Some("playlistItemsNotAccessible"))));
        assert!(!is_gone(&api(403, Some("forbidden"))));
        assert!(!is_gone(&api(500, None)));
        assert!(!is_gone(&YtmError::QuotaExceeded));
        assert!(!is_gone(&YtmError::Network("offline".into())));
    }

    #[test]
    fn reads_lengths_and_skips_what_it_cannot_read() {
        let body = json!({ "items": [
            { "id": "v1", "contentDetails": { "duration": "PT6M57S" } },
            { "id": "set1", "contentDetails": { "duration": "PT1H35M" } },
            { "id": "live", "contentDetails": { "duration": "P0D" } },
            { "id": "odd" }
        ]});
        assert_eq!(
            parse_durations(&body),
            HashMap::from([("v1".to_string(), 417_000), ("set1".to_string(), 5_700_000)])
        );
    }

    #[test]
    fn reads_a_playlists_name_or_none() {
        let named = json!({ "items": [{ "id": "PLx", "snippet": { "title": "Deep Cuts" } }] });
        assert_eq!(parse_playlist_name(&named).as_deref(), Some("Deep Cuts"));
        // A playlist private to another account comes back as no items at all.
        assert_eq!(parse_playlist_name(&json!({ "items": [] })), None);
    }

    #[test]
    fn a_playlist_id_comes_out_of_every_link_shape() {
        assert_eq!(
            playlist_id_from_link("https://music.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf").as_deref(),
            Some("PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf")
        );
        assert_eq!(
            playlist_id_from_link("https://www.youtube.com/watch?v=fjR4idz1-MA&list=PL123_abc-XYZ&index=2").as_deref(),
            Some("PL123_abc-XYZ")
        );
        assert_eq!(
            playlist_id_from_link("https://youtube.com/playlist?list=OLAK5uy_kq#top").as_deref(),
            Some("OLAK5uy_kq")
        );
        assert_eq!(playlist_id_from_link("  PL123_abc-XYZ  ").as_deref(), Some("PL123_abc-XYZ"));
        assert_eq!(playlist_id_from_link("https://example.com/nope"), None);
        assert_eq!(playlist_id_from_link("https://music.youtube.com/playlist?list="), None);
        assert_eq!(playlist_id_from_link("not a link"), None);
        assert_eq!(playlist_id_from_link(""), None);
    }

    #[test]
    fn urls_ask_for_fifty_at_a_time() {
        assert_eq!(
            items_url("LM", None),
            "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=LM"
        );
        assert_eq!(
            items_url("PLx", Some("CDIQAA")),
            "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=PLx&pageToken=CDIQAA"
        );
        assert_eq!(playlist_url("PLx"), "https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=PLx");
        assert_eq!(
            videos_url(&["a", "b"]),
            "https://www.googleapis.com/youtube/v3/videos?part=contentDetails&maxResults=50&id=a,b"
        );
    }
}
