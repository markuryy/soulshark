import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { SpotifyApi } from "@spotify/web-api-ts-sdk";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { openUrl } from "@tauri-apps/plugin-opener";

// Define types
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

interface SpotifyAuthProps {
  onAuthSuccess?: () => void;
}

export default function SpotifyAuth({ onAuthSuccess }: SpotifyAuthProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [spotifySettings, setSpotifySettings] = useState<SpotifySettings>({
    client_id: "",
    redirect_uri: "",
  });
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  // Load settings and check authentication status on mount
  useEffect(() => {
    loadSettings();
    loadCredentials();
    
    // Cleanup function to stop the server when the component is unmounted
    return () => {
      invoke("stop_spotify_callback_server").catch(e => {
        console.error("Failed to stop callback server on unmount:", e);
      });
    };
  }, []);
  
  // Poll for authentication status after initiating auth flow
  useEffect(() => {
    let interval: number | null = null;
    
    if (isAuthenticating) {
      // Check every 2 seconds if authentication was successful
      interval = window.setInterval(async () => {
        try {
          // Check for authentication directly from the backend
          const creds = await invoke<Credentials>("get_credentials");
          
          // If we have credentials, authentication was successful
          if (creds?.spotify_access_token) {
            // Update local state
            setCredentials(creds);
            setIsAuthenticating(false);
            clearInterval(interval!);
            
            // Force a reload of credentials to ensure UI updates
            await loadCredentials();
            
            toast.success("Successfully connected to Spotify!");
            
            // Call the success callback if provided
            if (onAuthSuccess) {
              onAuthSuccess();
            }
          }
        } catch (error) {
          console.error("Failed to check authentication status:", error);
        }
      }, 2000);
    }
    
    return () => {
      if (interval !== null) {
        clearInterval(interval);
      }
    };
  }, [isAuthenticating, onAuthSuccess]);

  // Check if we have valid tokens
  useEffect(() => {
    if (credentials) {
      const hasTokens = !!credentials.spotify_access_token && !!credentials.spotify_refresh_token;
      const isExpired = credentials.spotify_token_expires_at 
        ? credentials.spotify_token_expires_at * 1000 < Date.now() 
        : true;
      
      console.log('Auth check:', { 
        hasTokens, 
        isExpired, 
        expires_at: credentials.spotify_token_expires_at,
        now: Date.now(),
        access_token: !!credentials.spotify_access_token,
        refresh_token: !!credentials.spotify_refresh_token
      });
      
      setIsAuthenticated(hasTokens && !isExpired);
    }
  }, [credentials]);

  // Load Spotify settings
  const loadSettings = async () => {
    try {
      const result = await invoke<{ spotify: SpotifySettings }>("get_settings");
      setSpotifySettings(result.spotify);
    } catch (error) {
      console.error("Failed to load Spotify settings:", error);
      toast.error("Failed to load Spotify settings");
    }
  };

  // Load credentials
  const loadCredentials = async () => {
    try {
      const creds = await invoke<Credentials>("get_credentials");
      setCredentials(creds);
    } catch (error) {
      console.error("Failed to load credentials:", error);
      toast.error("Failed to load credentials");
    }
  };

  // Save Spotify tokens to credentials store
  const saveTokens = async (
    accessToken: string,
    refreshToken: string,
    expiresAt: number
  ) => {
    if (!credentials) return;

    try {
      await invoke("save_credentials", {
        credentials: {
          ...credentials,
          spotify_access_token: accessToken,
          spotify_refresh_token: refreshToken,
          spotify_token_expires_at: expiresAt,
        },
      });
      
      // Reload credentials to verify they were saved
      await loadCredentials();
      
      toast.success("Spotify authentication successful");
      
      // Call the success callback if provided
      if (onAuthSuccess) {
        onAuthSuccess();
      }
    } catch (error) {
      console.error("Failed to save Spotify tokens:", error);
      toast.error("Failed to save Spotify tokens");
    }
  };

  // Generate a code verifier for PKCE
  const generateCodeVerifier = (length: number) => {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  };

  // Generate a code challenge from the verifier
  const generateCodeChallenge = async (codeVerifier: string) => {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  };

  // Initiate Spotify authentication
  const authenticateWithSpotify = async () => {
    setIsAuthenticating(true);

    try {
      // Validate settings
      if (!spotifySettings.client_id) {
        throw new Error("Spotify Client ID is required");
      }

      // Start the callback server
      await invoke("start_spotify_callback_server");
      
      // Use localhost:5174/callback as the redirect URI
      const redirectUri = "http://localhost:5174/callback";

      // Generate PKCE code verifier and challenge
      const verifier = generateCodeVerifier(128);
      const challenge = await generateCodeChallenge(verifier);
      
      // Store the verifier in Tauri's store for later use
      const store = await load("spotify-auth.json");
      await store.set("code_verifier", verifier);
      await store.save();
      
      // Build the authorization URL
      const params = new URLSearchParams();
      params.append("client_id", spotifySettings.client_id);
      params.append("response_type", "code");
      params.append("redirect_uri", redirectUri);
      params.append("scope", "user-read-private user-read-email playlist-read-private user-library-read");
      params.append("code_challenge_method", "S256");
      params.append("code_challenge", challenge);
      
      const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
      
      // Open the authorization URL in the system browser
      await openUrl(authUrl);
      
      // Show a message to the user
      toast.info("Please complete authentication in your browser. The app will automatically process the callback.");
      
    } catch (error) {
      console.error("Spotify authentication failed:", error);
      toast.error(`Spotify authentication failed: ${error instanceof Error ? error.message : String(error)}`);
      
      // Stop the server if authentication fails
      try {
        await invoke("stop_spotify_callback_server");
      } catch (e) {
        console.error("Failed to stop callback server:", e);
      }
      
      // Only set isAuthenticating to false if there was an error
      setIsAuthenticating(false);
    }
  };

  // Check if authentication was successful
  const checkAuthStatus = async () => {
    try {
      // Check if there's a pending auth
      const hasPendingAuth = await invoke<boolean>("check_pending_auth");
      
      // Reload credentials
      await loadCredentials();
      
      if (credentials?.spotify_access_token) {
        toast.success("Successfully connected to Spotify!");
        if (onAuthSuccess) {
          onAuthSuccess();
        }
      } else if (hasPendingAuth) {
        toast.info("Authentication in progress. Please complete the process in your browser.");
      } else {
        toast.error("Not connected to Spotify. Please try authenticating again.");
      }
    } catch (error) {
      console.error("Failed to check authentication status:", error);
      toast.error("Failed to check authentication status");
    }
  };

  // Logout from Spotify
  const logoutFromSpotify = async () => {
    if (!credentials) return;

    try {
      // Stop the callback server
      await invoke("stop_spotify_callback_server");
      
      await invoke("save_credentials", {
        credentials: {
          ...credentials,
          spotify_access_token: null,
          spotify_refresh_token: null,
          spotify_token_expires_at: null,
        },
      });
      
      // Reload credentials
      await loadCredentials();
      setIsAuthenticated(false);
      toast.success("Disconnected from Spotify");
    } catch (error) {
      console.error("Failed to logout from Spotify:", error);
      toast.error("Failed to disconnect from Spotify");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col space-y-4">
        {isAuthenticated ? (
          <div className="flex flex-col space-y-4">
            <div className="flex items-center gap-2 font-medium">
              <span className="text-muted-foreground">✓</span> Connected to Spotify
            </div>
            <Button 
              variant="outline" 
              onClick={logoutFromSpotify}
            >
              Disconnect from Spotify
            </Button>
          </div>
        ) : (
          <div className="flex flex-col space-y-4">
            <div className="flex items-center gap-2 font-medium">
              <span className="text-muted-foreground">⚠</span> Not connected to Spotify
            </div>
            <Button 
              onClick={authenticateWithSpotify} 
              disabled={isAuthenticating || !spotifySettings.client_id}
              className="mb-2"
            >
              {isAuthenticating ? "Connecting..." : "Connect to Spotify"}
            </Button>
            {!spotifySettings.client_id && (
              <p className="text-sm text-muted-foreground">
                Please set your Spotify Client ID in the settings first
              </p>
            )}
          </div>
        )}
        
      </div>
    </div>
  );
}
