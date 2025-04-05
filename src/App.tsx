import { Button } from "@/components/ui/button";
import { Home, Heart, Library, Settings, ChevronLeft, ChevronRight, Search, Music } from "lucide-react";
import { useState, useEffect } from "react";
import SoulSharkLogo from "@/components/logo";
import SettingsPage from "@/components/settings/SettingsPage";
import SpotifyAuth from "@/components/spotify/SpotifyAuth";
import SpotifySearch from "@/components/spotify/SpotifySearch";
import SpotifyPlaylistItem from "@/components/spotify/SpotifyPlaylistItem";
import SpotifyContent from "@/components/spotify/SpotifyContent";
import { getUserPlaylists, initializeSpotify } from "@/lib/spotify";

// Types
interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string;
  images: { url: string }[];
  tracks: {
    total: number;
  };
}

// Type for navigation history item
interface NavigationHistoryItem {
  page: string;
  playlistId?: string;
  artistId?: string;
  artistName?: string;
  albumId?: string;
  albumName?: string;
  searchQuery?: string;
}

function App() {
  const [currentPage, setCurrentPage] = useState("home");
  const [isSpotifyAuthenticated, setIsSpotifyAuthenticated] = useState(false);
  const [spotifyPlaylists, setSpotifyPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [selectedArtistId, setSelectedArtistId] = useState<string | null>(null);
  const [selectedArtistName, setSelectedArtistName] = useState<string | null>(null);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [selectedAlbumName, setSelectedAlbumName] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  
  // Navigation history state
  const [navigationHistory, setNavigationHistory] = useState<NavigationHistoryItem[]>([
    { page: "home" }
  ]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(0);
  
  // Check Spotify authentication on mount and when currentPage changes to library
  useEffect(() => {
    checkSpotifyAuth();
  }, []);
  
  // Load playlists when authentication status changes or when navigating to library page
  useEffect(() => {
    if (isSpotifyAuthenticated && (currentPage === "library" || currentPage === "spotify-playlist")) {
      loadSpotifyPlaylists();
    }
  }, [isSpotifyAuthenticated, currentPage]);
  
  // Check if authenticated with Spotify
  const checkSpotifyAuth = async () => {
    try {
      const spotify = await initializeSpotify();
      setIsSpotifyAuthenticated(!!spotify);
      
      if (spotify) {
        loadSpotifyPlaylists();
      }
    } catch (error) {
      console.error("Failed to check Spotify authentication:", error);
    }
  };
  
  // Load Spotify playlists
  const loadSpotifyPlaylists = async () => {
    setIsLoadingPlaylists(true);
    
    try {
      const playlists = await getUserPlaylists();
      
      // Convert to our SpotifyPlaylist type
      const formattedPlaylists = playlists.map(playlist => ({
        id: playlist.id,
        name: playlist.name,
        description: playlist.description || "",
        images: playlist.images || [],
        tracks: {
          total: playlist.tracks?.total || 0
        }
      }));
      
      setSpotifyPlaylists(formattedPlaylists);
    } catch (error) {
      console.error("Failed to load Spotify playlists:", error);
    } finally {
      setIsLoadingPlaylists(false);
    }
  };
  
  // Navigate to a page and update history
  const navigateTo = (historyItem: NavigationHistoryItem) => {
    // Update state based on history item
    setCurrentPage(historyItem.page);
    
    if (historyItem.playlistId !== undefined) {
      setSelectedPlaylistId(historyItem.playlistId);
    }
    
    if (historyItem.artistId !== undefined) {
      setSelectedArtistId(historyItem.artistId);
      setSelectedArtistName(historyItem.artistName || null);
    }
    
    if (historyItem.albumId !== undefined) {
      setSelectedAlbumId(historyItem.albumId);
      setSelectedAlbumName(historyItem.albumName || null);
    }
    
    if (historyItem.searchQuery !== undefined) {
      setSearchQuery(historyItem.searchQuery);
    }
  };
  
  // Add a new history entry
  const addHistoryEntry = (historyItem: NavigationHistoryItem) => {
    // If we're not at the end of the history, remove future entries
    if (currentHistoryIndex < navigationHistory.length - 1) {
      setNavigationHistory(prev => prev.slice(0, currentHistoryIndex + 1));
    }
    
    // Add new entry and update index
    setNavigationHistory(prev => [...prev, historyItem]);
    setCurrentHistoryIndex(prev => prev + 1);
    
    // Navigate to the new page
    navigateTo(historyItem);
  };
  
  // Go back in history
  const goBack = () => {
    if (currentHistoryIndex > 0) {
      const newIndex = currentHistoryIndex - 1;
      setCurrentHistoryIndex(newIndex);
      navigateTo(navigationHistory[newIndex]);
    }
  };
  
  // Go forward in history
  const goForward = () => {
    if (currentHistoryIndex < navigationHistory.length - 1) {
      const newIndex = currentHistoryIndex + 1;
      setCurrentHistoryIndex(newIndex);
      navigateTo(navigationHistory[newIndex]);
    }
  };
  
  // Handle navigation to main pages from sidebar
  const handlePageChange = (page: string) => {
    addHistoryEntry({ page });
  };
  
  // Handle playlist selection
  const handlePlaylistSelect = (playlistId: string) => {
    setSelectedPlaylistId(playlistId);
    addHistoryEntry({ 
      page: "spotify-playlist", 
      playlistId 
    });
  };
  
  // Handle search
  const handleSearch = async (query: string) => {
    setIsSearching(true);
    setSearchQuery(query);
    addHistoryEntry({ 
      page: "spotify-search", 
      searchQuery: query 
    });
    setIsSearching(false);
  };
  
  // Handle artist click
  const handleArtistClick = (artistId: string, artistName: string) => {
    setSelectedArtistId(artistId);
    setSelectedArtistName(artistName);
    addHistoryEntry({ 
      page: "spotify-artist", 
      artistId, 
      artistName 
    });
  };
  
  // Handle album click
  const handleAlbumClick = (albumId: string, albumName: string) => {
    setSelectedAlbumId(albumId);
    setSelectedAlbumName(albumName);
    addHistoryEntry({ 
      page: "spotify-album", 
      albumId, 
      albumName 
    });
  };

  return (
    <div className="min-h-screen h-full bg-black text-white overflow-auto">
      <div className="flex">
        {/* Sidebar */}
        <div className="w-60 bg-black p-6 flex flex-col gap-6 fixed h-screen">
          <div className="flex items-center gap-2 mb-2">
            <SoulSharkLogo className="h-8 w-8 mr-2" />
            <span className="text-xl font-bold">soulshark</span>
          </div>
          <div className="space-y-4">
            <Button 
              variant={currentPage === "home" ? "default" : "ghost"} 
              className="w-full justify-start text-lg font-semibold"
              onClick={() => handlePageChange("home")}
            >
              <Home className="mr-3 h-5 w-5" />
              Home
            </Button>
            <Button 
              variant={currentPage === "liked" ? "default" : "ghost"} 
              className="w-full justify-start text-lg font-semibold"
              onClick={() => handlePageChange("liked")}
            >
              <Heart className="mr-3 h-5 w-5" />
              Liked
            </Button>
            <Button 
              variant={currentPage === "spotify-search" ? "default" : "ghost"} 
              className="w-full justify-start text-lg font-semibold"
              onClick={() => handlePageChange("spotify-search")}
            >
              <Search className="mr-3 h-5 w-5" />
              Search
            </Button>
            <Button 
              variant={currentPage === "library" ? "default" : "ghost"} 
              className="w-full justify-start text-lg font-semibold"
              onClick={() => handlePageChange("library")}
            >
              <Library className="mr-3 h-5 w-5" />
              Your Library
            </Button>
            <Button 
              variant={currentPage === "settings" ? "default" : "ghost"} 
              className="w-full justify-start text-lg font-semibold"
              onClick={() => handlePageChange("settings")}
            >
              <Settings className="mr-3 h-5 w-5" />
              Settings
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 bg-gradient-to-b from-gray-900 to-black min-h-screen ml-60">
          {/* Top Bar */}
          <div className="fixed top-0 left-60 right-0 flex items-center px-6 h-[72px] bg-black/50 backdrop-blur-sm z-10">
            <div className="flex gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                className="bg-black/60 rounded-full"
                onClick={goBack}
                disabled={currentHistoryIndex <= 0}
                title="Go back"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="bg-black/60 rounded-full"
                onClick={goForward}
                disabled={currentHistoryIndex >= navigationHistory.length - 1}
                title="Go forward"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Content Area */}
          <div className="p-6 mt-[72px]">
            {/* Render content based on current page */}
            {currentPage === "settings" && <SettingsPage />}
            
            {currentPage === "home" && (
              <div className="flex flex-col items-center justify-center h-96">
                <SoulSharkLogo className="h-32 w-32 mb-6" />
                <h2 className="text-3xl font-bold mb-4">Welcome to SoulShark</h2>
                <p className="text-gray-400 mb-6">Build your library, beyond the stream.</p>
                {!isSpotifyAuthenticated && (
                  <div className="text-center">
                    <p className="text-gray-500">
                      Configure Spotify in Settings to see your playlists and tracks
                    </p>
                  </div>
                )}
              </div>
            )}
            
            
            {currentPage === "spotify-liked" && (
              <SpotifyContent 
                contentType="liked" 
                onArtistClick={handleArtistClick}
                onAlbumClick={handleAlbumClick}
              />
            )}
            
            {currentPage === "spotify-playlist" && selectedPlaylistId && (
              <SpotifyContent 
                contentType="playlist" 
                playlistId={selectedPlaylistId}
                onArtistClick={handleArtistClick}
                onAlbumClick={handleAlbumClick}
              />
            )}
            
            {currentPage === "spotify-artist" && selectedArtistId && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold">{selectedArtistName}</h2>
                  <Button 
                    variant="outline"
                    onClick={goBack}
                    className="ml-4"
                  >
                    Back
                  </Button>
                </div>
                <SpotifyContent 
                  contentType="artist" 
                  artistId={selectedArtistId}
                  onArtistClick={handleArtistClick}
                  onAlbumClick={handleAlbumClick}
                />
              </div>
            )}
            
            {currentPage === "spotify-album" && selectedAlbumId && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold">{selectedAlbumName}</h2>
                  <Button 
                    variant="outline"
                    onClick={goBack}
                    className="ml-4"
                  >
                    Back
                  </Button>
                </div>
                <SpotifyContent 
                  contentType="album" 
                  albumId={selectedAlbumId}
                  onArtistClick={handleArtistClick}
                  onAlbumClick={handleAlbumClick}
                />
              </div>
            )}
            
            {currentPage === "spotify-search" && (
              <div>
                <h2 className="text-2xl font-bold mb-6">Search Spotify</h2>
                <div className="max-w-xl mb-8">
                  <SpotifySearch 
                    onSearch={handleSearch}
                    isLoading={isSearching}
                  />
                </div>
                {searchQuery && (
                  <SpotifyContent 
                    contentType="search" 
                    searchQuery={searchQuery}
                    onArtistClick={handleArtistClick}
                    onAlbumClick={handleAlbumClick}
                  />
                )}
              </div>
            )}
            
            {currentPage === "liked" && (
              <SpotifyContent 
                contentType="liked" 
                onArtistClick={handleArtistClick}
                onAlbumClick={handleAlbumClick}
              />
            )}
            
            {currentPage === "library" && (
              <div>
                <h2 className="text-2xl font-bold mb-6">Your Library</h2>
                
                {isSpotifyAuthenticated ? (
                  <div>
                    {isLoadingPlaylists ? (
                      <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-500 mx-auto mb-4"></div>
                        <p className="text-gray-400">Loading library...</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {/* Liked Songs as first item */}
                        <div 
                          className="bg-gradient-to-br from-purple-700 to-blue-900 rounded-lg p-4 cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => handlePageChange("liked")}
                        >
                          <div className="flex flex-col h-full">
                            <div className="flex-grow mb-4">
                              <div className="flex items-center justify-center h-32 mb-4">
                                <Heart className="h-16 w-16 text-white" />
                              </div>
                              <h3 className="text-xl font-bold">Liked Songs</h3>
                              <p className="text-sm text-gray-300 mt-1">Your liked tracks</p>
                            </div>
                          </div>
                        </div>
                        
                        {/* User's playlists */}
                        {spotifyPlaylists.map(playlist => (
                          <div 
                            key={playlist.id}
                            className="bg-gray-800 rounded-lg p-4 cursor-pointer hover:bg-gray-700 transition-colors"
                            onClick={() => handlePlaylistSelect(playlist.id)}
                          >
                            <div className="flex flex-col h-full">
                              <div className="flex-grow mb-4">
                                {playlist.images[0]?.url ? (
                                  <img 
                                    src={playlist.images[0].url} 
                                    alt={playlist.name} 
                                    className="w-full h-32 object-cover rounded-md mb-4"
                                  />
                                ) : (
                                  <div className="flex items-center justify-center h-32 bg-gray-700 rounded-md mb-4">
                                    <Music className="h-12 w-12 text-gray-400" />
                                  </div>
                                )}
                                <h3 className="text-lg font-bold truncate">{playlist.name}</h3>
                                <p className="text-sm text-gray-400 mt-1 truncate">{playlist.description || `${playlist.tracks.total} tracks`}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12">
                    <p className="text-gray-400 mb-6">Connect to Spotify to view your library</p>
                    <Button 
                      onClick={() => handlePageChange("settings")}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      Go to Settings
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
