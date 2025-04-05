use crate::{Credentials, SettingsState};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_store::StoreExt;
use tiny_http::{Response, Server};
use url::Url;

// Shared state for the HTTP server
struct ServerState {
    app_handle: AppHandle,
    is_running: bool,
}

// Global server state
static SERVER_STATE: once_cell::sync::Lazy<Arc<Mutex<Option<Arc<Mutex<ServerState>>>>>> =
    once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(None)));

// HTML response for successful authentication
const SUCCESS_HTML: &str = r#"<!DOCTYPE html>
<html>
<head>
    <title>Spotify Authentication Successful</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 50px;
            background-color: #f5f5f5;
        }
        .container {
            background-color: white;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            max-width: 500px;
            margin: 0 auto;
        }
        h1 {
            color: #1DB954;
        }
        p {
            margin: 20px 0;
            color: #333;
        }
        .success-icon {
            font-size: 48px;
            color: #1DB954;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon">✓</div>
        <h1>Authentication Successful</h1>
        <p>You have successfully authenticated with Spotify.</p>
        <p>You can now close this window and return to the application.</p>
    </div>
</body>
</html>"#;

// HTML response for authentication error
const ERROR_HTML: &str = r#"<!DOCTYPE html>
<html>
<head>
    <title>Spotify Authentication Error</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 50px;
            background-color: #f5f5f5;
        }
        .container {
            background-color: white;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            max-width: 500px;
            margin: 0 auto;
        }
        h1 {
            color: #e74c3c;
        }
        p {
            margin: 20px 0;
            color: #333;
        }
        .error-icon {
            font-size: 48px;
            color: #e74c3c;
            margin-bottom: 20px;
        }
        .error-message {
            background-color: #f9e9e8;
            padding: 10px;
            border-radius: 5px;
            color: #e74c3c;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="error-icon">✗</div>
        <h1>Authentication Error</h1>
        <p>There was an error authenticating with Spotify.</p>
        <div class="error-message">ERROR_MESSAGE</div>
        <p>Please close this window and try again in the application.</p>
    </div>
</body>
</html>"#;

#[derive(Debug, Serialize, Deserialize)]
struct TokenResponse {
    access_token: String,
    token_type: String,
    expires_in: u64,
    refresh_token: String,
    scope: String,
}

/// Exchange the authorization code for an access token
#[tauri::command]
pub async fn exchange_spotify_code(
    app_handle: AppHandle,
    code: String,
    code_verifier: String,
    state: State<'_, SettingsState>,
) -> Result<(), String> {
    // Get the app settings (not used but needed for validation)
    let _settings = crate::commands::settings::get_settings(state.clone())
        .await
        .map_err(|e| format!("Failed to get settings: {}", e))?;

    // Get the current credentials
    let credentials = crate::commands::settings::get_credentials(app_handle.clone())
        .await
        .map_err(|e| format!("Failed to get credentials: {}", e))?;

    // Build the token request
    let client = Client::new();

    // Get the client secret
    let client_secret = match &credentials.spotify_client_secret {
        Some(secret) if !secret.is_empty() => secret.as_str(),
        _ => return Err("Spotify client secret is not set".to_string()),
    };

    // Get the app settings again to use in the params
    let settings = crate::commands::settings::get_settings(state.clone())
        .await
        .map_err(|e| format!("Failed to get settings: {}", e))?;

    let params = [
        ("client_id", settings.spotify.client_id.as_str()),
        ("client_secret", client_secret),
        ("grant_type", "authorization_code"),
        ("code", code.as_str()),
        ("redirect_uri", "http://localhost:5174/callback"),
        ("code_verifier", code_verifier.as_str()),
    ];

    // Send the token request
    let response = client
        .post("https://accounts.spotify.com/api/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to send token request: {}", e))?;

    // Check if the request was successful
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Token request failed: {}", error_text));
    }

    // Parse the response
    let token_response: TokenResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    // Calculate the expiration time
    let expires_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        + token_response.expires_in;

    // Update the credentials
    let updated_credentials = Credentials {
        soulseek_password: credentials.soulseek_password,
        spotify_client_secret: credentials.spotify_client_secret,
        spotify_access_token: Some(token_response.access_token),
        spotify_refresh_token: Some(token_response.refresh_token),
        spotify_token_expires_at: Some(expires_at),
    };

    // Save the updated credentials
    crate::commands::settings::save_credentials(app_handle, updated_credentials)
        .await
        .map_err(|e| format!("Failed to save credentials: {}", e))?;

    Ok(())
}

/// Check for pending authorization code and exchange it for an access token
#[tauri::command]
pub async fn check_pending_auth(
    app_handle: AppHandle,
    state: State<'_, SettingsState>,
) -> Result<bool, String> {
    // Try to load the store
    let store = app_handle
        .store("spotify-auth.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    // Check if we have a code verifier
    let code_verifier = match store.get("code_verifier") {
        Some(verifier) => verifier.as_str().unwrap_or("").to_string(),
        None => return Ok(false), // No pending auth
    };

    if code_verifier.is_empty() {
        return Ok(false); // No valid verifier
    }

    // Get the app settings (not used but needed for validation)
    let _settings = crate::commands::settings::get_settings(state.clone())
        .await
        .map_err(|e| format!("Failed to get settings: {}", e))?;

    // Get the current credentials
    let credentials = crate::commands::settings::get_credentials(app_handle.clone())
        .await
        .map_err(|e| format!("Failed to get credentials: {}", e))?;

    // Check if we already have valid tokens
    if credentials.spotify_access_token.is_some() && credentials.spotify_refresh_token.is_some() {
        // We already have tokens, so we don't need to exchange the code
        // Clear the code verifier
        let _ = store.delete("code_verifier");
        let _ = store.save();

        return Ok(true);
    }

    // We don't have tokens, so we need to prompt the user to complete the auth flow
    Ok(false)
}

/// Start the HTTP server for Spotify callback
#[tauri::command]
pub fn start_spotify_callback_server(app_handle: AppHandle) -> Result<(), String> {
    // Create a server on localhost:5174
    let server = match Server::http("127.0.0.1:5174") {
        Ok(server) => server,
        Err(e) => return Err(format!("Failed to start server: {}", e)),
    };

    // Create shared state
    let server_state = Arc::new(Mutex::new(ServerState {
        app_handle: app_handle.clone(),
        is_running: true,
    }));

    // Store the server state in the global variable
    {
        let mut global_state = SERVER_STATE.lock().unwrap();
        *global_state = Some(server_state.clone());
    }

    // Clone for the thread
    let server_arc = Arc::new(server);
    let state_clone = server_state.clone();

    // Start the server in a separate thread
    thread::spawn(move || {
        println!("Spotify callback server started on http://localhost:5174");

        for request in server_arc.incoming_requests() {
            // Check if we should stop the server
            {
                let state = state_clone.lock().unwrap();
                if !state.is_running {
                    break;
                }
            }

            // Only handle GET requests to /callback
            if request.method().as_str() != "GET" || !request.url().starts_with("/callback") {
                let response = Response::from_string("Not Found").with_status_code(404);
                let _ = request.respond(response);
                continue;
            }

            // Parse the URL to get the query parameters
            let url_string = format!("http://localhost:5174{}", request.url());
            let url = match Url::parse(&url_string) {
                Ok(url) => url,
                Err(e) => {
                    let error_html =
                        ERROR_HTML.replace("ERROR_MESSAGE", &format!("Invalid URL: {}", e));
                    let response = Response::from_string(error_html)
                        .with_status_code(400)
                        .with_header(
                            tiny_http::Header::from_bytes(
                                &b"Content-Type"[..],
                                &b"text/html; charset=utf-8"[..],
                            )
                            .unwrap(),
                        );
                    let _ = request.respond(response);
                    continue;
                }
            };

            // Extract the code parameter
            let params: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();

            // Check if there's an error
            if let Some(error) = params.get("error") {
                let error_html =
                    ERROR_HTML.replace("ERROR_MESSAGE", &format!("Spotify error: {}", error));
                let response = Response::from_string(error_html)
                    .with_status_code(400)
                    .with_header(
                        tiny_http::Header::from_bytes(
                            &b"Content-Type"[..],
                            &b"text/html; charset=utf-8"[..],
                        )
                        .unwrap(),
                    );
                let _ = request.respond(response);
                continue;
            }

            // Check if we have a code
            let code = match params.get("code") {
                Some(code) => code.clone(),
                None => {
                    let error_html = ERROR_HTML.replace(
                        "ERROR_MESSAGE",
                        "No authorization code found in the callback URL",
                    );
                    let response = Response::from_string(error_html)
                        .with_status_code(400)
                        .with_header(
                            tiny_http::Header::from_bytes(
                                &b"Content-Type"[..],
                                &b"text/html; charset=utf-8"[..],
                            )
                            .unwrap(),
                        );
                    let _ = request.respond(response);
                    continue;
                }
            };

            // Get the app handle from the state
            let app_handle = {
                let state = state_clone.lock().unwrap();
                state.app_handle.clone()
            };

            // Get the code verifier from the store
            let store = match app_handle.store("spotify-auth.json") {
                Ok(store) => store,
                Err(e) => {
                    let error_html = ERROR_HTML
                        .replace("ERROR_MESSAGE", &format!("Failed to load store: {}", e));
                    let response = Response::from_string(error_html)
                        .with_status_code(500)
                        .with_header(
                            tiny_http::Header::from_bytes(
                                &b"Content-Type"[..],
                                &b"text/html; charset=utf-8"[..],
                            )
                            .unwrap(),
                        );
                    let _ = request.respond(response);
                    continue;
                }
            };

            // Get the code verifier
            let code_verifier = match store.get("code_verifier") {
                Some(verifier) => match verifier.as_str() {
                    Some(v) => v.to_string(),
                    None => {
                        let error_html =
                            ERROR_HTML.replace("ERROR_MESSAGE", "Invalid code verifier format");
                        let response = Response::from_string(error_html)
                            .with_status_code(500)
                            .with_header(
                                tiny_http::Header::from_bytes(
                                    &b"Content-Type"[..],
                                    &b"text/html; charset=utf-8"[..],
                                )
                                .unwrap(),
                            );
                        let _ = request.respond(response);
                        continue;
                    }
                },
                None => {
                    let error_html = ERROR_HTML.replace(
                        "ERROR_MESSAGE",
                        "No code verifier found. Please try authenticating again.",
                    );
                    let response = Response::from_string(error_html)
                        .with_status_code(400)
                        .with_header(
                            tiny_http::Header::from_bytes(
                                &b"Content-Type"[..],
                                &b"text/html; charset=utf-8"[..],
                            )
                            .unwrap(),
                        );
                    let _ = request.respond(response);
                    continue;
                }
            };

            // Clear the code verifier from the store
            let _ = store.delete("code_verifier");
            let _ = store.save();

            // Exchange the code for tokens using our helper function
            let result =
                exchange_code_blocking(app_handle.clone(), code.clone(), code_verifier.clone());

            // Send the response
            let response = match result {
                Ok(_) => Response::from_string(SUCCESS_HTML).with_header(
                    tiny_http::Header::from_bytes(
                        &b"Content-Type"[..],
                        &b"text/html; charset=utf-8"[..],
                    )
                    .unwrap(),
                ),
                Err(e) => {
                    let error_html = ERROR_HTML
                        .replace("ERROR_MESSAGE", &format!("Failed to exchange code: {}", e));
                    Response::from_string(error_html)
                        .with_status_code(500)
                        .with_header(
                            tiny_http::Header::from_bytes(
                                &b"Content-Type"[..],
                                &b"text/html; charset=utf-8"[..],
                            )
                            .unwrap(),
                        )
                }
            };

            let _ = request.respond(response);
        }

        println!("Spotify callback server stopped");
    });

    Ok(())
}

// Helper function to exchange the code for tokens in a blocking way
fn exchange_code_blocking(
    app_handle: AppHandle,
    code: String,
    code_verifier: String,
) -> Result<(), String> {
    // Create a new runtime for this thread
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();

    // Run the async code in the runtime
    rt.block_on(async {
        // Get the settings state
        let settings_state = app_handle.state::<SettingsState>();

        // Get the app settings
        let settings = match crate::commands::settings::get_settings(settings_state.clone()).await {
            Ok(s) => s,
            Err(e) => return Err(format!("Failed to get settings: {}", e)),
        };

        // Get the current credentials
        let credentials = match crate::commands::settings::get_credentials(app_handle.clone()).await
        {
            Ok(c) => c,
            Err(e) => return Err(format!("Failed to get credentials: {}", e)),
        };

        // Build the token request
        let client = Client::new();

        // Get the client secret
        let client_secret = match &credentials.spotify_client_secret {
            Some(secret) if !secret.is_empty() => secret.as_str(),
            _ => return Err("Spotify client secret is not set".to_string()),
        };

        let params = [
            ("client_id", settings.spotify.client_id.as_str()),
            ("client_secret", client_secret),
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", "http://localhost:5174/callback"),
            ("code_verifier", code_verifier.as_str()),
        ];

        // Send the token request
        let response = match client
            .post("https://accounts.spotify.com/api/token")
            .form(&params)
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => return Err(format!("Failed to send token request: {}", e)),
        };

        // Check if the request was successful
        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Token request failed: {}", error_text));
        }

        // Parse the response
        let token_response: TokenResponse = match response.json().await {
            Ok(t) => t,
            Err(e) => return Err(format!("Failed to parse token response: {}", e)),
        };

        // Calculate the expiration time
        let expires_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + token_response.expires_in;

        // Update the credentials
        let updated_credentials = Credentials {
            soulseek_password: credentials.soulseek_password,
            spotify_client_secret: credentials.spotify_client_secret,
            spotify_access_token: Some(token_response.access_token),
            spotify_refresh_token: Some(token_response.refresh_token),
            spotify_token_expires_at: Some(expires_at),
        };

        // Save the updated credentials
        match crate::commands::settings::save_credentials(app_handle, updated_credentials).await {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("Failed to save credentials: {}", e)),
        }
    })
}

/// Stop the Spotify callback server
#[tauri::command]
pub fn stop_spotify_callback_server() -> Result<(), String> {
    // Get the server state
    let mut guard = SERVER_STATE.lock().unwrap();

    // If the server is running, stop it
    if let Some(state_arc) = guard.take() {
        // Set the is_running flag to false
        let mut state = state_arc.lock().unwrap();
        state.is_running = false;

        println!("Spotify callback server stopping...");
    }

    Ok(())
}

/// Refresh the Spotify access token
#[tauri::command]
pub async fn refresh_spotify_token(
    app_handle: AppHandle,
    state: State<'_, SettingsState>,
) -> Result<(), String> {
    // Get the app settings
    let settings = crate::commands::settings::get_settings(state.clone())
        .await
        .map_err(|e| format!("Failed to get settings: {}", e))?;

    // Get the current credentials
    let credentials = crate::commands::settings::get_credentials(app_handle.clone())
        .await
        .map_err(|e| format!("Failed to get credentials: {}", e))?;

    // Check if we have a refresh token
    let refresh_token = match credentials.spotify_refresh_token {
        Some(token) => token,
        None => return Err("No refresh token available".to_string()),
    };

    // Build the token request
    let client = Client::new();

    // Get the client secret
    let client_secret = match &credentials.spotify_client_secret {
        Some(secret) if !secret.is_empty() => secret.as_str(),
        _ => return Err("Spotify client secret is not set".to_string()),
    };

    let params = [
        ("client_id", settings.spotify.client_id.as_str()),
        ("client_secret", client_secret),
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token.as_str()),
    ];

    // Send the token request
    let response = client
        .post("https://accounts.spotify.com/api/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to send token request: {}", e))?;

    // Check if the request was successful
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Token request failed: {}", error_text));
    }

    // Parse the response
    let token_response: TokenResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    // Calculate the expiration time
    let expires_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        + token_response.expires_in;

    // Update the credentials
    let updated_credentials = Credentials {
        soulseek_password: credentials.soulseek_password,
        spotify_client_secret: credentials.spotify_client_secret,
        spotify_access_token: Some(token_response.access_token),
        spotify_refresh_token: Some(token_response.refresh_token),
        spotify_token_expires_at: Some(expires_at),
    };

    // Save the updated credentials
    crate::commands::settings::save_credentials(app_handle, updated_credentials)
        .await
        .map_err(|e| format!("Failed to save credentials: {}", e))?;

    Ok(())
}
