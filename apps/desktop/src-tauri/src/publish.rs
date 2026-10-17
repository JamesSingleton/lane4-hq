//! Publishing verified results to the Lane4 API when a connection is
//! available. The operator signs in with a device code (approved in a browser),
//! picks the team hosting the meet, and heats post to
//! `/v1/teams/{team}/hosted-meets/{meet}/heats`. The session token lives in the
//! OS keychain (macOS Keychain / Windows Credential Manager) and never reaches
//! the webview; neither does the pending device code.

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::store::write_atomic;

const KEYRING_SERVICE: &str = "com.lane4hq.desktop";
const KEYRING_USER: &str = "results-publish-token";
/// Must match `DEVICE_CLIENTS` in `@lane4hq/auth/device-clients`.
const CLIENT_ID: &str = "lane4-desktop";
const DEVICE_GRANT: &str = "urn:ietf:params:oauth:grant-type:device_code";
const POST_TIMEOUT: Duration = Duration::from_secs(15);
const PROBE_TIMEOUT: Duration = Duration::from_secs(4);

/// The API this build talks to. Set `LANE4_API_URL` at build time to change it
/// (empty counts as unset, as CI passes missing variables).
pub const API_URL: &str = match option_env!("LANE4_API_URL") {
    Some(url) if !url.is_empty() => url,
    _ if cfg!(debug_assertions) => "http://localhost:8080",
    _ => "https://api.lane4hq.com",
};

/// Where accounts are created and sign-ins approved. Set `LANE4_ADMIN_URL` at
/// build time to change it.
pub const ADMIN_URL: &str = match option_env!("LANE4_ADMIN_URL") {
    Some(url) if !url.is_empty() => url,
    _ if cfg!(debug_assertions) => "http://localhost:3001",
    _ => "https://admin.lane4hq.com",
};

#[derive(Debug, thiserror::Error)]
pub enum PublishError {
    #[error("Publishing isn't set up yet.")]
    NotConfigured,
    #[error("This build has an invalid Lane4 address.")]
    BadEndpoint,
    #[error("Sign in to Lane4 first.")]
    NotSignedIn,
    #[error("Start signing in again.")]
    NoSignIn,
    #[error("Can't reach Lane4. Check the internet connection and try again.")]
    Offline(String),
    #[error("{0}")]
    Server(String),
    #[error("{0}")]
    Keychain(String),
    #[error("{0}")]
    Io(String),
}

impl PublishError {
    fn kind(&self) -> &'static str {
        match self {
            Self::NotConfigured => "notConfigured",
            Self::BadEndpoint => "badEndpoint",
            Self::NotSignedIn => "notSignedIn",
            Self::NoSignIn => "noSignIn",
            Self::Offline(_) => "offline",
            Self::Server(_) => "server",
            Self::Keychain(_) => "keychain",
            Self::Io(_) => "io",
        }
    }
}

/// `{ kind, message }` for every variant, so the webview always has text.
impl Serialize for PublishError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("PublishError", 2)?;
        s.serialize_field("kind", self.kind())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    name: String,
    email: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct PublishSettings {
    /// The server that issued the stored token. Tokens are only sent back to it.
    pub api_url: String,
    pub team_id: String,
    pub team_name: String,
    pub enabled: bool,
    pub account: Option<Account>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishSettingsView {
    team_id: String,
    team_name: String,
    enabled: bool,
    /// Set only while a token is in the keychain.
    account: Option<Account>,
    /// Set when the keychain itself failed, so the account panel can offer
    /// "Sign in again" instead of looking simply signed out.
    keychain_error: Option<String>,
}

pub const KEYCHAIN_SIGN_IN_AGAIN: &str =
    "Lane4 couldn't read the saved sign-in from this computer's keychain. Sign in again.";

/// What the account panel shows. A keychain error is not the same as being
/// signed out: the token may still be there, and the operator needs a way back in.
fn settings_view(
    settings: &PublishSettings,
    token: Result<Option<String>, PublishError>,
) -> PublishSettingsView {
    if !same_server(settings) {
        return PublishSettingsView {
            team_id: String::new(),
            team_name: String::new(),
            enabled: settings.enabled,
            account: None,
            keychain_error: None,
        };
    }
    let (account, keychain_error) = match token {
        Ok(Some(_)) => (settings.account.clone(), None),
        Ok(None) => (None, None),
        Err(PublishError::Keychain(_)) => (None, Some(KEYCHAIN_SIGN_IN_AGAIN.to_string())),
        Err(_) => (None, None),
    };
    PublishSettingsView {
        team_id: settings.team_id.clone(),
        team_name: settings.team_name.clone(),
        enabled: settings.enabled,
        account,
        keychain_error,
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostOutcome {
    status: u16,
    body: String,
}

struct PendingSignIn {
    device_code: String,
    verification_uri: String,
}

#[derive(Default)]
pub struct SignInState(Mutex<Option<PendingSignIn>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInStart {
    user_code: String,
    verification_uri: String,
    interval_secs: u64,
    expires_in_secs: u64,
}

#[derive(Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum SignInPoll {
    Pending,
    SlowDown,
    Denied,
    Expired,
    /// `me` is the `/v1/me` response: the user and their teams.
    Approved {
        me: Value,
    },
}

pub fn valid_api_url(url: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(url) else {
        return false;
    };
    match parsed.scheme() {
        "https" => parsed.host_str().is_some(),
        "http" => matches!(parsed.host_str(), Some("localhost" | "127.0.0.1" | "[::1]")),
        _ => false,
    }
}

/// `base` + path segments, each percent-encoded, keeping any base path.
pub fn api_url(base: &str, segments: &[&str]) -> Result<reqwest::Url, PublishError> {
    let mut url = reqwest::Url::parse(base).map_err(|_| PublishError::BadEndpoint)?;
    url.path_segments_mut()
        .map_err(|_| PublishError::BadEndpoint)?
        .pop_if_empty()
        .extend(segments);
    Ok(url)
}

/// RFC 8628 token polling: a 400 names why there's no token yet.
fn poll_outcome(status: u16, body: &str) -> Result<Option<SignInPoll>, PublishError> {
    if (200..300).contains(&status) {
        return Ok(None);
    }
    let error = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|v| v.get("error").and_then(Value::as_str).map(str::to_owned))
        .unwrap_or_default();
    match error.as_str() {
        "authorization_pending" => Ok(Some(SignInPoll::Pending)),
        "slow_down" => Ok(Some(SignInPoll::SlowDown)),
        "access_denied" => Ok(Some(SignInPoll::Denied)),
        "expired_token" => Ok(Some(SignInPoll::Expired)),
        _ => Err(server_error(status, body)),
    }
}

fn server_error(status: u16, body: &str) -> PublishError {
    let message = serde_json::from_str::<Value>(body).ok().and_then(|v| {
        v.pointer("/error/message")
            .or_else(|| v.get("error_description"))
            .or_else(|| v.get("message"))
            .and_then(Value::as_str)
            .map(str::to_owned)
    });
    PublishError::Server(message.unwrap_or_else(|| format!("Lane4 answered HTTP {status}.")))
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, PublishError> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| PublishError::Io(e.to_string()))?;
    fs::create_dir_all(&dir).map_err(|e| PublishError::Io(e.to_string()))?;
    Ok(dir.join("publish.json"))
}

fn load_settings(app: &AppHandle) -> Result<PublishSettings, PublishError> {
    match fs::read(settings_path(app)?) {
        Ok(bytes) => Ok(serde_json::from_slice(&bytes).unwrap_or_default()),
        Err(_) => Ok(PublishSettings::default()),
    }
}

fn save_settings(app: &AppHandle, settings: &PublishSettings) -> Result<(), PublishError> {
    let json = serde_json::to_vec_pretty(settings).map_err(|e| PublishError::Io(e.to_string()))?;
    write_atomic(&settings_path(app)?, &json).map_err(|e| PublishError::Io(e.to_string()))
}

fn keyring_entry() -> Result<keyring::Entry, PublishError> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| PublishError::Keychain(e.to_string()))
}

fn read_token() -> Result<Option<String>, PublishError> {
    match keyring_entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(PublishError::Keychain(e.to_string())),
    }
}

fn delete_token() -> Result<(), PublishError> {
    match keyring_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(PublishError::Keychain(e.to_string())),
    }
}

/// Forget the account, its token, and the team it chose.
fn clear_account(settings: &mut PublishSettings) -> Result<(), PublishError> {
    delete_token()?;
    settings.account = None;
    settings.team_id.clear();
    settings.team_name.clear();
    Ok(())
}

fn client(timeout: Duration) -> Result<reqwest::Client, PublishError> {
    reqwest::Client::builder()
        .timeout(timeout)
        .user_agent(concat!("Lane4Desktop/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| PublishError::Io(e.to_string()))
}

async fn send(request: reqwest::RequestBuilder) -> Result<(u16, String), PublishError> {
    let response = request
        .send()
        .await
        .map_err(|e| PublishError::Offline(e.to_string()))?;
    let status = response.status().as_u16();
    let mut body = response.text().await.unwrap_or_default();
    body.truncate(64_000);
    Ok((status, body))
}

async fn post_json(url: reqwest::Url, body: Value) -> Result<(u16, String), PublishError> {
    send(
        client(POST_TIMEOUT)?
            .post(url)
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(body.to_string()),
    )
    .await
}

/// A token from another build's server is never sent here.
fn same_server(settings: &PublishSettings) -> bool {
    settings.api_url == API_URL
}

/// The stored token, if it was issued by this build's server.
fn token_for(settings: &PublishSettings) -> Result<String, PublishError> {
    if !same_server(settings) {
        return Err(PublishError::NotSignedIn);
    }
    read_token()?.ok_or(PublishError::NotSignedIn)
}

/// `/v1/me` with the stored token. A rejected token is removed.
async fn fetch_me(app: &AppHandle, settings: &mut PublishSettings) -> Result<Value, PublishError> {
    let token = token_for(settings)?;
    let (status, body) = send(
        client(POST_TIMEOUT)?
            .get(api_url(API_URL, &["v1", "me"])?)
            .bearer_auth(token),
    )
    .await?;
    if status == 401 {
        clear_account(settings)?;
        save_settings(app, settings)?;
        return Err(PublishError::NotSignedIn);
    }
    if !(200..300).contains(&status) {
        return Err(server_error(status, &body));
    }
    let me: Value = serde_json::from_str(&body).map_err(|e| PublishError::Server(e.to_string()))?;
    let account = Account {
        name: me
            .pointer("/user/name")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned(),
        email: me
            .pointer("/user/email")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned(),
    };
    if settings.account.as_ref() != Some(&account) {
        settings.account = Some(account);
        save_settings(app, settings)?;
    }
    Ok(me)
}

#[tauri::command]
pub async fn publish_get_settings(app: AppHandle) -> Result<PublishSettingsView, PublishError> {
    let settings = load_settings(&app)?;
    // Don't touch the keychain for a token issued by a different server.
    let token = if same_server(&settings) {
        read_token()
    } else {
        Ok(None)
    };
    Ok(settings_view(&settings, token))
}

/// Save the host team and the auto-publish switch.
#[tauri::command]
pub async fn publish_set_settings(
    app: AppHandle,
    team_id: String,
    team_name: String,
    enabled: bool,
) -> Result<(), PublishError> {
    let mut settings = load_settings(&app)?;
    settings.team_id = team_id.trim().to_string();
    settings.team_name = team_name.trim().to_string();
    settings.enabled = enabled;
    save_settings(&app, &settings)
}

/// Ask for a device code and open the approval page in the browser.
#[tauri::command]
pub async fn account_start_sign_in(
    app: AppHandle,
    pending: State<'_, SignInState>,
) -> Result<SignInStart, PublishError> {
    let (status, body) = post_json(
        api_url(API_URL, &["api", "auth", "device", "code"])?,
        json!({ "client_id": CLIENT_ID }),
    )
    .await?;
    if !(200..300).contains(&status) {
        return Err(server_error(status, &body));
    }
    let v: Value = serde_json::from_str(&body).map_err(|e| PublishError::Server(e.to_string()))?;
    let text = |key: &str| {
        v.get(key)
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned()
    };
    let device_code = text("device_code");
    let user_code = text("user_code");
    let complete = text("verification_uri_complete");
    let verification_uri = if complete.is_empty() {
        text("verification_uri")
    } else {
        complete
    };
    if device_code.is_empty() || user_code.is_empty() || !valid_verification_uri(&verification_uri)
    {
        return Err(PublishError::Server(
            "Lane4 sent an unexpected sign-in response.".into(),
        ));
    }
    *pending.0.lock().expect("sign-in lock") = Some(PendingSignIn {
        device_code,
        verification_uri: verification_uri.clone(),
    });
    // The code is also shown in the app, so a failed launch isn't fatal.
    let _ = app.opener().open_url(&verification_uri, None::<&str>);
    Ok(SignInStart {
        user_code,
        verification_uri,
        interval_secs: v.get("interval").and_then(Value::as_u64).unwrap_or(5),
        expires_in_secs: v.get("expires_in").and_then(Value::as_u64).unwrap_or(900),
    })
}

fn valid_verification_uri(url: &str) -> bool {
    reqwest::Url::parse(url).is_ok_and(|u| matches!(u.scheme(), "https" | "http"))
}

/// Check once whether the browser approval has happened.
#[tauri::command]
pub async fn account_poll_sign_in(
    app: AppHandle,
    pending: State<'_, SignInState>,
) -> Result<SignInPoll, PublishError> {
    let device_code = pending
        .0
        .lock()
        .expect("sign-in lock")
        .as_ref()
        .map(|p| p.device_code.clone())
        .ok_or(PublishError::NoSignIn)?;
    let (status, body) = post_json(
        api_url(API_URL, &["api", "auth", "device", "token"])?,
        json!({
            "grant_type": DEVICE_GRANT,
            "device_code": device_code,
            "client_id": CLIENT_ID,
        }),
    )
    .await?;
    if let Some(outcome) = poll_outcome(status, &body)? {
        if matches!(outcome, SignInPoll::Denied | SignInPoll::Expired) {
            *pending.0.lock().expect("sign-in lock") = None;
        }
        return Ok(outcome);
    }
    let token = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|v| {
            v.get("access_token")
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .ok_or_else(|| PublishError::Server("Lane4 sent no session token.".into()))?;
    *pending.0.lock().expect("sign-in lock") = None;
    keyring_entry()?
        .set_password(&token)
        .map_err(|e| PublishError::Keychain(e.to_string()))?;
    let mut settings = load_settings(&app)?;
    if !same_server(&settings) {
        settings.api_url = API_URL.to_string();
        settings.account = None;
        settings.team_id.clear();
        settings.team_name.clear();
        save_settings(&app, &settings)?;
    }
    let me = fetch_me(&app, &mut settings).await?;
    Ok(SignInPoll::Approved { me })
}

/// Reopen the approval page for the sign-in in progress.
#[tauri::command]
pub fn account_reopen_sign_in(
    app: AppHandle,
    pending: State<'_, SignInState>,
) -> Result<(), PublishError> {
    let uri = pending
        .0
        .lock()
        .expect("sign-in lock")
        .as_ref()
        .map(|p| p.verification_uri.clone())
        .ok_or(PublishError::NoSignIn)?;
    app.opener()
        .open_url(&uri, None::<&str>)
        .map_err(|e| PublishError::Server(e.to_string()))
}

#[tauri::command]
pub fn account_cancel_sign_in(pending: State<'_, SignInState>) {
    *pending.0.lock().expect("sign-in lock") = None;
}

/// The signed-in user and their teams, fresh from the server.
#[tauri::command]
pub async fn account_me(app: AppHandle) -> Result<Value, PublishError> {
    let mut settings = load_settings(&app)?;
    fetch_me(&app, &mut settings).await
}

/// Open Lane4's sign-up page in the browser; accounts are created on the web.
#[tauri::command]
pub fn account_open_sign_up(app: AppHandle) -> Result<(), PublishError> {
    let url = sign_up_url(ADMIN_URL)?;
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|e| PublishError::Server(e.to_string()))
}

fn sign_up_url(admin_url: &str) -> Result<reqwest::Url, PublishError> {
    let admin_url = admin_url.trim().trim_end_matches('/');
    if !valid_api_url(admin_url) {
        return Err(PublishError::BadEndpoint);
    }
    api_url(admin_url, &["sign-up"])
}

/// Sign out: end the session on the server if reachable, then forget it here.
#[tauri::command]
pub async fn account_sign_out(app: AppHandle) -> Result<(), PublishError> {
    let mut settings = load_settings(&app)?;
    if let Ok(token) = token_for(&settings) {
        if let Ok(url) = api_url(API_URL, &["api", "auth", "sign-out"]) {
            let _ = client(PROBE_TIMEOUT)?
                .post(url)
                .bearer_auth(token)
                .header(reqwest::header::CONTENT_TYPE, "application/json")
                .body("{}")
                .send()
                .await;
        }
    }
    clear_account(&mut settings)?;
    save_settings(&app, &settings)
}

/// Can Lane4 be reached right now? Any HTTP answer counts.
#[tauri::command]
pub async fn publish_probe() -> Result<bool, PublishError> {
    Ok(client(PROBE_TIMEOUT)?
        .get(api_url(API_URL, &["health"])?)
        .send()
        .await
        .is_ok())
}

/// POST one heat publication. The body is built and validated in TypeScript
/// (`@lane4hq/meet-engine/publish`); Rust adds auth and the idempotency key.
#[tauri::command]
pub async fn publish_post(
    app: AppHandle,
    meet_id: String,
    idempotency_key: String,
    body: String,
) -> Result<PostOutcome, PublishError> {
    let settings = load_settings(&app)?;
    if !settings.enabled || settings.team_id.is_empty() {
        return Err(PublishError::NotConfigured);
    }
    let token = token_for(&settings)?;
    let url = api_url(
        API_URL,
        &[
            "v1",
            "teams",
            &settings.team_id,
            "hosted-meets",
            &meet_id,
            "heats",
        ],
    )?;
    let (status, mut body) = send(
        client(POST_TIMEOUT)?
            .post(url)
            .bearer_auth(token)
            .header("Idempotency-Key", idempotency_key)
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(body),
    )
    .await?;
    body.truncate(2_000);
    Ok(PostOutcome { status, body })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn requires_https_except_for_localhost() {
        assert!(valid_api_url("https://api.lane4hq.com"));
        assert!(valid_api_url("http://localhost:8080"));
        assert!(valid_api_url("http://127.0.0.1:8080/x"));
        assert!(!valid_api_url("http://api.lane4hq.com"));
        assert!(!valid_api_url("ftp://x"));
        assert!(!valid_api_url("not a url"));
    }

    #[test]
    fn build_addresses_are_valid() {
        assert!(valid_api_url(API_URL), "LANE4_API_URL={API_URL}");
        assert!(valid_api_url(ADMIN_URL), "LANE4_ADMIN_URL={ADMIN_URL}");
    }

    #[test]
    fn tokens_stay_with_the_server_that_issued_them() {
        let mut settings = PublishSettings {
            api_url: API_URL.into(),
            ..Default::default()
        };
        assert!(same_server(&settings));
        settings.api_url = "https://staging.lane4hq.com".into();
        assert!(!same_server(&settings));
        assert!(matches!(
            token_for(&settings),
            Err(PublishError::NotSignedIn)
        ));
    }

    #[test]
    fn sign_up_opens_only_lane4_style_urls() {
        assert_eq!(
            sign_up_url("https://admin.lane4hq.com/").unwrap().as_str(),
            "https://admin.lane4hq.com/sign-up"
        );
        assert_eq!(
            sign_up_url("http://localhost:3001").unwrap().as_str(),
            "http://localhost:3001/sign-up"
        );
        assert!(sign_up_url("http://evil.example").is_err());
        assert!(sign_up_url("file:///etc/passwd").is_err());
    }

    #[test]
    fn builds_encoded_api_urls() {
        let url = api_url(
            "https://api.lane4hq.com",
            &["v1", "teams", "t 1", "hosted-meets", "m/1", "heats"],
        )
        .unwrap();
        assert_eq!(
            url.as_str(),
            "https://api.lane4hq.com/v1/teams/t%201/hosted-meets/m%2F1/heats"
        );
        let prefixed = api_url("https://lane4hq.com/api/", &["health"]).unwrap();
        assert_eq!(prefixed.as_str(), "https://lane4hq.com/api/health");
    }

    #[test]
    fn reads_device_token_errors() {
        let pending = poll_outcome(400, r#"{"error":"authorization_pending"}"#).unwrap();
        assert!(matches!(pending, Some(SignInPoll::Pending)));
        let slow = poll_outcome(400, r#"{"error":"slow_down"}"#).unwrap();
        assert!(matches!(slow, Some(SignInPoll::SlowDown)));
        let denied = poll_outcome(400, r#"{"error":"access_denied"}"#).unwrap();
        assert!(matches!(denied, Some(SignInPoll::Denied)));
        let expired = poll_outcome(400, r#"{"error":"expired_token"}"#).unwrap();
        assert!(matches!(expired, Some(SignInPoll::Expired)));
        assert!(poll_outcome(200, "{}").unwrap().is_none());
        let other = poll_outcome(
            400,
            r#"{"error":"invalid_grant","error_description":"Invalid client ID"}"#,
        );
        assert_eq!(other.err().unwrap().to_string(), "Invalid client ID");
    }

    #[test]
    fn prefers_the_api_error_message() {
        let e = server_error(
            403,
            r#"{"error":{"code":"forbidden","message":"Not a coach"}}"#,
        );
        assert_eq!(e.to_string(), "Not a coach");
        assert_eq!(
            server_error(502, "bad gateway").to_string(),
            "Lane4 answered HTTP 502."
        );
    }

    #[test]
    fn errors_always_carry_a_message() {
        let v = serde_json::to_value(PublishError::NotSignedIn).unwrap();
        assert_eq!(
            v,
            json!({ "kind": "notSignedIn", "message": "Sign in to Lane4 first." })
        );
        let offline = serde_json::to_value(PublishError::Offline("dns".into())).unwrap();
        assert_eq!(offline["kind"], "offline");
    }

    #[test]
    fn keychain_failure_asks_the_operator_to_sign_in_again() {
        let settings = PublishSettings {
            api_url: API_URL.into(),
            team_id: "team-1".into(),
            team_name: "Dolphins".into(),
            enabled: true,
            account: Some(Account {
                name: "Coach".into(),
                email: "coach@example.com".into(),
            }),
        };
        let failed = settings_view(
            &settings,
            Err(PublishError::Keychain("user interaction required".into())),
        );
        assert!(failed.account.is_none());
        assert_eq!(
            failed.keychain_error.as_deref(),
            Some(KEYCHAIN_SIGN_IN_AGAIN)
        );
        assert_eq!(failed.team_name, "Dolphins");

        let signed_out = settings_view(&settings, Ok(None));
        assert!(signed_out.account.is_none());
        assert!(signed_out.keychain_error.is_none());

        let signed_in = settings_view(&settings, Ok(Some("token".into())));
        assert_eq!(signed_in.account.unwrap().email, "coach@example.com");
        assert!(signed_in.keychain_error.is_none());

        let other_error = settings_view(&settings, Err(PublishError::NotSignedIn));
        assert!(other_error.account.is_none());
        assert!(other_error.keychain_error.is_none());
        assert_eq!(other_error.team_id, "team-1");

        let other_server = PublishSettings {
            api_url: "https://staging.lane4hq.com".into(),
            ..settings
        };
        let ignored = settings_view(
            &other_server,
            Err(PublishError::Keychain("should not be read".into())),
        );
        assert!(ignored.account.is_none());
        assert!(ignored.keychain_error.is_none());
        assert!(ignored.team_id.is_empty());
    }

    #[test]
    fn old_settings_files_still_load() {
        let old: PublishSettings =
            serde_json::from_str(r#"{"endpoint":"https://x/api","enabled":true}"#).unwrap();
        assert!(old.enabled);
        assert!(old.api_url.is_empty());
    }
}
