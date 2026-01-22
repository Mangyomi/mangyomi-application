# Mangyomi 📖

A Tachiyomi-style manga reader desktop application built with Electron and React.

## Disclaimer

Mangyomi is a **manga reading application** that provides a platform for browsing and reading manga through third-party extensions.

### Important Notice

- **No Content Hosting**: Mangyomi does not host, store, or distribute any manga content. All content is fetched directly from third-party websites through user-installed extensions.
- **Extension Responsibility**: Extensions are developed independently and are not bundled with the core application. Users choose which extensions to install.
- **User Responsibility**: Users are responsible for ensuring their use of this application complies with local laws and the terms of service of the content sources they access.
- **Educational Purpose**: This project is provided for educational and personal use. The developers do not condone or encourage piracy.

### Copyright

If you are a copyright holder and believe content accessible through third-party extensions infringes your rights, please contact the respective website operators directly.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY. See the [LICENSE](LICENSE) file for details.

![Mangyomi Screenshot](./docs/manga_library.png)

**[📸 View Full Showcase](./SHOWCASE.md)**

## Features

- 📚 **Library Management** - Organize your manga collection with tags and categories
- 🔍 **Browse Sources** - Search and discover manga from multiple sources via extensions
- 📖 **Chapter Reader** - Smooth reading experience with vertical scroll and page modes
- 📜 **Reading History** - Track your reading progress with lazy loading for large histories
- 📉 **Tracking** - Automatically sync reading progress with AniList
- 🎮 **Discord RPC** - Show your current reading activity on Discord with rich presence
- 📥 **Downloads** - Download chapters for offline reading
- 🏷️ **Tags** - Organize manga with custom colored tags
- 🔌 **Extension System** - Install extensions directly from GitHub repositories
- 📦 **Tachiyomi Import** - Restore your library from Tachiyomi/Mihon backup files
- ⚡ **Virtualized UI** - Smooth performance for large libraries and histories
- ⚙️ **Settings** - Customize theme, reading preferences, and privacy options
- 🚀 **Smart Prefetching** - Progressive streaming downloads images as URLs are discovered

## Installing Extensions

Mangyomi supports installing extensions directly from GitHub:

1. Go to **Extensions** in the sidebar
2. Enter a GitHub repository URL (e.g., `github.com/username/mangyomi-extensions`)
3. Click **Browse** to see available extensions
4. Click **Install** on any extension you want
5. Toggle extensions on/off or uninstall as needed

### Extension Repository Format

Extension repositories should contain folders, each with:
- `manifest.json` - Extension metadata
- `index.js` - Extension implementation

```
my-extensions-repo/
├── extension-one/
│   ├── manifest.json
│   └── index.js
├── extension-two/
│   ├── manifest.json
│   └── index.js
```

## 🎮 Discord Rich Presence

Mangyomi integrates with Discord to display your reading status:

- **Rich Details**: Shows Manga title, current chapter, and source extension.
- **Privacy Controls**:
  - **Hide NSFW**: Option to automatically hide status when reading NSFW content.
  - **Strict Mode**: Treat all content from NSFW-tagged extensions as sensitive.
  - **Incognito**: Toggle RPC on/off globally.
- **Interactive**: Buttons to view the manga on AniList or viewing the project on GitHub.

![Discord RPC](./docs/manga_settings_discord.png)

## 📉 Tracking (AniList)

Sync your reading progress automatically:

- **Two-way Sync**: Updates your AniList profile as you read.
- **Status Updates**: Automatically changes status to "Reading" or "Completed".
- **Score Tracking**: Update your score directly from the app (Work in Progress).

![AniList Tracking](./docs/manga_anilist_tracking.png)

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Development

```bash
git clone https://github.com/Mangyomi/mangyomi-app.git
cd mangyomi
npm install
npm run dev
```

### Building

```bash
npm run electron:build
```

## Extension Development

### manifest.json

```json
{
  "id": "your-extension",
  "name": "Your Extension",
  "version": "1.0.0",
  "baseUrl": "https://example.com",
  "language": "en",
  "nsfw": false
}
```

### Extension API

```javascript
module.exports = {
  getImageHeaders() {
    return { 'Referer': 'https://example.com/' };
  },

  async getPopularManga(page) {
    return { manga: [...], hasNextPage: true };
  },

  async getLatestManga(page) {
    return { manga: [...], hasNextPage: true };
  },

  async searchManga(query, page) {
    return { manga: [...], hasNextPage: true };
  },

  async getMangaDetails(mangaId) {
    return { id, title, coverUrl, author, description, status, genres };
  },

  async getChapterList(mangaId) {
    return [{ id, title, chapterNumber, url }];
  },

  async getChapterPages(chapterId) {
    return ['https://...'];
  },

  // Optional: Streaming API for progressive page loading
  async getChapterPagesStreaming(chapterId) {
    // Fetch pages in batches and send progressively
    const pages = [];
    for (let batch = 0; batch < totalBatches; batch++) {
      // Check if user cancelled (e.g., left the reader)
      if (isStreamingCancelled()) {
        console.log('Streaming cancelled by user');
        return pages;
      }
      
      const batchPages = await fetchBatch(batch);
      pages.push(...batchPages);
      
      // Send progress to UI (pages load as they're discovered)
      sendStreamingPages(pages, false); // false = not done yet
    }
    
    sendStreamingPages(pages, true); // true = done
    return pages;
  }
};
```

### Available Global Functions

Extensions have access to these globals in the sandbox:

| Function | Description |
|----------|-------------|
| `browserFetch(url)` | Fetch with browser cookies (for sites requiring auth) |
| `serverFetch(url, options)` | Standard fetch (faster, no cookies) |
| `sendStreamingPages(pages, done)` | Send page URLs progressively to the reader |
| `isStreamingCancelled()` | Check if user left reader (stop background fetching) |

## Tech Stack

### Main Application
- **Electron** - Desktop framework
- **React 18** - UI library with TypeScript
- **Vite** - Build tool
- **SQLite** - Local database (better-sqlite3)
- **Zustand** - State management

### Installer
- **Tauri** - Lightweight Rust-based installer (~12MB vs ~330MB Electron)
- **7-Zip SFX** - Self-extracting portable package
- **React** - Installer UI

## License

GNU General Public License v3.0

## Acknowledgments

- Inspired by [Tachiyomi](https://tachiyomi.org/)
- Built with [Electron](https://www.electronjs.org/) and [React](https://reactjs.org/)

