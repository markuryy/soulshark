use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

// Download status enum
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DownloadStatus {
    Queued,
    Searching,
    InProgress,
    Completed,
    Failed(String),
    Canceled,
}

// Download struct to track individual downloads
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Download {
    pub id: String,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub query: String,
    pub started_at: i64,
    pub status: DownloadStatus,
    pub progress: Option<f32>,
    pub file_path: Option<String>,
    pub is_playlist: bool,
    pub total_tracks: Option<usize>,
    pub completed_tracks: Option<usize>,
    pub failed_tracks: Option<usize>,
    pub console_logs: Vec<String>,
}

impl Download {
    pub fn new(title: String, artist: Option<String>, album: Option<String>, query: String, is_playlist: bool) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            title,
            artist,
            album,
            query,
            started_at: chrono::Utc::now().timestamp(),
            status: DownloadStatus::Queued,
            progress: None,
            file_path: None,
            is_playlist,
            total_tracks: None,
            completed_tracks: None,
            failed_tracks: None,
            console_logs: Vec::new(),
        }
    }

    pub fn update_status(&mut self, status: DownloadStatus) {
        self.status = status;
    }

    pub fn update_progress(&mut self, progress: f32) {
        self.progress = Some(progress);
    }

    pub fn set_file_path(&mut self, path: String) {
        self.file_path = Some(path);
    }
    
    pub fn add_console_log(&mut self, log: String) {
        self.console_logs.push(log);
        // Keep only the last 100 logs to prevent excessive memory usage
        if self.console_logs.len() > 100 {
            self.console_logs.remove(0);
        }
    }
    
    pub fn set_playlist_info(&mut self, total: usize) {
        self.total_tracks = Some(total);
        self.completed_tracks = Some(0);
        self.failed_tracks = Some(0);
    }
    
    pub fn increment_completed_tracks(&mut self) {
        if let Some(completed) = self.completed_tracks {
            self.completed_tracks = Some(completed + 1);
            self.update_playlist_progress();
        }
    }
    
    pub fn increment_failed_tracks(&mut self) {
        if let Some(failed) = self.failed_tracks {
            self.failed_tracks = Some(failed + 1);
            self.update_playlist_progress();
        }
    }
    
    fn update_playlist_progress(&mut self) {
        if let (Some(completed), Some(failed), Some(total)) = (self.completed_tracks, self.failed_tracks, self.total_tracks) {
            if total > 0 {
                let progress = (completed + failed) as f32 / total as f32;
                self.update_progress(progress);
            }
        }
    }
}

// Download manager to track all downloads
#[derive(Debug, Default)]
pub struct DownloadManager {
    downloads: HashMap<String, Download>,
}

impl DownloadManager {
    pub fn new() -> Self {
        Self {
            downloads: HashMap::new(),
        }
    }

    pub fn add_download(&mut self, download: Download) -> String {
        let id = download.id.clone();
        self.downloads.insert(id.clone(), download);
        id
    }

    pub fn get_download(&self, id: &str) -> Option<&Download> {
        self.downloads.get(id)
    }

    pub fn get_download_mut(&mut self, id: &str) -> Option<&mut Download> {
        self.downloads.get_mut(id)
    }

    pub fn get_all_downloads(&self) -> Vec<Download> {
        self.downloads.values().cloned().collect()
    }

    pub fn update_download_status(&mut self, id: &str, status: DownloadStatus) -> Result<(), String> {
        match self.downloads.get_mut(id) {
            Some(download) => {
                download.update_status(status);
                Ok(())
            }
            None => Err(format!("Download with id {} not found", id)),
        }
    }

    pub fn update_download_progress(&mut self, id: &str, progress: f32) -> Result<(), String> {
        match self.downloads.get_mut(id) {
            Some(download) => {
                download.update_progress(progress);
                Ok(())
            }
            None => Err(format!("Download with id {} not found", id)),
        }
    }
    
    pub fn remove_download(&mut self, id: &str) -> Option<Download> {
        self.downloads.remove(id)
    }
    
    pub fn clear_completed_downloads(&mut self) -> usize {
        let completed_ids: Vec<String> = self.downloads
            .iter()
            .filter(|(_, download)| {
                matches!(download.status, 
                    DownloadStatus::Completed | 
                    DownloadStatus::Canceled | 
                    DownloadStatus::Failed(_)
                )
            })
            .map(|(id, _)| id.clone())
            .collect();
        
        let count = completed_ids.len();
        
        for id in completed_ids {
            self.downloads.remove(&id);
        }
        
        count
    }
}

// Tauri state wrapper for the download manager
pub struct DownloadManagerState(pub Arc<Mutex<DownloadManager>>);

impl DownloadManagerState {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(DownloadManager::new())))
    }
}

// Initialize the download manager state
pub fn init_download_manager() -> DownloadManagerState {
    DownloadManagerState::new()
}

// Helper function to emit download events
pub fn emit_download_event(app_handle: &AppHandle, event: &str, payload: &Download) {
    use tauri::Emitter;
    
    if let Err(e) = app_handle.emit(event, payload) {
        eprintln!("Failed to emit event {}: {}", event, e);
    }
}

// Helper function to emit download events for string messages
pub fn emit_download_message(app_handle: &AppHandle, event: &str, message: &str) {
    use tauri::Emitter;
    
    if let Err(e) = app_handle.emit(event, message) {
        eprintln!("Failed to emit event {}: {}", event, e);
    }
}
