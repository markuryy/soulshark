import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { X, RefreshCw, Download, CheckCircle, AlertCircle } from "lucide-react";

// Types
interface Download {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  query: string;
  started_at: number;
  status: "Queued" | "InProgress" | "Completed" | { Failed: string } | "Canceled";
  progress?: number;
  file_path?: string;
  is_playlist: boolean;
}

export default function DownloadsPage() {
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load downloads on mount
  useEffect(() => {
    loadDownloads();
    
    // Set up event listeners
    const unlisten1 = listen<Download>("download:started", (event) => {
      setDownloads(prev => [event.payload, ...prev]);
    });
    
    const unlisten2 = listen<Download>("download:progress", (event) => {
      setDownloads(prev => 
        prev.map(download => 
          download.id === event.payload.id ? event.payload : download
        )
      );
    });
    
    const unlisten3 = listen<Download>("download:completed", (event) => {
      setDownloads(prev => 
        prev.map(download => 
          download.id === event.payload.id ? event.payload : download
        )
      );
    });
    
    const unlisten4 = listen<Download>("download:failed", (event) => {
      setDownloads(prev => 
        prev.map(download => 
          download.id === event.payload.id ? event.payload : download
        )
      );
    });
    
    const unlisten5 = listen<Download>("download:canceled", (event) => {
      setDownloads(prev => 
        prev.map(download => 
          download.id === event.payload.id ? event.payload : download
        )
      );
    });
    
    // Clean up listeners on unmount
    return () => {
      unlisten1.then(fn => fn());
      unlisten2.then(fn => fn());
      unlisten3.then(fn => fn());
      unlisten4.then(fn => fn());
      unlisten5.then(fn => fn());
    };
  }, []);
  
  // Load downloads from backend
  const loadDownloads = async () => {
    setIsLoading(true);
    try {
      const result = await invoke<Download[]>("get_all_downloads");
      setDownloads(result);
    } catch (error) {
      console.error("Failed to load downloads:", error);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Cancel a download
  const cancelDownload = async (id: string) => {
    try {
      await invoke("cancel_download", { id });
    } catch (error) {
      console.error("Failed to cancel download:", error);
    }
  };
  
  // Clear completed downloads
  const clearCompletedDownloads = async () => {
    try {
      await invoke("clear_completed_downloads");
      // Refresh the list
      loadDownloads();
    } catch (error) {
      console.error("Failed to clear completed downloads:", error);
    }
  };
  
  // Format timestamp
  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };
  
  // Get status display
  const getStatusDisplay = (status: Download["status"]) => {
    if (status === "Queued") return "Queued";
    if (status === "InProgress") return "Downloading";
    if (status === "Completed") return "Completed";
    if (status === "Canceled") return "Canceled";
    if (typeof status === "object" && "Failed" in status) return `Failed: ${status.Failed}`;
    return "Unknown";
  };
  
  // Get status icon
  const getStatusIcon = (status: Download["status"]) => {
    if (status === "Queued") return <Download className="h-4 w-4 text-gray-400" />;
    if (status === "InProgress") return <RefreshCw className="h-4 w-4 text-blue-400 animate-spin" />;
    if (status === "Completed") return <CheckCircle className="h-4 w-4 text-green-400" />;
    if (status === "Canceled") return <X className="h-4 w-4 text-gray-400" />;
    if (typeof status === "object" && "Failed" in status) return <AlertCircle className="h-4 w-4 text-red-400" />;
    return null;
  };
  
  // Get active downloads
  const activeDownloads = downloads.filter(d => 
    d.status === "Queued" || d.status === "InProgress"
  );
  
  // Get completed downloads
  const completedDownloads = downloads.filter(d => 
    d.status === "Completed" || d.status === "Canceled" || typeof d.status === "object"
  );

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-6">Downloads</h1>
      
      {isLoading ? (
        <div className="flex justify-center py-8">
          <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Active Downloads */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Active Downloads</h2>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={loadDownloads}
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            
            {activeDownloads.length === 0 ? (
              <div className="bg-gray-800 rounded-lg p-6 text-center text-gray-400">
                No active downloads
              </div>
            ) : (
              <div className="space-y-4">
                {activeDownloads.map(download => (
                  <div key={download.id} className="bg-gray-800 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-medium">{download.title}</h3>
                        {download.artist && (
                          <p className="text-sm text-gray-400">
                            {download.artist} {download.album ? `- ${download.album}` : ''}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => cancelDownload(download.id)}
                        title="Cancel download"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <span className="flex items-center gap-1">
                        {getStatusIcon(download.status)}
                        {getStatusDisplay(download.status)}
                      </span>
                      <span>•</span>
                      <span>Started: {formatTimestamp(download.started_at)}</span>
                    </div>
                    
                    {download.progress !== undefined && (
                      <div className="mt-2">
                        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-green-500 rounded-full"
                            style={{ width: `${download.progress * 100}%` }}
                          />
                        </div>
                        <div className="text-right text-xs text-gray-400 mt-1">
                          {Math.round(download.progress * 100)}%
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Completed Downloads */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Completed Downloads</h2>
              {completedDownloads.length > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearCompletedDownloads}
                >
                  Clear History
                </Button>
              )}
            </div>
            
            {completedDownloads.length === 0 ? (
              <div className="bg-gray-800 rounded-lg p-6 text-center text-gray-400">
                No completed downloads
              </div>
            ) : (
              <div className="space-y-2">
                {completedDownloads.map(download => (
                  <div key={download.id} className="bg-gray-800 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium">{download.title}</h3>
                        {download.artist && (
                          <p className="text-sm text-gray-400">
                            {download.artist} {download.album ? `- ${download.album}` : ''}
                          </p>
                        )}
                        <div className="flex items-center gap-2 text-sm text-gray-400 mt-1">
                          <span className="flex items-center gap-1">
                            {getStatusIcon(download.status)}
                            {getStatusDisplay(download.status)}
                          </span>
                          <span>•</span>
                          <span>Completed: {formatTimestamp(download.started_at)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
