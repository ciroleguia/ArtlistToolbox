import {
  buildFingerprint,
  buildSearchQuery,
  cleanText,
  durationMismatch,
  normalizeTrack,
  pickBestMatch,
  scoreCandidates
} from "./lib/matcher.js";
import {
  buildY2mateUrl,
  buildYoutubeSearchUrl,
  extractVideoCandidates,
  isValidVideoId
} from "./lib/youtube.js";
import { DEFAULT_SETTINGS, MEMORY_LIMIT, PROCESSED_LIMIT, RECENT_LIMIT, STATS_DAYS } from "./lib/defaults.js";
import { buildCsv, formatDurationLabel } from "./lib/csv.js";

const SEARCH_ATTEMPTS = 2;
const RETRY_DELAY_MS = 500;
const CANDIDATE_LIMIT = 5;
const CSV_COLUMNS = ["Title", "Artist", "Duration", "Artlist URL", "YouTube URL"];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "artlist-toolbox-copy-track",
      title: "Copy track info",
      contexts: ["page"],
      documentUrlPatterns: ["https://artlist.io/*", "https://*.artlist.io/*"]
    });
    chrome.contextMenus.create({
      id: "artlist-toolbox-export-csv",
      title: "Export visible tracks (CSV)",
      contexts: ["page"],
      documentUrlPatterns: ["https://artlist.io/*", "https://*.artlist.io/*"]
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) {
    return;
  }

  const type =
    info.menuItemId === "artlist-toolbox-copy-track"
      ? "ARTLIST_CONTEXT_COPY"
      : "ARTLIST_EXPORT_CSV";

  chrome.tabs.sendMessage(tab.id, { type }).catch(() => {
    // The tab may not be an Artlist page anymore (or the script is not ready).
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message?.type) {
    case "ARTLIST_DOWNLOAD_TRACK":
      handleTrackDownload(message.payload, message.options)
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((error) => {
          console.error("[Artlist Toolbox]", error);
          sendResponse({
            ok: false,
            error: error?.message || "No se pudo buscar la cancion en YouTube."
          });
        });
      return true;

    case "ARTLIST_OPEN_Y2MATE":
      handleOpenY2mate(message.payload)
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((error) => {
          console.error("[Artlist Toolbox]", error);
          sendResponse({
            ok: false,
            error: error?.message || "No se pudo abrir el conversor."
          });
        });
      return true;

    case "ARTLIST_CHECK_PROCESSED":
      handleCheckProcessed(message.payload)
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch(() => sendResponse({ ok: false }));
      return true;

    case "ARTLIST_BUILD_CSV":
      handleBuildCsv(message.payload)
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((error) => sendResponse({ ok: false, error: error?.message }));
      return true;

    default:
      return false;
  }
});

async function handleTrackDownload(rawTrack, options = {}) {
  const track = normalizeTrack(rawTrack);
  if (!track.title && !track.artist) {
    throw new Error("No pude detectar el nombre de la cancion ni el artista.");
  }

  const settings = await getSettings();
  if (!settings.enabled) {
    throw new Error("El flujo de descarga esta desactivado en el panel.");
  }

  const mode = options.override || settings.flowMode;
  const openInBackgroundTab = settings.openInBackground || Boolean(options.forceBackground);
  const searchUrl = buildYoutubeSearchUrl(buildSearchQuery(track));
  const fingerprint = settings.memoryEnabled ? buildFingerprint(track) : "";

  // ---- Copy-link mode (Cmd/Ctrl + click): resolve but never open tabs ----
  if (options.copyOnly) {
    const remembered = fingerprint ? await getMemoryEntry(fingerprint) : null;
    if (remembered?.videoId) {
      return { mode: "copied", url: buildYoutubeWatchUrl(remembered.videoId), title: remembered.title };
    }

    if (mode === "search") {
      return { mode: "copied", url: searchUrl, kind: "search" };
    }

    const candidates = await searchYouTube(track);
    const ranked = scoreCandidates(track, candidates, scoringOptions(settings));
    if (!ranked.length) {
      return { mode: "copied", url: searchUrl, kind: "search" };
    }

    const target =
      mode === "ask"
        ? ranked[0]
        : pickBestMatch(track, candidates, settings.minScore, scoringOptions(settings)) || ranked[0];
    return {
      mode: "copied",
      url: buildYoutubeWatchUrl(target.videoId),
      title: target.title,
      score: target.score
    };
  }

  // ---- Memory shortcut: trusted video from a previous choice ----
  if (fingerprint && mode === "auto" && (!options.override || options.override === "auto")) {
    const remembered = await getMemoryEntry(fingerprint);
    if (remembered?.videoId && isValidVideoId(remembered.videoId)) {
      await openTab(buildY2mateUrl(remembered.videoId), openInBackgroundTab);
      await recordDownload({ track, video: remembered, fingerprint, remembered: true });
      return { mode: "auto", remembered: true, video: remembered };
    }
  }

  if (mode === "search") {
    await openTab(searchUrl, openInBackgroundTab);
    return { mode: "search" };
  }

  const candidates = await searchYouTube(track);
  const ranked = scoreCandidates(track, candidates, scoringOptions(settings));
  const memoryVideoId = fingerprint ? (await getMemoryEntry(fingerprint))?.videoId || null : null;

  if (mode === "ask") {
    if (!ranked.length) {
      await openTab(searchUrl, openInBackgroundTab);
      throw new Error(
        "No encontre resultados. Abri la busqueda de YouTube para revisar manualmente."
      );
    }
    return {
      mode: "ask",
      searchUrl,
      memoryVideoId,
      candidates: ranked.slice(0, CANDIDATE_LIMIT).map(toPublicCandidate)
    };
  }

  const bestMatch = pickBestMatch(track, candidates, settings.minScore, scoringOptions(settings));

  if (!bestMatch) {
    await openTab(searchUrl, openInBackgroundTab);
    if (options.queueMode) {
      return { mode: "search", reason: "no-match" };
    }
    throw new Error(
      "No encontre un video suficientemente parecido. Abri la busqueda de YouTube para revisar manualmente."
    );
  }

  // ---- Duration veto: force manual pick when durations disagree ----
  if (settings.durationVeto && durationMismatch(track, bestMatch, settings.durationTolerance)) {
    if (options.queueMode) {
      await openTab(searchUrl, openInBackgroundTab);
      return { mode: "search", reason: "duration-veto" };
    }
    return {
      mode: "ask",
      veto: true,
      searchUrl,
      memoryVideoId,
      candidates: ranked.slice(0, CANDIDATE_LIMIT).map(toPublicCandidate)
    };
  }

  await openTab(buildY2mateUrl(bestMatch.videoId), openInBackgroundTab);
  await recordDownload({ track, video: bestMatch, fingerprint });
  return { mode: "auto", video: bestMatch };
}

async function handleOpenY2mate(payload = {}) {
  const videoId = String(payload.videoId || "");
  if (!isValidVideoId(videoId)) {
    throw new Error("El video seleccionado no es valido.");
  }

  const settings = await getSettings();
  if (!settings.enabled) {
    throw new Error("El flujo de descarga esta desactivado en el panel.");
  }

  await openTab(buildY2mateUrl(videoId), settings.openInBackground);

  const track = payload.track
    ? normalizeTrack(payload.track)
    : normalizeTrack({ title: payload.title, artist: payload.artist });
  const video = {
    videoId,
    title: cleanText(payload.title) || track.title,
    artist: cleanText(payload.artist) || track.artist
  };

  await recordDownload({
    track,
    video,
    fingerprint: settings.memoryEnabled ? buildFingerprint(track) : ""
  });

  return { videoId };
}

async function handleCheckProcessed(payload = {}) {
  const tracks = Array.isArray(payload.tracks) ? payload.tracks.slice(0, 200) : [];
  const { processed } = await chrome.storage.local.get({ processed: {} });

  const results = tracks.map((track) => {
    const fingerprint = buildFingerprint(track);
    const entry = fingerprint ? processed[fingerprint] : null;
    return entry ? { processed: true, at: entry.at || 0 } : { processed: false };
  });

  return { results };
}

async function handleBuildCsv(payload = {}) {
  const tracks = Array.isArray(payload.tracks) ? payload.tracks.slice(0, 500) : [];
  const { processed, matchMemory } = await chrome.storage.local.get({
    processed: {},
    matchMemory: {}
  });

  const rows = tracks.map((track) => {
    const fingerprint = buildFingerprint(track);
    const stored = fingerprint
      ? processed[fingerprint]?.videoId || matchMemory[fingerprint]?.videoId
      : "";
    const videoId = isValidVideoId(stored) ? stored : "";
    return [
      cleanText(track.title),
      cleanText(track.artist),
      formatDurationLabel(track.duration),
      String(track.url || ""),
      videoId ? buildYoutubeWatchUrl(videoId) : ""
    ];
  });

  return { csv: buildCsv(CSV_COLUMNS, rows), count: rows.length };
}

async function getSettings() {
  const items = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const flowMode = items.flowMode || (items.searchOnly ? "search" : "auto");

  // One-time migration from the old boolean toggle.
  if (items.flowMode !== flowMode) {
    await chrome.storage.local.set({ flowMode, searchOnly: false });
  }

  const minScore = Number(items.minScore);
  const tolerance = Number(items.durationTolerance);

  return {
    enabled: Boolean(items.enabled),
    flowMode,
    openInBackground: Boolean(items.openInBackground),
    minScore:
      Number.isFinite(minScore) && minScore > 0 ? minScore : DEFAULT_SETTINGS.minScore,
    durationVeto: items.durationVeto !== false,
    durationTolerance: Number.isFinite(tolerance) && tolerance > 0 ? tolerance : DEFAULT_SETTINGS.durationTolerance,
    negativeTerms: Array.isArray(items.negativeTerms) ? items.negativeTerms : null,
    preferredTerms: Array.isArray(items.preferredTerms) ? items.preferredTerms : null,
    memoryEnabled: items.memoryEnabled !== false
  };
}

function scoringOptions(settings) {
  return {
    negativeTerms: settings.negativeTerms,
    preferredTerms: settings.preferredTerms
  };
}

async function searchYouTube(track) {
  const url = buildYoutubeSearchUrl(buildSearchQuery(track));
  let lastError = new Error("No se pudo buscar en YouTube.");

  for (let attempt = 1; attempt <= SEARCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        credentials: "omit",
        headers: {
          "Accept-Language": "en-US,en;q=0.9"
        }
      });

      if (!response.ok) {
        throw new Error(`YouTube respondio con HTTP ${response.status}.`);
      }

      const html = await response.text();
      const candidates = extractVideoCandidates(html);
      if (candidates.length) {
        return candidates.slice(0, 20);
      }

      lastError = new Error("YouTube no devolvio resultados para esta busqueda.");
    } catch (error) {
      lastError = error;
    }

    if (attempt < SEARCH_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS);
    }
  }

  throw lastError;
}

// Stores recent history, processed history, stats and (when enabled) the
// match memory entry for this track.
async function recordDownload({ track, video, fingerprint, remembered = false }) {
  const settings = await getSettings();
  const { recent, processed, stats } = await chrome.storage.local.get({
    recent: [],
    processed: {},
    stats: { total: 0, daily: {} }
  });

  const videoId = video?.videoId;
  if (isValidVideoId(videoId)) {
    const nextEntry = {
      videoId,
      title: cleanText(video.title) || cleanText(track.title),
      artist: cleanText(video.artist) || cleanText(track.artist),
      at: Date.now()
    };

    const nextRecent = [nextEntry, ...recent.filter((item) => item?.videoId !== videoId)].slice(
      0,
      RECENT_LIMIT
    );
    await chrome.storage.local.set({ recent: nextRecent });
  }

  if (fingerprint) {
    const title = cleanText(track.title) || cleanText(video?.title);
    const artist = cleanText(track.artist) || cleanText(video?.artist);
    const now = Date.now();

    const nextProcessed = {
      ...processed,
      [fingerprint]: {
        title,
        artist,
        videoId: isValidVideoId(videoId) ? videoId : processed[fingerprint]?.videoId || "",
        at: now,
        count: (processed[fingerprint]?.count || 0) + 1
      }
    };
    await chrome.storage.local.set({ processed: pruneProcessed(nextProcessed) });

    if (settings.memoryEnabled && isValidVideoId(videoId)) {
      const { matchMemory } = await chrome.storage.local.get({ matchMemory: {} });
      const nextMemory = {
        ...matchMemory,
        [fingerprint]: {
          videoId,
          title,
          artist,
          at: now,
          remembered: Boolean(remembered) || Boolean(matchMemory[fingerprint])
        }
      };
      await chrome.storage.local.set({ matchMemory: pruneMemory(nextMemory) });
    }
  }

  await chrome.storage.local.set({
    stats: {
      total: (Number(stats.total) || 0) + 1,
      daily: bumpDailyStats(stats.daily)
    }
  });
}

async function getMemoryEntry(fingerprint) {
  if (!fingerprint) {
    return null;
  }
  const { matchMemory } = await chrome.storage.local.get({ matchMemory: {} });
  const entry = matchMemory[fingerprint];
  if (!entry || !isValidVideoId(entry.videoId)) {
    return null;
  }
  return entry;
}

function pruneProcessed(processed) {
  const entries = Object.entries(processed).sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0));
  return Object.fromEntries(entries.slice(0, PROCESSED_LIMIT));
}

function pruneMemory(matchMemory) {
  const entries = Object.entries(matchMemory).sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0));
  return Object.fromEntries(entries.slice(0, MEMORY_LIMIT));
}

function bumpDailyStats(daily = {}) {
  const today = localDateKey(new Date());
  const next = { ...daily, [today]: (Number(daily[today]) || 0) + 1 };

  // Keep only the last STATS_DAYS days.
  const cutoff = localDateKey(new Date(Date.now() - (STATS_DAYS - 1) * 86400000));
  return Object.fromEntries(Object.entries(next).filter(([date]) => date >= cutoff));
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildYoutubeWatchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function toPublicCandidate(candidate) {
  return {
    videoId: candidate.videoId,
    title: candidate.title,
    artist: candidate.artist,
    duration: candidate.duration,
    lengthText: candidate.lengthText,
    thumbnail: candidate.thumbnail,
    url: candidate.url,
    score: candidate.score
  };
}

function openTab(url, background = false) {
  return chrome.tabs.create({ url, active: !background });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
