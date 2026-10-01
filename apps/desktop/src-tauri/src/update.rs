//! App updates: Tauri's updater, pointed at the Lane4 API's `/v1/desktop/update`.
//! The API serves the newest signed `desktop-v*` GitHub release.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::publish::{api_url, API_URL};

/// Only builds with `plugins.updater.pubkey` in their config update; the
/// release workflow passes the key with `--config`. Without it the updater
/// plugin isn't loaded, so dev and CI builds never replace themselves.
pub fn enabled(config: &tauri::Config) -> bool {
    config
        .plugins
        .0
        .get("updater")
        .and_then(|updater| updater.get("pubkey"))
        .and_then(|key| key.as_str())
        .is_some_and(|key| !key.trim().is_empty())
}

pub struct UpdateState {
    enabled: bool,
    found: Mutex<Option<Update>>,
}

impl UpdateState {
    pub fn new(enabled: bool) -> Self {
        Self {
            enabled,
            found: Mutex::new(None),
        }
    }
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AvailableUpdate {
    version: String,
    current_version: String,
    notes: Option<String>,
}

fn message(error: impl std::fmt::Display) -> String {
    format!("Couldn't update Lane4: {error}")
}

/// `None` when this build is current, or doesn't update at all.
#[tauri::command]
pub async fn app_update_check(
    app: AppHandle,
    state: State<'_, UpdateState>,
) -> Result<Option<AvailableUpdate>, String> {
    if !state.enabled {
        return Ok(None);
    }
    let endpoint = api_url(API_URL, &["v1", "desktop", "update"]).map_err(message)?;
    let update = app
        .updater_builder()
        .endpoints(vec![endpoint])
        .map_err(message)?
        .build()
        .map_err(message)?
        .check()
        .await
        .map_err(message)?;
    let available = update.as_ref().map(|update| AvailableUpdate {
        version: update.version.clone(),
        current_version: update.current_version.clone(),
        notes: update.body.clone().filter(|notes| !notes.trim().is_empty()),
    });
    *state.found.lock().map_err(message)? = update;
    Ok(available)
}

/// Downloads the update `app_update_check` found, verifies its signature,
/// installs it, and restarts. On Windows the installer closes the app itself.
#[tauri::command]
pub async fn app_update_install(
    app: AppHandle,
    state: State<'_, UpdateState>,
) -> Result<(), String> {
    let update = state
        .found
        .lock()
        .map_err(message)?
        .take()
        .ok_or_else(|| "Check for updates first.".to_string())?;
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(message)?;
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn config(plugins: serde_json::Value) -> tauri::Config {
        tauri::Config {
            plugins: serde_json::from_value(plugins).unwrap(),
            ..Default::default()
        }
    }

    #[test]
    fn updates_need_a_public_key_in_the_build() {
        assert!(!enabled(&config(json!({}))));
        assert!(!enabled(&config(json!({ "updater": { "pubkey": " " } }))));
        assert!(enabled(&config(
            json!({ "updater": { "pubkey": "dW50cnVzdGVk" } })
        )));
    }
}
