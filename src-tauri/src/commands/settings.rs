use crate::settings::{self, AppSettings, Credentials, SettingsState};
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn get_settings(state: State<'_, SettingsState>) -> Result<AppSettings, String> {
    settings::store::get_settings(state)
}

#[tauri::command]
pub async fn save_settings(
    state: State<'_, SettingsState>,
    settings: AppSettings,
) -> Result<(), String> {
    settings::store::save_settings(state, settings)
}

#[tauri::command]
pub async fn save_credentials(
    app_handle: AppHandle,
    credentials: Credentials,
) -> Result<(), String> {
    settings::store::save_credentials(&app_handle, credentials).await
}

#[tauri::command]
pub async fn get_credentials(app_handle: AppHandle) -> Result<Credentials, String> {
    settings::store::get_credentials(&app_handle).await
}
