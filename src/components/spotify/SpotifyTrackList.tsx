import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Play, Clock } from "lucide-react";
import { downloadTrack } from "@/lib/spotify";

interface SpotifyTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: {
    id: string;
    name: string;
    images?: { url: string }[];
  };
  duration_ms: number;
}

interface SpotifyTrackListProps {
  tracks: SpotifyTrack[];
  title?: string;
  description?: string;
  onArtistClick?: (artistId: string, artistName: string) => void;
  onAlbumClick?: (albumId: string, albumName: string) => void;
}

export default function SpotifyTrackList({ 
  tracks, 
  title, 
  description,
  onArtistClick,
  onAlbumClick
}: SpotifyTrackListProps) {
  const [downloadingTrackIds, setDownloadingTrackIds] = useState<Set<string>>(new Set());

  // Format track duration from milliseconds to MM:SS
  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Handle track download
  const handleDownload = async (track: SpotifyTrack) => {
    setDownloadingTrackIds(prev => new Set(prev).add(track.id));
    
    try {
      const artistName = track.artists[0]?.name || "Unknown Artist";
      await downloadTrack(artistName, track.name);
    } catch (error) {
      console.error("Failed to download track:", error);
    } finally {
      setDownloadingTrackIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(track.id);
        return newSet;
      });
    }
  };

  return (
    <div className="w-full">
      {title && (
        <div className="mb-6">
          <h2 className="text-2xl font-bold">{title}</h2>
          {description && <p className="text-gray-400 mt-1">{description}</p>}
        </div>
      )}

      <div className="bg-gray-900/50 rounded-lg overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-gray-400 border-b border-gray-800">
          <div className="col-span-1">#</div>
          <div className="col-span-5">TITLE</div>
          <div className="col-span-3">ALBUM</div>
          <div className="col-span-2 flex items-center justify-end">
            <Clock className="h-4 w-4" />
          </div>
          <div className="col-span-1"></div>
        </div>

        {/* Track List */}
        {tracks.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400">
            No tracks found
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {tracks.map((track, index) => (
              <div 
                key={track.id} 
                className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-gray-800/50"
              >
                <div className="col-span-1 text-gray-400">{index + 1}</div>
                <div className="col-span-5 flex items-center space-x-3">
                  {track.album.images && track.album.images[0] && (
                    <img 
                      src={track.album.images[0].url} 
                      alt={track.album.name} 
                      className="w-10 h-10 rounded"
                    />
                  )}
                  <div>
                    <div className="font-medium">{track.name}</div>
                    <div className="text-sm text-gray-400">
                      {track.artists.map((artist, i) => (
                        <span key={artist.id}>
                          {i > 0 && ", "}
                          <button 
                            className="hover:underline hover:text-blue-400 focus:outline-none"
                            onClick={() => onArtistClick && onArtistClick(artist.id, artist.name)}
                            disabled={!onArtistClick}
                          >
                            {artist.name}
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="col-span-3 text-gray-400 truncate">
                  <button 
                    className="hover:underline hover:text-blue-400 focus:outline-none truncate"
                    onClick={() => onAlbumClick && onAlbumClick(track.album.id, track.album.name)}
                    disabled={!onAlbumClick}
                  >
                    {track.album.name}
                  </button>
                </div>
                <div className="col-span-2 text-gray-400 text-right">
                  {formatDuration(track.duration_ms)}
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-gray-400 hover:text-white hover:bg-green-600"
                    onClick={() => handleDownload(track)}
                    disabled={downloadingTrackIds.has(track.id)}
                    title="Save track"
                  >
                    {downloadingTrackIds.has(track.id) ? (
                      <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-current" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
