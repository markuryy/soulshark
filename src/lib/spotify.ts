import { SpotifyApi } from "@spotify/web-api-ts-sdk";
import { invoke } from "@tauri-apps/api/core";

// Types
interface SpotifySettings {
  client_id: string;
  redirect_uri: string;
}

interface Credentials {
  soulseek_password: string | null;
  spotify_client_secret: string | null;
  spotify_access_token: string | null;
  spotify_refresh_token: string | null;
  spotify_token_expires_at: number | null;
}

interface AppSettings {
  spotify: SpotifySettings;
  // Other settings fields omitted for brevity
}

// Singleton instance of the Spotify API
let spotifyApiInstance: SpotifyApi | null = null;

/**
 * Initialize the Spotify API with stored credentials
 * @returns A SpotifyApi instance or null if not authenticated
 */
export async function initializeSpotify(): Promise<SpotifyApi | null> {
  try {
    // If we already have an instance, return it
    if (spotifyApiInstance) {
      return spotifyApiInstance;
    }

    // Get settings and credentials
    const settings = await invoke<AppSettings>("get_settings");
    const credentials = await invoke<Credentials>("get_credentials");

    // Check if we have valid credentials
    if (!credentials.spotify_access_token) {
      console.log("No Spotify access token found");
      return null;
    }

    // Check if token is expired
    const isExpired = credentials.spotify_token_expires_at 
      ? credentials.spotify_token_expires_at < Date.now() 
      : true;

    if (isExpired && credentials.spotify_refresh_token) {
      console.log("Spotify token is expired, refreshing token");
      try {
        // Refresh the token
        await invoke("refresh_spotify_token");
        
        // Get the updated credentials
        const updatedCredentials = await invoke<Credentials>("get_credentials");
        
        if (!updatedCredentials.spotify_access_token) {
          console.log("Failed to refresh Spotify token");
          return null;
        }
        
        // Create Spotify SDK instance with the refreshed token
        const spotify = SpotifyApi.withAccessToken(
          settings.spotify.client_id,
          {
            access_token: updatedCredentials.spotify_access_token,
            token_type: "Bearer",
            expires_in: 3600, // Default to 1 hour
            refresh_token: updatedCredentials.spotify_refresh_token || "",
          }
        );
        
        // Store the instance
        spotifyApiInstance = spotify;
        return spotify;
      } catch (error) {
        console.error("Failed to refresh Spotify token:", error);
        return null;
      }
    } else if (isExpired) {
      console.log("Spotify token is expired and no refresh token available");
      return null;
    }

    // Create Spotify SDK instance
    const spotify = SpotifyApi.withAccessToken(
      settings.spotify.client_id,
      {
        access_token: credentials.spotify_access_token,
        token_type: "Bearer",
        expires_in: 3600, // Default to 1 hour
        refresh_token: credentials.spotify_refresh_token || "",
      }
    );

    // Store the instance
    spotifyApiInstance = spotify;
    return spotify;
  } catch (error) {
    console.error("Failed to initialize Spotify:", error);
    return null;
  }
}

/**
 * Get the user's playlists
 * @returns Array of user playlists
 */
export async function getUserPlaylists() {
  const spotify = await initializeSpotify();
  if (!spotify) {
    throw new Error("Not authenticated with Spotify");
  }

  const response = await spotify.currentUser.playlists.playlists();
  return response.items;
}

/**
 * Search Spotify for tracks, albums, artists, or playlists
 * @param query Search query
 * @param types Array of item types to search for (track, album, artist, playlist)
 * @param limit Number of results to return per type (max 50)
 * @returns Search results
 */
export async function searchSpotify(query: string, types = ["track", "album", "artist", "playlist"] as const, limit = 20 as 20) {
  const spotify = await initializeSpotify();
  if (!spotify) {
    throw new Error("Not authenticated with Spotify");
  }

  const response = await spotify.search(query, types, undefined, limit);
  return response;
}

/**
 * Get the user's liked tracks
 * @param limit Number of tracks to fetch (max 50)
 * @param offset Offset for pagination
 * @returns Object containing track items and pagination info
 */
export async function getLikedTracks(limit: number = 50, offset = 0) {
  const spotify = await initializeSpotify();
  if (!spotify) {
    throw new Error("Not authenticated with Spotify");
  }

  // Spotify API has a max limit of 50 per request
  const actualLimit = Math.min(limit, 50) as 50 | 20 | 1;
  
  const response = await spotify.currentUser.tracks.savedTracks(actualLimit, offset);
  return {
    items: response.items,
    total: response.total,
    offset: response.offset,
    limit: response.limit
  };
}

/**
 * Get total count of user's liked tracks
 * @returns Total number of liked tracks
 */
export async function getLikedTracksCount() {
  const spotify = await initializeSpotify();
  if (!spotify) {
    throw new Error("Not authenticated with Spotify");
  }
  
  // Request just 1 track to get the total count
  const response = await spotify.currentUser.tracks.savedTracks(1, 0);
  return response.total;
}

/**
 * Get all of the user's liked tracks by making multiple API requests
 * @param batchSize Number of tracks to fetch per request (max 50)
 * @param onProgress Optional callback for progress updates
 * @returns Array of all liked tracks
 */
export async function getAllLikedTracks(batchSize: number = 50, onProgress?: (loaded: number, total: number) => void) {
  const spotify = await initializeSpotify();
  if (!spotify) {
    throw new Error("Not authenticated with Spotify");
  }

  // Get total liked tracks count
  const totalTracks = await getLikedTracksCount();

  if (totalTracks === 0) {
    return [];
  }

  const actualBatchSize = Math.min(batchSize, 50);
  const batchCount = Math.ceil(totalTracks / actualBatchSize);
  const allTracks = [];

  for (let i = 0; i < batchCount; i++) {
    const offset = i * actualBatchSize;
    const response = await getLikedTracks(actualBatchSize, offset);

    allTracks.push(...response.items.map(item => item.track));

    if (onProgress) {
      onProgress(allTracks.length, totalTracks);
    }
  }

  return allTracks;
}

/**
 * Get tracks for a specific playlist
 * @param playlistId Spotify playlist ID
 * @param limit Number of tracks to fetch (max 100)
 * @param offset Offset for pagination
 * @returns Array of playlist tracks
 */
export async function getPlaylistTracks(playlistId: string, limit: 50 = 50, offset = 0) {
  const spotify = await initializeSpotify();
  if (!spotify) {
    throw new Error("Not authenticated with Spotify");
  }

  const response = await spotify.playlists.getPlaylistItems(playlistId, undefined, undefined, limit, offset);
  return response.items;
}

/**
 * Download a Spotify track using sldl
 * @param artistName Artist name
 * @param trackName Track name
 * @returns Promise that resolves when the download is started
 */
export async function downloadTrack(artistName: string, trackName: string) {
  const query = `${artistName} - ${trackName}`;
  
  try {
    // Call the Tauri command to execute sldl
    await invoke("execute_sldl", {
      query,
      options: {}
    });
    
    return true;
  } catch (error) {
    console.error("Failed to download track:", error);
    throw error;
  }
}

/**
 * Download a Spotify playlist using sldl
 * @param playlistId Spotify playlist ID
 * @returns Promise that resolves when the download is started
 */
export async function downloadPlaylist(playlistId: string) {
  const playlistUrl = `https://open.spotify.com/playlist/${playlistId}`;
  
  try {
    // Get playlist details to pass as metadata
    const spotify = await initializeSpotify();
    if (!spotify) {
      throw new Error("Not authenticated with Spotify");
    }
    
    // Get playlist details
    const playlist = await spotify.playlists.getPlaylist(playlistId);
    
    // Call the Tauri command to execute sldl with playlist metadata
    await invoke("execute_sldl", {
      query: playlistUrl,
      options: {},
      title: playlist.name,
      artist: playlist.owner?.display_name || undefined
    });
    
    return true;
  } catch (error) {
    console.error("Failed to download playlist:", error);
    throw error;
  }
}

/**
 * Download a Spotify album using sldl
 * @param albumId Spotify album ID
 * @returns Promise that resolves when the download is started
 */
export async function downloadAlbum(albumId: string) {
  const albumUrl = `https://open.spotify.com/album/${albumId}`;
  
  try {
    // Get album details to pass as metadata
    const spotify = await initializeSpotify();
    if (!spotify) {
      throw new Error("Not authenticated with Spotify");
    }
    
    // Get album details
    const album = await spotify.albums.get(albumId);
    
    // Get artist name
    const artistName = album.artists.length > 0 ? album.artists[0].name : undefined;
    
    // Call the Tauri command to execute sldl with album metadata
    await invoke("execute_sldl", {
      query: albumUrl,
      options: {},
      title: album.name,
      artist: artistName
    });
    
    return true;
  } catch (error) {
    console.error("Failed to download album:", error);
    throw error;
  }
}

/**
 * Download the user's liked tracks using sldl
 * @returns Promise that resolves when the download is started
 */
export async function downloadLikedTracks() {
  try {
    // Get user profile to pass as metadata
    const spotify = await initializeSpotify();
    if (!spotify) {
      throw new Error("Not authenticated with Spotify");
    }
    
    // Get user profile
    const userProfile = await spotify.currentUser.profile();
    
    // Call the Tauri command to execute sldl with metadata
    await invoke("execute_sldl", {
      query: "spotify-likes",
      options: {},
      title: "Liked Songs",
      artist: userProfile.display_name || undefined
    });
    
    return true;
  } catch (error) {
    console.error("Failed to download liked tracks:", error);
    throw error;
  }
}

/**
 * Get an artist by ID
 * @param artistId Spotify artist ID
 * @returns Artist data
 */
export async function getArtist(artistId: string) {
  const spotify = await initializeSpotify();
  if (!spotify) {
    throw new Error("Not authenticated with Spotify");
  }

  return await spotify.artists.get(artistId);
}

/**
 * Get an artist's albums
 * @param artistId Spotify artist ID
 * @returns Artist's albums
 */
export async function getArtistAlbums(artistId: string) {
  const spotify = await initializeSpotify();
  if (!spotify) {
    throw new Error("Not authenticated with Spotify");
  }

  return await spotify.artists.albums(artistId);
}

/**
 * Get an artist's top tracks
 * @param artistId Spotify artist ID
 * @returns Artist's top tracks
 */
export async function getArtistTopTracks(artistId: string) {
  const spotify = await initializeSpotify();
  if (!spotify) {
    throw new Error("Not authenticated with Spotify");
  }

  // The SDK requires a market parameter, using 'US' as default
  return await spotify.artists.topTracks(artistId, 'US');
}

/**
 * Get an album by ID
 * @param albumId Spotify album ID
 * @returns Album data
 */
export async function getAlbum(albumId: string) {
  const spotify = await initializeSpotify();
  if (!spotify) {
    throw new Error("Not authenticated with Spotify");
  }

  return await spotify.albums.get(albumId);
}

/**
 * Get an album's tracks
 * @param albumId Spotify album ID
 * @param offset Offset for pagination
 * @returns Album tracks
 */
export async function getAlbumTracks(albumId: string, offset = 0) {
  const spotify = await initializeSpotify();
  if (!spotify) {
    throw new Error("Not authenticated with Spotify");
  }

  // Using 50 as a fixed limit
  return await spotify.albums.tracks(albumId, undefined, 50, offset);
}

/**
 * Get all tracks in a playlist, handling pagination
 * @param playlistId Spotify playlist ID
 * @param batchSize Number of tracks per request (max 100)
 * @param onProgress Optional progress callback
 * @returns Array of all playlist tracks
 */
export async function getAllPlaylistTracks(playlistId: string, batchSize: number = 100, onProgress?: (loaded: number, total: number) => void) {
  const spotify = await initializeSpotify();
  if (!spotify) throw new Error("Not authenticated with Spotify");

  const firstPage = await spotify.playlists.getPlaylistItems(playlistId, undefined, undefined, 1, 0);
  const total = firstPage.total ?? 0;
  if (total === 0) return [];

  const allItems = [];
  const actualBatchSize = Math.min(batchSize, 100);
  const batchCount = Math.ceil(total / actualBatchSize);

  for (let i = 0; i < batchCount; i++) {
    const offset = i * actualBatchSize;
    const page = await spotify.playlists.getPlaylistItems(
      playlistId,
      undefined,
      undefined,
      actualBatchSize as any,
      offset
    );
    allItems.push(...page.items);

    if (onProgress) onProgress(allItems.length, total);
  }

  return allItems;
}

/**
 * Get all tracks in an album, handling pagination
 * @param albumId Spotify album ID
 * @param batchSize Number of tracks per request (max 50)
 * @param onProgress Optional progress callback
 * @returns Array of all album tracks
 */
export async function getAllAlbumTracks(albumId: string, batchSize: number = 50, onProgress?: (loaded: number, total: number) => void) {
  const spotify = await initializeSpotify();
  if (!spotify) throw new Error("Not authenticated with Spotify");

  const firstPage = await spotify.albums.tracks(albumId, undefined, 1, 0);
  const total = firstPage.total ?? 0;
  if (total === 0) return [];

  const allItems = [];
  const actualBatchSize = Math.min(batchSize, 50);
  const batchCount = Math.ceil(total / actualBatchSize);

  for (let i = 0; i < batchCount; i++) {
    const offset = i * actualBatchSize;
    const page = await spotify.albums.tracks(
      albumId,
      undefined,
      actualBatchSize as any,
      offset
    );
    allItems.push(...page.items);

    if (onProgress) onProgress(allItems.length, total);
  }

  return allItems;
}

/**
 * Reset the Spotify API instance
 * This should be called when the user logs out or when the token is refreshed
 */
export function resetSpotifyApi() {
  spotifyApiInstance = null;
}
