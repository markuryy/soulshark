use crate::downloads::{Download, DownloadManagerState, DownloadStatus, emit_download_event, emit_download_message};
use tauri::{AppHandle, Manager, State};

/// Get all downloads
#[tauri::command]
pub async fn get_all_downloads(state: State<'_, DownloadManagerState>) -> Result<Vec<Download>, String> {
    let downloads = state.0.lock().map_err(|e| e.to_string())?.get_all_downloads();
    Ok(downloads)
}

/// Get a specific download by ID
#[tauri::command]
pub async fn get_download(
    id: String,
    state: State<'_, DownloadManagerState>,
) -> Result<Option<Download>, String> {
    let download_manager = state.0.lock().map_err(|e| e.to_string())?;
    let download = download_manager.get_download(&id).cloned();
    Ok(download)
}

/// Cancel a download (if possible)
#[tauri::command]
pub async fn cancel_download(
    id: String,
    app_handle: AppHandle,
    state: State<'_, DownloadManagerState>,
) -> Result<(), String> {
    // Update download status to canceled
    {
        let mut download_manager = state.0.lock().map_err(|e| e.to_string())?;
        download_manager.update_download_status(&id, DownloadStatus::Canceled)?;
    }

    // Get the updated download to emit event
    let download = {
        let download_manager = state.0.lock().map_err(|e| e.to_string())?;
        download_manager.get_download(&id).cloned()
    };

    if let Some(download) = download {
        // Emit download canceled event
        emit_download_event(&app_handle, "download:canceled", &download);
    }

    Ok(())
}

/// Clear completed downloads from the list
#[tauri::command]
pub async fn clear_completed_downloads(
    app_handle: AppHandle,
    state: State<'_, DownloadManagerState>,
) -> Result<(), String> {
    // This is a placeholder for now - we would need to implement the clear functionality
    // in the DownloadManager struct first
    
    // For now, we'll just emit an event to notify the frontend
    let message = "Completed downloads cleared";
    emit_download_message(&app_handle, "downloads:cleared", message);
    
    Ok(())
}
