import {
  buildSearchQuery,
  cleanText,
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

const DEFAULT_SETTINGS = {
  enabled: true,
  flowMode: null,
  searchOnly: false,
  openInBackground: false,
  minScore: 0.42
};

const RECENT_LIMIT = 10;
const SEARCH_ATTEMPTS = 2;
const RETRY_DELAY_MS = 500;
const CANDIDATE_LIMIT = 5;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message?.type) {
    case "ARTLIST_DOWNLOAD_TRACK":
      handleTrackDownload(message.payload)
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((error) => {
          console.error("[Artlist Downloader]", error);
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
          console.error("[Artlist Downloader]", error);
          sendResponse({
            ok: false,
            error: error?.message || "No se pudo abrir el conversor."
          });
        });
      return true;

    default:
      return false;
  }
});

async function handleTrackDownload(track) {
  const normalizedTrack = normalizeTrack(track);
  if (!normalizedTrack.title && !normalizedTrack.artist) {
    throw new Error("No pude detectar el nombre de la cancion ni el artista.");
  }

  const settings = await getSettings();
  const searchUrl = buildYoutubeSearchUrl(buildSearchQuery(normalizedTrack));

  if (settings.flowMode === "search") {
    await openTab(searchUrl, settings.openInBackground);
    return { mode: "search" };
  }

  const candidates = await searchYouTube(normalizedTrack);
  const ranked = scoreCandidates(normalizedTrack, candidates);

  if (settings.flowMode === "ask") {
    if (!ranked.length) {
      await openTab(searchUrl, settings.openInBackground);
      throw new Error(
        "No encontre resultados. Abri la busqueda de YouTube para revisar manualmente."
      );
    }
    return {
      mode: "ask",
      searchUrl,
      candidates: ranked.slice(0, CANDIDATE_LIMIT).map(toPublicCandidate)
    };
  }

  const bestMatch = pickBestMatch(normalizedTrack, candidates, settings.minScore);

  if (!bestMatch) {
    await openTab(searchUrl, settings.openInBackground);
    throw new Error(
      "No encontre un video suficientemente parecido. Abri la busqueda de YouTube para revisar manualmente."
    );
  }

  await openTab(buildY2mateUrl(bestMatch.videoId), settings.openInBackground);
  await addRecentDownload(bestMatch);
  return { mode: "auto", video: bestMatch };
}

async function handleOpenY2mate(payload = {}) {
  const videoId = String(payload.videoId || "");
  if (!isValidVideoId(videoId)) {
    throw new Error("El video seleccionado no es valido.");
  }

  const settings = await getSettings();
  await openTab(buildY2mateUrl(videoId), settings.openInBackground);
  await addRecentDownload({
    videoId,
    title: payload.title,
    artist: payload.artist
  });

  return { videoId };
}

async function getSettings() {
  const items = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const flowMode = items.flowMode || (items.searchOnly ? "search" : "auto");

  // One-time migration from the old boolean toggle.
  if (items.flowMode !== flowMode) {
    await chrome.storage.local.set({ flowMode, searchOnly: false });
  }

  const minScore = Number(items.minScore);

  return {
    flowMode,
    openInBackground: Boolean(items.openInBackground),
    minScore:
      Number.isFinite(minScore) && minScore > 0 ? minScore : DEFAULT_SETTINGS.minScore
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

async function addRecentDownload(entry) {
  const { videoId, title, artist } = entry || {};
  if (!isValidVideoId(videoId)) {
    return;
  }

  const { recent } = await chrome.storage.local.get({ recent: [] });
  const nextEntry = {
    videoId,
    title: cleanText(title),
    artist: cleanText(artist),
    at: Date.now()
  };

  const next = [nextEntry, ...recent.filter((item) => item?.videoId !== videoId)].slice(
    0,
    RECENT_LIMIT
  );

  await chrome.storage.local.set({ recent: next });
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
