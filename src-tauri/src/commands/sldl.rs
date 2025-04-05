use crate::downloads::{Download, DownloadManagerState, DownloadStatus, emit_download_event};
use crate::settings::{self, SettingsState};
use std::collections::HashMap;
use tauri::{AppHandle, Manager, Emitter, State};
use tauri_plugin_shell::{ShellExt, process::CommandEvent};
use regex::Regex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

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
    // Check if this is a Spotify playlist
    let is_playlist = query.contains("spotify:") || query.contains("spotify.com/playlist") || query == "spotify-likes";
    
    // Create a new download entry
    let download_title = title.clone().unwrap_or_else(|| {
        if is_playlist {
            // For playlists, use a better default title than the URL
            if query == "spotify-likes" {
                "Spotify Liked Songs".to_string()
            } else {
                "Spotify Playlist (Loading...)".to_string()
            }
        } else {
            query.clone()
        }
    });
    
    let download = Download::new(
        download_title,
        artist.clone(),
        album.clone(),
        query.clone(),
        is_playlist
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
    
    // Flag to track if we're processing a playlist
    let is_playlist_download = Arc::new(AtomicBool::new(false));
    let is_playlist_clone = is_playlist_download.clone();
    
    // Handle command output in a separate task
    tauri::async_runtime::spawn(async move {
        // Compile regex patterns for parsing progress
        let playlist_re = Regex::new(r"Downloading (\d+) tracks:").unwrap();
        let loading_playlist_re = Regex::new(r"Loading Spotify playlist").unwrap();
        let playlist_name_re = Regex::new(r"Playlist: (.+) by (.+)").unwrap();
        let searching_re = Regex::new(r"Searching: (.+)").unwrap();
        let initialize_re = Regex::new(r"Initialize:\s+(.+)\s+\[(\d+)s/(\d+)kbps/([0-9.]+)MB\]").unwrap();
        let progress_re = Regex::new(r"InProgress:\s+(.+)\s+\[(\d+)s/(\d+)kbps/([0-9.]+)MB\]").unwrap();
        let success_re = Regex::new(r"Succeeded:\s+(.+)\s+\[(\d+)s/(\d+)kbps/([0-9.]+)MB\]").unwrap();
        let completed_re = Regex::new(r"Completed: (\d+) succeeded, (\d+) failed").unwrap();
        let not_found_re = Regex::new(r"Not found: (.+)").unwrap();
        
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let line_str = String::from_utf8_lossy(&line).to_string();
                    println!("sldl stdout: {}", line_str);
                    
                    // Add to download's console logs
                    if let Ok(mut download_manager) = download_manager_state.lock() {
                        if let Some(download) = download_manager.get_download_mut(&download_id_clone) {
                            download.add_console_log(line_str.clone());
                        }
                    }
                    
                    // Emit stdout event to the frontend
                    let _ = app_handle_clone.emit("sldl:stdout", line_str.clone());
                    
                    // Check if this is a playlist download
                    if let Some(caps) = playlist_re.captures(&line_str) {
                        if let Some(count_match) = caps.get(1) {
                            if let Ok(track_count) = count_match.as_str().parse::<usize>() {
                                is_playlist_clone.store(true, Ordering::SeqCst);
                                
                                // Update download with playlist info
                                if let Ok(mut download_manager) = download_manager_state.lock() {
                                    if let Some(download) = download_manager.get_download_mut(&download_id_clone) {
                                        download.set_playlist_info(track_count);
                                        
                                        // Emit progress event
                                        let download_clone = download.clone();
                                        emit_download_event(&app_handle_clone, "download:progress", &download_clone);
                                    }
                                }
                            }
                        }
                    }
                    
                    // Check for loading playlist message
                    else if loading_playlist_re.is_match(&line_str) {
                        if let Ok(mut download_manager) = download_manager_state.lock() {
                            if let Some(download) = download_manager.get_download_mut(&download_id_clone) {
                                download.update_status(DownloadStatus::Searching);
                                
                                // Emit progress event
                                let download_clone = download.clone();
                                emit_download_event(&app_handle_clone, "download:progress", &download_clone);
                            }
                        }
                    }
                    
                    // Check for playlist name
                    else if let Some(caps) = playlist_name_re.captures(&line_str) {
                        if let (Some(playlist_name), Some(creator)) = (caps.get(1), caps.get(2)) {
                            if let Ok(mut download_manager) = download_manager_state.lock() {
                                if let Some(download) = download_manager.get_download_mut(&download_id_clone) {
                                    // Update the download title with the actual playlist name
                                    download.title = format!("{} by {}", playlist_name.as_str(), creator.as_str());
                                    
                                    // Emit progress event
                                    let download_clone = download.clone();
                                    emit_download_event(&app_handle_clone, "download:progress", &download_clone);
                                }
                            }
                        }
                    }
                    
                    // Check for searching status
                    else if let Some(caps) = searching_re.captures(&line_str) {
                        if let Ok(mut download_manager) = download_manager_state.lock() {
                            if let Some(download) = download_manager.get_download_mut(&download_id_clone) {
                                download.update_status(DownloadStatus::Searching);
                                
                                // If this is a single track download, update the title with the actual track name
                                if !download.is_playlist {
                                    if let Some(track_name) = caps.get(1) {
                                        download.title = track_name.as_str().to_string();
                                    }
                                }
                                
                                // Emit progress event
                                let download_clone = download.clone();
                                emit_download_event(&app_handle_clone, "download:progress", &download_clone);
                            }
                        }
                    }
                    
                    // Check for initialize status
                    else if initialize_re.is_match(&line_str) {
                        // Update status to InProgress
                        if let Ok(mut download_manager) = download_manager_state.lock() {
                            if let Some(download) = download_manager.get_download_mut(&download_id_clone) {
                                download.update_status(DownloadStatus::InProgress);
                                
                                // Only set progress to 0 for single downloads
                                // For playlists, we track progress by completed/total
                                if !download.is_playlist {
                                    download.update_progress(0.0);
                                }
                                
                                // Emit progress event
                                let download_clone = download.clone();
                                emit_download_event(&app_handle_clone, "download:progress", &download_clone);
                            }
                        }
                    }
                    
                    // Check for in progress status
                    else if let Some(caps) = progress_re.captures(&line_str) {
                        // Extract file path and update progress
                        if let Ok(mut download_manager) = download_manager_state.lock() {
                            if let Some(download) = download_manager.get_download_mut(&download_id_clone) {
                                // For single downloads, set progress to 0.5 (50%)
                                if !download.is_playlist {
                                    download.update_progress(0.5);
                                }
                                
                                // Extract file path if available
                                if let Some(file_path) = caps.get(1) {
                                    download.set_file_path(file_path.as_str().to_string());
                                }
                                
                                // Emit progress event
                                let download_clone = download.clone();
                                emit_download_event(&app_handle_clone, "download:progress", &download_clone);
                            }
                        }
                    }
                    
                    // Check for not found status
                    else if not_found_re.is_match(&line_str) {
                        if let Ok(mut download_manager) = download_manager_state.lock() {
                            if let Some(download) = download_manager.get_download_mut(&download_id_clone) {
                                // For playlists, increment failed tracks
                                if download.is_playlist {
                                    download.increment_failed_tracks();
                                    
                                    // Emit progress event
                                    let download_clone = download.clone();
                                    emit_download_event(&app_handle_clone, "download:progress", &download_clone);
                                }
                            }
                        }
                    }
                    
                    // Check for success status
                    else if let Some(caps) = success_re.captures(&line_str) {
                        if let Ok(mut download_manager) = download_manager_state.lock() {
                            if let Some(download) = download_manager.get_download_mut(&download_id_clone) {
                                // For playlists, increment completed tracks
                                if download.is_playlist {
                                    download.increment_completed_tracks();

                                    // Fallback: if playlist has only 1 track, mark as completed immediately
                                    if let (Some(total), Some(completed), Some(failed)) = (
                                        download.total_tracks,
                                        download.completed_tracks,
                                        download.failed_tracks
                                    ) {
                                        if total == 1 && completed + failed >= 1 {
                                            download.update_status(DownloadStatus::Completed);
                                            download.update_progress(1.0);
                                            let download_clone = download.clone();
                                            emit_download_event(&app_handle_clone, "download:completed", &download_clone);
                                            continue;
                                        }
                                    }

                                    // Otherwise, emit progress event
                                    let download_clone = download.clone();
                                    emit_download_event(&app_handle_clone, "download:progress", &download_clone);
                                } else {
                                    // For single downloads, mark as completed
                                    download.update_status(DownloadStatus::Completed);
                                    download.update_progress(1.0);

                                    // Extract file path if available
                                    if let Some(file_path) = caps.get(1) {
                                        download.set_file_path(file_path.as_str().to_string());
                                    }

                                    let download_clone = download.clone();
                                    emit_download_event(&app_handle_clone, "download:completed", &download_clone);
                                }
                            }
                        }
                    }
                    
                    // Check for playlist completion
                    else if let Some(caps) = completed_re.captures(&line_str) {
                        if let (Some(succeeded), Some(failed)) = (caps.get(1), caps.get(2)) {
                            if let (Ok(succeeded_count), Ok(failed_count)) = (
                                succeeded.as_str().parse::<usize>(),
                                failed.as_str().parse::<usize>()
                            ) {
                                if let Ok(mut download_manager) = download_manager_state.lock() {
                                    if let Some(download) = download_manager.get_download_mut(&download_id_clone) {
                                        // Update final counts
                                        download.completed_tracks = Some(succeeded_count);
                                        download.failed_tracks = Some(failed_count);
                                        
                                        // Mark as completed
                                        download.update_status(DownloadStatus::Completed);
                                        download.update_progress(1.0);
                                        
                                        // Emit completed event
                                        let download_clone = download.clone();
                                        emit_download_event(&app_handle_clone, "download:completed", &download_clone);
                                    }
                                }
                            }
                        }
                    }
                },
                CommandEvent::Stderr(line) => {
                    let line_str = String::from_utf8_lossy(&line).to_string();
                    eprintln!("sldl stderr: {}", line_str);
                    
                    // Add to download's console logs
                    if let Ok(mut download_manager) = download_manager_state.lock() {
                        if let Some(download) = download_manager.get_download_mut(&download_id_clone) {
                            download.add_console_log(format!("ERROR: {}", line_str.clone()));
                        }
                    }
                    
                    // Emit stderr event to the frontend
                    let _ = app_handle_clone.emit("sldl:stderr", line_str);
                },
                CommandEvent::Terminated(status) => {
                    println!("sldl terminated with status: {:?}", status);
                    
                    // Emit terminated event to the frontend
                    let is_success = status.code.map_or(false, |code| code == 0);
                    let _ = app_handle_clone.emit("sldl:terminated", is_success);
                    
                    // Cleanup unwanted playlist metadata files
                    let download_path = {
                        let settings_state = app_handle_clone.state::<SettingsState>();
                        if let Ok(settings) = settings::store::get_settings(settings_state) {
                            settings.soulseek.downloads_path.clone()
                        } else {
                            String::new()
                        }
                    };
                    if !download_path.is_empty() {
                        tauri::async_runtime::spawn(async move {
                            use std::path::Path;
                            use tokio::fs;
                            use tokio_stream::wrappers::ReadDirStream;
                            use tokio_stream::StreamExt;

                            fn clean_dir<'a>(path: &'a Path) -> std::pin::Pin<Box<dyn std::future::Future<Output=std::io::Result<()>> + Send + 'a>> {
                                fn inner<'a>(path: &'a Path) -> std::pin::Pin<Box<dyn std::future::Future<Output=std::io::Result<()>> + Send + 'a>> {
                                    Box::pin(async move {
                                        let mut entries = fs::read_dir(path).await.map(ReadDirStream::new)?;
                                        while let Some(Ok(entry)) = entries.next().await {
                                            let entry_path = entry.path();
                                            if entry_path.is_dir() {
                                                inner(&entry_path).await?;
                                                if let Ok(mut dir_stream) = fs::read_dir(&entry_path).await {
                                                    if matches!(dir_stream.next_entry().await, Ok(None)) {
                                                        let _ = fs::remove_dir(&entry_path).await;
                                                    }
                                                }
                                            } else if let Some(name) = entry_path.file_name().and_then(|n| n.to_str()) {
                                                if name == "_index.sldl" {
                                                    let _ = fs::remove_file(&entry_path).await;
                                                }
                                            }
                                        }
                                        Ok(())
                                    })
                                }
                                inner(path)
                            }

                            let _ = clean_dir(Path::new(&download_path)).await;
                        });
                    }

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
                    } else {
                        // If command succeeded but we didn't get a completion message
                        if let Ok(mut download_manager) = download_manager_state.lock() {
                            if let Some(download) = download_manager.get_download_mut(&download_id_clone) {
                                if download.status != DownloadStatus::Completed {
                                    download.update_status(DownloadStatus::Completed);
                                    download.update_progress(1.0);
                                    
                                    // Emit completed event
                                    let download_clone = download.clone();
                                    emit_download_event(&app_handle_clone, "download:completed", &download_clone);
                                }
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
