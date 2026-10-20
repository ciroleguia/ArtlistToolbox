// Ranking helpers shared by the background service worker, the rankings page,
// the options page and the test suite. Pure functions only: no chrome.* or DOM
// APIs in this file.

import { cleanText } from "./matcher.js";
import { formatDurationLabel } from "./csv.js";

export const RATING_MAX = 5;

// "Focus favorites" keeps rows at this rating or above bright.
export const FOCUS_MIN_RATING = 4;

// Coerces anything into an integer 1..5, or 0 for "not rated".
export function normalizeRating(value) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number) || number < 1 || number > RATING_MAX) {
    return 0;
  }
  return number;
}

// "★★★★☆" style label for badges and lists.
export function ratingToStars(rating) {
  const value = normalizeRating(rating);
  return "★".repeat(value) + "☆".repeat(RATING_MAX - value);
}

// Builds the stored entry for a rating. `previous` preserves createdAt and
// fills gaps (url, duration, title) when the track info is incomplete.
export function buildRankingEntry({ track = {}, rating, previous = null, now = Date.now() } = {}) {
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

  return {
    title: cleanText(track.title) || cleanText(previous?.title),
    artist: cleanText(track.artist) || cleanText(previous?.artist),
    rating: value,
    url: cleanText(track.url) || cleanText(previous?.url),
    duration: nextDuration,
    createdAt: Number(previous?.createdAt) || now,
    updatedAt: now
  };
}

export function countRankings(rankings = {}) {
  return Object.entries(rankings).filter(([, entry]) => normalizeRating(entry?.rating) > 0).length;
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

// Returns [fingerprint, entry] pairs sorted by "rating", "recent" or "title".
export function sortRankingEntries(rankings = {}, mode = "rating") {
  const entries = Object.entries(rankings).filter(([, entry]) => normalizeRating(entry?.rating) > 0);

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

// Filters sorted entries by a free-text query and an inclusive rating range.
export function filterRankingEntries(
  entries = [],
  { query = "", minRating = 0, maxRating = RATING_MAX } = {}
) {
  const needle = normalizeSearch(query);
  const min = normalizeRating(minRating) || 0;
  const max = normalizeRating(maxRating) || RATING_MAX;

  return entries.filter(([, entry]) => {
    const rating = normalizeRating(entry?.rating);
    if (!rating || rating < min || rating > max) {
      return false;
    }
    if (!needle) {
      return true;
    }
    return normalizeSearch(`${entry?.title || ""} ${entry?.artist || ""}`).includes(needle);
  });
}

function normalizeSearch(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export const RANKING_CSV_COLUMNS = ["Title", "Artist", "Rating", "Duration", "Artlist URL", "Updated"];

export function buildRankingCsvRows(rankings = {}) {
  return sortRankingEntries(rankings, "rating").map(([, entry]) => {
    const updatedAt = Number(entry?.updatedAt);
    return [
      cleanText(entry?.title),
      cleanText(entry?.artist),
      String(normalizeRating(entry?.rating) || ""),
      formatDurationLabel(entry?.duration),
      cleanText(entry?.url),
      Number.isFinite(updatedAt) && updatedAt > 0 ? new Date(updatedAt).toISOString() : ""
    ];
  });
}
