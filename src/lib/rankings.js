// Ranking helpers shared by the background service worker, content script,
// rankings page, options page and test suite. Pure functions only: no chrome.*
// or DOM APIs in this file.

import { cleanText } from "./matcher.js";
import { formatDurationLabel } from "./csv.js";

export const RATING_MAX = 5;

// "Focus favorites" keeps rows at this rating or above bright by default.
export const FOCUS_MIN_RATING = 4;

export const MAX_TAGS_PER_TRACK = 12;
export const MAX_TAG_LENGTH = 28;
export const MAX_NOTE_LENGTH = 280;

// Coerces anything into an integer 1..5, or 0 for "not rated".
export function normalizeRating(value) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number) || number < 1 || number > RATING_MAX) {
    return 0;
  }
  return number;
}

export function normalizeKind(value) {
  return String(value || "").trim().toLowerCase() === "sfx" ? "sfx" : "music";
}

export function normalizeTags(input) {
  const rawList = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(/[,;\n]+/)
      : [];

  const seen = new Set();
  const result = [];

  for (const raw of rawList) {
    const tag = cleanText(raw)
      .replace(/^#+/, "")
      .toLowerCase()
      .slice(0, MAX_TAG_LENGTH)
      .trim();

    if (!tag || seen.has(tag)) {
      continue;
    }

    seen.add(tag);
    result.push(tag);
    if (result.length >= MAX_TAGS_PER_TRACK) {
      break;
    }
  }

  return result;
}

export function cleanNote(value) {
  return cleanText(value).slice(0, MAX_NOTE_LENGTH);
}

// "★★★★☆" style label for badges and lists.
export function ratingToStars(rating) {
  const value = normalizeRating(rating);
  return "★".repeat(value) + "☆".repeat(RATING_MAX - value);
}

// Compact badge string for row pseudo-element, e.g. "★★★★★ · intro, reel".
export function formatRowBadgeText(rating, tags = []) {
  const stars = ratingToStars(rating);
  const cleanTags = normalizeTags(tags);
  if (!cleanTags.length) {
    return stars;
  }
  const preview = cleanTags.slice(0, 2).join(", ");
  const clipped = preview.length > 20 ? `${preview.slice(0, 19)}…` : preview;
  const suffix = cleanTags.length > 2 ? ` +${cleanTags.length - 2}` : "";
  return `${stars} · ${clipped}${suffix}`;
}

// Builds the stored entry for a rating. `previous` preserves createdAt and
// existing tags/note/kind unless explicitly overridden, and fills metadata gaps.
export function buildRankingEntry({
  track = {},
  rating,
  tags,
  note,
  kind,
  previous = null,
  now = Date.now()
} = {}) {
  const value = normalizeRating(rating);
  if (!value) {
    return null;
  }

  const duration = Number(track.duration);
  const previousDuration = Number(previous?.duration);
  const nextDuration =
    Number.isFinite(duration) && duration > 0
      ? Math.round(duration)
      : Number.isFinite(previousDuration) && previousDuration > 0
        ? Math.round(previousDuration)
        : null;

  const nextTags =
    tags !== undefined
      ? normalizeTags(tags)
      : track.tags !== undefined
        ? normalizeTags(track.tags)
        : normalizeTags(previous?.tags || []);

  const nextNote =
    note !== undefined
      ? cleanNote(note)
      : track.note !== undefined
        ? cleanNote(track.note)
        : cleanNote(previous?.note || "");

  const nextKind = normalizeKind(kind || track.kind || previous?.kind);

  return {
    title: cleanText(track.title) || cleanText(previous?.title),
    artist: cleanText(track.artist) || cleanText(previous?.artist),
    kind: nextKind,
    rating: value,
    tags: nextTags,
    note: nextNote,
    url: cleanText(track.url) || cleanText(previous?.url),
    duration: nextDuration,
    createdAt: Number(previous?.createdAt) || now,
    updatedAt: now
  };
}

export function countRankings(rankings = {}) {
  return Object.entries(rankings || {}).filter(([, entry]) => normalizeRating(entry?.rating) > 0).length;
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

export function collectAllTags(rankings = {}) {
  const counts = new Map();
  Object.values(rankings || {}).forEach((entry) => {
    if (normalizeRating(entry?.rating) <= 0) {
      return;
    }
    normalizeTags(entry?.tags).forEach((tag) => {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    });
  });

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || collator.compare(a.tag, b.tag));
}

// Returns [fingerprint, entry] pairs sorted by "rating", "recent" or "title".
export function sortRankingEntries(rankings = {}, mode = "rating") {
  const entries = Object.entries(rankings || {}).filter(
    ([, entry]) => normalizeRating(entry?.rating) > 0
  );

  const byRating = (a, b) =>
    normalizeRating(b[1]?.rating) - normalizeRating(a[1]?.rating) ||
    (Number(b[1]?.updatedAt) || 0) - (Number(a[1]?.updatedAt) || 0) ||
    collator.compare(String(a[1]?.title || ""), String(b[1]?.title || ""));

  const sorters = {
    rating: byRating,
    recent: (a, b) => (Number(b[1]?.updatedAt) || 0) - (Number(a[1]?.updatedAt) || 0),
    title: (a, b) =>
      collator.compare(
        `${a[1]?.artist || ""} ${a[1]?.title || ""}`.trim(),
        `${b[1]?.artist || ""} ${b[1]?.title || ""}`.trim()
      )
  };

  return [...entries].sort(sorters[mode] || byRating);
}

// Filters sorted entries by free-text query (title/artist/tags/note), rating
// range, optional tag, and optional kind ("all" | "music" | "sfx").
export function filterRankingEntries(
  entries = [],
  { query = "", minRating = 0, maxRating = RATING_MAX, tag = "", kind = "all" } = {}
) {
  const needle = normalizeSearch(query);
  const min = normalizeRating(minRating) || 0;
  const max = normalizeRating(maxRating) || RATING_MAX;
  const targetTag = normalizeTags(tag)[0] || "";
  const targetKind = kind && kind !== "all" ? normalizeKind(kind) : "";

  return entries.filter(([, entry]) => {
    const rating = normalizeRating(entry?.rating);
    if (!rating || rating < min || rating > max) {
      return false;
    }

    if (targetKind && normalizeKind(entry?.kind) !== targetKind) {
      return false;
    }

    const entryTags = normalizeTags(entry?.tags);
    if (targetTag && !entryTags.includes(targetTag)) {
      return false;
    }

    if (!needle) {
      return true;
    }

    const haystack = [entry?.title || "", entry?.artist || "", ...entryTags, entry?.note || ""].join(
      " "
    );
    return normalizeSearch(haystack).includes(needle);
  });
}

function normalizeSearch(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export const RANKING_CSV_COLUMNS = [
  "Title",
  "Artist",
  "Kind",
  "Rating",
  "Tags",
  "Note",
  "Duration",
  "Artlist URL",
  "Updated"
];

export function buildRankingCsvRows(rankings = {}) {
  return sortRankingEntries(rankings, "rating").map(([, entry]) => {
    const updatedAt = Number(entry?.updatedAt);
    return [
      cleanText(entry?.title),
      cleanText(entry?.artist),
      normalizeKind(entry?.kind),
      String(normalizeRating(entry?.rating) || ""),
      normalizeTags(entry?.tags).join(", "),
      cleanNote(entry?.note),
      formatDurationLabel(entry?.duration),
      cleanText(entry?.url),
      Number.isFinite(updatedAt) && updatedAt > 0 ? new Date(updatedAt).toISOString() : ""
    ];
  });
}
