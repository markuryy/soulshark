import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { downloadPlaylist } from "@/lib/spotify";
import { useState } from "react";

interface SpotifyPlaylistItemProps {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  trackCount: number;
  onClick: () => void;
  isActive?: boolean;
}

export default function SpotifyPlaylistItem({
  id,
  name,
  description,
  imageUrl,
  trackCount,
  onClick,
  isActive = false,
}: SpotifyPlaylistItemProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDownloading(true);
    
    try {
      await downloadPlaylist(id);
    } catch (error) {
      console.error("Failed to download playlist:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div 
      className={`flex items-center justify-between p-2 rounded-md cursor-pointer hover:bg-gray-800 ${isActive ? 'bg-gray-800' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center space-x-2 overflow-hidden">
        {imageUrl && (
          <img 
            src={imageUrl} 
            alt={name} 
            className="w-8 h-8 rounded"
          />
        )}
        <div className="overflow-hidden">
          <div className="text-sm font-medium truncate">{name}</div>
          {description && (
            <div className="text-xs text-gray-400 truncate">{description}</div>
          )}
        </div>
      </div>
      
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 text-gray-400 hover:text-white hover:bg-green-600"
        onClick={handleDownload}
        disabled={isDownloading}
        title="Save playlist"
      >
        {isDownloading ? (
          <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-current" />
        ) : (
          <Download className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
