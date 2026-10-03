// src-tauri/src/external/resident_advisor.rs
//! Gigs from Resident Advisor, read from the GraphQL endpoint ra.co itself uses.
//!
//! RA has no public API and no key. The endpoint answers a plain POST, but only
//! with a User-Agent that names the client: reqwest's default gets Cloudflare's
//! 403 page. It is asked only when a DJ page opens and its gigs are a day old —
//! never in the background, never in bulk.
//!
//! Nothing here trusts the shape of the answer. Every field is optional, an
//! event without an id or a date is dropped rather than failing the list, and
//! an answer of another shape is an `RaError`, never a panic. The page then
//! shows "Gigs on Resident Advisor ↗" and nothing else depends on RA.
//!
//! Captured responses are never committed: the tests use hand-written JSON.

use crate::db::dj::{DjGig, DjRaArtist};
use serde_json::{json, Value};
use std::future::Future;
use std::time::Duration;

pub const GRAPHQL_URL: &str = "https://ra.co/graphql";
const SITE: &str = "https://ra.co";
/// Artist search, ARTIST index only. `contentUrl` is "/dj/<slug>".
pub const SEARCH_QUERY: &str = "query Search($searchTerm: String!, $limit: Int, $indices: [IndexType!]) { search(searchTerm: $searchTerm, limit: $limit, indices: $indices, includeNonLive: false) { searchType id value contentUrl imageUrl } }";
/// The artist and both event lists in one request. LATEST is upcoming,
/// earliest first, today included; PREVIOUS is past, newest first. Dates are
/// the venue's local time without a zone: "2026-10-03T00:00:00.000".
pub const ARTIST_EVENTS_QUERY: &str = "query ArtistEvents($slug: String!) { artist(slug: $slug) { id name urlSafeName contentUrl image upcoming: events(limit: 100, type: LATEST) { ...E } past: events(limit: 20, type: PREVIOUS) { ...E } } } fragment E on Event { id title date contentUrl venue { name area { name country { urlCode } } } artists { name } }";
/// Search results asked for — also the "Not this artist?" list.
pub const SEARCH_LIMIT: u32 = 10;
/// The largest answer read (RA's are a few hundred KB at most).
const MAX_BODY_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq)]
pub enum RaError {
    /// RA could not be reached.
    Network(String),
    /// An error status — 403 is the bot protection.
    Http(u16),
    /// An answer that is not what was asked for: RA changed something.
    Shape(String),
    /// GraphQL's own `{"errors":[…]}`.
    GraphQl(String),
}

impl std::fmt::Display for RaError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Network(message) => write!(f, "{message}"),
            Self::Http(403) => write!(f, "Resident Advisor refused the request"),
            Self::Http(status) => write!(f, "Resident Advisor answered {status}"),
            Self::Shape(what) => write!(f, "Resident Advisor answered in an unexpected shape ({what})"),
            Self::GraphQl(message) => write!(f, "Resident Advisor: {message}"),
        }
    }
}

impl std::error::Error for RaError {}

/// An artist from RA's search.
#[derive(Debug, Clone, PartialEq)]
pub struct RaSearchHit {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub image_url: Option<String>,
}

/// An artist page: who, and every gig RA lists for them.
#[derive(Debug, Clone, PartialEq)]
pub struct RaArtistEvents {
    pub artist: DjRaArtist,
    pub name: String,
    /// Upcoming then past, each event once.
    pub gigs: Vec<DjGig>,
}

/// The artist page RA usually has for a name: lower-case, every character
/// that is not an ASCII letter or digit dropped. "Marco Carola" →
/// "marcocarola". It may 404 for unusual names.
pub fn guess_ra_slug(name: &str) -> String {
    name.chars()
        .filter(char::is_ascii_alphanumeric)
        .map(|c| c.to_ascii_lowercase())
        .collect()
}

pub fn artist_page_url(slug: &str) -> String {
    format!("{SITE}/dj/{slug}")
}

/// A slug is used in a URL: letters, digits, `-` and `_` only.
pub fn valid_slug(slug: &str) -> bool {
    !slug.is_empty()
        && slug.len() <= 100
        && slug.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// The search result whose name is the DJ name, ignoring case and outer spaces.
pub fn pick_exact<'a>(name: &str, hits: &'a [RaSearchHit]) -> Option<&'a RaSearchHit> {
    let wanted = name.trim().to_lowercase();
    hits.iter().find(|hit| hit.name.trim().to_lowercase() == wanted)
}

// --- reading the answers -------------------------------------------------

/// A non-empty string field.
fn text(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

/// An id, sent as a string or as a number.
fn id_of(value: &Value) -> Option<String> {
    match value.get("id")? {
        Value::String(s) if !s.trim().is_empty() => Some(s.trim().to_string()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

/// "2026-10-12T00:00:00.000" → "2026-10-12". Anything else is no date.
fn day_of(date: &str) -> Option<String> {
    let day = date.get(..10)?;
    let b = day.as_bytes();
    let shaped = b[4] == b'-'
        && b[7] == b'-'
        && b.iter().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit());
    shaped.then(|| day.to_string())
}

/// "/dj/marcocarola" → "marcocarola".
fn slug_of(content_url: &str) -> Option<String> {
    let slug = content_url.trim().strip_prefix("/dj/")?.trim_end_matches('/');
    valid_slug(slug).then(|| slug.to_string())
}

/// The `data` object, or what went wrong instead.
fn data_of(body: &Value) -> Result<&Value, RaError> {
    if let Some(data) = body.get("data").filter(|d| d.is_object()) {
        return Ok(data);
    }
    let first_error = body
        .get("errors")
        .and_then(Value::as_array)
        .and_then(|errors| errors.first());
    match first_error {
        Some(error) => Err(RaError::GraphQl(
            text(error, "message")
                .map(|m| m.chars().take(200).collect::<String>())
                .unwrap_or_else(|| "unknown error".to_string()),
        )),
        None => Err(RaError::Shape("no data".to_string())),
    }
}

pub fn parse_search(body: &Value) -> Result<Vec<RaSearchHit>, RaError> {
    let hits = data_of(body)?
        .get("search")
        .and_then(Value::as_array)
        .ok_or_else(|| RaError::Shape("search is not a list".to_string()))?;
    Ok(hits
        .iter()
        .filter(|hit| hit.get("searchType").and_then(Value::as_str).unwrap_or("ARTIST") == "ARTIST")
        .filter_map(|hit| {
            let name = text(hit, "value")?;
            let slug = text(hit, "contentUrl")
                .and_then(|url| slug_of(&url))
                .or_else(|| Some(guess_ra_slug(&name)).filter(|s| !s.is_empty()))?;
            Some(RaSearchHit { id: id_of(hit)?, name, slug, image_url: text(hit, "imageUrl") })
        })
        .collect())
}

/// One event as a gig, or None when it has no id or no readable date.
fn parse_event(event: &Value, own_name: &str) -> Option<DjGig> {
    let id = id_of(event)?;
    let date = day_of(&text(event, "date")?)?;
    let venue = event.get("venue").filter(|v| v.is_object());
    let area = venue.and_then(|v| v.get("area")).filter(|a| a.is_object());
    // "All" is a country-wide listing, not a city.
    let city = area
        .and_then(|a| text(a, "name"))
        .filter(|name| !name.eq_ignore_ascii_case("all"));
    let country = area
        .and_then(|a| a.pointer("/country/urlCode"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|code| !code.is_empty())
        .map(str::to_uppercase);

    let own = own_name.trim().to_lowercase();
    let others: Vec<String> = event
        .get("artists")
        .and_then(Value::as_array)
        .map(|artists| {
            artists
                .iter()
                .filter_map(|a| text(a, "name"))
                .filter(|name| name.to_lowercase() != own)
                .collect()
        })
        .unwrap_or_default();

    let url = text(event, "contentUrl")
        .filter(|path| path.starts_with('/'))
        .map(|path| format!("{SITE}{path}"))
        .unwrap_or_else(|| format!("{SITE}/events/{id}"));

    Some(DjGig {
        ra_event_id: id,
        date,
        venue: venue.and_then(|v| text(v, "name")),
        city,
        country,
        lineup: (!others.is_empty()).then(|| others.join(", ")),
        url: Some(url),
    })
}

/// The answer to `ARTIST_EVENTS_QUERY`. `Ok(None)` is RA saying there is no
/// artist with that slug.
pub fn parse_artist_events(body: &Value, slug: &str) -> Result<Option<RaArtistEvents>, RaError> {
    let artist = match data_of(body)?.get("artist") {
        Some(Value::Null) => return Ok(None),
        Some(artist) if artist.is_object() => artist,
        _ => return Err(RaError::Shape("no artist object".to_string())),
    };
    let id = id_of(artist).ok_or_else(|| RaError::Shape("artist without an id".to_string()))?;
    let name = text(artist, "name").unwrap_or_default();
    let slug = text(artist, "urlSafeName")
        .filter(|s| valid_slug(s))
        .or_else(|| text(artist, "contentUrl").and_then(|url| slug_of(&url)))
        .unwrap_or_else(|| slug.to_string());

    let mut gigs: Vec<DjGig> = Vec::new();
    for list in ["upcoming", "past"] {
        let events = artist.get(list).and_then(Value::as_array);
        for gig in events.into_iter().flatten().filter_map(|e| parse_event(e, &name)) {
            // Today can be in both lists.
            if !gigs.iter().any(|known| known.ra_event_id == gig.ra_event_id) {
                gigs.push(gig);
            }
        }
    }

    Ok(Some(RaArtistEvents {
        artist: DjRaArtist { id, slug, image_url: text(artist, "image") },
        name,
        gigs,
    }))
}

// --- asking RA -----------------------------------------------------------

/// One GraphQL request, answering with the JSON body. Tests replay hand-written answers.
pub trait RaApi {
    fn query(&self, query: &'static str, variables: Value) -> impl Future<Output = Result<Value, RaError>> + Send;
}

pub async fn search_artists<A: RaApi + Sync>(api: &A, term: &str) -> Result<Vec<RaSearchHit>, RaError> {
    let variables = json!({ "searchTerm": term.trim(), "limit": SEARCH_LIMIT, "indices": ["ARTIST"] });
    parse_search(&api.query(SEARCH_QUERY, variables).await?)
}

pub async fn artist_events<A: RaApi + Sync>(api: &A, slug: &str) -> Result<Option<RaArtistEvents>, RaError> {
    if !valid_slug(slug) {
        return Ok(None);
    }
    let body = api.query(ARTIST_EVENTS_QUERY, json!({ "slug": slug })).await?;
    parse_artist_events(&body, slug)
}

/// Resolves a DJ name on RA and reads its gigs: the search result named
/// exactly like the DJ, else the slug guessed from the name. A search that
/// fails or finds no exact name still tries the guess. `Ok(None)`: no artist.
pub async fn find_artist<A: RaApi + Sync>(api: &A, name: &str) -> Result<Option<RaArtistEvents>, RaError> {
    let found = match search_artists(api, name).await {
        Ok(hits) => pick_exact(name, &hits).map(|hit| hit.slug.clone()),
        Err(_) => None,
    };
    let slug = found.unwrap_or_else(|| guess_ra_slug(name));
    artist_events(api, &slug).await
}

/// RA over HTTPS.
pub struct LiveRa {
    http: reqwest::Client,
}

impl LiveRa {
    pub fn new() -> Result<Self, RaError> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .user_agent(concat!("RecoDeck/", env!("CARGO_PKG_VERSION"), " (desktop app)"))
            .build()
            .map_err(|e| RaError::Network(format!("Could not build HTTP client: {e}")))?;
        Ok(Self { http })
    }
}

impl RaApi for LiveRa {
    async fn query(&self, query: &'static str, variables: Value) -> Result<Value, RaError> {
        let mut response = self
            .http
            .post(GRAPHQL_URL)
            .header("Referer", "https://ra.co/")
            .header("Origin", SITE)
            .json(&json!({ "query": query, "variables": variables }))
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    RaError::Network("Resident Advisor did not answer in 30 seconds".to_string())
                } else {
                    RaError::Network(format!("Could not reach Resident Advisor: {e}"))
                }
            })?;
        let status = response.status().as_u16();
        if !(200..300).contains(&status) {
            return Err(RaError::Http(status));
        }
        // A GraphQL answer is small; refuse anything huge rather than buffer it.
        if response.content_length().is_some_and(|n| n > MAX_BODY_BYTES) {
            return Err(too_large());
        }
        // Read in chunks and stop at the cap too: a chunked answer has no
        // Content-Length to check first.
        let body = read_capped(&mut response, MAX_BODY_BYTES).await?;
        serde_json::from_slice(&body).map_err(|_| RaError::Shape("not JSON".to_string()))
    }
}

fn too_large() -> RaError {
    RaError::Shape("answer too large".to_string())
}

/// A response body, a chunk at a time.
trait BodyChunks {
    /// The next chunk, or None at the end.
    async fn next_chunk(&mut self) -> Result<Option<Vec<u8>>, RaError>;
}

impl BodyChunks for reqwest::Response {
    async fn next_chunk(&mut self) -> Result<Option<Vec<u8>>, RaError> {
        self.chunk()
            .await
            .map(|chunk| chunk.map(|bytes| bytes.to_vec()))
            .map_err(|e| RaError::Network(format!("Could not read Resident Advisor's answer: {e}")))
    }
}

/// The whole body, or `answer too large` as soon as it passes `cap` bytes —
/// without reading the rest.
async fn read_capped<B: BodyChunks>(body: &mut B, cap: u64) -> Result<Vec<u8>, RaError> {
    let mut out = Vec::new();
    while let Some(chunk) = body.next_chunk().await? {
        if (out.len() + chunk.len()) as u64 > cap {
            return Err(too_large());
        }
        out.extend_from_slice(&chunk);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::Mutex;

    fn event(id: Value, date: Value) -> Value {
        let path = match &id {
            Value::String(s) => format!("/events/{s}"),
            other => format!("/events/{other}"),
        };
        json!({
            "id": id, "title": "Music On", "date": date, "contentUrl": path,
            "venue": { "name": "Amnesia", "area": { "name": "Ibiza", "country": { "urlCode": "es" } } },
            "artists": [{ "name": "Marco Carola" }, { "name": "Loco Dice" }, { "name": "Luciano" }]
        })
    }

    fn artist_body(upcoming: Vec<Value>, past: Vec<Value>) -> Value {
        json!({ "data": { "artist": {
            "id": "570", "name": "Marco Carola", "urlSafeName": "marcocarola", "contentUrl": "/dj/marcocarola",
            "image": "https://static.ra.co/images/profiles/square/marcocarola.jpg",
            "upcoming": upcoming, "past": past
        }}})
    }

    #[test]
    fn reads_artist_search_results() {
        let body = json!({ "data": { "search": [
            { "searchType": "ARTIST", "id": "570", "value": "Marco Carola", "contentUrl": "/dj/marcocarola",
              "imageUrl": "https://static.ra.co/images/profiles/square/marcocarola.jpg" },
            { "searchType": "ARTIST", "id": 8812, "value": "Marco Carola Jr", "contentUrl": "/dj/marcocarolajr", "imageUrl": null },
            { "searchType": "CLUB", "id": "1", "value": "Marco's", "contentUrl": "/clubs/1" }
        ]}});
        assert_eq!(
            parse_search(&body).unwrap(),
            vec![
                RaSearchHit {
                    id: "570".into(),
                    name: "Marco Carola".into(),
                    slug: "marcocarola".into(),
                    image_url: Some("https://static.ra.co/images/profiles/square/marcocarola.jpg".into()),
                },
                RaSearchHit {
                    id: "8812".into(),
                    name: "Marco Carola Jr".into(),
                    slug: "marcocarolajr".into(),
                    image_url: None,
                },
            ]
        );
    }

    #[test]
    fn search_results_tolerate_missing_and_unknown_fields() {
        let body = json!({ "data": { "search": [
            { "id": "1", "value": "Luciano", "somethingNew": { "nested": true } },
            { "value": "No id" },
            { "id": "3" },
            { "id": "4", "value": "Bad url", "contentUrl": "/dj/../../x" }
        ]}, "extensions": { "cost": 3 } });
        let hits = parse_search(&body).unwrap();
        assert_eq!(hits.iter().map(|h| (h.id.as_str(), h.slug.as_str())).collect::<Vec<_>>(), [
            ("1", "luciano"),
            ("4", "badurl"),
        ]);
    }

    #[test]
    fn reads_an_artist_and_their_gigs() {
        let body = artist_body(
            vec![event(json!("2001"), json!("2026-10-12T00:00:00.000"))],
            vec![event(json!(1999), json!("2026-08-01T00:00:00.000"))],
        );
        let found = parse_artist_events(&body, "marcocarola").unwrap().expect("an artist");
        assert_eq!(
            found.artist,
            DjRaArtist {
                id: "570".into(),
                slug: "marcocarola".into(),
                image_url: Some("https://static.ra.co/images/profiles/square/marcocarola.jpg".into()),
            }
        );
        assert_eq!(found.name, "Marco Carola");
        assert_eq!(
            found.gigs,
            vec![
                DjGig {
                    ra_event_id: "2001".into(),
                    date: "2026-10-12".into(),
                    venue: Some("Amnesia".into()),
                    city: Some("Ibiza".into()),
                    country: Some("ES".into()),
                    lineup: Some("Loco Dice, Luciano".into()),
                    url: Some("https://ra.co/events/2001".into()),
                },
                DjGig {
                    ra_event_id: "1999".into(),
                    date: "2026-08-01".into(),
                    venue: Some("Amnesia".into()),
                    city: Some("Ibiza".into()),
                    country: Some("ES".into()),
                    lineup: Some("Loco Dice, Luciano".into()),
                    url: Some("https://ra.co/events/1999".into()),
                },
            ]
        );
    }

    #[test]
    fn events_without_an_id_or_a_date_are_dropped_and_missing_fields_are_none() {
        let body = artist_body(
            vec![
                json!({ "date": "2026-10-12T00:00:00.000" }),
                json!({ "id": "2", "date": null }),
                json!({ "id": "3", "date": "next Friday" }),
                json!({ "id": "4", "date": "2026-11-01T23:00:00.000", "venue": null, "artists": null, "unknown": 1 }),
                json!({ "id": "5", "date": "2026-11-02T00:00:00.000",
                        "venue": { "name": "TBA", "area": { "name": "All", "country": { "urlCode": "DE" } } },
                        "artists": [{ "name": "MARCO CAROLA" }] }),
            ],
            vec![],
        );
        let gigs = parse_artist_events(&body, "marcocarola").unwrap().unwrap().gigs;
        assert_eq!(
            gigs,
            vec![
                DjGig {
                    ra_event_id: "4".into(),
                    date: "2026-11-01".into(),
                    venue: None,
                    city: None,
                    country: None,
                    lineup: None,
                    url: Some("https://ra.co/events/4".into()),
                },
                DjGig {
                    ra_event_id: "5".into(),
                    date: "2026-11-02".into(),
                    venue: Some("TBA".into()),
                    city: None,
                    country: Some("DE".into()),
                    lineup: None,
                    url: Some("https://ra.co/events/5".into()),
                },
            ]
        );
    }

    #[test]
    fn an_event_in_both_lists_is_kept_once() {
        let today = event(json!("7"), json!("2026-10-03T00:00:00.000"));
        let body = artist_body(vec![today.clone()], vec![today]);
        assert_eq!(parse_artist_events(&body, "marcocarola").unwrap().unwrap().gigs.len(), 1);
    }

    #[test]
    fn an_artist_without_lists_or_slug_still_reads() {
        let body = json!({ "data": { "artist": { "id": 570, "name": "Marco Carola" } } });
        let found = parse_artist_events(&body, "marcocarola").unwrap().unwrap();
        assert_eq!(found.artist.id, "570");
        assert_eq!(found.artist.slug, "marcocarola", "falls back to the slug asked for");
        assert!(found.gigs.is_empty());
    }

    #[test]
    fn an_unknown_slug_is_no_artist() {
        let body = json!({ "data": { "artist": null } });
        assert_eq!(parse_artist_events(&body, "nobody").unwrap(), None);
    }

    #[test]
    fn graphql_errors_are_an_error() {
        let body = json!({ "errors": [{ "message": "Cannot query field \"urlSafeName\" on type \"Artist\"." }] });
        assert_eq!(
            parse_artist_events(&body, "x"),
            Err(RaError::GraphQl("Cannot query field \"urlSafeName\" on type \"Artist\".".into()))
        );
        assert!(matches!(parse_search(&body), Err(RaError::GraphQl(_))));
    }

    #[test]
    fn a_wholly_different_shape_is_an_error_and_never_a_panic() {
        for body in [
            json!([1, 2, 3]),
            json!("<html>Just a moment…</html>"),
            json!({ "foo": 1 }),
            json!({ "data": null }),
            json!({ "data": { "artist": "Marco Carola" } }),
            json!({ "data": { "artist": { "name": "no id" } } }),
            json!({ "data": { "artists": [] } }),
            json!({ "errors": "not a list" }),
        ] {
            assert!(matches!(parse_artist_events(&body, "x"), Err(RaError::Shape(_))), "{body}");
        }
        for body in [json!({ "data": { "search": { "items": [] } } }), json!(null), json!({ "data": {} })] {
            assert!(matches!(parse_search(&body), Err(RaError::Shape(_))), "{body}");
        }
    }

    #[test]
    fn guesses_the_usual_slug_from_a_name() {
        assert_eq!(guess_ra_slug("Marco Carola"), "marcocarola");
        assert_eq!(guess_ra_slug("  DJ Koze "), "djkoze");
        assert_eq!(guess_ra_slug("Âme"), "me");
        assert_eq!(guess_ra_slug("Seth Troxler & The Martinez Brothers"), "sethtroxlerthemartinezbrothers");
        assert_eq!(artist_page_url("marcocarola"), "https://ra.co/dj/marcocarola");
    }

    #[test]
    fn slugs_are_checked_before_they_are_used() {
        assert!(valid_slug("marcocarola"));
        assert!(valid_slug("dj-koze_2"));
        assert!(!valid_slug(""));
        assert!(!valid_slug("../x"));
        assert!(!valid_slug("a b"));
    }

    #[test]
    fn picks_the_result_named_exactly_like_the_dj() {
        let hit = |id: &str, name: &str| RaSearchHit {
            id: id.into(),
            name: name.into(),
            slug: guess_ra_slug(name),
            image_url: None,
        };
        let hits = vec![hit("1", "Marco Carola Jr"), hit("2", "marco carola")];
        assert_eq!(pick_exact(" Marco Carola ", &hits).map(|h| h.id.as_str()), Some("2"));
        assert_eq!(pick_exact("Luciano", &hits), None);
    }

    // --- resolving ----------------------------------------------------

    /// Answers by the query's slug or search term, and records the variables asked for.
    #[derive(Default)]
    struct FakeRa {
        answers: HashMap<String, Result<Value, RaError>>,
        calls: Mutex<Vec<Value>>,
    }

    impl FakeRa {
        fn answer(mut self, key: &str, body: Result<Value, RaError>) -> Self {
            self.answers.insert(key.to_string(), body);
            self
        }

        fn calls(&self) -> Vec<Value> {
            self.calls.lock().unwrap().clone()
        }
    }

    impl RaApi for FakeRa {
        fn query(&self, _query: &'static str, variables: Value) -> impl Future<Output = Result<Value, RaError>> + Send {
            self.calls.lock().unwrap().push(variables.clone());
            let key = variables
                .get("slug")
                .or_else(|| variables.get("searchTerm"))
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let answer = self.answers.get(&key).cloned().unwrap_or(Err(RaError::Http(404)));
            async move { answer }
        }
    }

    fn search_body(hits: &[(&str, &str, &str)]) -> Value {
        let hits: Vec<Value> = hits
            .iter()
            .map(|(id, name, slug)| json!({ "searchType": "ARTIST", "id": id, "value": name, "contentUrl": format!("/dj/{slug}") }))
            .collect();
        json!({ "data": { "search": hits } })
    }

    #[tokio::test]
    async fn an_exact_search_result_is_followed_to_its_page() {
        let api = FakeRa::default()
            .answer("Marco Carola", Ok(search_body(&[("9", "Marco Carola Jr", "mcjr"), ("570", "Marco Carola", "marco-carola")])))
            .answer("marco-carola", Ok(artist_body(vec![], vec![])));

        let found = find_artist(&api, "Marco Carola").await.unwrap().unwrap();

        assert_eq!(found.artist.id, "570");
        assert_eq!(
            api.calls(),
            vec![
                json!({ "searchTerm": "Marco Carola", "limit": 10, "indices": ["ARTIST"] }),
                json!({ "slug": "marco-carola" }),
            ]
        );
    }

    #[tokio::test]
    async fn without_an_exact_result_the_guessed_slug_is_tried() {
        let api = FakeRa::default()
            .answer("Marco Carola", Ok(search_body(&[("9", "Marco Carola Jr", "mcjr")])))
            .answer("marcocarola", Ok(artist_body(vec![], vec![])));
        assert!(find_artist(&api, "Marco Carola").await.unwrap().is_some());
        assert_eq!(api.calls()[1], json!({ "slug": "marcocarola" }));
    }

    #[tokio::test]
    async fn a_failed_search_still_tries_the_guess_and_reports_what_that_says() {
        let api = FakeRa::default()
            .answer("Marco Carola", Err(RaError::GraphQl("search is down".into())))
            .answer("marcocarola", Ok(json!({ "data": { "artist": null } })));
        assert_eq!(find_artist(&api, "Marco Carola").await, Ok(None));

        let blocked = FakeRa::default();
        assert_eq!(find_artist(&blocked, "Marco Carola").await, Err(RaError::Http(404)));
    }

    #[tokio::test]
    async fn a_name_with_no_usable_slug_asks_nothing_more() {
        let api = FakeRa::default().answer("Âü", Ok(search_body(&[])));
        assert_eq!(find_artist(&api, "Âü").await, Ok(None));
        assert_eq!(api.calls().len(), 1);
    }

    #[test]
    fn errors_read_as_a_person_would_say_them() {
        assert_eq!(RaError::Http(403).to_string(), "Resident Advisor refused the request");
        assert_eq!(RaError::Http(500).to_string(), "Resident Advisor answered 500");
        assert_eq!(
            RaError::Shape("no data".into()).to_string(),
            "Resident Advisor answered in an unexpected shape (no data)"
        );
    }
    /// A body of `size`-byte chunks that never ends, counting what was read.
    struct Endless {
        size: usize,
        read: usize,
    }

    impl BodyChunks for Endless {
        async fn next_chunk(&mut self) -> Result<Option<Vec<u8>>, RaError> {
            self.read += 1;
            Ok(Some(vec![b' '; self.size]))
        }
    }

    struct Chunks(Vec<Vec<u8>>);

    impl BodyChunks for Chunks {
        async fn next_chunk(&mut self) -> Result<Option<Vec<u8>>, RaError> {
            Ok((!self.0.is_empty()).then(|| self.0.remove(0)))
        }
    }

    #[tokio::test]
    async fn a_body_without_a_length_stops_being_read_at_the_cap() {
        let mut body = Endless { size: 1024, read: 0 };
        assert_eq!(read_capped(&mut body, 10 * 1024).await, Err(too_large()));
        assert_eq!(body.read, 11, "stopped at the chunk that passed the cap");

        let mut real_cap = Endless { size: 64 * 1024, read: 0 };
        assert_eq!(read_capped(&mut real_cap, MAX_BODY_BYTES).await, Err(too_large()));
        assert_eq!(real_cap.read as u64, MAX_BODY_BYTES / (64 * 1024) + 1);
    }

    #[tokio::test]
    async fn a_body_up_to_the_cap_is_read_whole() {
        let mut body = Chunks(vec![b"{\"a\":".to_vec(), b"1}".to_vec()]);
        assert_eq!(read_capped(&mut body, 8).await.unwrap(), b"{\"a\":1}");
        let mut over = Chunks(vec![b"{\"a\":".to_vec(), b"123}".to_vec()]);
        assert_eq!(read_capped(&mut over, 8).await, Err(too_large()));
    }
}
