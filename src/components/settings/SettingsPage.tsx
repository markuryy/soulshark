import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Store, load } from "@tauri-apps/plugin-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Define types for our settings
interface SoulseekSettings {
  username: string;
  downloads_path: string;
  remove_special_chars: boolean;
  preferred_format: string;
}

interface SpotifySettings {
  client_id: string;
  redirect_uri: string;
}

interface OutputSettings {
  m3u_path: string;
  name_format: string;
}

interface AppSettings {
  soulseek: SoulseekSettings;
  spotify: SpotifySettings;
  output: OutputSettings;
}

interface Credentials {
  soulseek_password: string | null;
  spotify_client_secret: string | null;
}

export default function SettingsPage() {
  // State for settings and credentials
  const [settings, setSettings] = useState<AppSettings>({
    soulseek: {
      username: "",
      downloads_path: "",
      remove_special_chars: true,
      preferred_format: "flac",
    },
    spotify: {
      client_id: "",
      redirect_uri: "http://localhost:9871/callback",
    },
    output: {
      m3u_path: "playlists/",
      name_format: "{albumartist|artist}/{album} ({year})/{track}. {title}",
    },
  });

  const [credentials, setCredentials] = useState<Credentials>({
    soulseek_password: null,
    spotify_client_secret: null,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [loadError, setLoadError] = useState("");

  // Load settings and credentials on component mount
  useEffect(() => {
    loadSettings();
    loadCredentials();
  }, []);

  // Load settings from backend
  const loadSettings = async () => {
    try {
      console.log("Fetching settings from backend...");
      
      // Try to load settings from the store directly
      try {
        const store = await load("settings.json");
        
        if (await store.has("app_settings")) {
          const appSettings = await store.get("app_settings") as AppSettings;
          console.log("Loaded settings from store:", appSettings);
          setSettings(appSettings);
          setLoadError("");
          return;
        } else {
          console.log("No settings found in store, falling back to command");
        }
      } catch (storeError) {
        console.error("Failed to load from store, falling back to command:", storeError);
      }
      
      // Fall back to command
      const appSettings = await invoke<AppSettings>("get_settings");
      console.log("Received settings from command:", appSettings);
      setSettings(appSettings);
      setLoadError("");
    } catch (error) {
      console.error("Failed to load settings:", error);
      setLoadError(`Failed to load settings: ${error}`);
    }
  };

  // Load credentials from backend
  const loadCredentials = async () => {
    try {
      console.log("Fetching credentials from backend...");
      const creds = await invoke<Credentials>("get_credentials");
      console.log("Received credentials:", creds ? "Found" : "Not found");
      setCredentials(creds);
    } catch (error) {
      console.error("Failed to load credentials:", error);
      setLoadError(prev => prev + `\nFailed to load credentials: ${error}`);
    }
  };

  // Save settings to backend
  const saveSettings = async () => {
    setIsSaving(true);
    setSaveMessage("");
    setLoadError("");

    try {
      console.log("Saving settings to backend:", settings);
      
      // Try to save settings to the store directly
      try {
        const store = await load("settings.json");
        await store.set("app_settings", settings);
        await store.save();
        console.log("Saved settings to store directly");
      } catch (storeError) {
        console.error("Failed to save to store directly:", storeError);
      }
      
      // Also save using the command for backend state
      await invoke("save_settings", { settings });
      
      console.log("Saving credentials to backend");
      // Save credentials to backend state
      await invoke("save_credentials", { 
        credentials: {
          soulseek_password: credentials.soulseek_password,
          spotify_client_secret: credentials.spotify_client_secret,
        } 
      });
      
      setSaveMessage("Settings saved successfully!");
      
      // Reload settings to verify they were saved correctly
      await loadSettings();
      await loadCredentials();
    } catch (error) {
      console.error("Failed to save settings:", error);
      setSaveMessage("Failed to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // Update settings state
  const updateSettings = (
    section: keyof AppSettings,
    field: string,
    value: any
  ) => {
    setSettings((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
  };

  // Update credentials state
  const updateCredentials = (field: keyof Credentials, value: string | null) => {
    setCredentials((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>

      <Tabs defaultValue="soulseek" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="soulseek">Soulseek</TabsTrigger>
          <TabsTrigger value="spotify">Spotify</TabsTrigger>
          <TabsTrigger value="output">Output</TabsTrigger>
        </TabsList>

        {/* Soulseek Settings */}
        <TabsContent value="soulseek">
          <Card>
            <CardHeader>
              <CardTitle>Soulseek Settings</CardTitle>
              <CardDescription>
                Configure your Soulseek account and download preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="soulseek-username">Username</Label>
                  <Input
                    id="soulseek-username"
                    value={settings.soulseek.username}
                    onChange={(e) =>
                      updateSettings("soulseek", "username", e.target.value)
                    }
                    placeholder="Your Soulseek username"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="soulseek-password">Password</Label>
                  <Input
                    id="soulseek-password"
                    type="password"
                    value={credentials.soulseek_password || ""}
                    onChange={(e) =>
                      updateCredentials("soulseek_password", e.target.value)
                    }
                    placeholder="Your Soulseek password"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="downloads-path">Downloads Path</Label>
                  <Input
                    id="downloads-path"
                    value={settings.soulseek.downloads_path}
                    onChange={(e) =>
                      updateSettings("soulseek", "downloads_path", e.target.value)
                    }
                    placeholder="/path/to/downloads"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="preferred-format">Preferred Format</Label>
                  <Input
                    id="preferred-format"
                    value={settings.soulseek.preferred_format}
                    onChange={(e) =>
                      updateSettings("soulseek", "preferred_format", e.target.value)
                    }
                    placeholder="flac, mp3, etc."
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="remove-special-chars"
                    checked={settings.soulseek.remove_special_chars}
                    onCheckedChange={(checked) =>
                      updateSettings(
                        "soulseek",
                        "remove_special_chars",
                        checked
                      )
                    }
                  />
                  <Label htmlFor="remove-special-chars">
                    Remove special characters from filenames
                  </Label>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Spotify Settings */}
        <TabsContent value="spotify">
          <Card>
            <CardHeader>
              <CardTitle>Spotify Settings</CardTitle>
              <CardDescription>
                Configure your Spotify API credentials
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="spotify-client-id">Client ID</Label>
                  <Input
                    id="spotify-client-id"
                    value={settings.spotify.client_id}
                    onChange={(e) =>
                      updateSettings("spotify", "client_id", e.target.value)
                    }
                    placeholder="Your Spotify Client ID"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="spotify-client-secret">Client Secret</Label>
                  <Input
                    id="spotify-client-secret"
                    type="password"
                    value={credentials.spotify_client_secret || ""}
                    onChange={(e) =>
                      updateCredentials("spotify_client_secret", e.target.value)
                    }
                    placeholder="Your Spotify Client Secret"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="spotify-redirect-uri">Redirect URI</Label>
                  <Input
                    id="spotify-redirect-uri"
                    value={settings.spotify.redirect_uri}
                    onChange={(e) =>
                      updateSettings("spotify", "redirect_uri", e.target.value)
                    }
                    placeholder="http://localhost:9871/callback"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Output Settings */}
        <TabsContent value="output">
          <Card>
            <CardHeader>
              <CardTitle>Output Settings</CardTitle>
              <CardDescription>
                Configure output file naming and organization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="m3u-path">M3U Playlist Path</Label>
                  <Input
                    id="m3u-path"
                    value={settings.output.m3u_path}
                    onChange={(e) =>
                      updateSettings("output", "m3u_path", e.target.value)
                    }
                    placeholder="playlists/"
                  />
                  <p className="text-sm text-gray-500">
                    Set to 'none' to disable M3U playlist creation
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name-format">Name Format</Label>
                  <Input
                    id="name-format"
                    value={settings.output.name_format}
                    onChange={(e) =>
                      updateSettings("output", "name_format", e.target.value)
                    }
                    placeholder="{albumartist|artist}/{album} ({year})/{track}. {title}"
                  />
                  <p className="text-sm text-gray-500">
                    Format for organizing downloaded files
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="mt-6 flex justify-end">
        <Button onClick={saveSettings} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Settings"}
        </Button>
      </div>

      {saveMessage && (
        <p className="mt-4 text-center text-green-500">{saveMessage}</p>
      )}
      
      {loadError && (
        <p className="mt-4 text-center text-red-500">{loadError}</p>
      )}
      
      <div className="mt-4 text-center">
        <Button 
          variant="outline" 
          onClick={() => {
            loadSettings();
            loadCredentials();
          }}
          className="mx-auto"
        >
          Reload Settings
        </Button>
      </div>
    </div>
  );
}
