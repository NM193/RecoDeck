//! Tauri commands for the YouTube side of the tracklist feature.
//!
//! Every user brings their own API key: the free allowance of 10,000 units a
//! day is charged per key, so a key shipped inside the app would be a single
//! budget shared by everyone (one search alone costs 100 units), and a key in a
//! binary is trivially extracted.

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::library::AppState;
use crate::db::Database;
use crate::error::AppError;
use crate::external::youtube::{self, RawSet, DAILY_QUOTA};
use crate::external::youtube_time::{now_unix, pacific_day, seconds_until_pacific_midnight};

const YT_API_KEY_SETTING: &str = "youtube_api_key";
const YT_QUOTA_SETTING: &str = "youtube_quota";

/// What the counter knows, persisted as JSON in the settings table.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct QuotaState {
    pacific_day: String,
    spent: u32,
}

/// What the Settings screen shows.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuotaStatus {
    pub spent: u32,
    pub remaining: u32,
    pub daily_limit: u32,
    pub pacific_day: String,
    pub seconds_until_reset: i64,
    /// True once counting alone says the day is used up. YouTube itself is the
    /// authority — this is a local estimate and can be low if the same key is
    /// also used elsewhere.
    pub exhausted: bool,
}

// --- helpers -----------------------------------------------------------

/// Runs `f` with the database, then releases the lock. Nothing awaits inside,
/// which is deliberate: a lock must never be held across a network call.
fn with_db<T>(
    state: &State<'_, AppState>,
    f: impl FnOnce(&Database) -> Result<T, AppError>,
) -> Result<T, AppError> {
    let guard = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = guard
        .as_ref()
        .ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
    f(db)
}

fn read_key(state: &State<'_, AppState>) -> Result<String, AppError> {
    let key = with_db(state, |db| {
        db.get_setting(YT_API_KEY_SETTING)
            .map_err(|e| AppError::Database(format!("Failed to read YouTube API key: {e}")))
    })?;

    match key {
        Some(k) if !k.trim().is_empty() => Ok(k),
        _ => Err(AppError::YtNoApiKey),
    }
}

fn load_quota(db: &Database, today: &str) -> QuotaState {
    let stored = db
        .get_setting(YT_QUOTA_SETTING)
        .ok()
        .flatten()
        .and_then(|raw| serde_json::from_str::<QuotaState>(&raw).ok());

    match stored {
        // A counter from an earlier Pacific day is not carried over.
        Some(state) if state.pacific_day == today => state,
        _ => QuotaState {
            pacific_day: today.to_string(),
            spent: 0,
        },
    }
}

fn to_status(state: QuotaState, now: i64) -> QuotaStatus {
    QuotaStatus {
        remaining: DAILY_QUOTA.saturating_sub(state.spent),
        exhausted: state.spent >= DAILY_QUOTA,
        spent: state.spent,
        daily_limit: DAILY_QUOTA,
        pacific_day: state.pacific_day,
        seconds_until_reset: seconds_until_pacific_midnight(now),
    }
}

/// The quota core, free of Tauri state so it can be tested against a database.
fn spend_units(db: &Database, units: u32, now: i64) -> Result<QuotaStatus, AppError> {
    let today = pacific_day(now);
    let mut quota = load_quota(db, &today);
    quota.spent = quota.spent.saturating_add(units);

    let encoded = serde_json::to_string(&quota)
        .map_err(|e| AppError::Internal(format!("Failed to encode quota: {e}")))?;
    db.set_setting(YT_QUOTA_SETTING, &encoded)
        .map_err(|e| AppError::Database(format!("Failed to save quota: {e}")))?;

    Ok(to_status(quota, now))
}

/// Add what a call cost. Called after the network work, never during it.
fn record_spend(state: &State<'_, AppState>, units: u32) -> Result<QuotaStatus, AppError> {
    let now = now_unix();
    with_db(state, |db| spend_units(db, units, now))
}

// --- commands ----------------------------------------------------------

#[tauri::command]
pub async fn set_youtube_api_key(
    state: State<'_, AppState>,
    api_key: String,
) -> Result<(), AppError> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation(
            "YouTube API key cannot be empty".to_string(),
        ));
    }

    with_db(&state, |db| {
        db.set_setting(YT_API_KEY_SETTING, trimmed)
            .map_err(|e| AppError::Database(format!("Failed to save YouTube API key: {e}")))
    })
}

#[tauri::command]
pub async fn get_youtube_api_key_status(state: State<'_, AppState>) -> Result<bool, AppError> {
    match read_key(&state) {
        Ok(_) => Ok(true),
        Err(AppError::YtNoApiKey) => Ok(false),
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub async fn delete_youtube_api_key(state: State<'_, AppState>) -> Result<(), AppError> {
    with_db(&state, |db| {
        db.set_setting(YT_API_KEY_SETTING, "")
            .map_err(|e| AppError::Database(format!("Failed to delete YouTube API key: {e}")))
    })
}

#[tauri::command]
pub async fn get_youtube_quota(state: State<'_, AppState>) -> Result<QuotaStatus, AppError> {
    let now = now_unix();
    let today = pacific_day(now);
    let quota = with_db(&state, |db| Ok(load_quota(db, &today)))?;
    Ok(to_status(quota, now))
}

/// Cheapest call there is (1 unit), so a key can be checked the moment it is
/// pasted instead of failing later on a real fetch.
#[tauri::command]
pub async fn test_youtube_api_key(state: State<'_, AppState>) -> Result<QuotaStatus, AppError> {
    let key = read_key(&state)?;

    let mut spent = 0u32;
    let result = youtube::verify_key(&key, &mut spent).await;

    // Google bills the attempt, so the spend is recorded even when the key is
    // rejected. The verification error still wins over a bookkeeping error.
    let status = record_spend(&state, spent);
    result?;
    status
}

/// Fetch one set: description plus up to five pages of comments, 5-7 units.
/// Accepts a full URL or a bare video id.
#[tauri::command]
pub async fn fetch_youtube_set(
    state: State<'_, AppState>,
    input: String,
) -> Result<RawSet, AppError> {
    let video_id = youtube::extract_video_id(&input).ok_or_else(|| {
        AppError::Validation(format!("Could not find a YouTube video id in \"{input}\""))
    })?;

    let key = read_key(&state)?;

    let mut spent = 0u32;
    let result = youtube::fetch_set(&key, &video_id, &mut spent).await;

    let _ = record_spend(&state, spent);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 2026-01-15 12:00 UTC and the same instant a day later, both in PST.
    const DAY_ONE: i64 = 1_768_478_400;
    const DAY_TWO: i64 = DAY_ONE + 86_400;

    #[test]
    fn spending_accumulates_within_a_pacific_day() {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");

        let after_video = spend_units(&db, 1, DAY_ONE).unwrap();
        assert_eq!(after_video.spent, 1);

        // A set is one videos call plus up to five comment pages.
        let after_set = spend_units(&db, 6, DAY_ONE).unwrap();
        assert_eq!(after_set.spent, 7);
        assert_eq!(after_set.remaining, DAILY_QUOTA - 7);
        assert_eq!(after_set.pacific_day, "2026-01-15");
    }

    #[test]
    fn a_new_pacific_day_starts_the_counter_over() {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");

        spend_units(&db, 9_500, DAY_ONE).unwrap();
        let next_day = spend_units(&db, 5, DAY_TWO).unwrap();

        assert_eq!(next_day.spent, 5, "yesterday's spending must not carry over");
        assert_eq!(next_day.pacific_day, "2026-01-16");
    }

    #[test]
    fn an_expensive_search_shows_up_as_such() {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");
        let status = spend_units(&db, 100, DAY_ONE).unwrap();
        assert_eq!(status.spent, 100);
        assert_eq!(status.remaining, 9_900);
    }

    #[test]
    fn status_reports_what_is_left() {
        let status = to_status(
            QuotaState {
                pacific_day: "2026-09-07".to_string(),
                spent: 137,
            },
            1_768_478_400,
        );
        assert_eq!(status.remaining, DAILY_QUOTA - 137);
        assert_eq!(status.daily_limit, 10_000);
        assert!(!status.exhausted);
        assert!(status.seconds_until_reset > 0);
    }

    #[test]
    fn overspending_does_not_wrap_around() {
        let status = to_status(
            QuotaState {
                pacific_day: "2026-09-07".to_string(),
                spent: 10_400,
            },
            1_768_478_400,
        );
        assert_eq!(status.remaining, 0);
        assert!(status.exhausted);
    }
}
