// src-tauri/src/external/dj_releases.rs
//! A DJ's tracks on Spotify, at a cost that stays bounded however big the
//! discography is.
//!
//! Development-mode apps list an artist's releases 10 at a time and cannot
//! fetch several albums at once, so the cost is held down by what is read:
//! - **Listing.** The artist's own albums and singles in full, plus only the
//!   newest `appears_limit` (150) appears-on / compilation releases — those
//!   run to thousands for a busy remixer. "Load older releases" widens that
//!   window by another 150. Once anything is recorded, a refresh reads each
//!   group only up to the first release already recorded (Spotify lists
//!   newest first), which is a handful of requests a week.
//! - **Tracks.** Only releases whose tracks were never stored are read, 20
//!   releases per batch. Each finished batch is stored at once, with its
//!   releases marked fetched, so an interrupted first fetch continues from
//!   there on the next open.
//!
//! A track is kept when the DJ's artist id is among the *track's* artists: a
//! remix on someone else's EP stays, the rest of a compilation goes.

use crate::db::dj::{DjRelease, DjTrack, APPEARS_STEP};
use crate::external::spotify::{
    album_tracks_url, artist_albums_url, next_page, parse_album_track_page, parse_release_page, SpotifyApi,
    SpotifyError,
};
use std::collections::HashSet;

/// The artist's own releases: every one is read.
const OWN_GROUPS: [&str; 2] = ["album", "single"];
/// Other people's releases the artist is on: only the newest window.
const APPEARS_GROUPS: [&str; 2] = ["appears_on", "compilation"];
/// Releases per batch. Tracks are stored and progress reported after each.
pub const BATCH_SIZE: usize = 20;

/// Which listing to make.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Listing {
    /// The first fetch when nothing is recorded yet; otherwise only what is
    /// newer than the newest recorded release of each group.
    Update,
    /// Every group again, with the appears-on window 150 wider.
    LoadOlder,
}

/// Where a fetch keeps what it found, for one DJ. The command's store locks the
/// shared database for each call (never across a request); tests use an
/// in-memory database.
pub trait ReleaseStore {
    /// Whether the profile still points at the Spotify artist being fetched
    /// (and Spotify is still connected). Asked before every write; a fetch
    /// whose artist changed meanwhile stops instead of writing old tracks.
    fn is_current(&self) -> Result<bool, String>;
    fn known_releases(&self) -> Result<HashSet<String>, String>;
    /// Records a whole listing, with the window it was made with, in one go.
    fn record_releases(
        &self,
        releases: &[DjRelease],
        appears_limit: i64,
        appears_total: Option<i64>,
    ) -> Result<(), String>;
    /// Recorded releases whose tracks are not stored yet.
    fn pending_releases(&self) -> Result<Vec<DjRelease>, String>;
    /// One finished batch: its tracks, and its releases marked fetched.
    fn write_batch(&self, release_ids: &[String], tracks: &[DjTrack]) -> Result<(), String>;
    /// Called once every release is fetched.
    fn mark_synced(&self) -> Result<(), String>;
}

#[derive(Debug, Clone, PartialEq)]
pub enum FetchError {
    Spotify(SpotifyError),
    Store(String),
    /// The profile switched to another Spotify artist, or Spotify was
    /// disconnected, while fetching. Nothing more was written.
    Superseded,
}

impl std::fmt::Display for FetchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Spotify(err) => write!(f, "{err}"),
            Self::Store(message) => write!(f, "Could not store the tracks: {message}"),
            Self::Superseded => write!(f, "This DJ's Spotify artist changed while its tracks were being read"),
        }
    }
}

impl From<SpotifyError> for FetchError {
    fn from(err: SpotifyError) -> Self {
        Self::Spotify(err)
    }
}

/// What a fetch did.
#[derive(Debug, Clone, PartialEq)]
pub struct FetchSummary {
    /// Releases recorded for the first time by this listing.
    pub new_releases: usize,
    /// Releases whose tracks were read (new ones and any left from before).
    pub releases_read: usize,
    pub tracks_kept: usize,
}

/// What a listing found, ready to record.
struct Listed {
    releases: Vec<DjRelease>,
    appears_limit: i64,
    appears_total: Option<i64>,
}

/// One group of releases, newest first: up to `max` of them, and with `known`,
/// only those before the first known one. The total is Spotify's for the group.
async fn list_group<A: SpotifyApi + Sync>(
    api: &A,
    artist_id: &str,
    group: &str,
    max: Option<usize>,
    known: Option<&HashSet<String>>,
) -> Result<(Vec<DjRelease>, i64), SpotifyError> {
    let mut releases = Vec::new();
    let mut total = None;
    let mut url = Some(artist_albums_url(artist_id, group));
    let mut pages = 0;
    let full = |releases: &Vec<DjRelease>| max.is_some_and(|max| releases.len() >= max);
    'pages: while let Some(current) = url.take() {
        let page = parse_release_page(&api.get_json(&current).await?);
        pages += 1;
        total.get_or_insert(page.total);
        for release in page.items {
            if full(&releases) || known.is_some_and(|known| known.contains(&release.id)) {
                break 'pages;
            }
            releases.push(release);
        }
        // A full window needs no next page.
        url = if full(&releases) { None } else { next_page(page.next, pages)? };
    }
    Ok((releases, total.unwrap_or(0)))
}

/// Own releases in full, and the newest `appears_limit` of the others.
async fn list_full<A: SpotifyApi + Sync>(
    api: &A,
    artist_id: &str,
    appears_limit: i64,
) -> Result<Listed, SpotifyError> {
    let mut releases = Vec::new();
    for group in OWN_GROUPS {
        releases.extend(list_group(api, artist_id, group, None, None).await?.0);
    }

    let window = appears_limit.max(0) as usize;
    let mut appears = Vec::new();
    let mut appears_total = 0;
    for group in APPEARS_GROUPS {
        let (found, total) = list_group(api, artist_id, group, Some(window), None).await?;
        appears.extend(found);
        appears_total += total;
    }
    // The newest of both groups together. A stable sort keeps Spotify's order
    // among releases of the same date.
    appears.sort_by(|a, b| b.release_date.cmp(&a.release_date));
    appears.truncate(window);
    releases.extend(appears);

    Ok(Listed { releases, appears_limit, appears_total: Some(appears_total) })
}

/// Only releases newer than the newest recorded one, per group. The window
/// grows by the appears-on releases added at its top, so "older releases"
/// still means the ones below it.
async fn list_new<A: SpotifyApi + Sync>(
    api: &A,
    artist_id: &str,
    appears_limit: i64,
    known: &HashSet<String>,
) -> Result<Listed, SpotifyError> {
    let mut releases = Vec::new();
    for group in OWN_GROUPS {
        releases.extend(list_group(api, artist_id, group, None, Some(known)).await?.0);
    }

    let window = appears_limit.max(0) as usize;
    let mut added = 0;
    let mut appears_total = 0;
    for group in APPEARS_GROUPS {
        let (found, total) = list_group(api, artist_id, group, Some(window), Some(known)).await?;
        added += found.len() as i64;
        appears_total += total;
        releases.extend(found);
    }

    Ok(Listed { releases, appears_limit: appears_limit + added, appears_total: Some(appears_total) })
}

/// Every page of a release's tracks, keeping the ones the artist is on.
async fn release_tracks<A: SpotifyApi + Sync>(
    api: &A,
    artist_id: &str,
    release: &DjRelease,
) -> Result<Vec<DjTrack>, SpotifyError> {
    let mut kept = Vec::new();
    let mut url = Some(album_tracks_url(&release.id));
    let mut pages = 0;
    while let Some(current) = url.take() {
        let page = parse_album_track_page(&api.get_json(&current).await?);
        pages += 1;
        for track in page.items {
            if !track.artist_ids.iter().any(|id| id == artist_id) {
                continue;
            }
            kept.push(DjTrack {
                spotify_id: track.id,
                title: track.name,
                artists: track.artists,
                album: Some(release.name.clone()).filter(|name| !name.is_empty()),
                release_date: release.release_date.clone(),
                isrc: track.isrc,
                duration_ms: track.duration_ms,
            });
        }
        url = next_page(page.next, pages)?;
    }
    Ok(kept)
}

fn ensure_current<S: ReleaseStore>(store: &S) -> Result<(), FetchError> {
    if store.is_current().map_err(FetchError::Store)? {
        Ok(())
    } else {
        Err(FetchError::Superseded)
    }
}

/// Lists the artist's releases, records the ones not seen before, then reads
/// the tracks of every release still unfetched, batch by batch.
///
/// `appears_limit` is the profile's current window. `progress(done, total)`
/// counts releases: once with 0 before the first batch, then after each batch.
/// On an error, every finished batch is already stored. Before every write the
/// store is asked whether the profile still points at `artist_id`.
pub async fn fetch_dj_tracks<A, S>(
    api: &A,
    store: &S,
    artist_id: &str,
    appears_limit: i64,
    listing: Listing,
    mut progress: impl FnMut(usize, usize) + Send,
) -> Result<FetchSummary, FetchError>
where
    A: SpotifyApi + Sync,
    S: ReleaseStore,
{
    let known = store.known_releases().map_err(FetchError::Store)?;
    let listed = match listing {
        Listing::LoadOlder => list_full(api, artist_id, appears_limit + APPEARS_STEP).await?,
        Listing::Update if known.is_empty() => list_full(api, artist_id, appears_limit).await?,
        Listing::Update => list_new(api, artist_id, appears_limit, &known).await?,
    };
    let new_releases = listed
        .releases
        .iter()
        .map(|r| r.id.as_str())
        .filter(|id| !known.contains(*id))
        .collect::<HashSet<_>>()
        .len();
    ensure_current(store)?;
    // Recorded only now that the whole listing worked: a half listing must
    // not make the next refresh stop early and skip what it never saw.
    store
        .record_releases(&listed.releases, listed.appears_limit, listed.appears_total)
        .map_err(FetchError::Store)?;

    let pending = store.pending_releases().map_err(FetchError::Store)?;
    let total = pending.len();
    if total > 0 {
        progress(0, total);
    }
    let mut done = 0;
    let mut tracks_kept = 0;
    for batch in pending.chunks(BATCH_SIZE) {
        // Checked before reading too, so a switched profile costs no requests.
        ensure_current(store)?;
        let mut tracks = Vec::new();
        for release in batch {
            tracks.extend(release_tracks(api, artist_id, release).await?);
        }
        let ids: Vec<String> = batch.iter().map(|r| r.id.clone()).collect();
        ensure_current(store)?;
        store.write_batch(&ids, &tracks).map_err(FetchError::Store)?;
        done += batch.len();
        tracks_kept += tracks.len();
        progress(done, total);
    }

    ensure_current(store)?;
    store.mark_synced().map_err(FetchError::Store)?;
    Ok(FetchSummary { new_releases, releases_read: total, tracks_kept })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use serde_json::{json, Value};
    use std::cell::Cell;
    use std::collections::HashMap;
    use std::future::Future;
    use std::sync::Mutex;

    const ARTIST: &str = "dj1";
    const KEY: &str = "the dj";

    /// The DJ's storage on an in-memory database.
    struct TestStore {
        db: Database,
        /// Disconnect Spotify (clearing the profile's artist) once this many
        /// batches were written.
        disconnect_after_batches: Cell<Option<usize>>,
        batches: Cell<usize>,
    }

    impl TestStore {
        fn new() -> Self {
            let db = Database::new_in_memory().expect("in-memory db");
            db.run_migrations().expect("migrations");
            db.ensure_dj_profile(KEY, "The DJ").unwrap();
            db.resolve_dj_spotify(KEY, ARTIST).unwrap();
            Self { db, disconnect_after_batches: Cell::new(None), batches: Cell::new(0) }
        }

        fn track_ids(&self) -> Vec<String> {
            let mut ids: Vec<String> = self.db.dj_tracks(KEY).unwrap().into_iter().map(|t| t.spotify_id).collect();
            ids.sort();
            ids
        }

        fn synced(&self) -> Option<i64> {
            self.db.get_dj_profile(KEY).unwrap().unwrap().spotify_synced_at
        }
    }

    impl ReleaseStore for TestStore {
        fn is_current(&self) -> Result<bool, String> {
            let profile = self.db.get_dj_profile(KEY).map_err(|e| e.to_string())?;
            Ok(profile.is_some_and(|p| p.spotify_artist_id.as_deref() == Some(ARTIST)))
        }
        fn known_releases(&self) -> Result<HashSet<String>, String> {
            self.db.dj_release_ids(KEY).map_err(|e| e.to_string())
        }
        fn record_releases(&self, releases: &[DjRelease], limit: i64, total: Option<i64>) -> Result<(), String> {
            self.db.record_dj_releases(KEY, releases, limit, total).map(|_| ()).map_err(|e| e.to_string())
        }
        fn pending_releases(&self) -> Result<Vec<DjRelease>, String> {
            self.db.pending_dj_releases(KEY).map_err(|e| e.to_string())
        }
        fn write_batch(&self, ids: &[String], tracks: &[DjTrack]) -> Result<(), String> {
            self.db.write_dj_track_batch(KEY, ids, tracks).map_err(|e| e.to_string())?;
            self.batches.set(self.batches.get() + 1);
            if self.disconnect_after_batches.get() == Some(self.batches.get()) {
                self.db.clear_dj_spotify().map_err(|e| e.to_string())?;
            }
            Ok(())
        }
        fn mark_synced(&self) -> Result<(), String> {
            self.db.mark_dj_spotify_synced(KEY, 1_000).map_err(|e| e.to_string())
        }
    }

    /// Replays hand-written pages by URL and records what was asked for. A
    /// group listing nobody wrote a page for is empty.
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

        /// A release with one track by the DJ, called `t-<release id>`.
        fn release_with_track(self, release_id: &str) -> Self {
            let track = album_track(&format!("t-{release_id}"), &[ARTIST]);
            self.page(&album_tracks_url(release_id), page(vec![track], None, 1))
        }

        fn calls(&self) -> Vec<String> {
            self.calls.lock().unwrap().clone()
        }

        fn album_calls(&self) -> Vec<String> {
            self.calls().into_iter().filter(|url| url.contains("/albums/")).collect()
        }
    }

    impl SpotifyApi for FakeApi {
        fn get_json(&self, url: &str) -> impl Future<Output = Result<Value, SpotifyError>> + Send {
            self.calls.lock().unwrap().push(url.to_string());
            let answer = match self.pages.get(url) {
                Some(answer) => answer.clone(),
                None if url.contains("/albums?include_groups=") => Ok(page(vec![], None, 0)),
                None => Err(SpotifyError::Network(format!("no page for {url}"))),
            };
            async move { answer }
        }
    }

    fn page(items: Vec<Value>, next: Option<&str>, total: i64) -> Value {
        json!({ "items": items, "next": next, "total": total })
    }

    fn release(id: &str, date: &str) -> Value {
        json!({ "id": id, "name": format!("Release {id}"), "release_date": date })
    }

    fn album_track(id: &str, artist_ids: &[&str]) -> Value {
        let artists: Vec<Value> = artist_ids.iter().map(|a| json!({ "id": a, "name": format!("Artist {a}") })).collect();
        json!({ "id": id, "name": format!("Track {id}"), "duration_ms": 300000, "artists": artists })
    }

    fn group(name: &str) -> String {
        artist_albums_url(ARTIST, name)
    }

    fn next_of(name: &str) -> String {
        format!("{}&offset=10", group(name))
    }

    async fn fetch(api: &FakeApi, store: &TestStore, limit: i64, listing: Listing) -> Result<FetchSummary, FetchError> {
        fetch_dj_tracks(api, store, ARTIST, limit, listing, |_, _| {}).await
    }

    #[tokio::test]
    async fn keeps_the_tracks_the_dj_is_on_not_everything_on_their_releases() {
        let api = FakeApi::default()
            .page(&group("compilation"), page(vec![release("comp", "2024-01-01")], None, 1))
            .page(
                &album_tracks_url("comp"),
                page(
                    vec![
                        album_track("remix", &["someone", ARTIST]),
                        album_track("not-theirs", &["someone"]),
                        album_track("solo", &[ARTIST]),
                    ],
                    None,
                    3,
                ),
            );
        let store = TestStore::new();

        let summary = fetch(&api, &store, 150, Listing::Update).await.unwrap();

        assert_eq!(store.track_ids(), ["remix", "solo"]);
        assert_eq!(summary, FetchSummary { new_releases: 1, releases_read: 1, tracks_kept: 2 });
        let stored = &store.db.dj_tracks(KEY).unwrap()[0];
        assert_eq!(stored.album.as_deref(), Some("Release comp"));
        assert_eq!(stored.release_date.as_deref(), Some("2024-01-01"));
        assert_eq!(store.synced(), Some(1_000));
    }

    #[tokio::test]
    async fn every_page_of_a_releases_tracks_is_read() {
        let second = format!("{}&offset=50", album_tracks_url("lp"));
        let api = FakeApi::default()
            .page(&group("album"), page(vec![release("lp", "2020-01-01")], None, 1))
            .page(&album_tracks_url("lp"), page(vec![album_track("a", &[ARTIST])], Some(&second), 2))
            .page(&second, page(vec![album_track("b", &[ARTIST])], None, 2));
        let store = TestStore::new();

        fetch(&api, &store, 150, Listing::Update).await.unwrap();

        assert_eq!(store.track_ids(), ["a", "b"]);
    }

    #[tokio::test]
    async fn the_first_fetch_reads_own_releases_in_full_and_only_the_newest_appearances() {
        let api = FakeApi::default()
            .page(&group("single"), page(vec![release("s1", "2025-01-01")], Some(&next_of("single")), 2))
            .page(&next_of("single"), page(vec![release("s2", "2001-01-01")], None, 2))
            .page(
                &group("appears_on"),
                page(vec![release("ap1", "2025-06-01"), release("ap2", "2023-01-01")], Some(&next_of("appears_on")), 4),
            )
            .page(&next_of("appears_on"), page(vec![release("ap3", "2019-01-01"), release("ap4", "2018-01-01")], None, 4))
            .page(&group("compilation"), page(vec![release("c1", "2024-01-01"), release("c2", "2010-01-01")], None, 2))
            .release_with_track("s1")
            .release_with_track("s2")
            .release_with_track("ap1")
            .release_with_track("c1");
        let store = TestStore::new();

        // A window of 2: the newest two of appears-on and compilation together.
        fetch(&api, &store, 2, Listing::Update).await.unwrap();

        assert_eq!(store.track_ids(), ["t-ap1", "t-c1", "t-s1", "t-s2"]);
        assert!(!api.calls().contains(&next_of("appears_on")), "two were enough");
        let profile = store.db.get_dj_profile(KEY).unwrap().unwrap();
        assert_eq!((profile.appears_limit, profile.appears_total), (2, Some(6)));
    }

    #[tokio::test]
    async fn load_older_widens_the_window_and_reads_only_what_is_new() {
        let appears = || {
            FakeApi::default()
                .page(
                    &group("appears_on"),
                    page(vec![release("ap1", "2025-06-01"), release("ap2", "2023-01-01")], Some(&next_of("appears_on")), 3),
                )
                .page(&next_of("appears_on"), page(vec![release("ap3", "2019-01-01")], None, 3))
                .release_with_track("ap1")
                .release_with_track("ap2")
                .release_with_track("ap3")
        };
        let store = TestStore::new();
        fetch(&appears(), &store, 1, Listing::Update).await.unwrap();
        assert_eq!(store.track_ids(), ["t-ap1"]);

        let api = appears();
        let summary = fetch(&api, &store, 1, Listing::LoadOlder).await.unwrap();

        assert_eq!(store.track_ids(), ["t-ap1", "t-ap2", "t-ap3"]);
        assert_eq!(summary.new_releases, 2);
        assert_eq!(api.album_calls(), [album_tracks_url("ap2"), album_tracks_url("ap3")]);
        let profile = store.db.get_dj_profile(KEY).unwrap().unwrap();
        assert_eq!((profile.appears_limit, profile.appears_total), (1 + APPEARS_STEP, Some(3)));
    }

    #[tokio::test]
    async fn a_refresh_stops_at_the_first_known_release_and_reads_only_new_ones() {
        let store = TestStore::new();
        let first = FakeApi::default()
            .page(&group("single"), page(vec![release("s1", "2024-01-01")], None, 1))
            .page(&group("appears_on"), page(vec![release("ap1", "2024-02-01")], None, 1))
            .release_with_track("s1")
            .release_with_track("ap1");
        fetch(&first, &store, 150, Listing::Update).await.unwrap();

        let api = FakeApi::default()
            .page(
                &group("single"),
                page(vec![release("s-new", "2026-09-01"), release("s1", "2024-01-01")], Some(&next_of("single")), 9),
            )
            .page(&group("appears_on"), page(vec![release("ap1", "2024-02-01")], Some(&next_of("appears_on")), 40))
            .release_with_track("s-new");

        let summary = fetch(&api, &store, 150, Listing::Update).await.unwrap();

        assert_eq!(summary, FetchSummary { new_releases: 1, releases_read: 1, tracks_kept: 1 });
        assert_eq!(
            api.calls(),
            [
                group("album"),
                group("single"),
                group("appears_on"),
                group("compilation"),
                album_tracks_url("s-new"),
            ],
            "one page per group, and only the new release's tracks"
        );
        assert_eq!(store.track_ids(), ["t-ap1", "t-s-new", "t-s1"]);
        let profile = store.db.get_dj_profile(KEY).unwrap().unwrap();
        assert_eq!((profile.appears_limit, profile.appears_total), (150, Some(40)));
    }

    #[tokio::test]
    async fn new_appearances_on_top_grow_the_window_with_them() {
        let store = TestStore::new();
        let first = FakeApi::default()
            .page(&group("appears_on"), page(vec![release("ap1", "2024-01-01")], None, 1))
            .release_with_track("ap1");
        fetch(&first, &store, 150, Listing::Update).await.unwrap();

        let api = FakeApi::default()
            .page(
                &group("appears_on"),
                page(vec![release("ap2", "2025-01-01"), release("ap1", "2024-01-01")], None, 2),
            )
            .release_with_track("ap2");
        fetch(&api, &store, 150, Listing::Update).await.unwrap();

        let profile = store.db.get_dj_profile(KEY).unwrap().unwrap();
        assert_eq!((profile.appears_limit, profile.appears_total), (151, Some(2)));
    }

    #[tokio::test]
    async fn an_interrupted_first_fetch_keeps_its_batches_and_resumes_from_the_rest() {
        let ids: Vec<String> = (0..25).map(|i| format!("r{i:02}")).collect();
        // Newest first: r24 … r00, so r24..r05 are the first batch of 20.
        let listing: Vec<Value> = ids.iter().rev().map(|id| release(id, &format!("2000-01-{}", &id[1..]))).collect();
        let mut broken = FakeApi::default().page(&group("single"), page(listing.clone(), None, 25));
        for id in &ids {
            broken = broken.release_with_track(id);
        }
        let broken = broken.fail(&album_tracks_url("r02"), SpotifyError::Network("offline".into()));
        let store = TestStore::new();
        let mut seen = Vec::new();

        let failed = fetch_dj_tracks(&broken, &store, ARTIST, 150, Listing::Update, |done, total| seen.push((done, total))).await;

        assert_eq!(failed, Err(FetchError::Spotify(SpotifyError::Network("offline".into()))));
        assert_eq!(seen, [(0, 25), (20, 25)]);
        assert_eq!(store.track_ids().len(), 20, "the finished batch stays");
        assert_eq!(store.db.count_pending_dj_releases(KEY).unwrap(), 5);
        assert_eq!(store.synced(), None);

        let mut working = FakeApi::default().page(&group("single"), page(listing, None, 25));
        for id in &ids {
            working = working.release_with_track(id);
        }
        let summary = fetch(&working, &store, 150, Listing::Update).await.unwrap();

        assert_eq!(summary.releases_read, 5);
        assert_eq!(working.album_calls().len(), 5, "only the unfinished releases");
        assert_eq!(store.track_ids().len(), 25);
        assert_eq!(store.synced(), Some(1_000));
    }

    #[tokio::test]
    async fn stops_writing_when_the_profile_leaves_the_artist_mid_fetch() {
        let listing: Vec<Value> = (0..45).map(|i| release(&format!("r{i}"), "2020-01-01")).collect();
        let mut api = FakeApi::default().page(&group("album"), page(listing, None, 45));
        for i in 0..45 {
            api = api.release_with_track(&format!("r{i}"));
        }
        let store = TestStore::new();
        // Spotify is disconnected right after the first batch of 20 is stored.
        store.disconnect_after_batches.set(Some(1));
        let mut seen = Vec::new();

        let result =
            fetch_dj_tracks(&api, &store, ARTIST, 150, Listing::Update, |d, t| seen.push((d, t))).await;

        assert_eq!(result, Err(FetchError::Superseded));
        assert_eq!(store.batches.get(), 1, "no second batch was written");
        assert_eq!(api.album_calls().len(), 20, "the second batch was never read");
        assert!(store.db.dj_tracks(KEY).unwrap().is_empty(), "the disconnect cleared the tracks and none came back");
        assert_eq!(store.synced(), None);
        assert_eq!(seen, [(0, 45), (20, 45)]);
    }

    #[tokio::test]
    async fn writes_nothing_for_an_artist_the_profile_no_longer_points_at() {
        let api = FakeApi::default().page(&group("album"), page(vec![release("lp", "2020-01-01")], None, 1)).release_with_track("lp");
        let store = TestStore::new();
        store.db.clear_dj_spotify().unwrap();

        assert_eq!(fetch(&api, &store, 150, Listing::Update).await, Err(FetchError::Superseded));
        assert!(store.db.dj_release_ids(KEY).unwrap().is_empty());
        assert!(api.album_calls().is_empty());
    }

    #[tokio::test]
    async fn a_failed_listing_records_nothing() {
        let api = FakeApi::default()
            .page(&group("single"), page(vec![release("s1", "2024-01-01")], None, 1))
            .fail(&group("compilation"), SpotifyError::Network("offline".into()));
        let store = TestStore::new();

        assert!(fetch(&api, &store, 150, Listing::Update).await.is_err());
        assert!(store.db.dj_release_ids(KEY).unwrap().is_empty());
    }

    #[tokio::test]
    async fn progress_is_reported_after_every_batch() {
        let listing: Vec<Value> = (0..45).map(|i| release(&format!("r{i}"), "2020-01-01")).collect();
        let mut api = FakeApi::default().page(&group("album"), page(listing, None, 45));
        for i in 0..45 {
            api = api.release_with_track(&format!("r{i}"));
        }
        let store = TestStore::new();
        let mut seen = Vec::new();

        fetch_dj_tracks(&api, &store, ARTIST, 150, Listing::Update, |done, total| seen.push((done, total)))
            .await
            .unwrap();

        assert_eq!(seen, [(0, 45), (20, 45), (40, 45), (45, 45)]);
    }

    #[tokio::test]
    async fn nothing_new_reports_no_progress_and_still_counts_as_synced() {
        let api = FakeApi::default();
        let store = TestStore::new();
        let mut seen = Vec::new();

        let summary = fetch_dj_tracks(&api, &store, ARTIST, 150, Listing::Update, |d, t| seen.push((d, t)))
            .await
            .unwrap();

        assert_eq!(summary, FetchSummary { new_releases: 0, releases_read: 0, tracks_kept: 0 });
        assert!(seen.is_empty());
        assert_eq!(store.synced(), Some(1_000));
    }
}
