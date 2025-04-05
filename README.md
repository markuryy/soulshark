# SoulShark

SoulShark is a desktop application built with Tauri, React, and TypeScript that allows you to download music from Soulseek based on your Spotify playlists.

## Features

- **Settings Management**: Configure Soulseek and Spotify credentials
- **Secure Storage**: Sensitive credentials are stored securely using Tauri's Stronghold plugin
- **Persistent Settings**: Non-sensitive settings are stored using Tauri's Store plugin
- **Modern UI**: Built with React, TypeScript, and Tailwind CSS

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or later)
- [Rust](https://www.rust-lang.org/) (v1.77.2 or later)
- [Bun](https://bun.sh/) (v1.0 or later)
- [Tauri CLI](https://tauri.app/v1/guides/getting-started/prerequisites)

### Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   bun install
   ```
3. Run the development server:
   ```bash
   bun run tauri dev
   ```

### Building

To build the application for production:

```bash
bun run tauri build
```

## Architecture

### Frontend

- **React**: UI library
- **TypeScript**: Type-safe JavaScript
- **Tailwind CSS**: Utility-first CSS framework
- **shadcn/ui**: UI component library

### Backend

- **Tauri**: Framework for building desktop applications
- **Rust**: Systems programming language
- **Tauri Store Plugin**: For storing non-sensitive settings
- **Tauri Stronghold Plugin**: For securely storing sensitive credentials

## Settings

The application uses two types of storage for settings:

1. **Tauri Store Plugin**: For non-sensitive settings like UI preferences, download paths, etc.
2. **Tauri Stronghold Plugin**: For sensitive credentials like passwords and API keys

### Settings Structure

```typescript
interface AppSettings {
  soulseek: {
    username: string;
    downloads_path: string;
    remove_special_chars: boolean;
    preferred_format: string;
  };
  spotify: {
    client_id: string;
    redirect_uri: string;
  };
  output: {
    m3u_path: string;
    name_format: string;
  };
}

interface Credentials {
  soulseek_password: string | null;
  spotify_client_secret: string | null;
}
```

## License

MIT
