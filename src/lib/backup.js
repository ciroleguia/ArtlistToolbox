// Full backup / restore and legacy config import helpers.
// Pure functions only: no chrome.* or DOM APIs in this file.

import {
  CONFIG_KEYS,
  DEFAULT_CONVERTER_TEMPLATE,
  DEFAULT_SETTINGS,
  MEMORY_LIMIT,
  PROCESSED_LIMIT,
  RECENT_LIMIT
} from "./defaults.js";
import { buildFingerprint, cleanText } from "./matcher.js";
import { buildRankingEntry, normalizeRating } from "./rankings.js";
import { isValidConverterTemplate, isValidVideoId } from "./youtube.js";

export const BACKUP_APP_ID = "artlist-toolbox";
export const BACKUP_SCHEMA_VERSION = 1;
const SUPPORTED_LANGUAGES = ["auto", "en", "es"];

export function buildBackupPayload(
  storageState = {},
  extensionVersion = "0.8.0",
  { includeData = true, now = Date.now() } = {}
) {
  const settings = {};
  CONFIG_KEYS.forEach((key) => {
    settings[key] = key in storageState ? storageState[key] : DEFAULT_SETTINGS[key];
  });

  if (!includeData) {
    return settings;
  }

  return {
    app: BACKUP_APP_ID,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    extensionVersion: String(extensionVersion || ""),
    exportedAt: new Date(now).toISOString(),
    settings,
    rankings: sanitizeRankingsMap(storageState.rankings),
    matchMemory: sanitizeMatchMemoryMap(storageState.matchMemory),
    processed: sanitizeProcessedMap(storageState.processed),
    recent: sanitizeRecentList(storageState.recent),
    stats: sanitizeStats(storageState.stats)
  };
}

export function sanitizeSettingsPatch(raw) {
  const clean = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return clean;
  }

  CONFIG_KEYS.forEach((key) => {
    if (!(key in raw)) {
      return;
    }
    const value = raw[key];

    switch (key) {
      case "language":
        if (SUPPORTED_LANGUAGES.includes(value)) {
          clean[key] = value;
        }
        break;

      case "flowMode":
        if (value === null || ["auto", "ask", "search"].includes(value)) {
          clean[key] = value;
        }
        break;

      case "minScore": {
        const num = Number(value);
        if (Number.isFinite(num) && num > 0 && num <= 1) {
          clean[key] = num;
        }
        break;
      }

      case "durationTolerance": {
        const num = Number(value);
        if (Number.isFinite(num) && num >= 1 && num <= 300) {
          clean[key] = num;
        }
        break;
      }

      case "converterUrlTemplate":
        if (typeof value === "string") {
          const trimmed = value.trim();
          if (!trimmed) {
            clean[key] = DEFAULT_CONVERTER_TEMPLATE;
          } else if (isValidConverterTemplate(trimmed)) {
            clean[key] = trimmed;
          }
        }
        break;

      case "negativeTerms":
      case "preferredTerms":
        if (value === null) {
          clean[key] = null;
        } else if (Array.isArray(value)) {
          clean[key] = value
            .map((term) => String(term).trim())
            .filter(Boolean)
            .slice(0, 100);
        }
        break;

      default:
        if (typeof value === "boolean") {
          clean[key] = value;
        }
    }
  });

  return clean;
}

export function sanitizeRankingsMap(rawRankings) {
  if (!rawRankings || typeof rawRankings !== "object" || Array.isArray(rawRankings)) {
    return {};
  }

  const clean = {};
  Object.entries(rawRankings).forEach(([rawKey, entry]) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const rating = normalizeRating(entry.rating);
    if (!rating) {
      return;
    }

    const title = cleanText(entry.title);
    const artist = cleanText(entry.artist);
    const fingerprint = buildFingerprint({ title, artist }) || cleanText(rawKey);
    if (!fingerprint) {
      return;
    }

    const updatedAt = Number(entry.updatedAt) > 0 ? Number(entry.updatedAt) : Date.now();
    const createdAt = Number(entry.createdAt) > 0 ? Number(entry.createdAt) : updatedAt;
    const built = buildRankingEntry({
      track: {
        title,
        artist,
        duration: entry.duration,
        url: entry.url,
        kind: entry.kind
      },
      rating,
      tags: entry.tags,
      note: entry.note,
      kind: entry.kind,
      previous: { createdAt },
      now: updatedAt
    });

    if (built) {
      const existing = clean[fingerprint];
      if (!existing || (built.updatedAt || 0) >= (existing.updatedAt || 0)) {
        clean[fingerprint] = built;
      }
    }
  });

  return clean;
}

export function sanitizeMatchMemoryMap(rawMemory) {
  if (!rawMemory || typeof rawMemory !== "object" || Array.isArray(rawMemory)) {
    return {};
  }

  const entries = [];
  Object.entries(rawMemory).forEach(([rawKey, entry]) => {
    if (!entry || typeof entry !== "object" || !isValidVideoId(entry.videoId)) {
      return;
    }
    const title = cleanText(entry.title);
    const artist = cleanText(entry.artist);
    const fingerprint = buildFingerprint({ title, artist }) || cleanText(rawKey);
    if (!fingerprint) {
      return;
    }
    entries.push([
      fingerprint,
      {
        videoId: entry.videoId,
        title,
        artist,
        at: Number(entry.at) > 0 ? Number(entry.at) : 0,
        remembered: Boolean(entry.remembered)
      }
    ]);
  });

  entries.sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
  return Object.fromEntries(entries.slice(0, MEMORY_LIMIT));
}

export function sanitizeProcessedMap(rawProcessed) {
  if (!rawProcessed || typeof rawProcessed !== "object" || Array.isArray(rawProcessed)) {
    return {};
  }

  const entries = [];
  Object.entries(rawProcessed).forEach(([rawKey, entry]) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const title = cleanText(entry.title);
    const artist = cleanText(entry.artist);
    const fingerprint = buildFingerprint({ title, artist }) || cleanText(rawKey);
    if (!fingerprint) {
      return;
    }
    entries.push([
      fingerprint,
      {
        title,
        artist,
        videoId: isValidVideoId(entry.videoId) ? entry.videoId : "",
        at: Number(entry.at) > 0 ? Number(entry.at) : 0,
        count: Math.max(1, Math.round(Number(entry.count) || 1))
      }
    ]);
  });

  entries.sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
  return Object.fromEntries(entries.slice(0, PROCESSED_LIMIT));
}

export function sanitizeRecentList(rawRecent) {
  if (!Array.isArray(rawRecent)) {
    return [];
  }

  const seen = new Set();
  const clean = [];

  for (const item of rawRecent) {
    if (!item || typeof item !== "object" || !isValidVideoId(item.videoId)) {
      continue;
    }
    if (seen.has(item.videoId)) {
      continue;
    }
    seen.add(item.videoId);
    clean.push({
      videoId: item.videoId,
      title: cleanText(item.title),
      artist: cleanText(item.artist),
      at: Number(item.at) > 0 ? Number(item.at) : 0
    });
    if (clean.length >= RECENT_LIMIT) {
      break;
    }
  }

  return clean;
}

export function sanitizeStats(rawStats) {
  if (!rawStats || typeof rawStats !== "object" || Array.isArray(rawStats)) {
    return { total: 0, daily: {} };
  }

  const total = Math.max(0, Math.round(Number(rawStats.total) || 0));
  const daily = {};

  if (rawStats.daily && typeof rawStats.daily === "object" && !Array.isArray(rawStats.daily)) {
    Object.entries(rawStats.daily).forEach(([date, count]) => {
      const value = Math.round(Number(count) || 0);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && value > 0) {
        daily[date] = value;
      }
    });
  }

  return { total, daily };
}

export function parseImportPayload(raw, currentStorage = {}, { merge = true } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false };
  }

  const hasBundleKeys =
    raw.app === BACKUP_APP_ID ||
    typeof raw.schemaVersion === "number" ||
    isPlainObject(raw.settings) ||
    isPlainObject(raw.rankings) ||
    isPlainObject(raw.matchMemory) ||
    isPlainObject(raw.processed);

  if (!hasBundleKeys) {
    const settingsPatch = sanitizeSettingsPatch(raw);
    const keys = Object.keys(settingsPatch);
    if (!keys.length) {
      return { ok: false };
    }
    return {
      ok: true,
      kind: "settings",
      patch: settingsPatch,
      counts: {
        settings: keys.length,
        rankings: 0,
        matchMemory: 0,
        processed: 0,
        recent: 0
      }
    };
  }

  const patch = {};
  const counts = {
    settings: 0,
    rankings: 0,
    matchMemory: 0,
    processed: 0,
    recent: 0
  };

  if (isPlainObject(raw.settings)) {
    const cleanSettings = sanitizeSettingsPatch(raw.settings);
    Object.assign(patch, cleanSettings);
    counts.settings = Object.keys(cleanSettings).length;
  }

  if (isPlainObject(raw.rankings)) {
    const incoming = sanitizeRankingsMap(raw.rankings);
    counts.rankings = Object.keys(incoming).length;
    patch.rankings = merge
      ? mergeByTimestamp(sanitizeRankingsMap(currentStorage.rankings), incoming, "updatedAt")
      : incoming;
  }

  if (isPlainObject(raw.matchMemory)) {
    const incoming = sanitizeMatchMemoryMap(raw.matchMemory);
    counts.matchMemory = Object.keys(incoming).length;
    patch.matchMemory = sanitizeMatchMemoryMap(
      merge
        ? mergeByTimestamp(sanitizeMatchMemoryMap(currentStorage.matchMemory), incoming, "at")
        : incoming
    );
  }

  if (isPlainObject(raw.processed)) {
    const incoming = sanitizeProcessedMap(raw.processed);
    counts.processed = Object.keys(incoming).length;
    patch.processed = sanitizeProcessedMap(
      merge
        ? mergeByTimestamp(sanitizeProcessedMap(currentStorage.processed), incoming, "at")
        : incoming
    );
  }

  if (Array.isArray(raw.recent)) {
    const incoming = sanitizeRecentList(raw.recent);
    counts.recent = incoming.length;
    patch.recent = merge
      ? sanitizeRecentList(
          [...incoming, ...sanitizeRecentList(currentStorage.recent)].sort(
            (a, b) => (b.at || 0) - (a.at || 0)
          )
        )
      : incoming;
  }

  if (isPlainObject(raw.stats)) {
    const incoming = sanitizeStats(raw.stats);
    if (merge) {
      const existing = sanitizeStats(currentStorage.stats);
      const mergedDaily = { ...existing.daily };
      Object.entries(incoming.daily).forEach(([date, count]) => {
        mergedDaily[date] = Math.max(mergedDaily[date] || 0, count);
      });
      patch.stats = {
        total: Math.max(existing.total, incoming.total),
        daily: mergedDaily
      };
    } else {
      patch.stats = incoming;
    }
  }

  if (!Object.keys(patch).length) {
    return { ok: false };
  }

  const kind =
    isPlainObject(raw.rankings) &&
    !isPlainObject(raw.settings) &&
    !isPlainObject(raw.matchMemory)
      ? "rankings"
      : "full";

  return { ok: true, kind, patch, counts };
}

function mergeByTimestamp(existing, incoming, timeField) {
  const merged = { ...existing };
  Object.entries(incoming).forEach(([key, nextEntry]) => {
    const prevEntry = merged[key];
    if (!prevEntry) {
      merged[key] = nextEntry;
      return;
    }
    const prevTime = Number(prevEntry[timeField]) || 0;
    const nextTime = Number(nextEntry[timeField]) || 0;
    merged[key] = nextTime >= prevTime ? nextEntry : prevEntry;
  });
  return merged;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
