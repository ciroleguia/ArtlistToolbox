# Artlist Toolbox

<p align="center">
  <img src="icons/icon128.png" width="100" height="100" alt="Artlist Toolbox icon">
</p>

<p align="center">
  Library tools for Artlist.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-blue.svg" alt="Manifest V3">
  <img src="https://img.shields.io/badge/Version-0.6.0-brightgreen.svg" alt="Version 0.6.0">
  <img src="https://img.shields.io/badge/License-MIT-orange.svg" alt="License MIT">
</p>

Artlist Toolbox is a Manifest V3 extension for [Artlist](https://artlist.io). It adds library tools to the music pages and a flow that searches YouTube for a track (in backend) and opens the y2mate.gs MP3 converter with the selected video.

It's just a tool I made to optimize my daily workflow at my video editing job, and I share it to you all if it can help you as it does for me. :)

The download flow is off by default. The page tools and the download flow are separate. Compact rows, the promo banner switch, copying track details, CSV export, and processed-track dimming work with the flow disabled. Actions that open the converter, the result picker, or the queue need the flow enabled.

## Requirements

I only tested it on my Brave browser (Chr. v155), should work in others Chromium-based browsers tho.
The extension runs from source and has no runtime dependencies.

## Install

1. Download the repository as a ZIP, or clone it:
   ```bash
   git clone https://github.com/ciroleguia/ArtlistToolbox.git
   ```
2. Open `chrome://extensions`. In Brave, use `brave://extensions`. In Edge, use `edge://extensions`.
3. Turn on Developer mode.
4. Click Load unpacked and select the folder that contains `manifest.json`.
5. Open [Artlist](https://artlist.io/royalty-free-music). If the site was already open, refresh the tab.

## Use

Open the extension popup from the toolbar to see the main settings, then there's a gear icon opens the extended settings page too.

### Page tools

Keyboard shortcuts are on by default. You can turn them off in Settings, Page and library.

- `c` copies the track under the cursor as `Artist - Title (m:ss)`.
- `/` focuses the library search field.
- Compact rows reduce the vertical padding of music rows and the sound effects table.
- Hide promo banner removes the promotional hero from library pages. It leaves the navigation bar and the track list in place.
- Processed tracks can be dimmed from the stored history.
- The right-click menu can copy the current track details or export the visible tracks to CSV on Artlist pages.
- CSV export uses the columns Title, Artist, Duration, Artlist URL, and YouTube URL. The extension fills the YouTube column from match memory or the processed history when it knows the video. The popup button is hidden until you enable it in Settings, Advanced. The context-menu export is always available.
- The popup shows the total download count and a 14-day breakdown.

### Download flow

Turn on `Enable Downloader` in the popup or in Settings. Pick one of three modes:

| Mode | What happens |
|---|---|
| Auto | The extension checks match memory, searches YouTube when needed, scores the results, and opens the converter if the best match clears the threshold. The duration veto can send the track to the picker instead. |
| Ask me | The picker shows up to five results with thumbnail, channel, duration, and score. The extension saves the video you choose to match memory. |
| Search only | The extension opens the YouTube search page and stops there. It does not open the converter. |

The match threshold sets the minimum score for an automatic pick. The default is 42%, and the popup slider covers 30% to 75%. Duration veto compares the Artlist track length with the YouTube video and opens the picker when the difference exceeds the tolerance, which is 15 seconds by default. You can change both values in Settings.

Match memory stores up to 500 title and artist pairs. In Auto mode, a remembered track opens the converter without another search. The picker marks the video you used before.

These actions work while the flow is on:

- `d` starts the download action for the row under the cursor.
- `q` starts queue mode. Click rows to select them, press Process, and the queue processes each track through the Auto flow. If a track has no confident match or fails the duration check, it opens the YouTube search instead. The final message reports how many tracks opened in the converter, went to search, or failed. You can stop the queue from the floating bar.
- If a track is already in the processed history, the download action shows a warning.
- Alt+click forces the picker for one track.
- Shift+click opens only the YouTube search for that track.
- Ctrl+click or Cmd+click copies the resolved YouTube URL without opening a tab.
- The download button shows a tooltip with the detected title and artist.

Open in background applies to all three modes. The page still opens, but the browser does not focus the new tab. The `d` and `q` shortcuts also follow the keyboard shortcuts setting, which is on by default.

### Settings

Open the settings page with the gear icon in the popup, or from the extension entry in `chrome://extensions`.

| Section | What it controls |
|---|---|
| Download flow | Master switch, default mode, match threshold, background opening, duration veto, and tolerance. |
| Keywords | Penalized and preferred search terms, one per line, with buttons to restore the defaults. |
| Match memory | The memory switch and the list of remembered videos, with individual and bulk delete. |
| Processed history | Tracks that already went through the flow, with individual and bulk delete. |
| Page and library | Promo banner, compact rows, processed dimming, and keyboard shortcuts. |
| Advanced | The optional CSV button in the popup. |
| Modifier clicks and menus | A reference for the modifier clicks and the context-menu actions. |
| Stats | Download total, the 14-day breakdown, and a reset button. |
| Config | JSON export and import, recent-downloads CSV export, and restoring the default settings. |
| Diagnostics | Version, storage usage, counters, and a copy-to-clipboard report. |

### Permissions and data

| Permission | Why the extension needs it |
|---|---|
| `tabs` | Opens the YouTube and y2mate tabs, and sends messages to Artlist tabs. |
| `storage` | Keeps settings, match memory, processed history, recent downloads, and stats in `chrome.storage.local`. |
| `contextMenus` | Adds the copy and CSV actions to the right-click menu. |
| `https://artlist.io/*`, `https://*.artlist.io/*` | Reads track details and applies the page tools. |
| `https://www.youtube.com/*`, `https://youtube.com/*` | Requests YouTube search pages to score video candidates. |
| `https://y2mate.gs/*` | Opens the converter page for the selected video. |

The extension keeps its data in `chrome.storage.local`. It has no account system, analytics, or project-owned server. When you use the download flow, your browser requests YouTube search pages and opens y2mate.gs. Those sites receive normal request data under their own terms and privacy policies. The project does not control y2mate.gs.

## Development

Node.js 20 or newer is required for the repository scripts. The extension itself has no runtime dependencies.

```bash
npm test      # Unit tests for matching, toolbox helpers, and YouTube parsing
npm run check # Syntax checks and manifest file validation
npm run zip   # Builds dist/ArtlistMusicDownloader-v<version>.zip
```

GitHub Actions runs `npm run check` and `npm test` on pushes to `main` and on pull requests. A pushed `v*` tag runs the release workflow, builds the zip, and attaches it to a GitHub Release.

## Contributing

Open an issue for a bug or a feature request. Pull requests should pass `npm test` and `npm run check`, and they should stay focused on one change. Describe the behavior before and after the change.

If this project looks useful to you, a ⭐ would mean a lot and it helps others discover it too. :)

If you want to sponsor my projects for creatives, [contact me](mailto:ciroaleguia@gmail.com).

## Changelog

Release notes live in [CHANGELOG.md](CHANGELOG.md).

## License

MIT. See [LICENSE](LICENSE).

## Disclaimer

Artlist Toolbox is not affiliated with Artlist, YouTube, or y2mate. The extension does not host, convert, or download audio itself. It opens pages from those services. You are responsible for following their terms and for holding the rights to any track you download. Use it only with content you are allowed to use.

## Author

Ciro Leguía. GitHub: [@ciroleguia](https://github.com/ciroleguia).
