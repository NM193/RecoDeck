// REST API routes for the mobile companion server
// All responses sanitize data: no file_path, no absolute paths exposed.

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
};
use axum::extract::Request;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use super::CompanionServerState;
use crate::db::Track;

// ---- Sanitized DTOs (never expose file_path) ----

/// Track data safe for mobile clients — file_path is stripped
#[derive(Debug, Clone, Serialize)]
pub struct MobileTrackDTO {
    pub id: i64,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<i32>,
    pub year: Option<i32>,
    pub label: Option<String>,
    pub duration_ms: Option<i32>,
    pub file_format: Option<String>,
    pub bitrate: Option<i32>,
    pub sample_rate: Option<i32>,
    pub file_size: Option<i64>,
    pub play_count: i32,
    pub rating: i32,
    pub genre: Option<String>,
    pub filename: String,
    // Analysis fields
    pub bpm: Option<f64>,
    pub musical_key: Option<String>,
}

impl MobileTrackDTO {
    fn from_track(track: Track) -> Self {
        let filename = std::path::Path::new(&track.file_path)
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_default();

        MobileTrackDTO {
            id: track.id.unwrap_or(0),
            title: track.title,
            artist: track.artist,
            album: track.album,
            album_artist: track.album_artist,
            track_number: track.track_number,
            year: track.year,
            label: track.label,
            duration_ms: track.duration_ms,
            file_format: track.file_format,
            bitrate: track.bitrate,
            sample_rate: track.sample_rate,
            file_size: track.file_size,
            play_count: track.play_count,
            rating: track.rating,
            genre: track.genre,
            filename,
            bpm: None,
            musical_key: None,
        }
    }

    fn from_track_with_analysis(
        track: Track,
        bpm: Option<f64>,
        musical_key: Option<String>,
    ) -> Self {
        let mut dto = Self::from_track(track);
        dto.bpm = bpm;
        dto.musical_key = musical_key;
        dto
    }
}

// ---- Request/Response types ----

#[derive(Deserialize)]
pub struct PaginationParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Deserialize)]
pub struct SearchParams {
    pub q: Option<String>,
}

#[derive(Serialize)]
pub struct StatusResponse {
    pub name: String,
    pub version: String,
    pub track_count: i64,
}

#[derive(Deserialize)]
pub struct StreamTicketRequest {
    pub track_id: i64,
}

#[derive(Serialize)]
pub struct StreamTicketResponse {
    pub ticket: String,
    pub expires_in: u64,
    pub stream_url: String,
}

#[derive(Serialize)]
pub struct SelfUrlResponse {
    pub url: String,
}

// ---- Route registration ----

pub fn api_routes() -> Router<Arc<CompanionServerState>> {
    Router::new()
        .route("/api/self", get(get_self_url))
        .route("/api/status", get(get_status))
        .route("/api/tracks", get(get_tracks))
        .route("/api/tracks/search", get(search_tracks))
        .route("/api/tracks/{id}", get(get_track))
        .route("/api/stream-ticket", post(create_stream_ticket))
}

// ---- Handlers ----

async fn get_self_url(request: Request) -> Json<SelfUrlResponse> {
    let host = request
        .headers()
        .get("host")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("localhost:8384");
    let scheme = request
        .headers()
        .get("x-forwarded-proto")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("http");
    let url = format!("{}://{}", scheme, host);
    Json(SelfUrlResponse { url })
}

async fn get_status(
    State(state): State<Arc<CompanionServerState>>,
) -> Result<Json<StatusResponse>, StatusCode> {
    let db_lock = state.db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let db = db_lock.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let track_count = db.count_tracks().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(StatusResponse {
        name: "RecoDeck".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        track_count,
    }))
}

async fn get_tracks(
    State(state): State<Arc<CompanionServerState>>,
    Query(params): Query<PaginationParams>,
) -> Result<Json<Vec<MobileTrackDTO>>, StatusCode> {
    let limit = params.limit.unwrap_or(50).min(500);
    let offset = params.offset.unwrap_or(0);

    let db_lock = state.db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let db = db_lock.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let rows = db
        .get_tracks_with_analysis_paginated(limit, offset)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let tracks: Vec<MobileTrackDTO> = rows
        .into_iter()
        .map(|(track, bpm, _bpm_conf, key, _key_conf)| {
            MobileTrackDTO::from_track_with_analysis(track, bpm, key)
        })
        .collect();

    Ok(Json(tracks))
}

async fn search_tracks(
    State(state): State<Arc<CompanionServerState>>,
    Query(params): Query<SearchParams>,
) -> Result<Json<Vec<MobileTrackDTO>>, StatusCode> {
    let query = params.q.unwrap_or_default();
    if query.is_empty() {
        return Ok(Json(Vec::new()));
    }

    let db_lock = state.db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let db = db_lock.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let tracks = db
        .search_tracks(&query)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mobile_tracks: Vec<MobileTrackDTO> = tracks
        .into_iter()
        .map(MobileTrackDTO::from_track)
        .collect();

    Ok(Json(mobile_tracks))
}

async fn get_track(
    State(state): State<Arc<CompanionServerState>>,
    Path(id): Path<i64>,
) -> Result<Json<MobileTrackDTO>, StatusCode> {
    let db_lock = state.db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let db = db_lock.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let track = db.get_track(id).map_err(|_| StatusCode::NOT_FOUND)?;

    Ok(Json(MobileTrackDTO::from_track(track)))
}

async fn create_stream_ticket(
    State(state): State<Arc<CompanionServerState>>,
    Json(body): Json<StreamTicketRequest>,
) -> Result<Json<StreamTicketResponse>, StatusCode> {
    // Verify the track exists
    let db_lock = state.db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let db = db_lock.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let _track = db.get_track(body.track_id).map_err(|_| StatusCode::NOT_FOUND)?;
    drop(db_lock);

    let ticket = state.create_ticket(body.track_id);
    let stream_url = format!("/stream/{}", body.track_id);

    Ok(Json(StreamTicketResponse {
        ticket,
        expires_in: 600,
        stream_url,
    }))
}
