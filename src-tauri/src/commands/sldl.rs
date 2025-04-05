use crate::settings::{self, SettingsState};
use std::collections::HashMap;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;

#[tauri::command]
pub async fn execute_sldl(
    app_handle: AppHandle,
    query: String,
    options: HashMap<String, String>,
) -> Result<(), String> {
    // Get credentials
    let credentials = settings::store::get_credentials(&app_handle).await?;

    // Get settings
    let state = app_handle.state::<SettingsState>();
    let settings = settings::store::get_settings(state)?;

    // Build sldl command
    let mut command = app_handle
        .shell()
        .sidecar("sldl-aarch64-apple-darwin")
        .map_err(|e| format!("Failed to create sidecar command: {}", e))?;

    // Build the command with all arguments
    let mut args = Vec::new();

    // Add the query
    args.push(query.clone());

    // Add Soulseek credentials
    if !settings.soulseek.username.is_empty() {
        args.push("--user".to_string());
        args.push(settings.soulseek.username.clone());
    }

    if let Some(password) = &credentials.soulseek_password {
        if !password.is_empty() {
            args.push("--pass".to_string());
            args.push(password.clone());
        }
    }

    // Add Spotify credentials if the query is a Spotify URL or "spotify-likes"
    if query.contains("spotify") {
        if !settings.spotify.client_id.is_empty() {
            args.push("--spotify-id".to_string());
            args.push(settings.spotify.client_id.clone());
        }

        if let Some(client_secret) = &credentials.spotify_client_secret {
            if !client_secret.is_empty() {
                args.push("--spotify-secret".to_string());
                args.push(client_secret.clone());
            }
        }

        if let Some(access_token) = &credentials.spotify_access_token {
            if !access_token.is_empty() {
                args.push("--spotify-token".to_string());
                args.push(access_token.clone());
            }
        }

        if let Some(refresh_token) = &credentials.spotify_refresh_token {
            if !refresh_token.is_empty() {
                args.push("--spotify-refresh".to_string());
                args.push(refresh_token.clone());
            }
        }
    }

    // Add download path
    if !settings.soulseek.downloads_path.is_empty() {
        args.push("--path".to_string());
        args.push(settings.soulseek.downloads_path.clone());
    }

    // Add preferred format
    if !settings.soulseek.preferred_format.is_empty() {
        args.push("--pref-format".to_string());
        args.push(settings.soulseek.preferred_format.clone());
    }

    // Add any additional options
    for (key, value) in options {
        args.push(format!("--{}", key));
        args.push(value);
    }

    // Add all arguments to the command
    command = command.args(args);

    // Execute the command
    let (mut rx, _child) = command
        .spawn()
        .map_err(|e| format!("Failed to spawn sldl command: {}", e))?;

    // Handle command output in a separate task
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    println!("sldl stdout: {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    eprintln!("sldl stderr: {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Terminated(status) => {
                    println!("sldl terminated with status: {:?}", status);
                }
                _ => {}
            }
        }
    });

    Ok(())
}
