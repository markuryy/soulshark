use crate::downloads::{Download, DownloadManagerState, DownloadStatus, emit_download_event};
use crate::settings::{self, SettingsState};
use std::collections::HashMap;
use tauri::{AppHandle, Manager, Emitter, State};
use serde::Serialize;
use tauri_plugin_shell::{ShellExt, process::CommandEvent};
use uuid::Uuid;
use regex::Regex;

#[tauri::command]
pub async fn execute_sldl(
    app_handle: AppHandle,
    state: State<'_, DownloadManagerState>,
    query: String,
    options: HashMap<String, String>,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
) -> Result<String, String> {
    // Create a new download entry
    let download_title = title.clone().unwrap_or_else(|| query.clone());
    let download = Download::new(
        download_title,
        artist.clone(),
        album.clone(),
        query.clone(),
        query.contains("spotify:") || query.contains("spotify.com/playlist") || query == "spotify-likes"
    );
    
    // Get the download ID
    let download_id = download.id.clone();
    
    // Add the download to the manager
    {
        let mut download_manager = state.0.lock().map_err(|e| e.to_string())?;
        download_manager.add_download(download.clone());
    }
    
    // Emit download started event
    emit_download_event(&app_handle, "download:started", &download);
    
    // Get credentials
    let credentials = settings::store::get_credentials(&app_handle).await?;

    // Get settings
    let settings_state = app_handle.state::<SettingsState>();
    let settings = settings::store::get_settings(settings_state)?;

    // Build sldl command
    let mut command = app_handle
        .shell()
        .sidecar("sldl")
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
    
    // Add name format
    if !settings.output.name_format.is_empty() {
        args.push("--name-format".to_string());
        args.push(settings.output.name_format.clone());
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
    
    // Clone what we need for the async task
    let app_handle_clone = app_handle.clone();
    let download_id_clone = download_id.clone();
    let download_manager_state = state.0.clone();
    
    // Handle command output in a separate task
    tauri::async_runtime::spawn(async move {
        // Compile regex patterns for parsing progress
        let initialize_re = Regex::new(r"Initialize:\s+(.+)\s+\[(\d+)s/(\d+)kbps/([0-9.]+)MB\]").unwrap();
        let progress_re = Regex::new(r"InProgress:\s+(.+)\s+\[(\d+)s/(\d+)kbps/([0-9.]+)MB\]").unwrap();
        let success_re = Regex::new(r"Succeeded:\s+(.+)\s+\[(\d+)s/(\d+)kbps/([0-9.]+)MB\]").unwrap();
        
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let line_str = String::from_utf8_lossy(&line).to_string();
                    println!("sldl stdout: {}", line_str);
                    
                    // Emit stdout event to the frontend
                    let _ = app_handle_clone.emit("sldl:stdout", line_str.clone());
                    
                    // Update download status based on output
                    if initialize_re.is_match(&line_str) {
                        // Update status to InProgress
                        if let Ok(mut download_manager) = download_manager_state.lock() {
                            if let Some(download) = download_manager.get_download_mut(&download_id_clone) {
                                download.update_status(DownloadStatus::InProgress);
                                download.update_progress(0.0);
                                
                                // Emit progress event
                                let download_clone = download.clone();
                                emit_download_event(&app_handle_clone, "download:progress", &download_clone);
                            }
                        }
                    } else if let Some(caps) = progress_re.captures(&line_str) {
                        // Extract file path and update progress (using a simple heuristic for now)
                        if let Ok(mut download_manager) = download_manager_state.lock() {
                            if let Some(download) = download_manager.get_download_mut(&download_id_clone) {
                                // Set progress to 0.5 (50%) as a simple approximation
                                download.update_progress(0.5);
                                
                                // Extract file path if available
                                if let Some(file_path) = caps.get(1) {
                                    download.set_file_path(file_path.as_str().to_string());
                                }
                                
                                // Emit progress event
                                let download_clone = download.clone();
                                emit_download_event(&app_handle_clone, "download:progress", &download_clone);
                            }
                        }
                    } else if let Some(caps) = success_re.captures(&line_str) {
                        // Update status to Completed
                        if let Ok(mut download_manager) = download_manager_state.lock() {
                            if let Some(download) = download_manager.get_download_mut(&download_id_clone) {
                                download.update_status(DownloadStatus::Completed);
                                download.update_progress(1.0);
                                
                                // Extract file path if available
                                if let Some(file_path) = caps.get(1) {
                                    download.set_file_path(file_path.as_str().to_string());
                                }
                                
                                // Emit completed event
                                let download_clone = download.clone();
                                emit_download_event(&app_handle_clone, "download:completed", &download_clone);
                            }
                        }
                    }
                },
                CommandEvent::Stderr(line) => {
                    let line_str = String::from_utf8_lossy(&line).to_string();
                    eprintln!("sldl stderr: {}", line_str);
                    
                    // Emit stderr event to the frontend
                    let _ = app_handle_clone.emit("sldl:stderr", line_str);
                },
                CommandEvent::Terminated(status) => {
                    println!("sldl terminated with status: {:?}", status);
                    
                    // Emit terminated event to the frontend
                    let is_success = status.code.map_or(false, |code| code == 0);
                    let _ = app_handle_clone.emit("sldl:terminated", is_success);
                    
                    // If the command failed, update the download status
                    if !is_success {
                        if let Ok(mut download_manager) = download_manager_state.lock() {
                            if let Some(download) = download_manager.get_download_mut(&download_id_clone) {
                                download.update_status(DownloadStatus::Failed("Command failed".to_string()));
                                
                                // Emit failed event
                                let download_clone = download.clone();
                                emit_download_event(&app_handle_clone, "download:failed", &download_clone);
                            }
                        }
                    }
                },
                _ => {}
            }
        }
    });

    Ok(download_id)
}
