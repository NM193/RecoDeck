//! YouTube Data API v3 client.
//!
//! Networking lives on the Rust side for two reasons: the API key never reaches
//! the webview, and every call passes through one place that can count quota.
//!
//! YouTube does not report how much quota is left — the Cloud Console lags by
//! hours — so counting each call against the published price list is the only
//! way to know. Google charges for the attempt, so a call is counted before its
//! response is inspected, exactly like the original tool did.

use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const API_BASE: &str = "https://www.googleapis.com/youtube/v3";

/// Free daily allowance, in units, per key.
pub const DAILY_QUOTA: u32 = 10_000;

/// Published unit costs. `search` is 100x everything else — it is the one call
/// that can drain a day in a few clicks, so callers should prefer channel
/// listing over search wherever possible.
pub fn unit_cost(endpoint: &str) -> u32 {
    match endpoint {
        "search" => 100,
        // videos, commentThreads, channels, playlistItems
        _ => 1,
    }
}

/// A comment flattened out of a comment thread.
///
/// Order matters and must not be sorted later: a reply follows its parent
/// directly, which is what lets the parser give an answer the timestamp from
/// the question it hangs under ("39:30 anyone id?" -> "Rockers Hi-Fi - ...").
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub author: String,
    pub text: String,
    pub like_count: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VideoMeta {
    pub id: String,
    pub url: String,
    pub title: String,
    pub channel: String,
    pub published_at: String,
    pub description: String,
    pub duration_ms: i64,
}

/// Exactly the shape the standalone tool writes into `fixtures/`, so the parser
/// cannot tell a live fetch from a replayed one.
///
/// These three structs are camelCase over IPC, unlike the rest of the app: the
/// ported parser reads this shape verbatim, and `fixtures/` are its tests. A
/// snake_case boundary here would mean reshaping data on the way in and losing
/// that equivalence.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawSet {
    pub video: VideoMeta,
    pub comments: Vec<Comment>,
    pub fetched_at: String,
}

/// "PT1H23M45S" -> milliseconds. Returns 0 for anything unparseable; duration is
/// only used to sanity-check cue points, so a miss must not fail the fetch.
pub fn parse_iso_duration(iso: &str) -> i64 {
    let body = match iso.strip_prefix("PT") {
        Some(b) => b,
        None => return 0,
    };
    let mut total: i64 = 0;
    let mut digits = String::new();
    for ch in body.chars() {
        if ch.is_ascii_digit() {
            digits.push(ch);
            continue;
        }
        let value: i64 = digits.parse().unwrap_or(0);
        digits.clear();
        match ch {
            'H' => total += value * 3_600_000,
            'M' => total += value * 60_000,
            'S' => total += value * 1_000,
            _ => return 0,
        }
    }
    total
}

/// Turn a Google API failure into something a person can act on.
///
/// Pure so it can be tested without the network — the three reasons below are
/// the ones a user actually hits, and a raw 403 tells them nothing.
pub fn map_api_error(status: u16, body: &str) -> AppError {
    let reason = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| {
            v.get("error")?
                .get("errors")?
                .get(0)?
                .get("reason")?
                .as_str()
                .map(str::to_string)
        })
        .unwrap_or_default();

    let message = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| {
            v.get("error")?
                .get("message")?
                .as_str()
                .map(str::to_string)
        })
        .unwrap_or_else(|| body.chars().take(200).collect());

    match reason.as_str() {
        "quotaExceeded" | "dailyLimitExceeded" | "rateLimitExceeded" => AppError::YtQuotaExceeded,
        "keyInvalid" | "badRequest" => AppError::YtInvalidKey,
        "accessNotConfigured" => AppError::YtApiNotEnabled,
        _ => {
            // Some responses carry the reason only in prose.
            if message.contains("API key not valid") {
                AppError::YtInvalidKey
            } else if message.contains("has not been used") || message.contains("is disabled") {
                AppError::YtApiNotEnabled
            } else {
                AppError::YtNetwork(format!("YouTube API error {status}: {message}"))
            }
        }
    }
}

/// One API call. `spent` is incremented before the response is judged, because
/// Google bills the attempt.
async fn call_api(
    api_key: &str,
    endpoint: &str,
    params: &[(&str, String)],
    spent: &mut u32,
) -> Result<serde_json::Value, AppError> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| AppError::YtNetwork(format!("Could not build HTTP client: {e}")))?;

    let mut query: Vec<(&str, String)> = params.to_vec();
    query.push(("key", api_key.to_string()));

    let response = client
        .get(format!("{API_BASE}/{endpoint}"))
        .query(&query)
        .send()
        .await;

    *spent += unit_cost(endpoint);

    let response = response.map_err(|e| {
        if e.is_timeout() {
            AppError::YtNetwork("YouTube did not answer in 30 seconds".to_string())
        } else {
            AppError::YtNetwork(format!("Could not reach YouTube: {e}"))
        }
    })?;

    let status = response.status().as_u16();
    let body = response
        .text()
        .await
        .map_err(|e| AppError::YtNetwork(format!("Could not read YouTube response: {e}")))?;

    if !(200..300).contains(&status) {
        return Err(map_api_error(status, &body));
    }

    serde_json::from_str(&body)
        .map_err(|e| AppError::YtNetwork(format!("YouTube sent unreadable JSON: {e}")))
}

/// The cheapest possible call (1 unit), used to tell a working key apart from a
/// missing one, a wrong one, and a project without the API switched on.
pub async fn verify_key(api_key: &str, spent: &mut u32) -> Result<(), AppError> {
    call_api(
        api_key,
        "videos",
        &[("part", "id".into()), ("id", "dQw4w9WgXcQ".into())],
        spent,
    )
    .await
    .map(|_| ())
}

pub async fn fetch_video(
    api_key: &str,
    video_id: &str,
    spent: &mut u32,
) -> Result<VideoMeta, AppError> {
    let data = call_api(
        api_key,
        "videos",
        &[
            ("part", "snippet,contentDetails,statistics".into()),
            ("id", video_id.to_string()),
        ],
        spent,
    )
    .await?;

    let item = data
        .get("items")
        .and_then(|i| i.get(0))
        .ok_or_else(|| AppError::NotFound(format!("No YouTube video with id {video_id}")))?;

    let snippet = item.get("snippet").cloned().unwrap_or_default();
    let text = |key: &str| {
        snippet
            .get(key)
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string()
    };

    Ok(VideoMeta {
        id: video_id.to_string(),
        url: format!("https://www.youtube.com/watch?v={video_id}"),
        title: text("title"),
        channel: text("channelTitle"),
        published_at: text("publishedAt"),
        description: text("description"),
        duration_ms: parse_iso_duration(
            item.get("contentDetails")
                .and_then(|c| c.get("duration"))
                .and_then(|d| d.as_str())
                .unwrap_or_default(),
        ),
    })
}

/// Comments ordered by relevance, because YouTube surfaces the pinned comment
/// first and the pinned comment is where uploaders park the tracklist.
///
/// Replies come back attached to their thread and cost no extra unit, so they
/// are flattened in place. Comments can be disabled on a video (403) — that is
/// a normal state for a set, not a failure, so whatever was collected so far is
/// returned instead of an error.
pub async fn fetch_comments(
    api_key: &str,
    video_id: &str,
    pages: u8,
    spent: &mut u32,
) -> Result<Vec<Comment>, AppError> {
    let mut comments = Vec::new();
    let mut page_token: Option<String> = None;

    for _ in 0..pages {
        let mut params = vec![
            ("part", "snippet,replies".to_string()),
            ("videoId", video_id.to_string()),
            ("order", "relevance".to_string()),
            ("maxResults", "100".to_string()),
            ("textFormat", "plainText".to_string()),
        ];
        if let Some(token) = &page_token {
            params.push(("pageToken", token.clone()));
        }

        let data = match call_api(api_key, "commentThreads", &params, spent).await {
            Ok(data) => data,
            // Comments disabled, or the thread list is closed: keep what we have.
            Err(AppError::YtNetwork(msg)) if msg.contains("403") => return Ok(comments),
            Err(e) => return Err(e),
        };

        let items = data
            .get("items")
            .and_then(|i| i.as_array())
            .cloned()
            .unwrap_or_default();

        for item in items {
            let top = item
                .pointer("/snippet/topLevelComment/snippet")
                .cloned()
                .unwrap_or_default();
            let parent_author = top
                .get("authorDisplayName")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();

            comments.push(Comment {
                author: parent_author.clone(),
                text: top
                    .get("textDisplay")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
                like_count: top.get("likeCount").and_then(|v| v.as_i64()).unwrap_or(0),
                reply_to: None,
            });

            let replies = item
                .pointer("/replies/comments")
                .and_then(|r| r.as_array())
                .cloned()
                .unwrap_or_default();

            for reply in replies {
                let r = reply.get("snippet").cloned().unwrap_or_default();
                comments.push(Comment {
                    author: r
                        .get("authorDisplayName")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string(),
                    text: r
                        .get("textDisplay")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string(),
                    like_count: r.get("likeCount").and_then(|v| v.as_i64()).unwrap_or(0),
                    reply_to: Some(parent_author.clone()),
                });
            }
        }

        page_token = data
            .get("nextPageToken")
            .and_then(|v| v.as_str())
            .map(str::to_string);
        if page_token.is_none() {
            break;
        }
    }

    Ok(comments)
}

/// One set: description plus up to five pages of comments. 5-7 units in total.
pub async fn fetch_set(
    api_key: &str,
    video_id: &str,
    spent: &mut u32,
) -> Result<RawSet, AppError> {
    let video = fetch_video(api_key, video_id, spent).await?;
    let comments = fetch_comments(api_key, video_id, 5, spent).await?;

    Ok(RawSet {
        video,
        comments,
        fetched_at: crate::external::youtube_time::iso_now(),
    })
}

/// Accepts a full URL, a share link, an embed link or a bare id.
pub fn extract_video_id(input: &str) -> Option<String> {
    let trimmed = input.trim();
    let is_id = |s: &str| {
        s.len() == 11 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    };
    if is_id(trimmed) {
        return Some(trimmed.to_string());
    }
    for marker in ["v=", "youtu.be/", "/embed/", "/live/", "/shorts/"] {
        if let Some(pos) = trimmed.find(marker) {
            let rest: String = trimmed[pos + marker.len()..]
                .chars()
                .take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
                .collect();
            if is_id(&rest) {
                return Some(rest);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso_durations_convert_to_ms() {
        assert_eq!(parse_iso_duration("PT1H23M45S"), 5_025_000);
        assert_eq!(parse_iso_duration("PT52M"), 3_120_000);
        assert_eq!(parse_iso_duration("PT30S"), 30_000);
        assert_eq!(parse_iso_duration(""), 0);
        assert_eq!(parse_iso_duration("garbage"), 0);
    }

    #[test]
    fn search_is_the_expensive_one() {
        assert_eq!(unit_cost("search"), 100);
        assert_eq!(unit_cost("videos"), 1);
        assert_eq!(unit_cost("commentThreads"), 1);
    }

    #[test]
    fn quota_errors_are_named_not_raw() {
        let body = r#"{"error":{"code":403,"message":"quota","errors":[{"reason":"quotaExceeded"}]}}"#;
        assert!(matches!(map_api_error(403, body), AppError::YtQuotaExceeded));
    }

    #[test]
    fn bad_key_is_told_apart_from_disabled_api() {
        let bad = r#"{"error":{"code":400,"message":"API key not valid","errors":[{"reason":"badRequest"}]}}"#;
        assert!(matches!(map_api_error(400, bad), AppError::YtInvalidKey));

        let off = r#"{"error":{"code":403,"message":"YouTube Data API v3 has not been used","errors":[{"reason":"accessNotConfigured"}]}}"#;
        assert!(matches!(map_api_error(403, off), AppError::YtApiNotEnabled));
    }

    #[test]
    fn unknown_errors_keep_their_message() {
        let body = r#"{"error":{"code":500,"message":"Backend error","errors":[{"reason":"backendError"}]}}"#;
        match map_api_error(500, body) {
            AppError::YtNetwork(msg) => assert!(msg.contains("Backend error")),
            other => panic!("expected YtNetwork, got {other:?}"),
        }
    }

    #[test]
    fn non_json_bodies_do_not_panic() {
        match map_api_error(502, "<html>bad gateway</html>") {
            AppError::YtNetwork(msg) => assert!(msg.contains("502")),
            other => panic!("expected YtNetwork, got {other:?}"),
        }
    }

    #[test]
    fn video_ids_come_out_of_every_link_shape() {
        assert_eq!(extract_video_id("fjR4idz1-MA").unwrap(), "fjR4idz1-MA");
        assert_eq!(
            extract_video_id("https://www.youtube.com/watch?v=fjR4idz1-MA&t=1260s").unwrap(),
            "fjR4idz1-MA"
        );
        assert_eq!(
            extract_video_id("https://youtu.be/QHDRRxKlimY?si=abc").unwrap(),
            "QHDRRxKlimY"
        );
        assert_eq!(
            extract_video_id("https://www.youtube.com/embed/X6WpzQoI0mc").unwrap(),
            "X6WpzQoI0mc"
        );
        assert!(extract_video_id("https://example.com/nope").is_none());
        assert!(extract_video_id("").is_none());
    }
}
