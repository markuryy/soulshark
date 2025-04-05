use crate::settings::{AppSettings, Credentials, SettingsState};
use crate::settings::crypto;
use serde_json::json;
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_store::StoreExt;

const SETTINGS_FILE: &str = "settings.json";
const SETTINGS_KEY: &str = "app_settings";

// Initialize the settings store
pub fn init_settings_store(app_handle: &AppHandle) -> Result<(), String> {
    // Update the settings state with the app handle
    if let Some(state) = app_handle.try_state::<SettingsState>() {
        let mut state = state.0.lock().unwrap();
        *state = Some(app_handle.clone());
    }

    // Create or load the settings store
    let store = app_handle
        .store(SETTINGS_FILE)
        .map_err(|e| format!("Failed to create settings store: {}", e))?;

    // Initialize with default settings if not already set
    let has_settings = store.has(SETTINGS_KEY);
    
    if !has_settings {
        println!("No settings found, initializing with defaults");
        let default_settings = AppSettings::default();
        
        // Set the default settings
        store.set(SETTINGS_KEY, json!(default_settings));
        
        // Save the store to persist the default settings
        store.save()
            .map_err(|e| format!("Failed to save default settings: {}", e))?;
        
        println!("Initialized store with default settings");
    } else {
        println!("Store already has settings");
    }

    Ok(())
}

// Constants for encrypted credentials
const CREDENTIALS_KEY: &str = "encrypted_credentials";

// Save credentials to the store with encryption
pub async fn save_credentials<R: Runtime>(
    app_handle: &AppHandle<R>,
    credentials: Credentials,
) -> Result<(), String> {
    // Get app data dir
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .to_string_lossy()
        .to_string();
    
    // Get or generate encryption key
    let key = crypto::get_encryption_key(&app_data_dir)?;
    
    // Serialize credentials
    let creds_json = serde_json::to_string(&credentials)
        .map_err(|e| format!("Failed to serialize credentials: {}", e))?;
    
    // Encrypt credentials
    let encrypted = crypto::encrypt(&key, &creds_json)?;
    
    // Store encrypted credentials
    let store = app_handle
        .store(SETTINGS_FILE)
        .map_err(|e| format!("Failed to access settings store: {}", e))?;
    
    store.set(CREDENTIALS_KEY, json!(encrypted));
    store.save()
        .map_err(|e| format!("Failed to save credentials: {}", e))?;
    
    println!("Credentials saved successfully");
    Ok(())
}

// Get credentials from the store and decrypt
pub async fn get_credentials<R: Runtime>(
    app_handle: &AppHandle<R>,
) -> Result<Credentials, String> {
    // Get app data dir
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .to_string_lossy()
        .to_string();
    
    // Get encryption key
    let key = match crypto::get_encryption_key(&app_data_dir) {
        Ok(key) => key,
        Err(e) => {
            println!("Warning: Could not get encryption key: {}", e);
            // If we can't get a key, return empty credentials
            return Ok(Credentials {
                soulseek_password: None,
                spotify_client_secret: None,
            });
        }
    };
    
    // Get store
    let store = app_handle
        .store(SETTINGS_FILE)
        .map_err(|e| format!("Failed to access settings store: {}", e))?;
    
    // Get encrypted credentials
    let encrypted = match store.get(CREDENTIALS_KEY) {
        Some(value) => {
            // Convert from JSON value to String
            serde_json::from_value::<String>(value)
                .map_err(|e| format!("Failed to deserialize encrypted data: {}", e))?
        },
        None => {
            println!("No credentials found in store");
            // No credentials stored yet
            return Ok(Credentials {
                soulseek_password: None,
                spotify_client_secret: None,
            });
        }
    };
    
    // Decrypt credentials
    let decrypted = match crypto::decrypt(&key, &encrypted) {
        Ok(data) => data,
        Err(e) => {
            println!("Warning: Failed to decrypt credentials: {}", e);
            // If decryption fails, return empty credentials
            return Ok(Credentials {
                soulseek_password: None,
                spotify_client_secret: None,
            });
        }
    };
    
    // Deserialize credentials
    let credentials = serde_json::from_str::<Credentials>(&decrypted)
        .map_err(|e| format!("Failed to deserialize credentials: {}", e))?;
    
    Ok(credentials)
}

// Get the current settings
pub fn get_settings(state: State<SettingsState>) -> Result<AppSettings, String> {
    let state = state.0.lock().unwrap();
    let app_handle = state
        .as_ref()
        .ok_or_else(|| "App handle not initialized".to_string())?;

    let store = app_handle
        .store(SETTINGS_FILE)
        .map_err(|e| format!("Failed to access settings store: {}", e))?;

    // Get the settings from the store
    let settings = store.get(SETTINGS_KEY);
    
    if settings.is_none() {
        return Err("Settings not found".to_string());
    }
    
    let settings = settings.unwrap();

    serde_json::from_value::<AppSettings>(settings)
        .map_err(|e| format!("Failed to deserialize settings: {}", e))
}

// Save the settings
pub fn save_settings(
    state: State<SettingsState>,
    settings: AppSettings,
) -> Result<(), String> {
    let state = state.0.lock().unwrap();
    let app_handle = state
        .as_ref()
        .ok_or_else(|| "App handle not initialized".to_string())?;

    let store = app_handle
        .store(SETTINGS_FILE)
        .map_err(|e| format!("Failed to access settings store: {}", e))?;

    // Set the settings in the store
    store.set(SETTINGS_KEY, json!(settings));

    // Save the store to persist the settings
    store.save()
        .map_err(|e| format!("Failed to persist settings: {}", e))?;
    
    Ok(())
}
