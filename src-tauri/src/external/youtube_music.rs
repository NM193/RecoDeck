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

use crate::db::youtube_music::{
    ListBaseline, ListChange, SyncBaseline, SyncChanges, YtmEntry, YtmTrack,
};
use crate::external::youtube::parse_iso_duration;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::Duration;

pub const API_BASE: &str = "https://www.googleapis.com/youtube/v3";
/// The largest page `playlistItems` and `videos` give.
pub const PAGE_SIZE: usize = 50;
/// The most pages one list is read to: 5,000 videos, YouTube's cap on a playlist.
pub const MAX_PAGES: usize = 100;
/// A list last read in full this long ago is read in full again, whatever its
/// first page says.
pub const FULL_REFETCH_MS: i64 = 24 * 60 * 60 * 1000;

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
    // rateLimitExceeded / userRateLimitExceeded are deliberately a plain Api
    // error (a short-term limit), not QuotaExceeded, which waits for the next Pacific day.
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

/// Lengths of up to 50 videos: 1 unit. Callers chunk their ids by 50.
pub fn videos_url(ids: &[&str]) -> String {
    debug_assert!(ids.len() <= PAGE_SIZE);
    let ids: Vec<String> = ids.iter().map(|id| urlencoding::encode(id).into_owned()).collect();
    format!("{API_BASE}/videos?part=contentDetails&id={}", ids.join(","))
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

// --- what a sync fetches ----------------------------------------------

/// One GET against the Data API, answering with the JSON body. The live client
/// adds the token and counts the unit; tests replay hand-written pages.
pub trait YtmApi {
    fn get_json(&self, url: &str) -> impl Future<Output = Result<Value, YtmError>> + Send;
}

/// Never read in full, or last read in full a day or more ago.
pub fn full_read_due(list: &ListBaseline, now_ms: i64) -> bool {
    list.full_synced_at.is_none_or(|at| now_ms - at >= FULL_REFETCH_MS)
}

/// One list: its first page, then — unless that page matches what is stored
/// and no full read is due — every other page.
async fn read_list<A: YtmApi + Sync>(api: &A, list: &ListBaseline, now_ms: i64) -> Result<ListChange, YtmError> {
    let first = parse_items_page(&api.get_json(&items_url(&list.id, None)).await?);
    if !full_read_due(list, now_ms)
        && list.total_results == Some(first.total_results)
        && list.first_page_ids.as_ref() == Some(&first.ids)
    {
        return Ok(ListChange::Unchanged);
    }

    let ItemsPage { ids: first_page_ids, mut entries, mut next_page_token, total_results } = first;
    let mut pages = 1;
    let mut seen: HashSet<String> = HashSet::new();
    while let Some(token) = next_page_token {
        if pages >= MAX_PAGES || !seen.insert(token.clone()) {
            return Err(YtmError::Network(format!("A YouTube playlist ran past {MAX_PAGES} pages")));
        }
        let page = parse_items_page(&api.get_json(&items_url(&list.id, Some(&token))).await?);
        pages += 1;
        entries.extend(page.entries);
        next_page_token = page.next_page_token;
    }
    Ok(ListChange::Full { entries, total_results, first_page_ids })
}

/// Lengths of the videos read in full whose length is not stored — new ones,
/// and ones stored without a length — each once, 50 to a call.
async fn fetch_durations<A: YtmApi + Sync>(
    api: &A,
    lists: &[(String, ListChange)],
    known: &HashSet<String>,
) -> Result<HashMap<String, i64>, YtmError> {
    let mut unseen: Vec<&str> = Vec::new();
    let mut queued: HashSet<&str> = HashSet::new();
    for (_, change) in lists {
        if let ListChange::Full { entries, .. } = change {
            for entry in entries {
                let id = entry.track.video_id.as_str();
                if !known.contains(id) && queued.insert(id) {
                    unseen.push(id);
                }
            }
        }
    }

    let mut durations = HashMap::new();
    for chunk in unseen.chunks(PAGE_SIZE) {
        durations.extend(parse_durations(&api.get_json(&videos_url(chunk)).await?));
    }
    Ok(durations)
}

/// Every list in `base`, Liked music first. A list YouTube no longer shows is
/// `Gone`; any other failure fails the sync, which the next run tries again.
pub async fn fetch_changes<A: YtmApi + Sync>(
    api: &A,
    base: &SyncBaseline,
    now_ms: i64,
) -> Result<SyncChanges, YtmError> {
    let mut lists = Vec::new();
    for list in &base.lists {
        let change = match read_list(api, list, now_ms).await {
            Ok(change) => change,
            Err(err) if is_gone(&err) => ListChange::Gone,
            Err(err) => return Err(err),
        };
        lists.push((list.id.clone(), change));
    }
    let durations = fetch_durations(api, &lists, &base.known_ids).await?;
    Ok(SyncChanges { lists, durations })
}

/// A playlist being added by link: its name (1 unit), then a full read, which
/// is its "new" baseline. None when YouTube shows this account no such
/// playlist — deleted, or private to another account.
pub async fn fetch_new_playlist<A: YtmApi + Sync>(
    api: &A,
    id: &str,
    known: &HashSet<String>,
    now_ms: i64,
) -> Result<Option<(String, SyncChanges)>, YtmError> {
    let name = match api.get_json(&playlist_url(id)).await {
        Ok(body) => parse_playlist_name(&body),
        Err(err) if is_gone(&err) => None,
        Err(err) => return Err(err),
    };
    let Some(name) = name else { return Ok(None) };

    let base = SyncBaseline { lists: vec![ListBaseline::new(id)], known_ids: known.clone() };
    let changes = fetch_changes(api, &base, now_ms).await?;
    if matches!(changes.lists.as_slice(), [(_, ListChange::Gone)]) {
        return Ok(None);
    }
    Ok(Some((name, changes)))
}

// --- the live client ----------------------------------------------------

/// `playlistItems`, `playlists` and `videos` all cost 1 unit (`youtube::unit_cost`).
const UNITS_PER_CALL: u32 = 1;

fn network(e: reqwest::Error) -> YtmError {
    if e.is_timeout() {
        YtmError::Network("YouTube did not answer in 30 seconds".to_string())
    } else {
        YtmError::Network(format!("Could not reach YouTube: {e}"))
    }
}

/// The Data API with the user's access token. Counts what it spends, so the
/// caller can add it to the shared quota counter.
pub struct LiveApi {
    http: reqwest::Client,
    token: String,
    spent: AtomicU32,
}

impl LiveApi {
    pub fn new(token: String) -> Result<Self, YtmError> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| YtmError::Network(format!("Could not build HTTP client: {e}")))?;
        Ok(Self { http, token, spent: AtomicU32::new(0) })
    }

    /// Units used so far. Google bills the attempt, so a call that failed counts.
    pub fn spent(&self) -> u32 {
        self.spent.load(Ordering::SeqCst)
    }
}

impl YtmApi for LiveApi {
    fn get_json(&self, url: &str) -> impl Future<Output = Result<Value, YtmError>> + Send {
        let url = url.to_string();
        async move {
            let response = self.http.get(&url).bearer_auth(&self.token).send().await;
            // Counted before the answer is judged, as `youtube::call_api` does.
            self.spent.fetch_add(UNITS_PER_CALL, Ordering::SeqCst);
            let response = response.map_err(network)?;
            let status = response.status().as_u16();
            let body = response.text().await.map_err(network)?;
            if !(200..300).contains(&status) {
                return Err(api_error(status, &body));
            }
            serde_json::from_str(&body)
                .map_err(|e| YtmError::Network(format!("YouTube sent unreadable JSON: {e}")))
        }
    }
}

impl From<YtmError> for crate::error::AppError {
    fn from(err: YtmError) -> Self {
        use crate::error::AppError;
        match err {
            YtmError::NotConnected => AppError::YouTubeMusicNotConnected,
            YtmError::Reconnect => AppError::YouTubeMusicReconnect,
            // The same kind Sets uses: the frontend already words it.
            YtmError::QuotaExceeded => AppError::YtQuotaExceeded,
            other => AppError::YouTubeMusic(other.to_string()),
        }
    }
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
            "https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=a,b"
        );
    }

    // --- what a sync fetches ------------------------------------------

    use crate::db::youtube_music::{ListBaseline, ListChange, SyncBaseline};
    use std::collections::HashSet;
    use std::future::Future;
    use std::sync::Mutex;

    /// Replays hand-written pages by URL and records what was asked for.
    #[derive(Default)]
    struct FakeApi {
        pages: HashMap<String, Result<Value, YtmError>>,
        calls: Mutex<Vec<String>>,
    }

    impl FakeApi {
        fn page(mut self, url: String, body: Value) -> Self {
            self.pages.insert(url, Ok(body));
            self
        }

        fn fail(mut self, url: String, err: YtmError) -> Self {
            self.pages.insert(url, Err(err));
            self
        }

        fn calls(&self) -> Vec<String> {
            self.calls.lock().unwrap().clone()
        }
    }

    impl YtmApi for FakeApi {
        fn get_json(&self, url: &str) -> impl Future<Output = Result<Value, YtmError>> + Send {
            self.calls.lock().unwrap().push(url.to_string());
            let answer = self
                .pages
                .get(url)
                .cloned()
                .unwrap_or_else(|| Err(YtmError::Network(format!("no page for {url}"))));
            async move { answer }
        }
    }

    fn page_of(ids: &[&str], total: i64, next: Option<&str>) -> Value {
        json!({
            "nextPageToken": next,
            "pageInfo": { "totalResults": total },
            "items": ids.iter().map(|id| item(id, &format!("Artist - {id}"), Some("Label"))).collect::<Vec<_>>()
        })
    }

    fn lengths(pairs: &[(&str, &str)]) -> Value {
        json!({ "items": pairs.iter().map(|(id, d)| json!({ "id": id, "contentDetails": { "duration": d } })).collect::<Vec<_>>() })
    }

    fn stored(id: &str, total: i64, first: &[&str], full_at: i64) -> ListBaseline {
        ListBaseline {
            id: id.to_string(),
            total_results: Some(total),
            first_page_ids: Some(first.iter().map(|s| s.to_string()).collect()),
            full_synced_at: Some(full_at),
        }
    }

    fn known(ids: &[&str]) -> HashSet<String> {
        ids.iter().map(|s| s.to_string()).collect()
    }

    const NOW: i64 = 10 * FULL_REFETCH_MS;
    const HOUR: i64 = 60 * 60 * 1000;

    /// Liked music, two pages: [a, b] then [c]; totalResults 3.
    fn two_pages() -> FakeApi {
        FakeApi::default()
            .page(items_url("LM", None), page_of(&["a", "b"], 3, Some("P2")))
            .page(items_url("LM", Some("P2")), page_of(&["c"], 3, None))
    }

    #[tokio::test]
    async fn a_first_sync_reads_every_page_and_asks_lengths_only_for_unseen_videos() {
        let api = two_pages().page(videos_url(&["a", "c"]), lengths(&[("a", "PT5M"), ("c", "PT1H5M")]));
        let base = SyncBaseline { lists: vec![ListBaseline::new("LM")], known_ids: known(&["b"]) };

        let changes = fetch_changes(&api, &base, NOW).await.unwrap();

        match changes.lists.as_slice() {
            [(id, ListChange::Full { entries, total_results, first_page_ids })] => {
                assert_eq!(id, "LM");
                assert_eq!(entries.iter().map(|e| e.track.video_id.as_str()).collect::<Vec<_>>(), ["a", "b", "c"]);
                assert_eq!(*total_results, 3);
                assert_eq!(first_page_ids, &["a", "b"]);
            }
            other => panic!("expected one full read, got {other:?}"),
        }
        assert_eq!(changes.durations, HashMap::from([("a".to_string(), 300_000), ("c".to_string(), 3_900_000)]));
        assert_eq!(api.calls().len(), 3, "two pages and one videos call: 3 units");
    }

    #[tokio::test]
    async fn an_unchanged_first_page_skips_the_list_for_one_unit() {
        let api = two_pages();
        let base = SyncBaseline { lists: vec![stored("LM", 3, &["a", "b"], NOW - HOUR)], known_ids: HashSet::new() };

        let changes = fetch_changes(&api, &base, NOW).await.unwrap();

        assert_eq!(changes.lists, vec![("LM".to_string(), ListChange::Unchanged)]);
        assert!(changes.durations.is_empty());
        assert_eq!(api.calls(), [items_url("LM", None)]);
    }

    #[tokio::test]
    async fn a_new_total_or_a_new_first_page_reads_the_list_again() {
        for list in [stored("LM", 2, &["a", "b"], NOW - HOUR), stored("LM", 3, &["x", "b"], NOW - HOUR)] {
            let api = two_pages();
            let base = SyncBaseline { lists: vec![list], known_ids: known(&["a", "b", "c"]) };
            let changes = fetch_changes(&api, &base, NOW).await.unwrap();
            assert!(matches!(changes.lists[0].1, ListChange::Full { .. }));
            assert_eq!(api.calls().len(), 2, "every page, and no videos call: all known");
        }
    }

    #[tokio::test]
    async fn once_a_day_a_list_is_read_in_full_whatever_its_first_page_says() {
        let api = two_pages();
        let base = SyncBaseline {
            lists: vec![stored("LM", 3, &["a", "b"], NOW - FULL_REFETCH_MS)],
            known_ids: known(&["a", "b", "c"]),
        };
        let changes = fetch_changes(&api, &base, NOW).await.unwrap();
        assert!(matches!(changes.lists[0].1, ListChange::Full { .. }));
    }

    #[tokio::test]
    async fn a_playlist_that_disappeared_is_marked_and_the_rest_still_sync() {
        let gone = YtmError::Api { status: 404, message: "x".into(), reason: Some("playlistNotFound".into()) };
        let api = FakeApi::default()
            .page(items_url("LM", None), page_of(&["a"], 1, None))
            .fail(items_url("PLgone", None), gone)
            .page(items_url("PL2", None), page_of(&["b"], 1, None));
        let base = SyncBaseline {
            lists: vec![ListBaseline::new("LM"), ListBaseline::new("PLgone"), ListBaseline::new("PL2")],
            known_ids: known(&["a", "b"]),
        };
        let changes = fetch_changes(&api, &base, NOW).await.unwrap();
        assert_eq!(changes.lists[1], ("PLgone".to_string(), ListChange::Gone));
        assert!(matches!(changes.lists[2].1, ListChange::Full { .. }));
    }

    #[tokio::test]
    async fn a_used_up_quota_fails_the_whole_sync() {
        let api = FakeApi::default().fail(items_url("LM", None), YtmError::QuotaExceeded);
        let base = SyncBaseline { lists: vec![ListBaseline::new("LM")], known_ids: HashSet::new() };
        assert_eq!(fetch_changes(&api, &base, NOW).await, Err(YtmError::QuotaExceeded));
    }

    #[tokio::test]
    async fn lengths_are_asked_for_fifty_videos_at_a_time() {
        let ids: Vec<String> = (0..51).map(|i| format!("v{i:02}")).collect();
        let ids: Vec<&str> = ids.iter().map(String::as_str).collect();
        let api = FakeApi::default()
            .page(items_url("LM", None), page_of(&ids[..50], 51, Some("P2")))
            .page(items_url("LM", Some("P2")), page_of(&ids[50..], 51, None))
            .page(videos_url(&ids[..50]), json!({ "items": [] }))
            .page(videos_url(&ids[50..]), json!({ "items": [] }));
        let base = SyncBaseline { lists: vec![ListBaseline::new("LM")], known_ids: HashSet::new() };
        fetch_changes(&api, &base, NOW).await.unwrap();
        assert_eq!(api.calls().len(), 4, "2 pages, then 2 videos calls for 51 new videos");
    }

    #[tokio::test]
    async fn a_new_video_in_two_lists_is_asked_for_once() {
        let api = FakeApi::default()
            .page(items_url("LM", None), page_of(&["a"], 1, None))
            .page(items_url("PL1", None), page_of(&["a"], 1, None))
            .page(videos_url(&["a"]), lengths(&[("a", "PT4M")]));
        let base = SyncBaseline {
            lists: vec![ListBaseline::new("LM"), ListBaseline::new("PL1")],
            known_ids: HashSet::new(),
        };
        let changes = fetch_changes(&api, &base, NOW).await.unwrap();
        assert_eq!(changes.durations, HashMap::from([("a".to_string(), 240_000)]));
        assert_eq!(api.calls().len(), 3);
    }

    #[tokio::test]
    async fn a_stored_video_without_a_length_is_asked_again_at_a_full_read() {
        // b is stored but YouTube had no length for it (a premiere); a and c
        // have theirs.
        let api = two_pages().page(videos_url(&["b"]), lengths(&[("b", "PT6M")]));
        let base = SyncBaseline {
            lists: vec![stored("LM", 2, &["a", "b"], NOW - HOUR)],
            known_ids: known(&["a", "c"]),
        };
        let changes = fetch_changes(&api, &base, NOW).await.unwrap();
        assert_eq!(changes.durations, HashMap::from([("b".to_string(), 360_000)]));
        assert_eq!(api.calls().len(), 3, "two pages, then b alone: 1 unit");
    }

    #[tokio::test]
    async fn a_playlist_added_by_link_is_named_then_read_in_full() {
        let api = FakeApi::default()
            .page(playlist_url("PLx"), json!({ "items": [{ "snippet": { "title": "Deep Cuts" } }] }))
            .page(items_url("PLx", None), page_of(&["a"], 1, None))
            .page(videos_url(&["a"]), lengths(&[("a", "PT7M")]));
        let (name, changes) = fetch_new_playlist(&api, "PLx", &HashSet::new(), NOW).await.unwrap().unwrap();
        assert_eq!(name, "Deep Cuts");
        assert!(matches!(changes.lists.as_slice(), [(_, ListChange::Full { .. })]));
        assert_eq!(api.calls().len(), 3, "1 unit for the name, then the read");
    }

    #[tokio::test]
    async fn a_playlist_youtube_does_not_show_is_not_found() {
        let api = FakeApi::default().page(playlist_url("PLprivate"), json!({ "items": [] }));
        assert_eq!(fetch_new_playlist(&api, "PLprivate", &HashSet::new(), NOW).await, Ok(None));
        assert_eq!(api.calls().len(), 1, "nothing read past the name");

        let gone = YtmError::Api { status: 404, message: "x".into(), reason: None };
        let api = FakeApi::default()
            .page(playlist_url("PLy"), json!({ "items": [{ "snippet": { "title": "Y" } }] }))
            .fail(items_url("PLy", None), gone.clone());
        assert_eq!(fetch_new_playlist(&api, "PLy", &HashSet::new(), NOW).await, Ok(None));

        let api = FakeApi::default().fail(playlist_url("PLz"), gone);
        assert_eq!(fetch_new_playlist(&api, "PLz", &HashSet::new(), NOW).await, Ok(None));
    }

    #[tokio::test]
    async fn a_repeated_page_token_stops_the_read_with_an_error() {
        let api = FakeApi::default()
            .page(items_url("LM", None), page_of(&["a"], 9, Some("P2")))
            .page(items_url("LM", Some("P2")), page_of(&["b"], 9, Some("P2")));
        let base = SyncBaseline { lists: vec![ListBaseline::new("LM")], known_ids: HashSet::new() };
        assert!(matches!(fetch_changes(&api, &base, NOW).await, Err(YtmError::Network(_))));
        assert_eq!(api.calls().len(), 2, "page one and P2 once, not again");
    }

    #[tokio::test]
    async fn a_404_on_a_later_page_marks_the_list_gone() {
        let gone = YtmError::Api { status: 404, message: "x".into(), reason: None };
        let api = FakeApi::default()
            .page(items_url("LM", None), page_of(&["a"], 2, Some("P2")))
            .fail(items_url("LM", Some("P2")), gone);
        let base = SyncBaseline { lists: vec![ListBaseline::new("LM")], known_ids: HashSet::new() };
        let changes = fetch_changes(&api, &base, NOW).await.unwrap();
        assert_eq!(changes.lists, vec![("LM".to_string(), ListChange::Gone)]);
    }
}
