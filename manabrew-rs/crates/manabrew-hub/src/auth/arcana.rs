use std::collections::HashMap;
use std::sync::{Arc, OnceLock};

use axum::extract::{Query, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::{DateTime, Duration, Utc};
use manabrew_hub::dto::{OAuthStartRequest, OAuthStartResponse};
use reqwest::Url;
use serde::Deserialize;
use sha2::{Digest, Sha256};

use super::oauth::app_redirect;
use super::{
    bearer_account, generate_code, now_str, resolve_signin_account, ts_in, ProviderIdentity,
    LOGIN_CODE_LEN,
};
use crate::config::ArcanaConfig;
use crate::routes::{generate_token, hash_token, internal_error, AppState};
use crate::storage::{is_unique_violation, ArcanaGrantRow, NewArcanaGrant, NewOAuthState};

pub const PROVIDER_ARCANA: &str = "arcana";
const SCOPE: &str = "profile collection:read decks:read events:read";
const BINDING_COOKIE: &str = "manabrew_arcana_binding";
const CALLBACK_PATH: &str = "/api/auth/callback/arcana";
const STATE_TTL_MINUTES: i64 = 10;
const AUTH_CODE_TTL_SECS: i64 = 60;
const VERIFIED_TTL_SECS: i64 = 300;
const ACCESS_EXPIRY_SKEW_SECS: i64 = 30;

#[derive(Deserialize)]
pub struct ArcanaCallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
    iss: Option<String>,
}

#[derive(Deserialize)]
struct TokenBody {
    access_token: String,
    expires_in: i64,
    refresh_token: String,
}

#[derive(Deserialize)]
struct TokenErrorBody {
    error: String,
}

#[derive(Deserialize)]
struct MeBody {
    issuer: String,
    subject: String,
}

enum ArcanaError {
    InvalidGrant,
    Unavailable(String),
}

enum MeOutcome {
    Valid(MeBody),
    Unauthorized,
}

fn json_error(status: StatusCode, error: &str) -> Response {
    (status, Json(serde_json::json!({ "error": error }))).into_response()
}

fn redirect_uri(state: &AppState) -> String {
    format!("{}{CALLBACK_PATH}", state.auth.public_url)
}

fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

fn binding_cookie(state: &AppState, value: &str, max_age: i64) -> HeaderValue {
    let secure = if state.auth.public_url.starts_with("https://") {
        "; Secure"
    } else {
        ""
    };
    HeaderValue::from_str(&format!(
        "{BINDING_COOKIE}={value}; Path={CALLBACK_PATH}; Max-Age={max_age}; HttpOnly; SameSite=Lax{secure}"
    ))
    .expect("cookie header")
}

fn binding_from_cookies(headers: &HeaderMap) -> Option<String> {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(';'))
        .filter_map(|pair| pair.trim().split_once('='))
        .find(|(name, _)| *name == BINDING_COOKIE)
        .map(|(_, value)| value.to_string())
}

fn expired(timestamp: &str, skew_secs: i64) -> bool {
    DateTime::parse_from_rfc3339(timestamp)
        .map(|at| at.with_timezone(&Utc) <= Utc::now() + Duration::seconds(skew_secs))
        .unwrap_or(true)
}

fn grant_lock(grant_id: &str) -> Arc<tokio::sync::Mutex<()>> {
    static LOCKS: OnceLock<parking_lot::Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>> =
        OnceLock::new();
    let mut locks = LOCKS.get_or_init(Default::default).lock();
    locks.retain(|_, lock| Arc::strong_count(lock) > 1);
    locks.entry(grant_id.to_string()).or_default().clone()
}

pub async fn arcana_start_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<OAuthStartRequest>,
) -> Response {
    let Some(config) = state.auth.arcana.as_ref() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    if request.client != "web" || (request.mode != "signin" && request.mode != "link") {
        return StatusCode::UNPROCESSABLE_ENTITY.into_response();
    }
    let link_account_id = if request.mode == "link" {
        match bearer_account(&state, &headers) {
            Ok(Some(account)) => Some(account.id),
            Ok(None) => return StatusCode::UNAUTHORIZED.into_response(),
            Err(error) => return internal_error(error),
        }
    } else {
        None
    };
    let state_token = generate_token();
    let verifier = generate_token();
    let binding = generate_token();
    let now = now_str();
    let expires_at = ts_in(Duration::minutes(STATE_TTL_MINUTES));
    let state_hash = hash_token(&state_token);
    let stored = {
        let storage = state.storage.lock().unwrap();
        storage
            .insert_oauth_state(&NewOAuthState {
                state_hash: &state_hash,
                provider: PROVIDER_ARCANA,
                mode: &request.mode,
                client: &request.client,
                link_account_id: link_account_id.as_deref(),
                return_to: &state.auth.web_app_url,
                created_at: &now,
                expires_at: &expires_at,
            })
            .and_then(|()| {
                storage.insert_arcana_oauth_state(
                    &state_hash,
                    &verifier,
                    &hash_token(&binding),
                    &now,
                    &expires_at,
                )
            })
    };
    if let Err(error) = stored {
        return internal_error(error);
    }
    let authorize_url = match Url::parse_with_params(
        &config.authorize_url,
        [
            ("response_type", "code"),
            ("client_id", config.client.client_id.as_str()),
            ("redirect_uri", &redirect_uri(&state)),
            ("scope", SCOPE),
            ("state", &state_token),
            ("code_challenge", &pkce_challenge(&verifier)),
            ("code_challenge_method", "S256"),
        ],
    ) {
        Ok(url) => url.to_string(),
        Err(error) => return internal_error(error),
    };
    let mut response = Json(OAuthStartResponse { authorize_url }).into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        binding_cookie(&state, &binding, STATE_TTL_MINUTES * 60),
    );
    response
}

pub async fn arcana_callback_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<ArcanaCallbackQuery>,
) -> Response {
    let mut response = arcana_callback(&state, &headers, query).await;
    response
        .headers_mut()
        .insert(header::SET_COOKIE, binding_cookie(&state, "", 0));
    response
}

async fn arcana_callback(
    state: &AppState,
    headers: &HeaderMap,
    query: ArcanaCallbackQuery,
) -> Response {
    let Some(config) = state.auth.arcana.as_ref() else {
        return app_redirect(state, "", &[("error", "oauth_failed")]);
    };
    let Some(state_hash) = query.state.as_deref().map(hash_token) else {
        return app_redirect(state, "", &[("error", "state_expired")]);
    };
    let now = now_str();
    let taken = {
        let storage = state.storage.lock().unwrap();
        storage
            .take_oauth_state(&state_hash, &now)
            .and_then(|row| Ok((row, storage.take_arcana_oauth_state(&state_hash, &now)?)))
    };
    let (stored, pkce) = match taken {
        Ok((Some(stored), Some(pkce))) if stored.provider == PROVIDER_ARCANA => (stored, pkce),
        Ok(_) => return app_redirect(state, "", &[("error", "state_expired")]),
        Err(error) => return internal_error(error),
    };
    let (verifier, binding_hash) = pkce;
    let fail = |error: &str| app_redirect(state, &stored.return_to, &[("error", error)]);
    let bound =
        binding_from_cookies(headers).is_some_and(|value| hash_token(&value) == binding_hash);
    if !bound {
        return fail("state_expired");
    }
    if query.iss.as_deref() != Some(config.issuer.as_str()) {
        tracing::warn!("arcana callback issuer mismatch");
        return fail("oauth_failed");
    }
    if query.error.is_some() {
        return fail("oauth_denied");
    }
    let Some(code) = query.code.as_deref() else {
        return fail("oauth_failed");
    };
    let tokens = match exchange_code(state, config, code, &verifier).await {
        Ok(tokens) => tokens,
        Err(ArcanaError::InvalidGrant) => return fail("oauth_failed"),
        Err(ArcanaError::Unavailable(error)) => {
            tracing::warn!(%error, "arcana code exchange failed");
            return fail("oauth_failed");
        }
    };
    let me = match fetch_me(state, config, &tokens.access_token).await {
        Ok(MeOutcome::Valid(me)) if me.issuer == config.issuer => me,
        Ok(_) => return fail("oauth_failed"),
        Err(ArcanaError::InvalidGrant) => return fail("oauth_failed"),
        Err(ArcanaError::Unavailable(error)) => {
            tracing::warn!(%error, "arcana /me failed");
            return fail("oauth_failed");
        }
    };
    match state
        .storage
        .lock()
        .unwrap()
        .arcana_issuer_matches(&config.issuer)
    {
        Ok(true) => {}
        Ok(false) => {
            tracing::error!(
                "configured arcana issuer differs from the one bound to stored identities"
            );
            return fail("oauth_failed");
        }
        Err(error) => return internal_error(error),
    }
    let identity = ProviderIdentity {
        user_id: me.subject.clone(),
        email: None,
        email_verified: false,
    };
    let account_id = if stored.mode == "link" {
        let Some(link_account_id) = stored.link_account_id.clone() else {
            return fail("oauth_failed");
        };
        let storage = state.storage.lock().unwrap();
        match storage.identity_by_provider(PROVIDER_ARCANA, &me.subject) {
            Ok(Some(row)) if row.account_id != link_account_id => return fail("identity_taken"),
            Ok(Some(_)) => {}
            Ok(None) => {
                if let Err(error) = storage.insert_identity(
                    &link_account_id,
                    PROVIDER_ARCANA,
                    &me.subject,
                    None,
                    false,
                    &now_str(),
                ) {
                    return internal_error(error);
                }
            }
            Err(error) => return internal_error(error),
        }
        link_account_id
    } else {
        let resolved = match resolve_signin_account(state, PROVIDER_ARCANA, &identity) {
            Err(error) if is_unique_violation(&error) => {
                resolve_signin_account(state, PROVIDER_ARCANA, &identity)
            }
            other => other,
        };
        match resolved {
            Ok(account) => account.id,
            Err(error) => return internal_error(error),
        }
    };
    let hub_code = (stored.mode != "link").then(|| generate_code(LOGIN_CODE_LEN));
    let code_hash = hub_code.as_deref().map(hash_token);
    let now = now_str();
    let saved = {
        let storage = state.storage.lock().unwrap();
        storage
            .insert_arcana_grant(&NewArcanaGrant {
                id: &uuid::Uuid::new_v4().to_string(),
                account_id: &account_id,
                subject: &me.subject,
                access_token: &tokens.access_token,
                access_expires_at: &ts_in(Duration::seconds(tokens.expires_in)),
                refresh_token: &tokens.refresh_token,
                now: &now,
                pending_code_hash: code_hash.as_deref(),
            })
            .and_then(|()| match code_hash.as_deref() {
                Some(code_hash) => storage.insert_auth_code(
                    code_hash,
                    &account_id,
                    &now,
                    &ts_in(Duration::seconds(AUTH_CODE_TTL_SECS)),
                ),
                None => Ok(()),
            })
    };
    if let Err(error) = saved {
        return internal_error(error);
    }
    match hub_code {
        Some(hub_code) => app_redirect(state, &stored.return_to, &[("code", &hub_code)]),
        None => app_redirect(state, &stored.return_to, &[("linked", PROVIDER_ARCANA)]),
    }
}

async fn token_request(
    state: &AppState,
    config: &ArcanaConfig,
    form: &[(&str, &str)],
) -> Result<TokenBody, ArcanaError> {
    let response = state
        .http
        .post(format!("{}/oauth/token", config.api_base_url))
        .basic_auth(&config.client.client_id, Some(&config.client.client_secret))
        .form(form)
        .send()
        .await
        .map_err(|error| ArcanaError::Unavailable(error.to_string()))?;
    let status = response.status();
    if status.is_success() {
        return response
            .json()
            .await
            .map_err(|error| ArcanaError::Unavailable(error.to_string()));
    }
    let body: Option<TokenErrorBody> = response.json().await.ok();
    match body {
        Some(body) if body.error == "invalid_grant" => Err(ArcanaError::InvalidGrant),
        Some(body) => Err(ArcanaError::Unavailable(format!("{status} {}", body.error))),
        None => Err(ArcanaError::Unavailable(status.to_string())),
    }
}

async fn exchange_code(
    state: &AppState,
    config: &ArcanaConfig,
    code: &str,
    verifier: &str,
) -> Result<TokenBody, ArcanaError> {
    token_request(
        state,
        config,
        &[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", &redirect_uri(state)),
            ("code_verifier", verifier),
        ],
    )
    .await
}

async fn fetch_me(
    state: &AppState,
    config: &ArcanaConfig,
    access_token: &str,
) -> Result<MeOutcome, ArcanaError> {
    let response = state
        .http
        .get(format!("{}/me", config.api_base_url))
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|error| ArcanaError::Unavailable(error.to_string()))?;
    match response.status() {
        StatusCode::UNAUTHORIZED => Ok(MeOutcome::Unauthorized),
        status if status.is_success() => response
            .json()
            .await
            .map(MeOutcome::Valid)
            .map_err(|error| ArcanaError::Unavailable(error.to_string())),
        status => Err(ArcanaError::Unavailable(status.to_string())),
    }
}

async fn refresh_grant(
    state: &AppState,
    config: &ArcanaConfig,
    grant: &ArcanaGrantRow,
) -> Result<ArcanaGrantRow, ArcanaError> {
    let tokens = token_request(
        state,
        config,
        &[
            ("grant_type", "refresh_token"),
            ("refresh_token", &grant.refresh_token),
        ],
    )
    .await?;
    let access_expires_at = ts_in(Duration::seconds(tokens.expires_in));
    state
        .storage
        .lock()
        .unwrap()
        .rotate_arcana_grant(
            &grant.id,
            &tokens.access_token,
            &access_expires_at,
            &tokens.refresh_token,
        )
        .map_err(|error| ArcanaError::Unavailable(error.to_string()))?;
    Ok(ArcanaGrantRow {
        access_token: tokens.access_token,
        access_expires_at,
        refresh_token: tokens.refresh_token,
        ..grant.clone()
    })
}

async fn verify_grant(
    state: &AppState,
    config: &ArcanaConfig,
    mut grant: ArcanaGrantRow,
) -> Result<(), ArcanaError> {
    let mut refreshed = false;
    if expired(&grant.access_expires_at, ACCESS_EXPIRY_SKEW_SECS) {
        grant = refresh_grant(state, config, &grant).await?;
        refreshed = true;
    }
    let mut outcome = fetch_me(state, config, &grant.access_token).await?;
    if matches!(outcome, MeOutcome::Unauthorized) && !refreshed {
        grant = refresh_grant(state, config, &grant).await?;
        outcome = fetch_me(state, config, &grant.access_token).await?;
    }
    match outcome {
        MeOutcome::Valid(me) if me.issuer == config.issuer && me.subject == grant.subject => state
            .storage
            .lock()
            .unwrap()
            .mark_arcana_grant_verified(&grant.id, &now_str())
            .map_err(|error| ArcanaError::Unavailable(error.to_string())),
        _ => Err(ArcanaError::InvalidGrant),
    }
}

pub async fn session_grant_rejection(state: &AppState, refresh_token: &str) -> Option<Response> {
    let session_hash = hash_token(refresh_token);
    let bound = match state
        .storage
        .lock()
        .unwrap()
        .arcana_grant_for_session(&session_hash)
    {
        Ok(Some(bound)) => bound,
        Ok(None) => return None,
        Err(error) => return Some(internal_error(error)),
    };
    let lock = grant_lock(&bound.id);
    let _guard = lock.lock().await;
    let grant = match state.storage.lock().unwrap().arcana_grant(&bound.id) {
        Ok(Some(grant)) => grant,
        Ok(None) => return Some(json_error(StatusCode::BAD_REQUEST, "invalid_grant")),
        Err(error) => return Some(internal_error(error)),
    };
    if !expired(&grant.verified_at, -VERIFIED_TTL_SECS) {
        return None;
    }
    let unavailable = || json_error(StatusCode::SERVICE_UNAVAILABLE, "temporarily_unavailable");
    let Some(config) = state.auth.arcana.as_ref() else {
        return Some(unavailable());
    };
    let grant_id = grant.id.clone();
    match verify_grant(state, config, grant).await {
        Ok(()) => None,
        Err(ArcanaError::InvalidGrant) => {
            let deleted = state.storage.lock().unwrap().delete_arcana_grant(&grant_id);
            Some(match deleted {
                Ok(()) => json_error(StatusCode::BAD_REQUEST, "invalid_grant"),
                Err(error) => internal_error(error),
            })
        }
        Err(ArcanaError::Unavailable(error)) => {
            tracing::warn!(%error, "arcana grant check unavailable");
            Some(unavailable())
        }
    }
}

async fn revoke_grant(state: &AppState, grant: &ArcanaGrantRow) {
    let lock = grant_lock(&grant.id);
    let _guard = lock.lock().await;
    let current = state.storage.lock().unwrap().arcana_grant(&grant.id);
    if let (Some(config), Ok(Some(current))) = (state.auth.arcana.as_ref(), current) {
        let sent = state
            .http
            .post(format!("{}/oauth/revoke", config.api_base_url))
            .basic_auth(&config.client.client_id, Some(&config.client.client_secret))
            .form(&[
                ("token", current.refresh_token.as_str()),
                ("token_type_hint", "refresh_token"),
            ])
            .send()
            .await;
        if let Err(error) = sent {
            tracing::warn!(%error, "arcana revoke failed");
        }
    }
    if let Err(error) = state.storage.lock().unwrap().delete_arcana_grant(&grant.id) {
        tracing::error!(%error, "delete arcana grant failed");
    }
}

pub async fn revoke_session_grant(state: &AppState, refresh_token: &str) {
    let grant = state
        .storage
        .lock()
        .unwrap()
        .arcana_grant_for_session(&hash_token(refresh_token));
    if let Ok(Some(grant)) = grant {
        revoke_grant(state, &grant).await;
    }
}

pub async fn revoke_account_grants(state: &AppState, account_id: &str) {
    let grants = state
        .storage
        .lock()
        .unwrap()
        .arcana_grants_for_account(account_id);
    for grant in grants.unwrap_or_default() {
        revoke_grant(state, &grant).await;
    }
}

pub fn bind_session(
    state: &AppState,
    code_hash: &str,
    refresh_token: &str,
) -> rusqlite::Result<()> {
    state
        .storage
        .lock()
        .unwrap()
        .bind_arcana_session(code_hash, &hash_token(refresh_token))
}
