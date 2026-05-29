# 雪球备份 (Xueqiu Backup)

Desktop app for scraping and browsing xueqiu.com stock forum posts. Scrapes timeline, articles, and nested comments into a local SQLite database with a native macOS/Windows viewer.

## Features

- **Timeline scraping** — fetch all original posts from a user's timeline with rate limiting
- **Full article extraction** — retrieve complete article text from xueqiu post pages
- **Nested comments** — fetch all comments including recursive child comments
- **Local SQLite storage** — posts and comments stored in WAL-mode SQLite, portable and queryable
- **Incremental refresh** — refresh individual post data (likes, comments) without re-scraping
- **Search** — filter posts by title or content
- **Native desktop app** — built with Tauri v2, fast startup, no terminal window
- **Cross-platform** — macOS `.app` + `.dmg`, Windows `.msi`

## Prerequisites

- [Rust](https://rustup.rs) 1.77+
- [Node.js](https://nodejs.org) 18+
- macOS: Xcode Command Line Tools (`xcode-select --install`)
- Windows: Microsoft Visual Studio C++ Build Tools

## Quick Start

```bash
# Install dependencies
npm install

# Development mode (hot reload)
npm run dev

# Production build
npm run build
```

Build outputs:
- macOS: `src-tauri/target/release/bundle/macos/雪球备份.app` and `.dmg`
- Windows: `src-tauri/target/release/bundle/msi/雪球备份_*.msi`

## Usage

### Setting up your cookie

1. Open the app, click the gear icon (⚙) in the sidebar header
2. Log in to [xueqiu.com](https://xueqiu.com) in your browser
3. Open DevTools → Application → Cookies, copy the `xq_a_token` cookie value
4. Paste it in the settings panel as `xq_a_token=your_value_here`
5. Enter your user ID (the numeric ID from your xueqiu profile URL)

### Scraping new posts

Click the download button (↓) in the sidebar header. The app will:
1. Fetch the user's timeline (all original posts)
2. For each post, fetch the article body and all comments
3. Store everything in SQLite

A progress bar shows the current status. Rate limiting (2–5s between posts) prevents IP bans.

### Browsing posts

- Left sidebar: scroll through posts, click to select
- Search box: filter posts by title or description
- Right panel: article text with comments tree
- Refresh button: re-fetch latest data for a single post (likes, comments, etc.)

## Project Structure

```
xueqiu/
├── index.html              # Frontend entry point (Vite)
├── app.js                  # Frontend logic (Tauri IPC)
├── vite.config.js          # Vite bundler config
├── package.json            # Node dependencies & scripts
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── main.rs         # App entry point
│   │   ├── lib.rs          # Tauri setup & command registration
│   │   ├── db.rs           # SQLite database layer
│   │   ├── scraper.rs      # Xueqiu HTTP scraper
│   │   └── commands.rs     # Tauri IPC commands
│   ├── Cargo.toml          # Rust dependencies
│   ├── tauri.conf.json     # Tauri configuration
│   └── capabilities/       # Permission definitions
└── dist/                   # Vite build output (gitignored)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri v2 |
| Backend | Rust (rusqlite, reqwest, tokio) |
| Frontend | Vanilla JS + Vite |
| Database | SQLite (WAL mode) |
| Packaging | Tauri bundler (`.app`, `.dmg`, `.msi`) |

## Data Storage

The database is stored at:
- **macOS**: `~/Library/Application Support/雪球备份/xueqiu_viewer.db`
- **Windows**: `%APPDATA%/雪球备份/xueqiu_viewer.db`

Cookie and user ID are stored in the `settings` table within the database.

## License

MIT
