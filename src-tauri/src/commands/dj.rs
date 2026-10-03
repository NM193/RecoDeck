// src-tauri/src/commands/dj.rs
//! Tauri commands for DJ pages.
//!
//! Opening a page is two steps. `get_dj_page` answers at once from the cache;
//! `refresh_dj_spotify` and `refresh_dj_gigs` then run side by side, each
//! asking its source only when the cache is stale, and the frontend reads the
//! page again when they return (and after every `dj-tracks-progress` batch).
//!
//! A source failing is not an error here: the refresh commands answer a
//! `DjRefresh` with the outcome and the message, so the page can say "couldn't
//! refresh" and keep what it had. Thrown errors are for bad input and a
//! missing database.

use std::collections::HashMap;
use std::future::Future;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::commands::library::AppState;
use crate::commands::spotify::{forget_access, has_account, now_ms, spotify_token, SpotifyState};
use crate::commands::youtube::{dj_key, with_db};
use crate::db::dj::{
    is_stale, AppearsWindow, DjGig, DjProfileRow, DjRaArtist, DjRelease, DjSetTrack, DjTrack,
    APPEARS_STEP, RA_MAX_AGE_MS, SPOTIFY_MAX_AGE_MS,
};
use crate::db::Database;
use crate::error::AppError;
use crate::external::dj_releases::{fetch_dj_tracks, FetchError, Listing, ReleaseStore, StoreError};
use crate::external::resident_advisor::{self as ra, LiveRa, RaApi};
use crate::external::spotify::{self as web_api, ArtistInfo, LiveApi, SpotifyApi, SpotifyError};

pub const TRACKS_PROGRESS_EVENT: &str = "dj-tracks-progress";

/// One fetch per DJ and source at a time. Opening the same page twice waits
/// for the first fetch, then finds the cache fresh.
#[derive(Default)]
pub struct DjState {
    locks: Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
}

impl DjState {
    fn lock_for(&self, key: String) -> Arc<tokio::sync::Mutex<()>> {
        let mut locks = self.locks.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        locks.entry(key).or_default().clone()
    }
}

// --- what the frontend reads (src/types/dj.ts) ----------------------------

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DjProfileDTO {
    pub name_key: String,
    pub display_name: String,
    pub spotify_artist_id: Option<String>,
    pub spotify_manual: bool,
    pub spotify_image_url: Option<String>,
    pub genres: Vec<String>,
    pub ra_artist_id: Option<String>,
    pub ra_slug: Option<String>,
    pub ra_image_url: Option<String>,
    pub ra_manual: bool,
    pub spotify_synced_at: Option<i64>,
    pub ra_synced_at: Option<i64>,
    /// The stored RA page, else one guessed from the name (may 404).
    pub ra_url: String,
    /// Spotify lists more appears-on / compilation releases than were fetched.
    pub has_older_releases: bool,
}

impl From<DjProfileRow> for DjProfileDTO {
    fn from(row: DjProfileRow) -> Self {
        let slug = row
            .ra_slug
            .clone()
            .unwrap_or_else(|| ra::guess_ra_slug(&row.display_name));
        Self {
            ra_url: ra::artist_page_url(&slug),
            has_older_releases: row.appears_total.is_some_and(|total| total > row.appears_limit),
            name_key: row.name_key,
            display_name: row.display_name,
            spotify_artist_id: row.spotify_artist_id,
            spotify_manual: row.spotify_manual,
            spotify_image_url: row.spotify_image_url,
            genres: row.genres,
            ra_artist_id: row.ra_artist_id,
            ra_slug: row.ra_slug,
            ra_image_url: row.ra_image_url,
            ra_manual: row.ra_manual,
            spotify_synced_at: row.spotify_synced_at,
            ra_synced_at: row.ra_synced_at,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DjPageDTO {
    pub profile: DjProfileDTO,
    /// Duplicates collapsed, newest first.
    pub tracks: Vec<DjTrack>,
    pub gigs: Vec<DjGig>,
    /// Releases listed but whose tracks are not fetched yet.
    pub pending_releases: i64,
}

/// A search result on Spotify or RA: a Search card, or a "Not this artist?" choice.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistCandidate {
    pub id: String,
    pub name: String,
    pub image_url: Option<String>,
    pub followers: Option<i64>,
    /// RA only: the `ra.co/dj/<slug>` part.
    pub slug: Option<String>,
}

impl From<ArtistInfo> for ArtistCandidate {
    fn from(artist: ArtistInfo) -> Self {
        Self {
            id: artist.id,
            name: artist.name,
            image_url: artist.image_url,
            followers: artist.followers,
            slug: None,
        }
    }
}

impl From<ra::RaSearchHit> for ArtistCandidate {
    fn from(hit: ra::RaSearchHit) -> Self {
        Self { id: hit.id, name: hit.name, image_url: hit.image_url, followers: None, slug: Some(hit.slug) }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DjCandidates {
    pub spotify: Vec<ArtistCandidate>,
    pub ra: Vec<ArtistCandidate>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RefreshOutcome {
    /// Nothing new to show: the cached data is new enough and nothing was
    /// asked, or a refresh stopped quietly because the DJ's Spotify artist was
    /// chosen again or Spotify was disconnected while it ran (the page then
    /// reads what that change left).
    Fresh,
    Refreshed,
    /// The fetch failed; the cache is as it was.
    Failed,
    /// No artist of that name on the source.
    NotFound,
    /// Spotify only: no account connected.
    NotConnected,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DjRefresh {
    pub outcome: RefreshOutcome,
    pub error: Option<String>,
}

impl DjRefresh {
    fn just(outcome: RefreshOutcome) -> Self {
        Self { outcome, error: None }
    }

    fn failed(message: impl ToString) -> Self {
        Self { outcome: RefreshOutcome::Failed, error: Some(message.to_string()) }
    }
}

/// The `dj-tracks-progress` payload, sent after every batch of releases.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DjTracksProgress {
    pub name_key: String,
    pub done: usize,
    pub total: usize,
}

/// An RA artist picked under "Not this artist?".
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RaPick {
    pub id: String,
    pub slug: String,
    pub image_url: Option<String>,
}

// --- rules ----------------------------------------------------------------

fn db_err(e: rusqlite::Error) -> AppError {
    AppError::Database(e.to_string())
}

/// The name key and the name as shown. A blank name is refused.
fn key_of(name: &str) -> Result<(String, String), AppError> {
    let display = name.trim();
    if display.is_empty() {
        return Err(AppError::Validation("A DJ page needs a name".to_string()));
    }
    Ok((dj_key(display), display.to_string()))
}

/// Spotify ids are base62.
fn valid_spotify_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric())
}

/// A week old, never finished, or releases still waiting for their tracks.
pub(crate) fn spotify_needs_refresh(profile: &DjProfileRow, pending: i64, now_ms: i64) -> bool {
    pending > 0 || is_stale(profile.spotify_synced_at, now_ms, SPOTIFY_MAX_AGE_MS)
}

pub(crate) fn gigs_need_refresh(profile: &DjProfileRow, now_ms: i64) -> bool {
    is_stale(profile.ra_synced_at, now_ms, RA_MAX_AGE_MS)
}

/// "None of these", chosen by hand: nothing to ask the source.
fn chose_none(artist_id: &Option<String>, manual: bool) -> bool {
    artist_id.is_none() && manual
}

fn read_page(db: &Database, key: &str, display: &str) -> Result<DjPageDTO, AppError> {
    let profile = db.ensure_dj_profile(key, display).map_err(db_err)?;
    Ok(DjPageDTO {
        tracks: crate::db::dj::collapse_duplicates(db.dj_tracks(key).map_err(db_err)?),
        gigs: db.dj_gigs(key).map_err(db_err)?,
        pending_releases: db.count_pending_dj_releases(key).map_err(db_err)?,
        profile: profile.into(),
    })
}

// --- Spotify ---------------------------------------------------------------

/// The fetch's storage for one DJ, on the shared database. Every write checks
/// the fetch is still the profile's — the same artist, no manual choice since
/// it began (the generation), Spotify still connected — in the same database
/// lock acquisition as the write itself: a manual change or a disconnect
/// during a long first fetch cannot slip in between the check and the write,
/// nor be undone by it. A refused call answers `StoreError::Superseded`.
struct SharedStore<'a> {
    state: &'a AppState,
    key: &'a str,
    artist_id: &'a str,
    /// The profile's `spotify_generation` when the fetch began.
    generation: i64,
}

impl SharedStore<'_> {
    fn is_current_in(&self, db: &Database) -> Result<bool, AppError> {
        let ours = db.get_dj_profile(self.key).map_err(db_err)?.is_some_and(|p| {
            p.spotify_artist_id.as_deref() == Some(self.artist_id) && p.spotify_generation == self.generation
        });
        Ok(ours && has_account(db))
    }

    fn with_artist<T>(&self, f: impl FnOnce(&Database) -> rusqlite::Result<T>) -> Result<T, StoreError> {
        with_db(self.state, |db| {
            if !self.is_current_in(db)? {
                return Ok(None);
            }
            f(db).map(Some).map_err(db_err)
        })
        .map_err(|e| StoreError::Failed(e.to_string()))?
        .ok_or(StoreError::Superseded)
    }
}

impl ReleaseStore for SharedStore<'_> {
    fn is_current(&self) -> Result<bool, StoreError> {
        with_db(self.state, |db| self.is_current_in(db)).map_err(|e| StoreError::Failed(e.to_string()))
    }

    fn known_releases(&self) -> Result<std::collections::HashSet<String>, StoreError> {
        self.with_artist(|db| db.dj_release_ids(self.key))
    }

    fn record_releases(&self, releases: &[DjRelease], window: &AppearsWindow) -> Result<(), StoreError> {
        self.with_artist(|db| db.record_dj_releases(self.key, releases, window).map(|_| ()))
    }

    fn pending_releases(&self) -> Result<Vec<DjRelease>, StoreError> {
        self.with_artist(|db| db.pending_dj_releases(self.key))
    }

    fn write_batch(&self, release_ids: &[String], tracks: &[DjTrack]) -> Result<(), StoreError> {
        self.with_artist(|db| db.write_dj_track_batch(self.key, release_ids, tracks))
    }

    fn mark_synced(&self) -> Result<(), StoreError> {
        self.with_artist(|db| db.mark_dj_spotify_synced(self.key, now_ms()))
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Fetched {
    Refreshed,
    NotFound,
}

fn store_err(e: AppError) -> FetchError {
    FetchError::Store(e.to_string())
}

/// One pass at the DJ's Spotify side: resolve the artist when there is none,
/// refresh its photo and genres, then fetch releases and tracks.
async fn fetch_spotify<A: SpotifyApi + Sync>(
    api: &A,
    state: &AppState,
    key: &str,
    listing: Listing,
    progress: impl FnMut(usize, usize) + Send,
) -> Result<Fetched, FetchError> {
    let profile = with_db(state, |db| db.get_dj_profile(key).map_err(db_err))
        .map_err(store_err)?
        .ok_or_else(|| FetchError::Store("No such DJ page".to_string()))?;

    // The artist, generation and window the fetch works with, read together.
    let profile = match profile.spotify_artist_id.clone() {
        Some(id) => {
            let artist = api.get_json(&web_api::artist_url(&id)).await?;
            if let Some(info) = web_api::parse_artist(&artist) {
                with_db(state, |db| {
                    db.set_dj_spotify_details(key, &id, info.image_url.as_deref(), &info.genres)
                        .map_err(db_err)
                })
                .map_err(store_err)?;
            }
            profile
        }
        None if profile.spotify_manual => return Ok(Fetched::NotFound),
        None => {
            let body = api.get_json(&web_api::artist_search_url(&profile.display_name)).await?;
            let found = web_api::parse_artist_search(&body);
            let Some(pick) = web_api::pick_artist(&profile.display_name, &found) else {
                return Ok(Fetched::NotFound);
            };
            let stored = with_db(state, |db| {
                // Disconnected during the search: the disconnect cleared this
                // page, and resolving now would write Spotify data back.
                if !has_account(db) {
                    return Ok(None);
                }
                db.resolve_dj_spotify(key, &pick.id).map_err(db_err)?;
                db.set_dj_spotify_details(key, &pick.id, pick.image_url.as_deref(), &pick.genres)
                    .map_err(db_err)?;
                db.get_dj_profile(key).map_err(db_err)
            })
            .map_err(store_err)?;
            // A manual pick may have landed meanwhile; it wins.
            stored.ok_or(FetchError::Superseded)?
        }
    };
    let Some(artist_id) = profile.spotify_artist_id.clone() else {
        return Ok(Fetched::NotFound);
    };

    let store = SharedStore { state, key, artist_id: &artist_id, generation: profile.spotify_generation };
    let stored = AppearsWindow {
        limit: profile.appears_limit,
        total: profile.appears_total,
        cutoff: profile.appears_cutoff.clone(),
    };
    fetch_dj_tracks(api, &store, &artist_id, &stored, listing, progress).await?;
    Ok(Fetched::Refreshed)
}

/// "Load older releases": the stored window plus `APPEARS_STEP`, worked out
/// once per request so the 401 retry lists the same window.
fn load_older(profile: &DjProfileRow) -> Listing {
    Listing::LoadOlder { appears_limit: profile.appears_limit + APPEARS_STEP }
}

/// The outer error is about getting a token; the inner one is the fetch's.
async fn spotify_pass(
    app: &AppHandle,
    state: &AppState,
    spotify: &SpotifyState,
    key: &str,
    listing: Listing,
) -> Result<Result<Fetched, FetchError>, AppError> {
    let api = LiveApi::new(spotify_token(state, spotify).await?)?;
    let progress = |done, total| {
        let payload = DjTracksProgress { name_key: key.to_string(), done, total };
        let _ = app.emit(TRACKS_PROGRESS_EVENT, &payload);
    };
    Ok(fetch_spotify(&api, state, key, listing, progress).await)
}

fn is_unauthorized<T>(outcome: &Result<Result<T, FetchError>, AppError>) -> bool {
    matches!(outcome, Ok(Err(FetchError::Spotify(SpotifyError::Api { status: 401, .. }))))
}

fn spotify_refresh(outcome: Result<Result<Fetched, FetchError>, AppError>) -> DjRefresh {
    match outcome {
        Ok(Ok(Fetched::Refreshed)) => DjRefresh::just(RefreshOutcome::Refreshed),
        Ok(Ok(Fetched::NotFound)) => DjRefresh::just(RefreshOutcome::NotFound),
        // The artist changed or Spotify was disconnected mid-fetch: a quiet
        // stop. The page reads what the change left, and says nothing failed.
        Ok(Err(FetchError::Superseded)) => DjRefresh::just(RefreshOutcome::Fresh),
        Ok(Err(err)) => DjRefresh::failed(err),
        Err(AppError::SpotifyNotConnected) => DjRefresh::just(RefreshOutcome::NotConnected),
        Err(err) => DjRefresh::failed(err),
    }
}

/// A pass, and one more after a 401 (with `forget` run in between).
async fn retry_unauthorized<T, Fut>(
    mut pass: impl FnMut() -> Fut,
    forget: impl FnOnce(),
) -> Result<Result<T, FetchError>, AppError>
where
    Fut: Future<Output = Result<Result<T, FetchError>, AppError>>,
{
    let outcome = pass().await;
    if !is_unauthorized(&outcome) {
        return outcome;
    }
    forget();
    pass().await
}

/// A pass, and one more with a fresh token after a 401 — an app revoked at
/// spotify.com loses its access token before it expires. Finished batches
/// are kept, so the second pass continues where the first stopped. Both
/// passes make the same `listing`.
async fn run_spotify(
    app: &AppHandle,
    state: &AppState,
    spotify: &SpotifyState,
    key: &str,
    listing: Listing,
) -> DjRefresh {
    let pass = move || spotify_pass(app, state, spotify, key, listing);
    spotify_refresh(retry_unauthorized(pass, || forget_access(spotify)).await)
}

/// Artist search on Spotify, with the same 401 retry.
async fn search_spotify(state: &AppState, spotify: &SpotifyState, query: &str) -> Result<Vec<ArtistInfo>, AppError> {
    let url = web_api::artist_search_url(query);
    let mut found = LiveApi::new(spotify_token(state, spotify).await?)?.get_json(&url).await;
    if matches!(found, Err(SpotifyError::Api { status: 401, .. })) {
        forget_access(spotify);
        found = LiveApi::new(spotify_token(state, spotify).await?)?.get_json(&url).await;
    }
    Ok(web_api::parse_artist_search(&found?))
}

// --- Resident Advisor --------------------------------------------------------

/// Reads the gigs of the stored RA artist, or resolves one by name first.
/// `Ok(false)`: RA has no such artist.
async fn fetch_gigs<A: RaApi + Sync>(
    api: &A,
    state: &AppState,
    key: &str,
    profile: &DjProfileRow,
) -> Result<bool, String> {
    let found = match (&profile.ra_artist_id, &profile.ra_slug) {
        (Some(_), Some(slug)) => ra::artist_events(api, slug).await,
        _ => ra::find_artist(api, &profile.display_name).await,
    }
    .map_err(|e| e.to_string())?;
    let Some(found) = found else {
        return Ok(false);
    };

    with_db(state, |db| {
        let current = db.get_dj_profile(key).map_err(db_err)?.and_then(|p| p.ra_artist_id);
        // Resolve when there is no artist yet; never write over a choice made
        // meanwhile.
        let ours = match current {
            None => db.resolve_dj_ra(key, &found.artist).map_err(db_err)?,
            Some(id) => id == found.artist.id,
        };
        if ours {
            db.replace_dj_gigs(key, &found.gigs, now_ms()).map_err(db_err)?;
        }
        Ok(())
    })
    .map_err(|e| e.to_string())?;
    Ok(true)
}

// --- commands ----------------------------------------------------------------

/// The cached page, at once and without asking anyone. Creates the profile on
/// first open.
#[tauri::command]
pub async fn get_dj_page(state: State<'_, AppState>, name: String) -> Result<DjPageDTO, AppError> {
    let (key, display) = key_of(&name)?;
    with_db(&state, |db| read_page(db, &key, &display))
}

/// Refreshes the Spotify side when it is stale: a week old, never finished, or
/// with releases still waiting. Emits `dj-tracks-progress` per batch.
#[tauri::command]
pub async fn refresh_dj_spotify(
    app: AppHandle,
    state: State<'_, AppState>,
    spotify: State<'_, SpotifyState>,
    dj: State<'_, DjState>,
    name: String,
) -> Result<DjRefresh, AppError> {
    let (key, display) = key_of(&name)?;
    let lock = dj.lock_for(format!("spotify:{key}"));
    let _running = lock.lock().await;

    let (profile, pending) = with_db(&state, |db| {
        let profile = db.ensure_dj_profile(&key, &display).map_err(db_err)?;
        Ok((profile, db.count_pending_dj_releases(&key).map_err(db_err)?))
    })?;
    if chose_none(&profile.spotify_artist_id, profile.spotify_manual) {
        return Ok(DjRefresh::just(RefreshOutcome::NotFound));
    }
    if !spotify_needs_refresh(&profile, pending, now_ms()) {
        return Ok(DjRefresh::just(RefreshOutcome::Fresh));
    }
    Ok(run_spotify(&app, &state, &spotify, &key, Listing::Update).await)
}

/// "Load older releases": the next 150 appears-on / compilation releases.
#[tauri::command]
pub async fn load_older_dj_releases(
    app: AppHandle,
    state: State<'_, AppState>,
    spotify: State<'_, SpotifyState>,
    dj: State<'_, DjState>,
    name: String,
) -> Result<DjRefresh, AppError> {
    let (key, display) = key_of(&name)?;
    let lock = dj.lock_for(format!("spotify:{key}"));
    let _running = lock.lock().await;

    let profile = with_db(&state, |db| db.ensure_dj_profile(&key, &display).map_err(db_err))?;
    Ok(run_spotify(&app, &state, &spotify, &key, load_older(&profile)).await)
}

/// Refreshes the gigs when they are a day old.
#[tauri::command]
pub async fn refresh_dj_gigs(
    state: State<'_, AppState>,
    dj: State<'_, DjState>,
    name: String,
) -> Result<DjRefresh, AppError> {
    let (key, display) = key_of(&name)?;
    let lock = dj.lock_for(format!("ra:{key}"));
    let _running = lock.lock().await;

    let profile = with_db(&state, |db| db.ensure_dj_profile(&key, &display).map_err(db_err))?;
    if chose_none(&profile.ra_artist_id, profile.ra_manual) {
        return Ok(DjRefresh::just(RefreshOutcome::NotFound));
    }
    if !gigs_need_refresh(&profile, now_ms()) {
        return Ok(DjRefresh::just(RefreshOutcome::Fresh));
    }
    let api = match LiveRa::new() {
        Ok(api) => api,
        Err(err) => return Ok(DjRefresh::failed(err)),
    };
    Ok(match fetch_gigs(&api, &state, &key, &profile).await {
        Ok(true) => DjRefresh::just(RefreshOutcome::Refreshed),
        Ok(false) => DjRefresh::just(RefreshOutcome::NotFound),
        Err(message) => DjRefresh::failed(message),
    })
}

/// "Not this artist?": what each source finds for the name. A source that
/// fails (or Spotify not connected) gives an empty list.
#[tauri::command]
pub async fn dj_artist_candidates(
    state: State<'_, AppState>,
    spotify: State<'_, SpotifyState>,
    name: String,
) -> Result<DjCandidates, AppError> {
    let (_, display) = key_of(&name)?;
    let ra_search = async {
        match LiveRa::new() {
            Ok(api) => ra::search_artists(&api, &display).await.unwrap_or_default(),
            Err(_) => Vec::new(),
        }
    };
    let (on_spotify, on_ra) = tokio::join!(search_spotify(&state, &spotify, &display), ra_search);
    Ok(DjCandidates {
        spotify: on_spotify.unwrap_or_default().into_iter().map(ArtistCandidate::from).collect(),
        ra: on_ra.into_iter().map(ArtistCandidate::from).collect(),
    })
}

/// A Spotify artist chosen by hand (a "Not this artist?" pick, or opening the
/// page from a Spotify search card), or None for "none". Answers the page as
/// it now reads; a different artist reads empty until the next refresh.
#[tauri::command]
pub async fn set_dj_spotify_artist(
    state: State<'_, AppState>,
    name: String,
    artist_id: Option<String>,
) -> Result<DjPageDTO, AppError> {
    let (key, display) = key_of(&name)?;
    if artist_id.as_deref().is_some_and(|id| !valid_spotify_id(id)) {
        return Err(AppError::Validation("Not a Spotify artist id".to_string()));
    }
    with_db(&state, |db| {
        db.ensure_dj_profile(&key, &display).map_err(db_err)?;
        db.set_dj_spotify_manual(&key, artist_id.as_deref()).map_err(db_err)?;
        read_page(db, &key, &display)
    })
}

/// The RA side of `set_dj_spotify_artist`.
#[tauri::command]
pub async fn set_dj_ra_artist(
    state: State<'_, AppState>,
    name: String,
    ra: Option<RaPick>,
) -> Result<DjPageDTO, AppError> {
    let (key, display) = key_of(&name)?;
    let artist = match ra {
        Some(pick) if pick.id.trim().is_empty() || !ra::valid_slug(&pick.slug) => {
            return Err(AppError::Validation("Not a Resident Advisor artist".to_string()));
        }
        Some(pick) => Some(DjRaArtist { id: pick.id.trim().to_string(), slug: pick.slug, image_url: pick.image_url }),
        None => None,
    };
    with_db(&state, |db| {
        db.ensure_dj_profile(&key, &display).map_err(db_err)?;
        db.set_dj_ra_manual(&key, artist.as_ref()).map_err(db_err)?;
        read_page(db, &key, &display)
    })
}

/// Search's DJs row: Spotify artists for the query. Throws
/// `SpotifyNotConnected` when there is no account.
#[tauri::command]
pub async fn search_spotify_artists(
    state: State<'_, AppState>,
    spotify: State<'_, SpotifyState>,
    query: String,
) -> Result<Vec<ArtistCandidate>, AppError> {
    let query = query.trim();
    if query.chars().count() < 2 {
        return Ok(Vec::new());
    }
    Ok(search_spotify(&state, &spotify, query)
        .await?
        .into_iter()
        .map(ArtistCandidate::from)
        .collect())
}

/// Cached tracks per name key, duplicates collapsed — for "you own 23" on
/// Search's DJ cards. Keys with nothing cached are left out.
#[tauri::command]
pub async fn get_dj_cached_tracks(
    state: State<'_, AppState>,
    name_keys: Vec<String>,
) -> Result<HashMap<String, Vec<DjTrack>>, AppError> {
    with_db(&state, |db| db.dj_cached_tracks(&name_keys).map_err(db_err))
}

/// The parsed rows of these saved sets, for Plays.
#[tauri::command]
pub async fn get_yt_tracks_for_sets(
    state: State<'_, AppState>,
    video_ids: Vec<String>,
) -> Result<Vec<DjSetTrack>, AppError> {
    with_db(&state, |db| db.yt_tracks_for_sets(&video_ids).map_err(db_err))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};
    use std::future::Future;
    use std::sync::atomic::AtomicBool;

    const KEY: &str = "marco carola";

    fn row() -> DjProfileRow {
        DjProfileRow {
            name_key: KEY.into(),
            display_name: "Marco Carola".into(),
            spotify_artist_id: None,
            spotify_manual: false,
            spotify_image_url: None,
            genres: vec![],
            ra_artist_id: None,
            ra_slug: None,
            ra_image_url: None,
            ra_manual: false,
            spotify_synced_at: None,
            ra_synced_at: None,
            appears_limit: 150,
            appears_total: None,
            appears_cutoff: None,
            spotify_generation: 0,
        }
    }

    fn app_state() -> AppState {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");
        db.ensure_dj_profile(KEY, "Marco Carola").unwrap();
        // A signed-in account: the store only writes while Spotify is connected.
        db.set_setting("spotify_refresh_token", "rt").unwrap();
        AppState {
            db: Mutex::new(Some(db)),
            ai_context_cache: Mutex::new(None),
            taste_profile_cache: Mutex::new(None),
            db_path: Mutex::new(None),
            analysis_cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    fn profile_of(state: &AppState) -> DjProfileRow {
        with_db(state, |db| Ok(db.get_dj_profile(KEY).unwrap().unwrap())).unwrap()
    }

    #[test]
    fn the_profile_reads_exactly_as_src_types_dj_ts() {
        let mut stored = row();
        stored.spotify_artist_id = Some("4mo".into());
        stored.spotify_manual = true;
        stored.genres = vec!["techno".into()];
        stored.ra_slug = Some("marco-carola".into());
        stored.spotify_synced_at = Some(5);
        stored.appears_total = Some(151);
        assert_eq!(
            serde_json::to_value(DjProfileDTO::from(stored)).unwrap(),
            json!({
                "nameKey": "marco carola", "displayName": "Marco Carola",
                "spotifyArtistId": "4mo", "spotifyManual": true, "spotifyImageUrl": null,
                "genres": ["techno"], "raArtistId": null, "raSlug": "marco-carola", "raImageUrl": null,
                "raManual": false, "spotifySyncedAt": 5, "raSyncedAt": null,
                "raUrl": "https://ra.co/dj/marco-carola", "hasOlderReleases": true
            })
        );
    }

    #[test]
    fn without_a_stored_ra_page_the_link_is_guessed_from_the_name() {
        let profile = DjProfileDTO::from(row());
        assert_eq!(profile.ra_url, "https://ra.co/dj/marcocarola");
        assert!(!profile.has_older_releases, "nothing listed yet");
    }

    #[test]
    fn the_other_shapes_read_as_the_frontend_expects() {
        let page = DjPageDTO { profile: row().into(), tracks: vec![], gigs: vec![], pending_releases: 3 };
        let value = serde_json::to_value(page).unwrap();
        assert_eq!(value["pendingReleases"], json!(3));
        assert_eq!(value.as_object().unwrap().len(), 4);

        let candidate = ArtistCandidate::from(ra::RaSearchHit {
            id: "570".into(),
            name: "Marco Carola".into(),
            slug: "marcocarola".into(),
            image_url: None,
        });
        assert_eq!(
            serde_json::to_value(DjCandidates { spotify: vec![], ra: vec![candidate] }).unwrap(),
            json!({ "spotify": [], "ra": [{
                "id": "570", "name": "Marco Carola", "imageUrl": null, "followers": null, "slug": "marcocarola"
            }]})
        );

        assert_eq!(
            serde_json::to_value(DjTracksProgress { name_key: KEY.into(), done: 20, total: 45 }).unwrap(),
            json!({ "nameKey": "marco carola", "done": 20, "total": 45 })
        );

        let outcomes = [
            (RefreshOutcome::Fresh, "fresh"),
            (RefreshOutcome::Refreshed, "refreshed"),
            (RefreshOutcome::Failed, "failed"),
            (RefreshOutcome::NotFound, "notFound"),
            (RefreshOutcome::NotConnected, "notConnected"),
        ];
        for (outcome, text) in outcomes {
            assert_eq!(serde_json::to_value(outcome).unwrap(), json!(text));
        }
        assert_eq!(
            serde_json::to_value(DjRefresh::failed("offline")).unwrap(),
            json!({ "outcome": "failed", "error": "offline" })
        );
    }

    #[test]
    fn an_ra_pick_reads_from_camel_case() {
        let pick: RaPick =
            serde_json::from_value(json!({ "id": "570", "slug": "marcocarola", "imageUrl": null })).unwrap();
        assert_eq!(pick, RaPick { id: "570".into(), slug: "marcocarola".into(), image_url: None });
    }

    #[test]
    fn a_page_is_keyed_like_watched_djs_and_needs_a_name() {
        assert_eq!(key_of("  Marco Carola ").unwrap(), ("marco carola".to_string(), "Marco Carola".to_string()));
        assert!(matches!(key_of("   "), Err(AppError::Validation(_))));
    }

    #[test]
    fn spotify_is_refreshed_weekly_or_while_releases_wait() {
        let now = 100 * SPOTIFY_MAX_AGE_MS;
        let mut profile = row();
        assert!(spotify_needs_refresh(&profile, 0, now), "never fetched");

        profile.spotify_synced_at = Some(now - 1_000);
        assert!(!spotify_needs_refresh(&profile, 0, now));
        assert!(spotify_needs_refresh(&profile, 7, now), "an interrupted fetch continues");

        profile.spotify_synced_at = Some(now - SPOTIFY_MAX_AGE_MS - 1);
        assert!(spotify_needs_refresh(&profile, 0, now));
    }

    #[test]
    fn gigs_are_refreshed_daily() {
        let now = 100 * RA_MAX_AGE_MS;
        let mut profile = row();
        assert!(gigs_need_refresh(&profile, now));
        profile.ra_synced_at = Some(now - RA_MAX_AGE_MS + 1);
        assert!(!gigs_need_refresh(&profile, now));
        profile.ra_synced_at = Some(now - RA_MAX_AGE_MS - 1);
        assert!(gigs_need_refresh(&profile, now));
    }

    #[test]
    fn none_chosen_by_hand_asks_nobody() {
        assert!(chose_none(&None, true));
        assert!(!chose_none(&None, false), "not resolved yet: search");
        assert!(!chose_none(&Some("4mo".into()), true));
    }

    #[test]
    fn spotify_outcomes_become_what_the_page_shows() {
        assert_eq!(spotify_refresh(Ok(Ok(Fetched::Refreshed))), DjRefresh::just(RefreshOutcome::Refreshed));
        assert_eq!(spotify_refresh(Ok(Ok(Fetched::NotFound))), DjRefresh::just(RefreshOutcome::NotFound));
        assert_eq!(
            spotify_refresh(Err(AppError::SpotifyNotConnected)),
            DjRefresh::just(RefreshOutcome::NotConnected)
        );
        assert_eq!(
            spotify_refresh(Err(AppError::SpotifyReconnect)),
            DjRefresh::failed("Spotify needs you to sign in again")
        );
        assert_eq!(
            spotify_refresh(Ok(Err(FetchError::Spotify(SpotifyError::Network("offline".into()))))),
            DjRefresh::failed("offline")
        );
        let unauthorized: Result<Result<Fetched, FetchError>, AppError> =
            Ok(Err(FetchError::Spotify(SpotifyError::Api { status: 401, message: String::new(), reason: None })));
        assert!(is_unauthorized(&unauthorized));
        assert!(!is_unauthorized(&Ok::<Result<Fetched, FetchError>, AppError>(Ok(Fetched::Refreshed))));
    }

    #[test]
    fn ids_are_checked_before_they_are_stored() {
        assert!(valid_spotify_id("4uLU6hMCjMI75M1A2tKUQC"));
        assert!(!valid_spotify_id(""));
        assert!(!valid_spotify_id("../x"));
    }

    #[test]
    fn the_page_reads_collapsed_tracks_gigs_and_what_is_left_to_fetch() {
        let state = app_state();
        let page = with_db(&state, |db| {
            db.record_dj_releases(
                KEY,
                &[DjRelease { id: "r1".into(), name: "EP".into(), release_date: Some("2020".into()) }],
                &AppearsWindow { limit: 150, total: Some(0), cutoff: None },
            )
            .unwrap();
            read_page(db, KEY, "Marco Carola")
        })
        .unwrap();
        assert_eq!(page.pending_releases, 1);
        assert!(page.tracks.is_empty() && page.gigs.is_empty());
        assert_eq!(page.profile.name_key, KEY);
    }

    // --- one pass against a fake Spotify -----------------------------------

    /// Replays pages by URL. `fail_once` answers its error the first time its
    /// URL is asked; `on_call` runs against the database when its URL is asked
    /// (a disconnect or a manual pick landing mid-fetch).
    #[derive(Default)]
    struct FakeApi<'a> {
        pages: HashMap<String, Value>,
        fail_once: Mutex<HashMap<String, SpotifyError>>,
        on_call: Option<OnCall<'a>>,
    }

    /// A URL, and what happens to the database when it is asked.
    type OnCall<'a> = (String, &'a AppState, fn(&Database));

    impl FakeApi<'_> {
        fn failing_once(self, url: String, err: SpotifyError) -> Self {
            self.fail_once.lock().unwrap().insert(url, err);
            self
        }
    }

    impl<'a> FakeApi<'a> {
        fn on_call(mut self, url: String, state: &'a AppState, action: fn(&Database)) -> Self {
            self.on_call = Some((url, state, action));
            self
        }
    }

    impl SpotifyApi for FakeApi<'_> {
        fn get_json(&self, url: &str) -> impl Future<Output = Result<Value, SpotifyError>> + Send {
            if let Some((at, state, action)) = &self.on_call {
                if at == url {
                    with_db(state, |db| {
                        action(db);
                        Ok(())
                    })
                    .unwrap();
                }
            }
            let answer = match (self.fail_once.lock().unwrap().remove(url), self.pages.get(url)) {
                (Some(err), _) => Err(err),
                (None, Some(body)) => Ok(body.clone()),
                (None, None) if url.contains("/albums?include_groups=") => {
                    Ok(json!({ "items": [], "next": null, "total": 0 }))
                }
                (None, None) => Err(SpotifyError::Network(format!("no page for {url}"))),
            };
            async move { answer }
        }
    }

    fn spotify_with<'a>(pages: &[(String, Value)]) -> FakeApi<'a> {
        FakeApi { pages: pages.iter().cloned().collect(), ..FakeApi::default() }
    }

    fn disconnect(db: &Database) {
        db.delete_setting("spotify_refresh_token").unwrap();
    }

    /// "4mo" chosen by hand, with two albums of one track each.
    fn picked_with_two_albums<'a>() -> FakeApi<'a> {
        let album = |id: &str| json!({ "id": id, "name": id, "release_date": "2020-01-01" });
        let track = |id: &str| json!({ "items": [{ "id": id, "name": id, "artists": [{ "id": "4mo", "name": "Marco Carola" }] }], "next": null, "total": 1 });
        spotify_with(&[
            (web_api::artist_url("4mo"), json!({ "id": "4mo", "name": "Marco Carola" })),
            (
                web_api::artist_albums_url("4mo", "album"),
                json!({ "items": [album("lp1"), album("lp2")], "next": null, "total": 2 }),
            ),
            (web_api::album_tracks_url("lp1"), track("t1")),
            (web_api::album_tracks_url("lp2"), track("t2")),
        ])
    }

    fn stored_tracks(state: &AppState) -> Vec<DjTrack> {
        with_db(state, |db| Ok(db.dj_tracks(KEY).unwrap())).unwrap()
    }

    #[tokio::test]
    async fn an_unresolved_page_takes_the_artist_named_exactly_like_it() {
        let state = app_state();
        let api = spotify_with(&[(
            web_api::artist_search_url("Marco Carola"),
            json!({ "artists": { "items": [
                { "id": "jr", "name": "Marco Carola Jr" },
                { "id": "4mo", "name": "Marco Carola", "images": [{ "url": "https://i.scdn.co/mc.jpg" }], "genres": [] }
            ]}}),
        )]);

        let fetched = fetch_spotify(&api, &state, KEY, Listing::Update, |_, _| {}).await;

        assert_eq!(fetched, Ok(Fetched::Refreshed));
        let profile = profile_of(&state);
        assert_eq!(profile.spotify_artist_id.as_deref(), Some("4mo"));
        assert!(!profile.spotify_manual);
        assert_eq!(profile.spotify_image_url.as_deref(), Some("https://i.scdn.co/mc.jpg"));
        assert!(profile.spotify_synced_at.is_some());
    }

    #[tokio::test]
    async fn no_exact_name_is_not_found_and_stores_nothing() {
        let state = app_state();
        let api = spotify_with(&[(
            web_api::artist_search_url("Marco Carola"),
            json!({ "artists": { "items": [{ "id": "jr", "name": "Marco Carola Jr" }] } }),
        )]);

        assert_eq!(fetch_spotify(&api, &state, KEY, Listing::Update, |_, _| {}).await, Ok(Fetched::NotFound));
        assert_eq!(profile_of(&state).spotify_artist_id, None);
    }

    #[tokio::test]
    async fn a_stored_artist_is_refreshed_not_searched_again() {
        let state = app_state();
        with_db(&state, |db| Ok(db.set_dj_spotify_manual(KEY, Some("4mo")).unwrap())).unwrap();
        let api = spotify_with(&[(
            web_api::artist_url("4mo"),
            json!({ "id": "4mo", "name": "Marco Carola", "images": [{ "url": "https://i.scdn.co/new.jpg" }], "genres": ["techno"] }),
        )]);

        assert_eq!(fetch_spotify(&api, &state, KEY, Listing::Update, |_, _| {}).await, Ok(Fetched::Refreshed));
        let profile = profile_of(&state);
        assert_eq!(profile.spotify_image_url.as_deref(), Some("https://i.scdn.co/new.jpg"));
        assert_eq!(profile.genres, vec!["techno".to_string()]);
        assert!(profile.spotify_manual);
    }

    #[tokio::test]
    async fn none_chosen_by_hand_is_not_found_without_asking() {
        let state = app_state();
        with_db(&state, |db| Ok(db.set_dj_spotify_manual(KEY, None).unwrap())).unwrap();
        let api = FakeApi::default();
        assert_eq!(fetch_spotify(&api, &state, KEY, Listing::Update, |_, _| {}).await, Ok(Fetched::NotFound));
    }

    #[test]
    fn a_fetch_for_an_artist_no_longer_chosen_writes_nothing() {
        let state = app_state();
        with_db(&state, |db| Ok(db.set_dj_spotify_manual(KEY, Some("new")).unwrap())).unwrap();
        let generation = profile_of(&state).spotify_generation;
        let stale = SharedStore { state: &state, key: KEY, artist_id: "old", generation };

        let wrote = stale.write_batch(
            &[],
            &[DjTrack {
                spotify_id: "t1".into(),
                title: "Old artist's track".into(),
                artists: "Someone".into(),
                album: None,
                release_date: None,
                isrc: None,
                duration_ms: None,
            }],
        );

        assert_eq!(wrote, Err(StoreError::Superseded));
        assert!(stored_tracks(&state).is_empty());
        assert!(SharedStore { state: &state, key: KEY, artist_id: "new", generation }.mark_synced().is_ok());
    }

    #[test]
    fn a_fetch_stops_quietly_once_spotify_is_disconnected() {
        let state = app_state();
        with_db(&state, |db| Ok(db.set_dj_spotify_manual(KEY, Some("4mo")).unwrap())).unwrap();
        let generation = profile_of(&state).spotify_generation;
        let store = SharedStore { state: &state, key: KEY, artist_id: "4mo", generation };
        assert_eq!(store.is_current(), Ok(true));

        with_db(&state, |db| {
            disconnect(db);
            Ok(())
        })
        .unwrap();

        assert_eq!(store.is_current(), Ok(false));
        assert_eq!(store.write_batch(&[], &[]), Err(StoreError::Superseded));
        assert_eq!(store.known_releases(), Err(StoreError::Superseded));
        assert_eq!(
            spotify_refresh(Ok(Err(FetchError::Superseded))),
            DjRefresh::just(RefreshOutcome::Fresh),
            "no error reaches the page"
        );
    }
    #[tokio::test]
    async fn a_disconnect_mid_fetch_stops_the_fetch_quietly() {
        let state = app_state();
        with_db(&state, |db| Ok(db.set_dj_spotify_manual(KEY, Some("4mo")).unwrap())).unwrap();
        let api = picked_with_two_albums().on_call(web_api::album_tracks_url("lp1"), &state, disconnect);

        let fetched = fetch_spotify(&api, &state, KEY, Listing::Update, |_, _| {}).await;

        assert_eq!(fetched, Err(FetchError::Superseded));
        assert_eq!(spotify_refresh(Ok(fetched)), DjRefresh::just(RefreshOutcome::Fresh));
        assert!(stored_tracks(&state).is_empty(), "the batch read before the disconnect is not written");
        assert_eq!(profile_of(&state).spotify_synced_at, None);
    }

    #[tokio::test]
    async fn a_disconnect_during_the_search_resolves_nothing() {
        let state = app_state();
        let api = spotify_with(&[(
            web_api::artist_search_url("Marco Carola"),
            json!({ "artists": { "items": [
                { "id": "4mo", "name": "Marco Carola", "images": [{ "url": "https://i.scdn.co/mc.jpg" }], "genres": ["techno"] }
            ]}}),
        )])
        .on_call(web_api::artist_search_url("Marco Carola"), &state, disconnect);

        assert_eq!(fetch_spotify(&api, &state, KEY, Listing::Update, |_, _| {}).await, Err(FetchError::Superseded));
        let profile = profile_of(&state);
        assert_eq!(profile.spotify_artist_id, None);
        assert_eq!(profile.spotify_image_url, None);
        assert!(profile.genres.is_empty());
    }

    #[tokio::test]
    async fn picking_another_artist_and_back_stops_the_fetch_that_was_running() {
        let state = app_state();
        with_db(&state, |db| Ok(db.set_dj_spotify_manual(KEY, Some("4mo")).unwrap())).unwrap();
        fn b_then_back(db: &Database) {
            db.set_dj_spotify_manual(KEY, Some("other")).unwrap();
            db.set_dj_spotify_manual(KEY, Some("4mo")).unwrap();
        }
        let api = picked_with_two_albums().on_call(web_api::album_tracks_url("lp1"), &state, b_then_back);

        let fetched = fetch_spotify(&api, &state, KEY, Listing::Update, |_, _| {}).await;

        assert_eq!(fetched, Err(FetchError::Superseded), "same artist id, but a newer choice");
        assert!(stored_tracks(&state).is_empty());
        let profile = profile_of(&state);
        assert_eq!(profile.spotify_artist_id.as_deref(), Some("4mo"));
        assert_eq!(profile.spotify_synced_at, None, "the next open fetches again");

        // The fetch the new choice starts runs through.
        let api = picked_with_two_albums();
        assert_eq!(fetch_spotify(&api, &state, KEY, Listing::Update, |_, _| {}).await, Ok(Fetched::Refreshed));
        assert_eq!(stored_tracks(&state).len(), 2);
    }

    #[tokio::test]
    async fn a_401_retry_during_load_older_widens_the_window_once() {
        let state = app_state();
        with_db(&state, |db| Ok(db.set_dj_spotify_manual(KEY, Some("4mo")).unwrap())).unwrap();
        // The listing is recorded (window widened), then a track read 401s.
        let api = picked_with_two_albums().failing_once(
            web_api::album_tracks_url("lp2"),
            SpotifyError::Api { status: 401, message: String::new(), reason: None },
        );
        let listing = load_older(&profile_of(&state));
        let forgot = std::cell::Cell::new(0);

        let outcome = retry_unauthorized(
            || async { Ok(fetch_spotify(&api, &state, KEY, listing, |_, _| {}).await) },
            || forgot.set(forgot.get() + 1),
        )
        .await;

        assert!(matches!(outcome, Ok(Ok(Fetched::Refreshed))), "{outcome:?}");
        assert_eq!(forgot.get(), 1);
        assert_eq!(profile_of(&state).appears_limit, 150 + APPEARS_STEP, "not 150 + 2 × 150");
        assert_eq!(stored_tracks(&state).len(), 2);
    }
}
