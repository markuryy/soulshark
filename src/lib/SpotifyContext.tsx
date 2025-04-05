// Types
import type { SpotifyTrack } from './spotifyTypes';

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { SpotifyApi } from '@spotify/web-api-ts-sdk';
import { initializeSpotify, resetSpotifyApi } from './spotify';
import { invoke } from '@tauri-apps/api/core';

// Types
interface Credentials {
  soulseek_password: string | null;
  spotify_client_secret: string | null;
  spotify_access_token: string | null;
  spotify_refresh_token: string | null;
  spotify_token_expires_at: number | null;
}



interface SpotifyContextType {
  isAuthenticated: boolean;
  spotifyApi: SpotifyApi | null;
  refreshAuthStatus: () => Promise<boolean>;
  logout: () => Promise<void>;

  likedTracks: SpotifyTrack[] | null;
  fetchLikedTracks: (forceRefresh?: boolean) => Promise<SpotifyTrack[]>;
  clearLikedTracksCache: () => void;

  fetchPlaylistTracks: (playlistId: string, forceRefresh?: boolean) => Promise<SpotifyTrack[]>;
  fetchAlbumTracks: (albumId: string, forceRefresh?: boolean) => Promise<SpotifyTrack[]>;
}

// Create the context with a default value
const SpotifyContext = createContext<SpotifyContextType>({
  isAuthenticated: false,
  spotifyApi: null,
  refreshAuthStatus: async () => false,
  logout: async () => {},

  likedTracks: null,
  fetchLikedTracks: async () => [],
  clearLikedTracksCache: () => {},

  fetchPlaylistTracks: async () => [],
  fetchAlbumTracks: async () => [],
});

// Custom hook to use the Spotify context
export const useSpotify = () => useContext(SpotifyContext);

// Provider component
export const SpotifyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [spotifyApi, setSpotifyApi] = useState<SpotifyApi | null>(null);

  const [likedTracks, setLikedTracks] = useState<SpotifyTrack[] | null>(null);

  const [playlistTracksCache] = useState<Map<string, SpotifyTrack[]>>(new Map());
  const [albumTracksCache] = useState<Map<string, SpotifyTrack[]>>(new Map());

  const fetchLikedTracks = async (forceRefresh = false): Promise<SpotifyTrack[]> => {
    if (!forceRefresh && likedTracks) {
      return likedTracks;
    }
    try {
      const { getAllLikedTracks } = await import('./spotify');
      const tracks = await getAllLikedTracks(50);
      setLikedTracks(tracks);
      return tracks;
    } catch (error) {
      console.error('Failed to fetch liked tracks:', error);
      throw error;
    }
  };

  const fetchPlaylistTracks = async (playlistId: string, forceRefresh = false): Promise<SpotifyTrack[]> => {
    if (!forceRefresh && playlistTracksCache.has(playlistId)) {
      return playlistTracksCache.get(playlistId)!;
    }
    try {
      const { getAllPlaylistTracks } = await import('./spotify');
      const items = await getAllPlaylistTracks(playlistId);
      const tracks = items.map(item => item.track as SpotifyTrack);
      playlistTracksCache.set(playlistId, tracks);
      return tracks;
    } catch (error) {
      console.error('Failed to fetch playlist tracks:', error);
      throw error;
    }
  };

  const fetchAlbumTracks = async (albumId: string, forceRefresh = false): Promise<SpotifyTrack[]> => {
    if (!forceRefresh && albumTracksCache.has(albumId)) {
      return albumTracksCache.get(albumId)!;
    }
    try {
      const { getAllAlbumTracks, getAlbum } = await import('./spotify');
      const albumTracks = await getAllAlbumTracks(albumId);
      const albumResponse = await getAlbum(albumId);
      const tracks = albumTracks.map(track => ({
        id: track.id,
        name: track.name,
        artists: track.artists.map(artist => ({ id: artist.id, name: artist.name })),
        album: {
          id: albumId,
          name: albumResponse.name,
          images: albumResponse.images
        },
        duration_ms: track.duration_ms
      }));
      albumTracksCache.set(albumId, tracks);
      return tracks;
    } catch (error) {
      console.error('Failed to fetch album tracks:', error);
      throw error;
    }
  };

  const clearLikedTracksCache = () => {
    setLikedTracks(null);
  };
  
  // Use a ref to track the last refresh time to prevent too frequent refreshes
  const lastRefreshTimeRef = useRef<number>(0);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check authentication status - with debounce to prevent too many calls
  const refreshAuthStatus = async () => {
    // Prevent refreshing more than once every 2 seconds
    const now = Date.now();
    if (now - lastRefreshTimeRef.current < 2000) {
      return isAuthenticated;
    }
    
    // Update last refresh time
    lastRefreshTimeRef.current = now;
    
    // Clear any pending refresh
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
    
    try {
      // Reset the API instance to force a fresh check
      resetSpotifyApi();
      
      // Try to initialize Spotify with stored credentials
      const api = await initializeSpotify();
      
      if (!api) {
        console.warn('Spotify API initialization returned null. Likely due to missing, expired, or invalid tokens.');
      }
      
      // Update state based on the result
      setSpotifyApi(api);
      setIsAuthenticated(!!api);
      
      return !!api;
    } catch (error) {
      console.error('Failed to refresh Spotify auth status:', error);
      setIsAuthenticated(false);
      setSpotifyApi(null);

      // Optional: show toast notification if refresh fails
      try {
        const { toast } = await import('sonner');
        toast.error('Failed to refresh Spotify connection. Please try reconnecting.');
      } catch (e) {
        console.error('Failed to load toast notification module:', e);
      }

      return false;
    }
  };

  // Logout from Spotify
  const logout = async () => {
    try {
      // Get current credentials
      const credentials = await invoke<Credentials>('get_credentials');
      
      // Clear Spotify tokens
      await invoke('save_credentials', {
        credentials: {
          ...credentials,
          spotify_access_token: null,
          spotify_refresh_token: null,
          spotify_token_expires_at: null,
        },
      });
      
      // Reset the API instance
      resetSpotifyApi();
      
      // Update state
      setIsAuthenticated(false);
      setSpotifyApi(null);
    } catch (error) {
      console.error('Failed to logout from Spotify:', error);
    }
  };

  // Check authentication status on mount only
  useEffect(() => {
    refreshAuthStatus();
    // No dependencies to prevent re-running
  }, []);

  // Provide the context value
  const contextValue: SpotifyContextType = {
    isAuthenticated,
    spotifyApi,
    refreshAuthStatus,
    logout,

    likedTracks,
    fetchLikedTracks,
    clearLikedTracksCache,

    fetchPlaylistTracks,
    fetchAlbumTracks,
  };

  return (
    <SpotifyContext.Provider value={contextValue}>
      {children}
    </SpotifyContext.Provider>
  );
};
