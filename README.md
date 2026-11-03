# Artlist Toolbox

<p align="center">
  <img src="icons/icon128.png" width="100" height="100" alt="Artlist Toolbox icon">
</p>

<p align="center">
  Library tools for Artlist.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-blue.svg" alt="Manifest V3">
  <img src="https://img.shields.io/badge/Version-0.8.0-brightgreen.svg" alt="Version 0.8.0">
  <img src="https://img.shields.io/badge/License-MIT-orange.svg" alt="License MIT">
</p>

Artlist Toolbox is a bilingual (English / Español) Manifest V3 extension for [Artlist](https://artlist.io). It adds video-editor library tools to **Music**, **Sound Effects (SFX)**, and standalone **track detail pages** — including 5-star track rankings with project tags and notes, a Chrome **Side Panel** view, and an optional flow that searches YouTube for a track (prioritizing official `"Artist - Topic"` uploads) and opens a configurable MP3 converter with the selected video.

It's a tool I made to optimize my daily workflow at my video editing job, and I share it with everyone in case it helps you too. :)

The download flow ships disabled by default. Page tools and the download flow are completely independent: compact rows, promo banner removal, copying track details, CSV export, processed-track dimming, track rankings, tags/notes, Focus favorites, and the Side Panel all work with the download flow off.

## Requirements

Tested on Chromium-based browsers (Chrome, Brave, Edge) with Manifest V3 and Side Panel support.
The extension runs directly from source with zero runtime dependencies and no bundler.

## Install

1. Download the repository as a ZIP, or clone it:
   ```bash
   git clone https://github.com/ciroleguia/ArtlistToolbox.git
   ```
2. Open `chrome://extensions` (`brave://extensions` in Brave, `edge://extensions` in Edge).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the folder that contains `manifest.json`.
5. Open [Artlist](https://artlist.io/royalty-free-music). If the site was already open, refresh the tab.

## Use

Open the extension popup from the toolbar to access quick switches. From the header icons you can open **Rankings in the Chrome Side Panel**, the full **Rankings tab**, or the extended **Settings** page.

### Page tools (Music, SFX & Detail Pages)

Keyboard shortcuts are on by default and can be toggled in **Settings → Page & library**.

- `c` copies the track under the cursor (or current detail-page track) as `Artist - Title (m:ss)`.
- `/` focuses the library search field.
- `1`–`5` rates the track under the cursor; `0` clears the rating.
- `t` opens the inline **Tags & Note** editor on the hovered row (so you can tag tracks like `intro`, `client-acme`, `sfx-hit` or add cue notes like `drop at 1:14`).
- `f` toggles **Focus favorites**, dimming rows below your star threshold and showing a floating status pill in the bottom-right corner where you can switch between `4+ ★` and `5 ★` or exit.
- **Compact rows** reduces vertical padding on both Music rows and Sound Effects (`AudioRow`) tables.
- **Hide promo banner** removes the large promotional hero on library pages before first paint while keeping navigation intact.
- **Dim processed rows** subtly fades tracks you already ran through the download flow (4–5★ favorites stay bright).
- **Right-click context menu** lets you copy track details, export visible Music/SFX tracks to CSV, or open the **Rankings Side Panel**.
- **CSV export** outputs `Title`, `Artist`, `Kind`, `Duration`, `Artlist URL`, `YouTube URL`, `Rating`, `Tags`, and `Note` (with spreadsheet formula-injection protection).

### Track rankings, tags, notes & Side Panel

Hover any Music or SFX row and press `1`–`5` to rate it (`0` to clear), or click the floating star HUD under the hovered row. Click `✎` (or press `t`) to attach comma-separated tags and a note. Ratings are keyed by normalized title and artist, so the same track keeps its stars, tags, and note across library lists, search results, and detail pages.

- Rated rows display a warm accent bar and a compact badge (`★★★★★ · intro, reel`).
- Open **Rankings** either in a full tab or docked in Chrome's **Side Panel** right alongside Artlist while you browse.
- Filter rankings by text (title, artist, tag, or note), star rating, tag dropdown / clickable `#tag` chips, and type (`All`, `Music`, `SFX`).
- Export rankings as CSV or JSON, and import/merge rankings JSON directly from the Rankings view.

### Download flow

Turn on **Enable Downloader** in the popup or Settings and choose one of three modes:

| Mode | What happens |
|---|---|
| **Auto** | Checks match memory, searches YouTube when needed, boosts official `"Artist - Topic"` and verified artist uploads, and opens your converter URL if the best candidate clears the match threshold and duration veto. |
| **Ask me** | Opens an accessible top-layer popover picker showing up to 5 candidates with `1`–`5` keyboard shortcuts, arrow-key navigation, `Topic` / `Used before` badges, thumbnail, duration, match score, and a `↗` button to preview on YouTube before converting. Your pick is saved to match memory. |
| **Search only** | Opens the YouTube search results page and stops there. |

While the download flow is enabled:

- `d` runs the download flow for the hovered row (or active detail page).
- `q` toggles **Queue mode**: click multiple rows to queue them, then click **Process** to batch-run them through the Auto flow with progress and a stop button.
- `Alt` + click always opens the candidate picker for that track.
- `Shift` + click opens only the YouTube search for that track.
- `Ctrl`/`Cmd` + click resolves and copies the YouTube URL to your clipboard without opening a tab.
- **Converter URL template**: defaults to `https://y2mate.gs/#{videoId}/mp3`, and can be customized in **Settings → Download flow** using `{videoId}`, `{youtubeUrl}` (URL-encoded), or `{rawYoutubeUrl}` (`http://` and `https://` only).

### Localization (English & Español)

Artlist Toolbox supports **English** and **Español** out of the box across the popup, Settings, Rankings / Side Panel, context menus, errors, and in-page overlays. By default (`Auto`), it follows your browser UI language; you can override it anytime in **Settings → Page & library → Language**.

### Settings & Full Backup

| Section | What it controls |
|---|---|
| **Download flow** | Master switch, default mode, match threshold, background tab opening, duration veto/tolerance, and custom Converter URL template. |
| **Keywords** | Penalized and preferred whole-word terms, one per line, with one-click default reset. |
| **Match memory** | Toggle and inspect up to 500 remembered track → YouTube video mappings. |
| **Processed history** | View and manage up to 1,000 processed tracks. |
| **Page & library** | Language (`Auto`, `English`, `Español`), promo banner switch, compact rows, processed dimming, and keyboard shortcuts. |
| **Track rankings** | Enable/disable rankings, inspect top rated tracks, open the Rankings tab or Side Panel, and clear all rankings. |
| **Advanced** | Optional CSV export button inside the toolbar popup. |
| **Stats** | Total downloads, 14-day daily breakdown, and reset. |
| **Backup & Config** | Full JSON backup export (settings + rankings + tags/notes + match memory + processed history + stats), settings-only JSON export, Merge-or-Replace JSON import (backward-compatible with v0.7.0 config files), recent downloads CSV export, and default settings restore. |
| **Diagnostics** | Extension version, active locale, `chrome.storage.local` byte usage, item counts, and copy-to-clipboard summary. |

### Permissions and data

| Permission | Why the extension needs it |
|---|---|
| `storage` | Stores settings, rankings (stars, tags, notes), match memory, processed history, recent downloads, and stats locally in `chrome.storage.local`. |
| `contextMenus` | Adds Copy track info, Export visible tracks (CSV), and Open Rankings side panel to Artlist's right-click menu. |
| `sidePanel` | Lets you dock the Rankings & Notes workspace beside Artlist in Chrome's Side Panel. |
| `https://artlist.io/*`, `https://*.artlist.io/*` | Reads visible track metadata and renders in-page library tools on Artlist pages. |
| `https://www.youtube.com/*`, `https://youtube.com/*` | Fetches YouTube search results in the background service worker when the download flow is used. |

All data stays local in `chrome.storage.local` — no account system, telemetry, analytics, or external project server.

## Development

Node.js 20 or newer is required for the repository test and packaging scripts. The extension itself has zero runtime dependencies.

```bash
npm test      # Unit tests for matching, rankings, YouTube parsing, DOM extraction, backup, CSV, and i18n
npm run check # Syntax checks across all scripts and Manifest V3 validation
npm run zip   # Builds dist/ArtlistToolbox-v<version>.zip
```

## Contributing

Open an issue for a bug or a feature request. Pull requests should pass `npm test` and `npm run check`, and stay focused on a clear change.

If this project is useful to you, a ⭐ means a lot and helps other editors discover it! :)
If you want to sponsor my projects for creatives, [contact me](mailto:ciroaleguia@gmail.com).

## License

MIT. See [LICENSE](LICENSE).

## Disclaimer

Artlist Toolbox is not affiliated with Artlist, YouTube, or y2mate. The extension does not host, convert, or download audio itself; it opens pages from third-party services configured by the user. You are responsible for following their terms and holding the appropriate rights or license for any media you use.

## Author

Ciro Leguía — GitHub: [@ciroleguia](https://github.com/ciroleguia)
