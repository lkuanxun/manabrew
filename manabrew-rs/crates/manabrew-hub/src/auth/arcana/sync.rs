use std::collections::HashSet;
use std::sync::Arc;

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use chrono::{DateTime, Duration, Utc};
use rand::Rng;
use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::Value;

use super::{expired, grant_lock, refresh_grant, ArcanaError, ACCESS_EXPIRY_SKEW_SECS};
use crate::auth::{now_str, ts_in, SessionAccount};
use crate::config::ArcanaConfig;
use crate::routes::{internal_error, AppState};
use crate::storage::{ArcanaGrantRow, ArcanaSyncTarget};

const POLL_INTERVAL_SECS: u64 = 5;
const CHANGES_LIMIT: u32 = 100;
const BACKOFF_BASE_SECS: i64 = 30;
const BACKOFF_MAX_SECS: i64 = 600;
const GRANT_GONE_RETRY_SECS: i64 = 60;
const TOPIC_COLLECTION: &str = "collection.changed";
const TOPIC_DECKS: &str = "decks.changed";

enum SyncError {
    GrantGone,
    CursorExpired,
    RetryAfter(i64),
    Failed(String),
}

#[derive(Deserialize)]
struct Snapshot {
    cursor: String,
    collection: Section,
    decks: Section,
}

#[derive(Deserialize)]
struct Section {
    revision: String,
    items: Vec<Value>,
}

#[derive(Deserialize)]
struct ChangesPage {
    events: Vec<ChangeEvent>,
    next_cursor: String,
    has_more: bool,
}

#[derive(Deserialize)]
struct ChangeEvent {
    event_id: String,
    topic: String,
}

#[derive(Deserialize)]
struct DeckSummary {
    deck_id: String,
    revision: String,
}

#[derive(Deserialize)]
struct DeckBody {
    deck: Value,
}

async fn authorized_get(
    state: &AppState,
    config: &ArcanaConfig,
    grant_id: &str,
    path: &str,
) -> Result<reqwest::Response, SyncError> {
    let lock = grant_lock(grant_id);
    let _guard = lock.lock().await;
    let grant = state
        .storage
        .lock()
        .unwrap()
        .arcana_grant(grant_id)
        .map_err(|error| SyncError::Failed(error.to_string()))?;
    let Some(mut grant) = grant else {
        return Err(SyncError::GrantGone);
    };
    let mut refreshed = false;
    if expired(&grant.access_expires_at, ACCESS_EXPIRY_SKEW_SECS) {
        grant = refresh_or_drop(state, config, grant_id, &grant).await?;
        refreshed = true;
    }
    let mut response = send_get(state, config, &grant.access_token, path).await?;
    if response.status() == StatusCode::UNAUTHORIZED && !refreshed {
        grant = refresh_or_drop(state, config, grant_id, &grant).await?;
        response = send_get(state, config, &grant.access_token, path).await?;
    }
    if response.status() == StatusCode::UNAUTHORIZED {
        drop_grant(state, grant_id);
        return Err(SyncError::GrantGone);
    }
    Ok(response)
}

async fn refresh_or_drop(
    state: &AppState,
    config: &ArcanaConfig,
    grant_id: &str,
    grant: &ArcanaGrantRow,
) -> Result<ArcanaGrantRow, SyncError> {
    match refresh_grant(state, config, grant).await {
        Ok(grant) => Ok(grant),
        Err(ArcanaError::InvalidGrant) => {
            drop_grant(state, grant_id);
            Err(SyncError::GrantGone)
        }
        Err(ArcanaError::Unavailable(error)) => Err(SyncError::Failed(error)),
    }
}

async fn send_get(
    state: &AppState,
    config: &ArcanaConfig,
    access_token: &str,
    path: &str,
) -> Result<reqwest::Response, SyncError> {
    state
        .http
        .get(format!("{}{path}", config.api_base_url))
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|error| SyncError::Failed(error.to_string()))
}

fn drop_grant(state: &AppState, grant_id: &str) {
    if let Err(error) = state.storage.lock().unwrap().delete_arcana_grant(grant_id) {
        tracing::error!(%error, "delete arcana grant failed");
    }
}

async fn get_json<T: DeserializeOwned>(
    state: &AppState,
    config: &ArcanaConfig,
    grant_id: &str,
    path: &str,
) -> Result<T, SyncError> {
    let response = authorized_get(state, config, grant_id, path).await?;
    match response.status() {
        status if status.is_success() => response
            .json()
            .await
            .map_err(|error| SyncError::Failed(error.to_string())),
        StatusCode::GONE => Err(SyncError::CursorExpired),
        StatusCode::BAD_REQUEST if path.starts_with("/changes") => Err(SyncError::CursorExpired),
        StatusCode::TOO_MANY_REQUESTS => Err(SyncError::RetryAfter(
            response
                .headers()
                .get(reqwest::header::RETRY_AFTER)
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.parse().ok())
                .unwrap_or(BACKOFF_BASE_SECS),
        )),
        status => Err(SyncError::Failed(format!("{path} returned {status}"))),
    }
}

fn store_failed(error: rusqlite::Error) -> SyncError {
    SyncError::Failed(error.to_string())
}

async fn take_snapshot(
    state: &AppState,
    config: &ArcanaConfig,
    target: &ArcanaSyncTarget,
) -> Result<(), SyncError> {
    let snapshot: Snapshot = get_json(state, config, &target.grant_id, "/snapshot").await?;
    let collection = Value::Array(snapshot.collection.items).to_string();
    let decks = snapshot
        .decks
        .items
        .iter()
        .map(deck_row)
        .collect::<Result<Vec<_>, _>>()?;
    state
        .storage
        .lock()
        .unwrap()
        .replace_arcana_mirror(
            &target.account_id,
            Some((&snapshot.collection.revision, &collection)),
            Some(&decks),
            Some(&snapshot.cursor),
            &now_str(),
        )
        .map_err(store_failed)
}

fn deck_row(deck: &Value) -> Result<(String, String, String), SyncError> {
    let field = |name: &str| {
        deck.get(name)
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or_else(|| SyncError::Failed(format!("deck without {name}")))
    };
    Ok((field("deck_id")?, field("revision")?, deck.to_string()))
}

async fn fetch_decks(
    state: &AppState,
    config: &ArcanaConfig,
    target: &ArcanaSyncTarget,
) -> Result<Vec<(String, String, String)>, SyncError> {
    let summaries: Section = get_json(state, config, &target.grant_id, "/decks").await?;
    let stored = state
        .storage
        .lock()
        .unwrap()
        .arcana_mirror_deck_revisions(&target.account_id)
        .map_err(store_failed)?;
    let mut decks = Vec::with_capacity(summaries.items.len());
    for summary in summaries.items {
        let summary: DeckSummary = serde_json::from_value(summary)
            .map_err(|error| SyncError::Failed(error.to_string()))?;
        let cached = stored.iter().find(|(deck_id, revision, _)| {
            *deck_id == summary.deck_id && *revision == summary.revision
        });
        match cached {
            Some(row) => decks.push(row.clone()),
            None => {
                let path = format!("/decks/{}", urlencode(&summary.deck_id));
                let body: DeckBody = get_json(state, config, &target.grant_id, &path).await?;
                decks.push(deck_row(&body.deck)?);
            }
        }
    }
    Ok(decks)
}

async fn follow_changes(
    state: &AppState,
    config: &ArcanaConfig,
    target: &ArcanaSyncTarget,
    mut cursor: String,
) -> Result<(), SyncError> {
    loop {
        let path = format!(
            "/changes?cursor={}&limit={CHANGES_LIMIT}",
            urlencode(&cursor)
        );
        let page: ChangesPage = get_json(state, config, &target.grant_id, &path).await?;
        let mut seen = HashSet::new();
        let topics: HashSet<&str> = page
            .events
            .iter()
            .filter(|event| seen.insert(event.event_id.as_str()))
            .map(|event| event.topic.as_str())
            .collect();
        let collection = if topics.contains(TOPIC_COLLECTION) {
            let section: Section = get_json(state, config, &target.grant_id, "/collection").await?;
            Some((section.revision, Value::Array(section.items).to_string()))
        } else {
            None
        };
        let decks = if topics.contains(TOPIC_DECKS) {
            Some(fetch_decks(state, config, target).await?)
        } else {
            None
        };
        state
            .storage
            .lock()
            .unwrap()
            .replace_arcana_mirror(
                &target.account_id,
                collection
                    .as_ref()
                    .map(|(revision, payload)| (revision.as_str(), payload.as_str())),
                decks.as_deref(),
                Some(&page.next_cursor),
                &now_str(),
            )
            .map_err(store_failed)?;
        cursor = page.next_cursor;
        if !page.has_more {
            return Ok(());
        }
    }
}

async fn sync_account(
    state: &AppState,
    config: &ArcanaConfig,
    target: &ArcanaSyncTarget,
) -> Result<(), SyncError> {
    match target.cursor.clone() {
        None => take_snapshot(state, config, target).await,
        Some(cursor) => match follow_changes(state, config, target, cursor).await {
            Err(SyncError::CursorExpired) => take_snapshot(state, config, target).await,
            other => other,
        },
    }
}

fn due(retry_at: Option<&str>) -> bool {
    retry_at
        .and_then(|at| DateTime::parse_from_rfc3339(at).ok())
        .is_none_or(|at| at.with_timezone(&Utc) <= Utc::now())
}

fn record_failure(state: &AppState, target: &ArcanaSyncTarget, error: SyncError) {
    let (message, delay, reset_cursor) = match error {
        SyncError::GrantGone => (
            "Arcana authorization is no longer valid".to_string(),
            GRANT_GONE_RETRY_SECS,
            false,
        ),
        SyncError::CursorExpired => ("change cursor expired".to_string(), 0, true),
        SyncError::RetryAfter(seconds) => ("rate limited by Arcana".to_string(), seconds, false),
        SyncError::Failed(detail) => {
            tracing::warn!(account = %target.account_id, error = %detail, "arcana sync failed");
            let exponent = target.failures.clamp(0, 5) as u32;
            let delay = (BACKOFF_BASE_SECS * 2_i64.pow(exponent)).min(BACKOFF_MAX_SECS)
                + rand::thread_rng().gen_range(0..5);
            (
                "Could not reach Arcana; retrying automatically".to_string(),
                delay,
                false,
            )
        }
    };
    if let Err(error) = state.storage.lock().unwrap().record_arcana_sync_failure(
        &target.account_id,
        &message,
        &ts_in(Duration::seconds(delay)),
        reset_cursor,
    ) {
        tracing::error!(%error, "record arcana sync failure");
    }
}

pub async fn sync_loop(state: Arc<AppState>) {
    let Some(config) = state.auth.arcana.clone() else {
        return;
    };
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(POLL_INTERVAL_SECS));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        interval.tick().await;
        let targets = match state.storage.lock().unwrap().arcana_sync_targets() {
            Ok(targets) => targets,
            Err(error) => {
                tracing::error!(%error, "load arcana sync targets");
                continue;
            }
        };
        for target in targets
            .iter()
            .filter(|target| due(target.retry_at.as_deref()))
        {
            if let Err(error) = sync_account(&state, &config, target).await {
                record_failure(&state, target, error);
            }
        }
    }
}

fn urlencode(value: &str) -> String {
    reqwest::Url::parse_with_params("http://x/", [("v", value)])
        .map(|url| url.query().unwrap_or_default()[2..].to_string())
        .unwrap_or_default()
}

fn parse_stored(payload: &str) -> Value {
    serde_json::from_str(payload).unwrap_or(Value::Null)
}

pub async fn arcana_library_handler(
    State(state): State<Arc<AppState>>,
    SessionAccount(account): SessionAccount,
) -> Response {
    let library = match state.storage.lock().unwrap().arcana_library(&account.id) {
        Ok(library) => library,
        Err(error) => return internal_error(error),
    };
    Json(serde_json::json!({
        "linked": library.linked,
        "lastSuccessAt": library.last_success_at,
        "lastError": library.last_error,
        "decks": library.decks.iter().map(|deck| parse_stored(deck)).collect::<Vec<_>>(),
        "collection": library.collection.as_deref().map(parse_stored),
    }))
    .into_response()
}

pub async fn arcana_sync_now_handler(
    State(state): State<Arc<AppState>>,
    SessionAccount(account): SessionAccount,
) -> Response {
    match state
        .storage
        .lock()
        .unwrap()
        .request_arcana_sync(&account.id)
    {
        Ok(()) => StatusCode::ACCEPTED.into_response(),
        Err(error) => internal_error(error),
    }
}
