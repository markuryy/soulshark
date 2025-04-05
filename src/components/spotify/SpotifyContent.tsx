import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import SpotifyAuth from "./SpotifyAuth";
import SpotifyTrackList from "./SpotifyTrackList";
import { 
  initializeSpotify, 
  getUserPlaylists, 
  getLikedTracks, 
  getPlaylistTracks,
  downloadLikedTracks,
  downloadPlaylist,
  downloadAlbum,
  resetSpotifyApi,
  searchSpotify,
  getArtist,
  getArtistTopTracks,
  getArtistAlbums,
  getAlbum,
  getAlbumTracks
} from "@/lib/spotify";
import { Music } from "lucide-react";

// Types
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

interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string;
  images: { url: string }[];
  tracks: {
    total: number;
  };
}

interface SpotifyContentProps {
  contentType: 'liked' | 'playlist' | 'search' | 'artist' | 'album';
  playlistId?: string;
  searchQuery?: string;
  artistId?: string;
  albumId?: string;
  limit?: number; // Optional limit for number of tracks to display
  onArtistClick?: (artistId: string, artistName: string) => void;
  onAlbumClick?: (albumId: string, albumName: string) => void;
}

interface SpotifyAlbum {
  id: string;
  name: string;
  images: { url: string; height: number; width: number }[];
  artists: { id: string; name: string }[];
  release_date: string;
  total_tracks: number;
}

export default function SpotifyContent({ 
  contentType, 
  playlistId, 
  searchQuery,
  artistId,
  albumId,
  limit,
  onArtistClick,
  onAlbumClick
}: SpotifyContentProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);
  const [albums, setAlbums] = useState<SpotifyAlbum[]>([]);
  const [playlist, setPlaylist] = useState<SpotifyPlaylist | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [artistInfo, setArtistInfo] = useState<{name: string; images: {url: string}[]} | null>(null);

  // Check authentication and load data on mount
  useEffect(() => {
    checkAuthAndLoadData();
  }, [contentType, playlistId, searchQuery, artistId, albumId]);

  // Check if authenticated with Spotify and load data
  const checkAuthAndLoadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const spotify = await initializeSpotify();
      if (spotify) {
        setIsAuthenticated(true);
        await loadContent();
      } else {
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error("Failed to initialize Spotify:", error);
      setError(`Failed to initialize Spotify: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Load content based on contentType
  const loadContent = async () => {
    try {
      switch (contentType) {
        case 'liked':
          await loadLikedTracks();
          break;
        case 'playlist':
          if (playlistId) {
            await loadPlaylistTracks(playlistId);
          }
          break;
        case 'search':
          if (searchQuery) {
            await performSearch(searchQuery);
          }
          break;
        case 'artist':
          if (artistId) {
            await loadArtistTracks(artistId);
          }
          break;
        case 'album':
          if (albumId) {
            await loadAlbumTracks(albumId);
          }
          break;
      }
    } catch (error) {
      console.error("Failed to load content:", error);
      setError(`Failed to load content: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  // Perform search
  const performSearch = async (query: string) => {
    try {
      const searchResults = await searchSpotify(query);
      
      // Extract tracks from search results
      const tracks: SpotifyTrack[] = [];
      
      // Add tracks from track results
      if (searchResults.tracks && searchResults.tracks.items.length > 0) {
        tracks.push(...searchResults.tracks.items);
      }
      
      // Add tracks from album results (first track of each album)
      if (searchResults.albums && searchResults.albums.items.length > 0) {
        // In a real app, you might want to fetch the tracks for each album
        // For now, we'll just show the albums as placeholder tracks
        const albumTracks = searchResults.albums.items.map(album => ({
          id: album.id,
          name: album.name,
          artists: album.artists.map(artist => ({
            id: artist.id,
            name: artist.name
          })),
          album: {
            id: album.id,
            name: `Album: ${album.name}`,
            images: album.images
          },
          duration_ms: 0
        }));
        tracks.push(...albumTracks);
      }
      
      // Add tracks from artist results (as placeholder tracks)
      if (searchResults.artists && searchResults.artists.items.length > 0) {
        const artistTracks = searchResults.artists.items.map(artist => ({
          id: artist.id,
          name: `Artist: ${artist.name}`,
          artists: [{ 
            id: artist.id, 
            name: artist.name 
          }],
          album: {
            id: artist.id,
            name: "Top Artist",
            images: artist.images
          },
          duration_ms: 0
        }));
        tracks.push(...artistTracks);
      }
      
      setTracks(tracks);
    } catch (error) {
      console.error("Failed to search Spotify:", error);
      
      // If we get an authentication error, reset the Spotify API instance
      if (error instanceof Error && error.message.includes("authentication")) {
        resetSpotifyApi();
        setIsAuthenticated(false);
      }
      
      throw error;
    }
  };

  // Load liked tracks
  const loadLikedTracks = async () => {
    try {
      const likedTracksResponse = await getLikedTracks();
      let tracksToDisplay = likedTracksResponse.map(item => item.track);
      
      // Apply limit if specified
      if (limit && limit > 0 && tracksToDisplay.length > limit) {
        tracksToDisplay = tracksToDisplay.slice(0, limit);
      }
      
      setTracks(tracksToDisplay);
    } catch (error) {
      console.error("Failed to load liked tracks:", error);
      
      // If we get an authentication error, reset the Spotify API instance
      if (error instanceof Error && error.message.includes("authentication")) {
        resetSpotifyApi();
        setIsAuthenticated(false);
      }
      
      throw error;
    }
  };

  // Load playlist tracks
  const loadPlaylistTracks = async (playlistId: string) => {
    try {
      const playlistTracksResponse = await getPlaylistTracks(playlistId);
      let tracksToDisplay = playlistTracksResponse.map(item => item.track as SpotifyTrack);
      
      // Apply limit if specified
      if (limit && limit > 0 && tracksToDisplay.length > limit) {
        tracksToDisplay = tracksToDisplay.slice(0, limit);
      }
      
      setTracks(tracksToDisplay);
      
      // Get playlist details from the first track's context
      if (playlistTracksResponse.length > 0) {
        // This is a simplified approach - in a real app, you'd fetch the playlist details
        const playlists = await getUserPlaylists();
        const foundPlaylist = playlists.find(p => p.id === playlistId);
        if (foundPlaylist) {
          // Convert to our SpotifyPlaylist type
          setPlaylist({
            id: foundPlaylist.id,
            name: foundPlaylist.name,
            description: foundPlaylist.description || "",
            images: foundPlaylist.images || [],
            tracks: {
              total: foundPlaylist.tracks?.total || playlistTracksResponse.length
            }
          });
        }
      }
    } catch (error) {
      console.error("Failed to load playlist tracks:", error);
      
      // If we get an authentication error, reset the Spotify API instance
      if (error instanceof Error && error.message.includes("authentication")) {
        resetSpotifyApi();
        setIsAuthenticated(false);
      }
      
      throw error;
    }
  };

  // Load artist tracks
  const loadArtistTracks = async (artistId: string) => {
    try {
      // Fetch artist info, top tracks, and albums in parallel
      const [artistResponse, topTracksResponse, albumsResponse] = await Promise.all([
        getArtist(artistId),
        getArtistTopTracks(artistId),
        getArtistAlbums(artistId)
      ]);
      
      // Store artist info
      setArtistInfo({
        name: artistResponse.name,
        images: artistResponse.images
      });
      
      // Convert to our SpotifyTrack format
      const tracksToDisplay = topTracksResponse.tracks.map(track => ({
        id: track.id,
        name: track.name,
        artists: track.artists.map(artist => ({
          id: artist.id,
          name: artist.name
        })),
        album: {
          id: track.album.id,
          name: track.album.name,
          images: track.album.images
        },
        duration_ms: track.duration_ms
      }));
      
      // Apply limit if specified
      if (limit && limit > 0 && tracksToDisplay.length > limit) {
        setTracks(tracksToDisplay.slice(0, limit));
      } else {
        setTracks(tracksToDisplay);
      }
      
      // Store albums
      setAlbums(albumsResponse.items);
      
    } catch (error) {
      console.error("Failed to load artist tracks:", error);
      
      // If we get an authentication error, reset the Spotify API instance
      if (error instanceof Error && error.message.includes("authentication")) {
        resetSpotifyApi();
        setIsAuthenticated(false);
      }
      
      throw error;
    }
  };
  
  // Load album tracks
  const loadAlbumTracks = async (albumId: string) => {
    try {
      const albumResponse = await getAlbum(albumId);
      const albumTracksResponse = await getAlbumTracks(albumId);
      
      // Store album info
      setAlbums([albumResponse]);
      
      // Convert to our SpotifyTrack format
      const tracksToDisplay = albumTracksResponse.items.map(track => ({
        id: track.id,
        name: track.name,
        artists: track.artists.map(artist => ({
          id: artist.id,
          name: artist.name
        })),
        album: {
          id: albumId,
          name: albumResponse.name,
          images: albumResponse.images
        },
        duration_ms: track.duration_ms
      }));
      
      // Apply limit if specified
      if (limit && limit > 0 && tracksToDisplay.length > limit) {
        setTracks(tracksToDisplay.slice(0, limit));
      } else {
        setTracks(tracksToDisplay);
      }
    } catch (error) {
      console.error("Failed to load album tracks:", error);
      
      // If we get an authentication error, reset the Spotify API instance
      if (error instanceof Error && error.message.includes("authentication")) {
        resetSpotifyApi();
        setIsAuthenticated(false);
      }
      
      throw error;
    }
  };

  // Handle download of all tracks
  const handleDownloadAll = async () => {
    setIsDownloading(true);
    
    try {
      if (contentType === 'liked') {
        await downloadLikedTracks();
      } else if (contentType === 'playlist' && playlistId) {
        await downloadPlaylist(playlistId);
      } else if (contentType === 'album' && albums.length > 0) {
        await downloadAlbum(albums[0].id);
      }
    } catch (error) {
      console.error("Failed to save tracks:", error);
      setError(`Failed to save tracks: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsDownloading(false);
    }
  };

  // If not authenticated, show message to configure in settings
  if (!isAuthenticated) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center py-12">
          <h2 className="text-2xl font-bold mb-4">Spotify Not Connected</h2>
          <p className="text-gray-400 mb-6">You need to connect to Spotify to view this content</p>
          <Button 
            onClick={() => window.location.hash = "#/settings"}
            className="bg-green-600 hover:bg-green-700"
          >
            Go to Settings
          </Button>
        </div>
      </div>
    );
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading Spotify content...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-medium text-red-400 mb-2">Error Loading Content</h3>
          <p className="text-red-300">{error}</p>
          <Button 
            onClick={checkAuthAndLoadData} 
            className="mt-4 bg-red-700 hover:bg-red-600"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Render content based on type
  return (
    <div className="p-6">
      {contentType === 'liked' && (
        <>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Liked Songs</h2>
            <Button 
              onClick={handleDownloadAll}
              disabled={isDownloading || tracks.length === 0}
              className="bg-green-600 hover:bg-green-700"
              title="Save all tracks"
            >
              {isDownloading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                  <Download className="h-4 w-4" />
                </div>
              ) : (
                <Download className="h-4 w-4" />
              )}
            </Button>
          </div>
          <SpotifyTrackList 
            tracks={tracks}
            onArtistClick={onArtistClick}
            onAlbumClick={onAlbumClick}
          />
        </>
      )}

      {contentType === 'playlist' && playlist && (
        <>
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold">{playlist.name}</h2>
              {playlist.description && <p className="text-gray-400 mt-1">{playlist.description}</p>}
            </div>
            <Button 
              onClick={handleDownloadAll}
              disabled={isDownloading || tracks.length === 0}
              className="bg-green-600 hover:bg-green-700"
              title="Save all tracks"
            >
              {isDownloading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                  <Download className="h-4 w-4" />
                </div>
              ) : (
                <Download className="h-4 w-4" />
              )}
            </Button>
          </div>
          <SpotifyTrackList 
            tracks={tracks}
            onArtistClick={onArtistClick}
            onAlbumClick={onAlbumClick}
          />
        </>
      )}

      {contentType === 'search' && (
        <div>
          <h2 className="text-2xl font-bold mb-6">Search Results for "{searchQuery}"</h2>
          {tracks.length > 0 ? (
            <SpotifyTrackList 
              tracks={tracks}
              onArtistClick={onArtistClick}
              onAlbumClick={onAlbumClick}
            />
          ) : (
            <p className="text-gray-400">No results found for "{searchQuery}"</p>
          )}
        </div>
      )}

      {contentType === 'artist' && artistInfo && (
        <div>
          {/* Artist header with image if available */}
          <div className="flex items-center mb-8">
            {artistInfo.images && artistInfo.images.length > 0 && (
              <div className="mr-6">
                <img 
                  src={artistInfo.images[0].url} 
                  alt={artistInfo.name}
                  className="w-40 h-40 object-cover rounded-full"
                />
              </div>
            )}
            <div>
              <h2 className="text-3xl font-bold">{artistInfo.name}</h2>
            </div>
          </div>
          
          {/* Albums grid */}
          {albums.length > 0 && (
            <div className="mb-8">
              <h3 className="text-xl font-bold mb-4">Albums</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {albums.map(album => (
                  <div 
                    key={album.id}
                    className="bg-gray-800 rounded-lg p-4 cursor-pointer hover:bg-gray-700 transition-colors"
                    onClick={() => onAlbumClick && onAlbumClick(album.id, album.name)}
                  >
                    <div className="flex flex-col h-full">
                      <div className="flex-grow mb-4">
                        {album.images && album.images.length > 0 ? (
                          <img 
                            src={album.images[0].url} 
                            alt={album.name} 
                            className="w-full aspect-square object-cover rounded-md mb-4"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-32 bg-gray-700 rounded-md mb-4">
                            <Music className="h-12 w-12 text-gray-400" />
                          </div>
                        )}
                        <h4 className="text-md font-bold truncate">{album.name}</h4>
                        <p className="text-sm text-gray-400 mt-1 truncate">{album.total_tracks} tracks</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Top tracks */}
          <div>
            <h3 className="text-xl font-bold mb-4">Popular Tracks</h3>
            <SpotifyTrackList 
              tracks={tracks}
              onArtistClick={onArtistClick}
              onAlbumClick={onAlbumClick}
            />
          </div>
        </div>
      )}

      {contentType === 'album' && albums.length > 0 && (
        <div>
          {/* Album header with image if available */}
          <div className="flex items-start mb-8">
            {albums[0].images && albums[0].images.length > 0 && (
              <div className="mr-6">
                <img 
                  src={albums[0].images[0].url} 
                  alt={albums[0].name}
                  className="w-48 h-48 object-cover rounded-md shadow-lg"
                />
              </div>
            )}
            <div>
              <h2 className="text-3xl font-bold">{albums[0].name}</h2>
              <div className="mt-2 flex items-center">
                {albums[0].artists.map((artist, index) => (
                  <span key={artist.id}>
                    <span 
                      className="text-gray-300 hover:text-white cursor-pointer"
                      onClick={() => onArtistClick && onArtistClick(artist.id, artist.name)}
                    >
                      {artist.name}
                    </span>
                    {index < albums[0].artists.length - 1 && <span className="mx-1">,</span>}
                  </span>
                ))}
              </div>
              <p className="text-gray-400 mt-1">{albums[0].total_tracks} tracks • {new Date(albums[0].release_date).getFullYear()}</p>
              <Button 
                onClick={() => downloadAlbum(albums[0].id)}
                className="mt-4 bg-green-600 hover:bg-green-700"
                title="Save album"
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* Album tracks */}
          <div>
            <h3 className="text-xl font-bold mb-4">Tracks</h3>
            <SpotifyTrackList 
              tracks={tracks}
              onArtistClick={onArtistClick}
              onAlbumClick={onAlbumClick}
            />
          </div>
        </div>
      )}
    </div>
  );
}
