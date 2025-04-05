use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::AppHandle;

// Define the settings structure
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SoulseekSettings {
    pub username: String,
    pub downloads_path: String,
    pub remove_special_chars: bool,
    pub preferred_format: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SpotifySettings {
    pub client_id: String,
    pub redirect_uri: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OutputSettings {
    pub m3u_path: String,
    pub name_format: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub soulseek: SoulseekSettings,
    pub spotify: SpotifySettings,
    pub output: OutputSettings,
}

// Default settings
impl Default for SoulseekSettings {
    fn default() -> Self {
        Self {
            username: String::new(),
            downloads_path: String::new(),
            remove_special_chars: true,
            preferred_format: "flac".to_string(),
        }
    }
}

impl Default for SpotifySettings {
    fn default() -> Self {
        Self {
            client_id: String::new(),
            redirect_uri: "http://localhost:9871/callback".to_string(),
        }
    }
}

impl Default for OutputSettings {
    fn default() -> Self {
        Self {
            m3u_path: "playlists/".to_string(),
            name_format: "{albumartist|artist}/{album} ({year})/{track}. {title}".to_string(),
        }
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            soulseek: SoulseekSettings::default(),
            spotify: SpotifySettings::default(),
            output: OutputSettings::default(),
        }
    }
}

// Sensitive credentials that will be encrypted and stored
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Credentials {
    pub soulseek_password: Option<String>,
    pub spotify_client_secret: Option<String>,
}

// State to hold the app handle for accessing the store
pub struct SettingsState(pub Mutex<Option<AppHandle>>);

// Initialize the settings state
pub fn init_settings_state() -> SettingsState {
    SettingsState(Mutex::new(None))
}

// Module exports
pub mod store;
pub mod crypto;
