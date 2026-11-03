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
  buildConverterUrl,
  buildWatchUrl,
  buildYoutubeSearchUrl,
  extractVideoCandidates,
  isValidConverterTemplate,
  isValidVideoId
} from "./lib/youtube.js";
import {
  DEFAULT_CONVERTER_TEMPLATE,
  DEFAULT_SETTINGS,
  MEMORY_LIMIT,
  PROCESSED_LIMIT,
  RECENT_LIMIT,
  STATS_DAYS
} from "./lib/defaults.js";
import { buildCsv, formatDurationLabel } from "./lib/csv.js";
import {
  buildRankingEntry,
  cleanNote,
  countRankings,
  normalizeKind,
  normalizeRating,
  normalizeTags
} from "./lib/rankings.js";
import { parseImportPayload } from "./lib/backup.js";
import { resolveLanguage, t } from "./lib/i18n.js";
import { createSerialQueue } from "./lib/storage-queue.js";

const SEARCH_ATTEMPTS = 2;
const RETRY_DELAY_MS = 500;
const CANDIDATE_LIMIT = 5;
const CSV_COLUMNS = [
  "Title",
  "Artist",
  "Kind",
  "Duration",
  "Artlist URL",
  "YouTube URL",
  "Rating",
  "Tags",
  "Note"
];
const ARTLIST_URL_PATTERNS = ["https://artlist.io/*", "https://*.artlist.io/*"];

const storageQueue = createSerialQueue();
const menuQueue = createSerialQueue();

chrome.runtime.onInstalled.addListener(() => {
  void refreshContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  void refreshContextMenus();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.language) {
    void refreshContextMenus();
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "artlist-toolbox-open-sidepanel") {
    if (tab?.windowId !== undefined && chrome.sidePanel?.open) {
      // Invoke sidePanel.open synchronously in the click listener before awaiting.
      const openPromise = chrome.sidePanel.open({ windowId: tab.windowId });
      void (async () => {
        try {
          await openPromise;
        } catch (_error) {
          await chrome.tabs.create({ url: chrome.runtime.getURL("rankings/rankings.html") });
        }
      })();
      return;
    }
    void chrome.tabs.create({ url: chrome.runtime.getURL("rankings/rankings.html") });
    return;
  }

  if (!tab?.id) {
    return;
  }

  const type =
    info.menuItemId === "artlist-toolbox-copy-track"
      ? "ARTLIST_CONTEXT_COPY"
      : "ARTLIST_EXPORT_CSV";

  void sendMessageToTab(tab.id, { type });
});

const MESSAGE_HANDLERS = {
  ARTLIST_DOWNLOAD_TRACK: (message) => ({
    run: () => handleTrackDownload(message.payload, message.options),
    fallbackKey: "error.youtubeSearchFailed"
  }),
  ARTLIST_OPEN_Y2MATE: (message) => ({
    run: () => handleOpenY2mate(message.payload),
    fallbackKey: "error.converterOpenFailed"
  }),
  ARTLIST_CHECK_PROCESSED: (message) => ({
    run: () => handleCheckProcessed(message.payload),
    fallbackKey: null
  }),
  ARTLIST_CHECK_RATINGS: (message) => ({
    run: () => handleCheckRatings(message.payload),
    fallbackKey: null
  }),
  ARTLIST_SET_RATING: (message) => ({
    run: () => storageQueue.enqueue(() => handleSetRating(message.payload)),
    fallbackKey: "error.ratingSaveFailed"
  }),
  ARTLIST_CLEAR_RATINGS: () => ({
    run: () => storageQueue.enqueue(() => handleClearRatings()),
    fallbackKey: null
  }),
  ARTLIST_IMPORT_BACKUP: (message) => ({
    run: () => storageQueue.enqueue(() => handleImportBackup(message.payload)),
    fallbackKey: "error.backupInvalid"
  }),
  ARTLIST_BUILD_CSV: (message) => ({
    run: () => handleBuildCsv(message.payload),
    fallbackKey: null
  })
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const builder = message?.type ? MESSAGE_HANDLERS[message.type] : null;
  if (!builder) {
    return false;
  }

  const { run, fallbackKey } = builder(message);
  (async () => {
    try {
      const result = await run();
      sendResponse({ ok: true, ...result });
    } catch (error) {
      console.error("[Artlist Toolbox]", error);
      const lang = await getActiveLanguage();
      const fallback = fallbackKey ? t(fallbackKey, {}, lang) : "";
      sendResponse({
        ok: false,
        error: error?.message || fallback || "Operation failed."
      });
    }
  })();

  return true;
});

async function refreshContextMenus() {
  return menuQueue.enqueue(async () => {
    const lang = await getActiveLanguage();
    await removeAllContextMenus();
    createContextMenu({
      id: "artlist-toolbox-copy-track",
      title: t("menu.copyTrack", {}, lang),
      contexts: ["page"],
      documentUrlPatterns: ARTLIST_URL_PATTERNS
    });
    createContextMenu({
      id: "artlist-toolbox-export-csv",
      title: t("menu.exportCsv", {}, lang),
      contexts: ["page"],
      documentUrlPatterns: ARTLIST_URL_PATTERNS
    });
    createContextMenu({
      id: "artlist-toolbox-open-sidepanel",
      title: t("menu.openSidePanel", {}, lang),
      contexts: ["page"],
      documentUrlPatterns: ARTLIST_URL_PATTERNS
    });
  });
}

function removeAllContextMenus() {
  return new Promise((resolve) => {
    chrome.contextMenus.removeAll(() => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

function createContextMenu(properties) {
  chrome.contextMenus.create(properties, () => {
    void chrome.runtime.lastError;
  });
}

async function sendMessageToTab(tabId, payload) {
  try {
    await chrome.tabs.sendMessage(tabId, payload);
  } catch (_error) {
    // The tab may not be an Artlist page anymore (or the content script is not ready).
  }
}

async function getActiveLanguage() {
  const { language } = await chrome.storage.local.get({ language: DEFAULT_SETTINGS.language });
  return resolveLanguage(language);
}

async function handleTrackDownload(rawTrack, options = {}) {
  const settings = await getSettings();
  const lang = settings.lang;
  const track = normalizeTrack(rawTrack);

  if (!track.title && !track.artist) {
    throw new Error(t("error.missingTrackInfo", {}, lang));
  }

  if (!settings.enabled) {
    throw new Error(t("error.flowDisabled", {}, lang));
  }

  const mode = options.override || settings.flowMode;
  const openInBackgroundTab = settings.openInBackground || Boolean(options.forceBackground);
  const searchUrl = buildYoutubeSearchUrl(buildSearchQuery(track));
  const fingerprint = settings.memoryEnabled ? buildFingerprint(track) : "";

  // ---- Copy-link mode (Cmd/Ctrl + click): resolve but never open tabs ----
  if (options.copyOnly) {
    const remembered = fingerprint ? await getMemoryEntry(fingerprint) : null;
    if (remembered?.videoId) {
      return { mode: "copied", url: buildWatchUrl(remembered.videoId), title: remembered.title };
    }

    if (mode === "search") {
      return { mode: "copied", url: searchUrl, kind: "search" };
    }

    const candidates = await searchYouTube(track, lang);
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
      url: buildWatchUrl(target.videoId),
      title: target.title,
      score: target.score
    };
  }

  // ---- Memory shortcut: trusted video from a previous choice ----
  if (fingerprint && mode === "auto" && (!options.override || options.override === "auto")) {
    const remembered = await getMemoryEntry(fingerprint);
    if (remembered?.videoId && isValidVideoId(remembered.videoId)) {
      await openTab(
        buildConverterUrl(remembered.videoId, settings.converterUrlTemplate),
        openInBackgroundTab
      );
      await storageQueue.enqueue(() =>
        recordDownload({ track, video: remembered, fingerprint, remembered: true, settings })
      );
      return { mode: "auto", remembered: true, video: remembered };
    }
  }

  if (mode === "search") {
    await openTab(searchUrl, openInBackgroundTab);
    return { mode: "search" };
  }

  const candidates = await searchYouTube(track, lang);
  const ranked = scoreCandidates(track, candidates, scoringOptions(settings));
  const memoryVideoId = fingerprint ? (await getMemoryEntry(fingerprint))?.videoId || null : null;

  if (mode === "ask") {
    if (!ranked.length) {
      await openTab(searchUrl, openInBackgroundTab);
      throw new Error(t("error.noResultsManualSearch", {}, lang));
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
    throw new Error(t("error.lowConfidenceManualSearch", {}, lang));
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

  await openTab(
    buildConverterUrl(bestMatch.videoId, settings.converterUrlTemplate),
    openInBackgroundTab
  );
  await storageQueue.enqueue(() => recordDownload({ track, video: bestMatch, fingerprint, settings }));
  return { mode: "auto", video: bestMatch };
}

async function handleOpenY2mate(payload = {}) {
  const settings = await getSettings();
  const lang = settings.lang;
  const videoId = String(payload.videoId || "");

  if (!isValidVideoId(videoId)) {
    throw new Error(t("error.invalidVideo", {}, lang));
  }

  if (!settings.enabled) {
    throw new Error(t("error.flowDisabled", {}, lang));
  }

  await openTab(buildConverterUrl(videoId, settings.converterUrlTemplate), settings.openInBackground);

  const track = payload.track
    ? normalizeTrack(payload.track)
    : normalizeTrack({ title: payload.title, artist: payload.artist });
  const video = {
    videoId,
    title: cleanText(payload.title) || track.title,
    artist: cleanText(payload.artist) || track.artist
  };

  await storageQueue.enqueue(() =>
    recordDownload({
      track,
      video,
      fingerprint: settings.memoryEnabled ? buildFingerprint(track) : "",
      settings
    })
  );

  return { videoId };
}

async function handleCheckProcessed(payload = {}) {
  const tracks = Array.isArray(payload.tracks) ? payload.tracks.slice(0, 500) : [];
  const { processed } = await chrome.storage.local.get({ processed: {} });

  const results = tracks.map((track) => {
    const fingerprint = buildFingerprint(track);
    const entry = fingerprint ? processed[fingerprint] : null;
    return entry ? { processed: true, at: entry.at || 0 } : { processed: false };
  });

  return { results };
}

async function handleCheckRatings(payload = {}) {
  const tracks = Array.isArray(payload.tracks) ? payload.tracks.slice(0, 500) : [];
  const { rankings } = await chrome.storage.local.get({ rankings: {} });

  const results = tracks.map((track) => {
    const fingerprint = buildFingerprint(track);
    const entry = fingerprint ? rankings[fingerprint] : null;
    const rating = normalizeRating(entry?.rating);
    return {
      rating,
      tags: rating ? normalizeTags(entry?.tags) : [],
      note: rating ? cleanNote(entry?.note) : ""
    };
  });

  return { results };
}

async function handleSetRating(payload = {}) {
  const lang = await getActiveLanguage();
  const rawTrack = payload.track || {};
  const track = normalizeTrack(rawTrack);
  const rating = normalizeRating(payload.rating);
  const fingerprint = buildFingerprint(track);
  if (!fingerprint) {
    throw new Error(t("error.missingTrackInfo", {}, lang));
  }

  const { rankings } = await chrome.storage.local.get({ rankings: {} });

  // Rating 0 clears the entry instead of storing a zero star.
  if (!rating) {
    if (rankings[fingerprint]) {
      const next = { ...rankings };
      delete next[fingerprint];
      await chrome.storage.local.set({ rankings: next });
    }
    return { rating: 0 };
  }

  const entry = buildRankingEntry({
    track: {
      ...track,
      url: rawTrack.url || "",
      kind: rawTrack.kind
    },
    rating,
    tags: payload.tags,
    note: payload.note,
    kind: payload.kind ?? rawTrack.kind,
    previous: rankings[fingerprint] || null,
    now: Date.now()
  });

  await chrome.storage.local.set({ rankings: { ...rankings, [fingerprint]: entry } });
  return { rating: entry.rating, entry, fingerprint };
}

async function handleClearRatings() {
  const { rankings } = await chrome.storage.local.get({ rankings: {} });
  const removed = countRankings(rankings);
  await chrome.storage.local.set({ rankings: {} });
  return { removed };
}

async function handleImportBackup(payload = {}) {
  const lang = await getActiveLanguage();
  const current = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const parsed = parseImportPayload(payload.raw, current, {
    merge: payload.merge !== false
  });

  if (!parsed.ok) {
    throw new Error(t("error.backupInvalid", {}, lang));
  }

  await chrome.storage.local.set(parsed.patch);
  return { kind: parsed.kind, counts: parsed.counts };
}

async function handleBuildCsv(payload = {}) {
  const tracks = Array.isArray(payload.tracks) ? payload.tracks.slice(0, 500) : [];
  const { processed, matchMemory, rankings } = await chrome.storage.local.get({
    processed: {},
    matchMemory: {},
    rankings: {}
  });

  const rows = tracks.map((track) => {
    const fingerprint = buildFingerprint(track);
    const stored = fingerprint
      ? processed[fingerprint]?.videoId || matchMemory[fingerprint]?.videoId
      : "";
    const videoId = isValidVideoId(stored) ? stored : "";
    const rankingEntry = fingerprint ? rankings[fingerprint] : null;
    const rating = normalizeRating(rankingEntry?.rating);
    const kind = normalizeKind(track.kind || rankingEntry?.kind);
    return [
      cleanText(track.title),
      cleanText(track.artist),
      kind,
      formatDurationLabel(track.duration),
      String(track.url || ""),
      videoId ? buildWatchUrl(videoId) : "",
      rating ? String(rating) : "",
      rating ? normalizeTags(rankingEntry?.tags).join(", ") : "",
      rating ? cleanNote(rankingEntry?.note) : ""
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
  const converterUrlTemplate = isValidConverterTemplate(items.converterUrlTemplate)
    ? items.converterUrlTemplate.trim()
    : DEFAULT_CONVERTER_TEMPLATE;

  return {
    lang: resolveLanguage(items.language),
    enabled: Boolean(items.enabled),
    flowMode,
    openInBackground: Boolean(items.openInBackground),
    minScore:
      Number.isFinite(minScore) && minScore > 0 ? minScore : DEFAULT_SETTINGS.minScore,
    durationVeto: items.durationVeto !== false,
    durationTolerance:
      Number.isFinite(tolerance) && tolerance > 0 ? tolerance : DEFAULT_SETTINGS.durationTolerance,
    converterUrlTemplate,
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

async function searchYouTube(track, lang = "en") {
  const url = buildYoutubeSearchUrl(buildSearchQuery(track));
  let lastError = new Error(t("error.youtubeSearchFailed", {}, lang));

  for (let attempt = 1; attempt <= SEARCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        credentials: "omit",
        headers: {
          "Accept-Language": "en-US,en;q=0.9"
        }
      });

      if (!response.ok) {
        throw new Error(t("error.youtubeHttp", { status: response.status }, lang));
      }

      const html = await response.text();
      const candidates = extractVideoCandidates(html);
      if (candidates.length) {
        return candidates.slice(0, 20);
      }

      lastError = new Error(t("error.youtubeEmpty", {}, lang));
    } catch (error) {
      lastError = error;
    }

    if (attempt < SEARCH_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS);
    }
  }

  throw lastError;
}

// Atomically updates recent history, processed history, stats and (when enabled)
// match memory in a single storage write. Caller must hold storageQueue.
async function recordDownload({ track, video, fingerprint, remembered = false, settings }) {
  const activeSettings = settings || (await getSettings());
  const { recent, processed, matchMemory, stats } = await chrome.storage.local.get({
    recent: [],
    processed: {},
    matchMemory: {},
    stats: { total: 0, daily: {} }
  });

  const patch = {};
  const videoId = video?.videoId;
  const now = Date.now();

  if (isValidVideoId(videoId)) {
    const nextEntry = {
      videoId,
      title: cleanText(video.title) || cleanText(track.title),
      artist: cleanText(video.artist) || cleanText(track.artist),
      at: now
    };

    patch.recent = [nextEntry, ...recent.filter((item) => item?.videoId !== videoId)].slice(
      0,
      RECENT_LIMIT
    );
  }

  if (fingerprint) {
    const title = cleanText(track.title) || cleanText(video?.title);
    const artist = cleanText(track.artist) || cleanText(video?.artist);

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
    patch.processed = pruneProcessed(nextProcessed);

    if (activeSettings.memoryEnabled && isValidVideoId(videoId)) {
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
      patch.matchMemory = pruneMemory(nextMemory);
    }
  }

  patch.stats = {
    total: (Number(stats?.total) || 0) + 1,
    daily: bumpDailyStats(stats?.daily)
  };

  await chrome.storage.local.set(patch);
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

function toPublicCandidate(candidate) {
  return {
    videoId: candidate.videoId,
    title: candidate.title,
    artist: candidate.artist,
    duration: candidate.duration,
    lengthText: candidate.lengthText,
    thumbnail: candidate.thumbnail,
    url: candidate.url,
    score: candidate.score,
    isTopic: Boolean(candidate.isTopic),
    isOfficialArtist: Boolean(candidate.isOfficialArtist)
  };
}

function openTab(url, background = false) {
  return chrome.tabs.create({ url, active: !background });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
