// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::Manager;

// Import modules
mod commands;
mod downloads;
mod settings;

// Re-export types for use in commands
pub use downloads::{Download, DownloadManagerState, DownloadStatus};
pub use settings::{AppSettings, Credentials, SettingsState};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            // Initialize settings state
            let settings_state = settings::init_settings_state();
            app.manage(settings_state);

            // Initialize download manager state
            let download_manager_state = downloads::init_download_manager();
            app.manage(download_manager_state);

            // Initialize settings store
            if let Err(e) = settings::store::init_settings_store(&app.handle()) {
                eprintln!("Failed to initialize settings store: {}", e);
            }

            // Ensure app data directory exists for encryption key
            let app_data_dir = app.handle().path().app_data_dir().unwrap();
            std::fs::create_dir_all(&app_data_dir).unwrap();

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::settings::get_credentials,
            commands::settings::save_credentials,
            commands::sldl::execute_sldl,
            commands::spotify::exchange_spotify_code,
            commands::spotify::refresh_spotify_token,
            commands::spotify::check_pending_auth,
            commands::spotify::start_spotify_callback_server,
            commands::spotify::stop_spotify_callback_server,
            commands::downloads::get_all_downloads,
            commands::downloads::get_download,
            commands::downloads::cancel_download,
            commands::downloads::clear_completed_downloads
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
