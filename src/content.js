// Auto-generated classic content script bundle from src/content-main.js + src/lib/*.
// Run `node scripts/build-content.mjs` after editing src/content-main.js or src/lib/*.
(() => {
  "use strict";

  // ---- src/lib/matcher.js ----
// Matching logic shared by the background service worker, content script and
// test suite. Pure functions only: no chrome.* or DOM APIs in this file.
const DEFAULT_MIN_SCORE = 0.42;

// Terms that usually mean "this is not the original track". They only penalize
// candidates when the target title/artist does not mention them itself.
const NEGATIVE_TERMS = [
  "cover",
  "remix",
  "slowed",
  "sped up",
  "speed up",
  "nightcore",
  "karaoke",
  "instrumental",
  "8d audio",
  "mashup",
  "ringtone",
  "hour loop",
  "live"
];

// Terms that usually indicate the canonical upload. They add a small bonus
// when present in the candidate title/artist.
const DEFAULT_PREFERRED_TERMS = [
  "official audio",
  "official video",
  "topic",
  "lyric video",
  "audio library"
];
const PREFERRED_BONUS_PER_HIT = 0.05;
const PREFERRED_BONUS_MAX = 0.1;
const TOPIC_CHANNEL_BONUS = 0.08;
const OFFICIAL_ARTIST_BONUS = 0.04;
const CANONICAL_BONUS_MAX = 0.1;
function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, "\"")
    .replace(/[’]/g, "'")
    .trim();
}
function stripTopicSuffix(value) {
  return cleanText(value).replace(/\s+-\s+topic$/i, "").trim();
}
function normalizeTrack(track = {}) {
  const duration = Number(track.duration);
  return {
    title: cleanText(track.title),
    artist: cleanText(track.artist),
    duration: Number.isFinite(duration) && duration > 0 ? duration : null
  };
}
function buildSearchQuery(track) {
  return [track.title, track.artist].filter(Boolean).join(" ");
}
function normalizeForMatch(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/official|video|audio|lyrics|lyric|music|visualizer|feat\.?|ft\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function containsScore(needle, haystack) {
  if (!needle || !haystack) {
    return 0;
  }

  if (haystack.includes(needle)) {
    return 1;
  }

  const words = needle.split(" ").filter((word) => word.length > 2);
  if (!words.length) {
    return 0;
  }

  const matched = words.filter((word) => haystack.includes(word)).length;
  return matched / words.length;
}
function similarity(a, b) {
  if (!a || !b) {
    return 0;
  }

  const distance = levenshteinDistance(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}
function levenshteinDistance(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_value, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }

    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}
function isTopicCandidate(candidate) {
  return Boolean(candidate?.isTopic) || /\s-\sTopic$/i.test(cleanText(candidate?.artist));
}
function scoreCandidate(track, candidate, index = 0, options = {}) {
  const negativeTerms = resolveTerms(options.negativeTerms, NEGATIVE_TERMS);
  const preferredTerms = resolveTerms(options.preferredTerms, DEFAULT_PREFERRED_TERMS);

  const targetTitle = normalizeForMatch(track.title);
  const targetArtist = normalizeForMatch(track.artist);
  const candidateTitle = normalizeForMatch(candidate.title);
  const candidateArtist = normalizeForMatch(stripTopicSuffix(candidate.artist));
  const combinedCandidate = `${candidateTitle} ${candidateArtist}`.trim();

  const titleScore = targetTitle
    ? Math.max(similarity(targetTitle, candidateTitle), containsScore(targetTitle, combinedCandidate))
    : 0;
  const artistScore = targetArtist
    ? Math.max(similarity(targetArtist, candidateArtist), containsScore(targetArtist, combinedCandidate))
    : 0;

  const hasDuration =
    Number.isFinite(track.duration) &&
    track.duration > 0 &&
    Number.isFinite(candidate.duration) &&
    candidate.duration > 0;

  let score;
  if (hasDuration) {
    const delta = Math.abs(track.duration - candidate.duration);
    const durationScore = delta <= 5 ? 1 : Math.max(0, 1 - (delta - 5) / 25);
    score = titleScore * 0.55 + artistScore * 0.3 + durationScore * 0.15;
  } else {
    score = titleScore * 0.66 + artistScore * 0.34;
  }

  const rankPenalty = Math.min(index, 10) * 0.015;
  const rawCombined = cleanText(`${candidate.title} ${candidate.artist}`);
  const canonicalBonus = Math.min(
    (isTopicCandidate(candidate) ? TOPIC_CHANNEL_BONUS : 0) +
      (candidate?.isOfficialArtist ? OFFICIAL_ARTIST_BONUS : 0),
    CANONICAL_BONUS_MAX
  );

  const adjusted =
    score -
    rankPenalty -
    negativeTermPenalty(track, rawCombined, negativeTerms) +
    preferredTermBonus(rawCombined, preferredTerms) +
    canonicalBonus;
  return clamp01(round3(adjusted));
}
function scoreCandidates(track, candidates = [], options = {}) {
  return candidates
    .map((candidate, index) => ({
      ...candidate,
      score: scoreCandidate(track, candidate, index, options)
    }))
    .sort((a, b) => b.score - a.score);
}
function pickBestMatch(track, candidates = [], minScore = DEFAULT_MIN_SCORE, options = {}) {
  const [best] = scoreCandidates(track, candidates, options);
  if (!best || best.score < minScore) {
    return null;
  }

  return best;
}

// True when both durations are known and differ by more than the tolerance.
// Used by the background to force the picker (duration veto) in auto mode.
function durationMismatch(track, candidate, toleranceSeconds = 15) {
  const target = Number(track?.duration);
  const candidateDuration = Number(candidate?.duration);
  const tolerance = Number(toleranceSeconds);

  if (!Number.isFinite(target) || target <= 0) {
    return false;
  }
  if (!Number.isFinite(candidateDuration) || candidateDuration <= 0) {
    return false;
  }

  return Math.abs(target - candidateDuration) > (Number.isFinite(tolerance) ? tolerance : 15);
}

// Stable key for match memory / processed history / rankings, based on title + artist.
function buildFingerprint(track = {}) {
  const title = normalizeForMatch(track.title);
  const artist = normalizeForMatch(track.artist);
  if (!title && !artist) {
    return "";
  }
  return `${title}::${artist}`;
}

function resolveTerms(customTerms, fallbackTerms) {
  // An explicitly empty array means "no terms"; null/undefined fall back to
  // the built-in defaults.
  const source = Array.isArray(customTerms) ? customTerms : fallbackTerms;
  return source.map((term) => normalizeForTerms(term)).filter(Boolean);
}

function negativeTermPenalty(track, candidateSource, terms = NEGATIVE_TERMS) {
  // Keep bracket contents (e.g. "(Karaoke Version)") so penalties still apply.
  const target = normalizeForTerms([track.title, track.artist].filter(Boolean).join(" "));
  const candidateText = normalizeForTerms(candidateSource);
  let hits = 0;

  terms.forEach((term) => {
    if (containsTerm(candidateText, term) && !containsTerm(target, term)) {
      hits += 1;
    }
  });

  return Math.min(hits * 0.12, 0.35);
}

function preferredTermBonus(candidateSource, terms = DEFAULT_PREFERRED_TERMS) {
  const candidateText = normalizeForTerms(candidateSource);
  let hits = 0;

  terms.forEach((term) => {
    if (containsTerm(candidateText, term)) {
      hits += 1;
    }
  });

  return Math.min(hits * PREFERRED_BONUS_PER_HIT, PREFERRED_BONUS_MAX);
}

function normalizeForTerms(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function containsTerm(text, term) {
  return ` ${text} `.includes(` ${term} `);
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

  // ---- src/lib/csv.js ----
// CSV builder used by the background service worker, rankings page, options
// page and test suite. Pure functions only.

// Guards against spreadsheet formula evaluation (=, @, tab/CR, or non-numeric
// leading +/- expressions) when opened in Excel, LibreOffice or Google Sheets.
function sanitizeCsvCell(value) {
  const text = String(value ?? "");
  if (!text) {
    return "";
  }
  if (/^[=@\t\r]/.test(text)) {
    return `'${text}`;
  }
  if (/^[+-]/.test(text) && !/^[+-]\d+(?:\.\d+)?$/.test(text)) {
    return `'${text}`;
  }
  return text;
}
function escapeCsvValue(value) {
  const text = sanitizeCsvCell(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
function buildCsv(columns, rows) {
  const lines = [columns.map((col) => escapeCsvValue(col)).join(",")];
  rows.forEach((row) => {
    lines.push(row.map((cell) => escapeCsvValue(cell)).join(","));
  });
  return lines.join("\r\n");
}
function formatDurationLabel(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) {
    return "";
  }
  const rounded = Math.round(total);
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

  // ---- src/lib/rankings.js ----
// Ranking helpers shared by the background service worker, content script,
// rankings page, options page and test suite. Pure functions only: no chrome.*
// or DOM APIs in this file.
const RATING_MAX = 5;

// "Focus favorites" keeps rows at this rating or above bright by default.
const FOCUS_MIN_RATING = 4;
const MAX_TAGS_PER_TRACK = 12;
const MAX_TAG_LENGTH = 28;
const MAX_NOTE_LENGTH = 280;

// Coerces anything into an integer 1..5, or 0 for "not rated".
function normalizeRating(value) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number) || number < 1 || number > RATING_MAX) {
    return 0;
  }
  return number;
}
function normalizeKind(value) {
  return String(value || "").trim().toLowerCase() === "sfx" ? "sfx" : "music";
}
function normalizeTags(input) {
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
function cleanNote(value) {
  return cleanText(value).slice(0, MAX_NOTE_LENGTH);
}

// "★★★★☆" style label for badges and lists.
function ratingToStars(rating) {
  const value = normalizeRating(rating);
  return "★".repeat(value) + "☆".repeat(RATING_MAX - value);
}

// Compact badge string for row pseudo-element, e.g. "★★★★★ · intro, reel".
function formatRowBadgeText(rating, tags = []) {
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
function buildRankingEntry({
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
function countRankings(rankings = {}) {
  return Object.entries(rankings || {}).filter(([, entry]) => normalizeRating(entry?.rating) > 0).length;
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
function collectAllTags(rankings = {}) {
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
function sortRankingEntries(rankings = {}, mode = "rating") {
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
function filterRankingEntries(
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
const RANKING_CSV_COLUMNS = [
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
function buildRankingCsvRows(rankings = {}) {
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

  // ---- src/lib/dom-extract.js ----
// DOM extraction helpers for Artlist Music rows, Sound Effects (SFX) rows, and
// standalone track detail pages. Written against standard DOM Element methods
// so it can be exercised directly in Node unit tests with lightweight mocks.
const OFFICIAL_DOWNLOAD_SELECTOR = [
  "button[aria-label='download' i]",
  "button[aria-label*='download' i]",
  "[data-testid='Tooltip' i][aria-label='Download' i] button",
  "[aria-label='Download' i] button",
  "[title*='download' i]",
  "[data-testid*='download' i]"
].join(",");
const KNOWN_ROW_SELECTOR = "[data-testid='music-row'], [data-testid='AudioRow']";
const TRACK_LINK_SELECTOR = [
  "a[href*='/royalty-free-music/song/']",
  "a[href*='/song/']",
  "a[href*='/sfx/track/']",
  "a[href*='/sound-effects/track/']"
].join(",");
const ARTIST_LINK_SELECTOR = [
  "a[href*='/royalty-free-music/artist/']",
  "a[href*='/artist/']",
  "a[href*='/sfx/artist/']",
  "a[href*='/creator/']"
].join(",");
const ROW_ATTR = "data-artlist-toolbox-row";
function detectTrackKind(target) {
  if (typeof target === "string") {
    return /\/(sfx|sound-effects)(?:\/|$)/i.test(target) ? "sfx" : "music";
  }

  if (!target || typeof target !== "object") {
    return "music";
  }

  const testId = String(target.getAttribute?.("data-testid") || "");
  if (testId === "AudioRow") {
    return "sfx";
  }
  if (testId === "music-row") {
    return "music";
  }

  if (target.querySelector?.("a[href*='/royalty-free-music/song/'], a[href*='/song/']")) {
    return "music";
  }
  if (target.querySelector?.("a[href*='/sfx/'], a[href*='/sound-effects/']")) {
    return "sfx";
  }

  const path = globalThis.location?.pathname || "";
  return detectTrackKind(path);
}
function isDetailPagePath(pathname) {
  return /\/(?:royalty-free-music\/song|song|sfx\/track|sound-effects\/track)\//i.test(
    String(pathname || "")
  );
}
function isTrackRow(element, doc = globalThis.document) {
  if (!element || element === doc?.body || element === doc?.documentElement) {
    return false;
  }

  if (element.matches?.(KNOWN_ROW_SELECTOR)) {
    return true;
  }

  // Never treat an inner child of a known row or an outer container holding
  // known rows as a track row itself.
  if (element.closest?.(KNOWN_ROW_SELECTOR) || element.querySelector?.(KNOWN_ROW_SELECTOR)) {
    return false;
  }

  const trackLinks = element.querySelectorAll?.(TRACK_LINK_SELECTOR) || [];
  if (trackLinks.length !== 1) {
    return false;
  }

  const hasDownload = Boolean(element.querySelector?.(OFFICIAL_DOWNLOAD_SELECTOR));
  return hasDownload;
}
function findTrackRowFromElement(element, doc = globalThis.document) {
  if (!element || element === doc?.body || element === doc?.documentElement) {
    return null;
  }

  const knownRow = element.closest?.(KNOWN_ROW_SELECTOR);
  if (knownRow) {
    return knownRow;
  }

  let current = element;
  while (current && current !== doc?.body && current !== doc?.documentElement) {
    if (isTrackRow(current, doc)) {
      return current;
    }
    current = current.parentElement || null;
  }
  return null;
}
function extractTrackFromRow(row, downloadButton = null) {
  if (!row) {
    return { title: "", artist: "", duration: null, url: "", kind: "music" };
  }

  let trackLink = row.querySelector?.(TRACK_LINK_SELECTOR) || null;

  // SFX AudioRow fallback: pick the primary non-artist/non-category anchor in the row.
  if (!trackLink && row.matches?.("[data-testid='AudioRow']")) {
    const anchors = [...(row.querySelectorAll?.("a[href]") || [])];
    trackLink =
      anchors.find((anchor) => {
        const href = String(anchor.getAttribute?.("href") || anchor.href || "");
        const label = cleanText(anchor.textContent);
        if (!label || !href) {
          return false;
        }
        return !/\/(artist|creator|category|categories|pack|packs)(?:\/|$)/i.test(href);
      }) || null;
  }

  const artistLinks = [...(row.querySelectorAll?.(ARTIST_LINK_SELECTOR) || [])];
  const title = cleanText(trackLink?.textContent);
  const artists = uniqueStrings(artistLinks.map((link) => cleanText(link.textContent)).filter(Boolean)).join(
    ", "
  );
  const duration = extractTrackDuration(row);
  const url = String(trackLink?.href || trackLink?.getAttribute?.("href") || "");
  const kind = url ? detectTrackKind(url) : detectTrackKind(row);

  if (title || artists) {
    return {
      title,
      artist: artists,
      duration,
      url,
      kind
    };
  }

  const labels = downloadButton ? extractGeometricLabels(row, downloadButton) : [];
  return {
    title: labels[0] || "",
    artist: labels[1] || "",
    duration,
    url,
    kind
  };
}
function extractTrackFromDetailPage(doc = globalThis.document, locationObj = globalThis.location) {
  const pathname = String(locationObj?.pathname || "");
  const href = String(locationObj?.href || "");
  const kind = detectTrackKind(pathname || href);

  if (!doc || !isDetailPagePath(pathname)) {
    return { title: "", artist: "", duration: null, url: href, kind };
  }

  const isInsideListRow = (node) =>
    Boolean(node?.closest?.(`[${ROW_ATTR}], ${KNOWN_ROW_SELECTOR}`));

  const headings = [...(doc.querySelectorAll?.("main h1, #app-root h1, h1") || [])].filter(
    (node) => !isInsideListRow(node) && isElementVisible(node)
  );
  const title = cleanText(headings[0]?.textContent);

  const artistLinks = [...(doc.querySelectorAll?.(ARTIST_LINK_SELECTOR) || [])].filter(
    (node) => !isInsideListRow(node) && isElementVisible(node)
  );
  const artist = uniqueStrings(artistLinks.map((node) => cleanText(node.textContent)).filter(Boolean))
    .slice(0, 3)
    .join(", ");

  const timeCandidates = [...(doc.querySelectorAll?.("time, span, div") || [])]
    .filter((node) => !isInsideListRow(node) && isElementVisible(node))
    .map((node) => cleanText(node.textContent))
    .filter((text) => /^\d{1,2}:\d{2}(?::\d{2})?$/.test(text));

  // If a player displays current / total time (e.g. "0:00" then "3:12"), prefer the first non-zero duration.
  const parsedTimes = timeCandidates.map(parseTimeLabel).filter((sec) => Number.isFinite(sec) && sec > 0);
  const duration = parsedTimes[0] ?? null;

  return {
    title,
    artist,
    duration,
    url: href,
    kind
  };
}
function extractTrackDuration(container) {
  if (!container) {
    return null;
  }

  const nodes = [...(container.querySelectorAll?.("time, span, div, p") || [])];
  for (const node of nodes) {
    const text = cleanText(node.textContent);
    if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(text) && isElementVisible(node)) {
      const parsed = parseTimeLabel(text);
      if (parsed !== null) {
        return parsed;
      }
    }
  }

  const fallback = cleanText(container.textContent).match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/);
  return fallback ? parseTimeLabel(fallback[0]) : null;
}
function parseTimeLabel(label) {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(label || "").trim());
  if (!match) {
    return null;
  }

  const [, first, second, third] = match;
  return third !== undefined
    ? Number(first) * 3600 + Number(second) * 60 + Number(third)
    : Number(first) * 60 + Number(second);
}
function isElementVisible(element) {
  if (!element) {
    return false;
  }
  if (typeof globalThis.getComputedStyle === "function") {
    const style = globalThis.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
  }
  return true;
}

function extractGeometricLabels(row, downloadButton) {
  if (typeof row.getBoundingClientRect !== "function" || typeof downloadButton.getBoundingClientRect !== "function") {
    return [];
  }

  const rowRect = row.getBoundingClientRect();
  const downloadRect = downloadButton.getBoundingClientRect();
  const maxLeft = Math.min(downloadRect.left, rowRect.left + Math.max(430, rowRect.width * 0.55));

  return [...(row.querySelectorAll?.("a, span, p, strong, h1, h2, h3, h4, div") || [])]
    .filter(isElementVisible)
    .map((node) => ({
      node,
      rect: node.getBoundingClientRect(),
      text: cleanText(node.textContent)
    }))
    .filter(({ node, rect, text }) => {
      if (!isUsefulTrackLabel(text) || node.contains?.(downloadButton)) {
        return false;
      }
      const startsInLeftMetadata = rect.left >= rowRect.left + 40 && rect.left < maxLeft;
      const compactLabel = rect.width <= Math.max(320, rowRect.width * 0.46);
      return startsInLeftMetadata && compactLabel;
    })
    .filter(({ node, text }) => {
      return ![...(node.children || [])].some((child) => cleanText(child.textContent) === text);
    })
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)
    .map(({ text }) => text)
    .filter((value, index, list) => list.indexOf(value) === index);
}

function isUsefulTrackLabel(value) {
  if (!value || value.length < 2 || value.length > 90) {
    return false;
  }
  if (/^\d+(:\d+)?$/.test(value) || /\b\d{1,2}:\d{2}\b/.test(value)) {
    return false;
  }
  return !/download|favorite|similar|share|more|play|pause|mp3|bpm|duration|add to/i.test(value);
}

function uniqueStrings(values) {
  return [...new Set(values)];
}

  // ---- src/lib/i18n.js ----
// Bilingual (English / Spanish) localization module shared across background,
// content script, popup, options and rankings / side panel views.
// Pure functions + lightweight DOM attribute translator.
const SUPPORTED_LANGUAGES = ["auto", "en", "es"];
const MESSAGES = {
  en: {
    // Context menus
    "menu.copyTrack": "Copy track info",
    "menu.exportCsv": "Export visible tracks (CSV)",
    "menu.openSidePanel": "Open Rankings side panel",

    // Background errors
    "error.youtubeSearchFailed": "Could not search for this track on YouTube.",
    "error.converterOpenFailed": "Could not open the converter.",
    "error.ratingSaveFailed": "Could not save that rating.",
    "error.missingTrackInfo": "Could not detect the track title or artist.",
    "error.flowDisabled": "The download flow is disabled in the popup.",
    "error.noResultsManualSearch": "No results found. Opened YouTube search so you can check manually.",
    "error.lowConfidenceManualSearch": "No close enough video match found. Opened YouTube search to check manually.",
    "error.invalidVideo": "The selected video is not valid.",
    "error.youtubeHttp": "YouTube responded with HTTP {status}.",
    "error.youtubeEmpty": "YouTube returned no results for this query.",
    "error.backupInvalid": "That file is not a valid Artlist Toolbox backup or config.",

    // Content script: tooltips & toasts
    "tooltip.thisTrack": "this track",
    "tooltip.searchYoutube": "Search {subject} on YouTube",
    "tooltip.searchAndPick": "Search {subject} on YouTube and pick a video",
    "tooltip.searchAndConvert": "Search {subject} on YouTube and open MP3 converter",
    "tooltip.openingSearch": "Opening YouTube search",
    "tooltip.ready": "Done",
    "tooltip.fromMemory": "From memory · ",
    "tooltip.matchPercent": " · {percent}% match",
    "tooltip.openingVideo": "{prefix}Opening: {title}{percent}",

    "toast.alreadyProcessed": "You already processed this track before.",
    "toast.processFailed": "Could not process this track.",
    "toast.youtubeLinkCopied": "YouTube link copied",
    "toast.youtubeLinkCopyFailed": "Could not copy the link",
    "toast.trackInfoMissing": "Could not detect track details.",
    "toast.copiedTrack": "Copied: {text}",
    "toast.clipboardFailed": "Could not copy to clipboard.",
    "toast.untitledTrack": "Untitled track",
    "toast.ratingSaved": "Rated {rating}/5 · {label}",
    "toast.ratingCleared": "Rating cleared · {label}",
    "toast.metaSaved": "Saved tags/note · {label}",
    "toast.focusOn": "Focus favorites: {min}+ stars · press f to exit",
    "toast.focusOff": "Focus favorites off",
    "toast.queueEnter": "Queue mode: click rows to add them. Press q to exit.",
    "toast.queueFinished": "Queue finished: {done} to converter · {search} to search · {failed} failed",
    "toast.noVisibleTracks": "No visible tracks found to export.",
    "toast.csvBuildFailed": "Could not generate CSV.",
    "toast.csvExported": "CSV exported: {count} tracks",

    // Content script: Candidate picker
    "picker.ariaLabel": "Choose YouTube video",
    "picker.headingVeto": "Duration differs from Artlist. Verify and pick a video (1–5):",
    "picker.headingDefault": "Choose the right video (1–5):",
    "picker.untitled": "Untitled video",
    "picker.usedBefore": "Used before",
    "picker.topicBadge": "Topic",
    "picker.previewYoutube": "Preview on YouTube",
    "picker.searchYoutube": "Search on YouTube",
    "picker.cancel": "Cancel",

    // Content script: Rating HUD & inline editor
    "hud.ariaLabel": "Rate track",
    "hud.starOne": "1 star",
    "hud.starMany": "{count} stars",
    "hud.editMeta": "Tags & note (t)",
    "hud.clear": "Clear",
    "hud.tagsPlaceholder": "Tags (comma-separated, e.g. intro, reel)",
    "hud.notePlaceholder": "Short note (e.g. drop at 1:14)…",
    "hud.save": "Save",
    "hud.close": "Close",

    // Content script: Focus favorites pill
    "focusPill.label": "Focus: {min}+ ★",
    "focusPill.labelFive": "Focus: 5 ★ only",
    "focusPill.cycleTitle": "Switch minimum star filter",
    "focusPill.exitTitle": "Exit Focus favorites (f)",

    // Content script: Queue bar
    "queue.stopping": "Stopping…",
    "queue.processing": "Processing…",
    "queue.processingItem": "Processing {index}/{total}: {title}",
    "queue.trackFallback": "track",
    "queue.selectedOne": "1 track queued",
    "queue.selectedMany": "{count} tracks queued",
    "queue.selectPrompt": "Click tracks to queue them",
    "queue.process": "Process",
    "queue.stop": "Stop",
    "queue.clear": "Clear",
    "queue.exit": "Exit",

    // Popup
    "popup.subtitle": "Library tools for Artlist.",
    "popup.sidePanel": "Open Rankings side panel",
    "popup.rankings": "Rankings",
    "popup.settings": "Settings",
    "popup.openArtlist": "Open Artlist Music",
    "popup.enableDownloader": "Enable Downloader",
    "popup.enableDownloaderHint": "Controls the download flow.",
    "popup.downloadFlow": "Download flow",
    "popup.modeAuto": "Auto",
    "popup.modeAsk": "Ask me",
    "popup.modeSearch": "Search only",
    "popup.flowHintAuto": "Search YouTube and open converter automatically.",
    "popup.flowHintAsk": "Show the top matches and let me pick one.",
    "popup.flowHintSearch": "Only open the YouTube search.",
    "popup.matchThreshold": "Match threshold",
    "popup.hidePromo": "Hide promo banner",
    "popup.hidePromoHint": "Removes the big promo hero on library pages.",
    "popup.compactRows": "Compact rows",
    "popup.compactRowsHint": "Tighter track rows so more of the library fits on screen.",
    "popup.trackRankings": "Track rankings",
    "popup.trackRankingsHint": "Rate with 1–5 · t for tags/note · f to focus favorites.",
    "popup.openInBackground": "Open in background",
    "popup.openInBackgroundHint": "Don't focus the tab we open.",
    "popup.exportCsv": "Export visible tracks (CSV)",
    "popup.openArtlistFirst": "Open an Artlist tab first.",
    "popup.exportingTracks": "Exporting {count} tracks…",
    "popup.noVisibleTracks": "No visible tracks to export.",
    "popup.reloadAndRetry": "Could not reach the page. Reload the tab and retry.",
    "popup.recentDownloads": "Recent downloads",
    "popup.clear": "Clear",
    "popup.noRecent": "No recent downloads.",
    "popup.statsLineOne": "1 download total · {week} in the last 7 days",
    "popup.statsLineMany": "{total} downloads total · {week} in the last 7 days",
    "popup.developedBy": "developed by",
    "popup.shortcutsTitle": "Shortcuts",
    "popup.shortcutRate": "Rate track",
    "popup.shortcutTags": "Tags / Note",
    "popup.shortcutFocus": "Focus favs",
    "popup.shortcutDownload": "Download",
    "popup.shortcutCopy": "Copy info",
    "popup.shortcutQueue": "Queue mode",
    "popup.shortcutSearch": "Search",

    // Rankings & Side Panel
    "rankings.title": "Track rankings",
    "rankings.subtitle": "Your 5-star picks, tags and notes from Artlist. Stored locally.",
    "rankings.openFullTab": "Open in full tab",
    "rankings.searchPlaceholder": "Search title, artist, tag or note…",
    "rankings.sortLabel": "Sort",
    "rankings.sortRating": "Rating",
    "rankings.sortRecent": "Recently rated",
    "rankings.sortTitle": "Title",
    "rankings.filterLabel": "Stars",
    "rankings.filterAll": "All ratings",
    "rankings.filter5": "5 stars",
    "rankings.filter4": "4 stars",
    "rankings.filter3": "3 stars",
    "rankings.filter2": "2 stars",
    "rankings.filter1": "1 star",
    "rankings.tagFilterLabel": "Tag",
    "rankings.tagFilterAll": "All tags",
    "rankings.kindFilterLabel": "Type",
    "rankings.kindAll": "All types",
    "rankings.kindMusic": "Music",
    "rankings.kindSfx": "SFX",
    "rankings.summaryEmpty": "No ranked tracks yet.",
    "rankings.summaryOne": "{shown} of 1 ranked track shown.",
    "rankings.summaryMany": "{shown} of {total} ranked tracks shown.",
    "rankings.emptyFiltered": "No ranked tracks match this search or filter.",
    "rankings.emptyInitial": "No ranked tracks yet. Hover a track on Artlist and press 1–5.",
    "rankings.rateStarOne": "Rate 1 star",
    "rankings.rateStarMany": "Rate {count} stars",
    "rankings.unknownTrack": "Unknown track",
    "rankings.ratedOn": "rated {date}",
    "rankings.openTrack": "Open",
    "rankings.edit": "Edit",
    "rankings.remove": "Remove",
    "rankings.save": "Save",
    "rankings.cancel": "Cancel",
    "rankings.exportCsv": "Export CSV",
    "rankings.exportJson": "Export JSON",
    "rankings.importJson": "Import JSON",
    "rankings.clearAll": "Clear all",
    "rankings.settingsLink": "Settings",
    "rankings.saveError": "Could not save that rating.",
    "rankings.noExport": "No rankings to export.",
    "rankings.exportedCsv": "Rankings CSV exported.",
    "rankings.exportedJson": "Rankings JSON exported.",
    "rankings.importedJson": "Merged {count} ranked tracks.",
    "rankings.importError": "Could not import rankings from that file.",
    "rankings.nothingToClear": "There are no rankings to clear.",
    "rankings.confirmClear": "Clear all {total} ranked tracks? This cannot be undone.",
    "rankings.clearError": "Could not clear rankings.",
    "rankings.cleared": "Cleared {count} rankings.",

    // Options
    "options.title": "Artlist Toolbox — Settings",
    "options.subtitle": "Everything is configurable. The download flow ships disabled by default; page tweaks and library tools work on their own.",
    "options.sectionDownload": "Download flow",
    "options.enableFlow": "Enable download flow",
    "options.enableFlowHint": "Enhances Artlist download buttons for YouTube lookup. Off by default.",
    "options.defaultBehavior": "Default behavior",
    "options.defaultBehaviorHint": "How a click resolves when no modifier key is used.",
    "options.flowHintAuto": "Search YouTube and open converter automatically (memory and duration veto still apply).",
    "options.flowHintAsk": "Show the top matches and let me pick one every time.",
    "options.flowHintSearch": "Only open the YouTube search; never auto-pick.",
    "options.matchThreshold": "Match threshold",
    "options.matchThresholdHint": "Minimum score to auto-pick a video in Auto mode.",
    "options.openBackground": "Open in background",
    "options.openBackgroundHint": "Don't focus the tab we open.",
    "options.durationVeto": "Duration veto",
    "options.durationVetoHint": "In Auto mode, force the manual picker when the video length differs from Artlist.",
    "options.vetoTolerance": "Veto tolerance",
    "options.vetoToleranceHint": "Seconds of difference allowed before asking.",
    "options.secondsUnit": "sec",
    "options.converterTemplate": "Converter URL template",
    "options.converterTemplateHint": "Supports {videoId}, {youtubeUrl} (encoded) and {rawYoutubeUrl}. Must start with https:// or http://.",
    "options.converterReset": "Reset URL",
    "options.converterInvalid": "Invalid URL template. Include https:// and {videoId} or {youtubeUrl}.",
    "options.converterSaved": "Converter URL saved.",

    "options.sectionKeywords": "Keywords",
    "options.keywordsHint": "One term per line. Terms match whole words (case and accents ignored). Clear a list to disable it.",
    "options.penalizedTerms": "Penalized terms",
    "options.penalizedHint": "Videos containing these lose score (unless the Artlist track mentions them too).",
    "options.preferredTerms": "Preferred terms",
    "options.preferredHint": "Videos containing these get a small bonus (max +10%).",
    "options.restoreDefaultsBtn": "Restore defaults",

    "options.sectionMemory": "Match memory",
    "options.rememberPicks": "Remember my picks",
    "options.rememberPicksHint": "In Auto mode, reuse the video you chose before for the same track (skips the search).",
    "options.memoryCountEmpty": "Nothing remembered yet. Pick a video from the picker and it will show up here.",
    "options.memoryCountOne": "1 remembered match (max 500).",
    "options.memoryCountMany": "{count} remembered matches (max 500).",
    "options.clearMemory": "Clear match memory",
    "options.confirmClearMemory": "Clear every remembered match? Future downloads will search YouTube again.",

    "options.sectionProcessed": "Processed history",
    "options.processedHint": "Tracks that went through the flow at least once. Used to dim rows and warn about repeats.",
    "options.processedCountEmpty": "No processed tracks yet.",
    "options.processedCountOne": "1 processed track (max 1000).",
    "options.processedCountMany": "{count} processed tracks (max 1000).",
    "options.clearProcessed": "Clear processed history",
    "options.confirmClearProcessed": "Clear the processed history? Rows will stop being dimmed.",

    "options.sectionPage": "Page & library",
    "options.language": "Language",
    "options.languageHint": "Applies to popup, settings, rankings, menus and in-page overlays.",
    "options.langAuto": "Auto (Browser)",
    "options.langEn": "English",
    "options.langEs": "Español",
    "options.hidePromo": "Hide promo banner",
    "options.hidePromoHint": "Removes the big promo hero on library pages before first paint.",
    "options.compactRows": "Compact rows",
    "options.compactRowsHint": "Tighter track and SFX rows so more of the library fits on screen.",
    "options.dimProcessed": "Dim processed rows",
    "options.dimProcessedHint": "Subtly fade tracks you already processed.",
    "options.shortcuts": "Keyboard shortcuts",
    "options.shortcutsHint": "d = download hovered · c = copy info · 1–5 = rate · 0 = clear · t = tags/note · f = focus favorites · / = search · q = queue.",

    "options.sectionRankings": "Track rankings",
    "options.enableRankings": "Enable track rankings",
    "options.enableRankingsHint": "Rate Music & SFX rows with 1–5, add tags/notes, and focus favorites. Works with the download flow off.",
    "options.rankingsCountEmpty": "No ranked tracks yet. Hover a track on Artlist and press 1–5.",
    "options.rankingsCountOne": "1 ranked track. Rate tracks on Artlist with 1–5.",
    "options.rankingsCountMany": "{count} ranked tracks. Rate tracks on Artlist with 1–5.",
    "options.openRankings": "Open rankings page",
    "options.openSidePanel": "Open in side panel",
    "options.clearRankings": "Clear all rankings",
    "options.confirmClearRankings": "Clear every ranked track? This cannot be undone.",

    "options.sectionAdvanced": "Advanced",
    "options.showPopupCsv": "Show CSV export button in popup",
    "options.showPopupCsvHint": "Adds the \"Export visible tracks (CSV)\" button to the popup. Right-click export stays available either way.",

    "options.sectionModifiers": "Modifier clicks & menus",
    "options.modAlt": " — always show the picker for that track.",
    "options.modShift": " — only open the YouTube search for that track.",
    "options.modCtrl": " — copy the resolved YouTube link (no tab).",
    "options.modRightTrack": "Right click on a track — copy its info from the context menu.",
    "options.modRightPage": "Right click on the page — export visible tracks as CSV or open the Rankings side panel.",

    "options.sectionStats": "Stats",
    "options.statsEmpty": "No downloads recorded yet.",
    "options.statsTotalOne": "1 download recorded (history kept for {days} days).",
    "options.statsTotalMany": "{count} downloads recorded (history kept for {days} days).",
    "options.statsDayOne": "1 download",
    "options.statsDayMany": "{count} downloads",
    "options.resetStats": "Reset stats",
    "options.confirmResetStats": "Reset the download stats?",

    "options.sectionBackup": "Backup & Config",
    "options.backupHint": "Full backups include settings, rankings (stars, tags, notes), match memory, processed history and stats.",
    "options.mergeOnImport": "Merge imported data with existing rankings & history",
    "options.mergeOnImportHint": "Keep existing items and update conflicts using the newest timestamp. Turn off to replace.",
    "options.exportFullBackup": "Export full backup (JSON)",
    "options.exportSettingsOnly": "Export settings only (JSON)",
    "options.importBackup": "Import backup / config",
    "options.exportRecentCsv": "Export recent (CSV)",
    "options.restoreAllDefaults": "Restore default settings",
    "options.confirmRestoreDefaults": "Restore every setting to its default? Memory, history, stats and rankings are NOT touched.",
    "options.backupExported": "Full backup exported.",
    "options.configExported": "Settings exported.",
    "options.importInvalid": "That file does not look like an Artlist Toolbox backup or config.",
    "options.importParseError": "Could not parse that file as JSON.",
    "options.importSuccess": "Imported {summary}. Reloading…",
    "options.defaultsRestored": "Defaults restored. Reloading…",
    "options.noRecentExport": "No recent downloads to export.",
    "options.recentExported": "Recent downloads exported.",

    "options.sectionDiagnostics": "Diagnostics",
    "options.diagnosticsLoading": "Loading…",
    "options.copyDiagnostics": "Copy diagnostics",
    "options.githubRepo": "GitHub repo",
    "options.diagnosticsCopied": "Diagnostics copied to the clipboard.",
    "options.diagnosticsCopyError": "Could not copy diagnostics.",
    "options.removeEntry": "Remove",
    "options.summarySettings": "{count} settings",
    "options.summaryRankings": "{count} rankings",
    "options.summaryMemory": "{count} memory",
    "options.summaryProcessed": "{count} processed",
    "options.summaryRecent": "{count} recent",
    "options.summaryBackup": "backup"
  },

  es: {
    // Context menus
    "menu.copyTrack": "Copiar info de la pista",
    "menu.exportCsv": "Exportar pistas visibles (CSV)",
    "menu.openSidePanel": "Abrir panel lateral de Rankings",

    // Background errors
    "error.youtubeSearchFailed": "No se pudo buscar la pista en YouTube.",
    "error.converterOpenFailed": "No se pudo abrir el conversor.",
    "error.ratingSaveFailed": "No se pudo guardar la calificación.",
    "error.missingTrackInfo": "No pude detectar el nombre de la pista ni el artista.",
    "error.flowDisabled": "El flujo de descarga está desactivado en el panel.",
    "error.noResultsManualSearch": "No encontré resultados. Abrí la búsqueda de YouTube para revisar manualmente.",
    "error.lowConfidenceManualSearch": "No encontré un video suficientemente parecido. Abrí la búsqueda de YouTube para revisar manualmente.",
    "error.invalidVideo": "El video seleccionado no es válido.",
    "error.youtubeHttp": "YouTube respondió con HTTP {status}.",
    "error.youtubeEmpty": "YouTube no devolvió resultados para esta búsqueda.",
    "error.backupInvalid": "Ese archivo no es un respaldo o configuración válida de Artlist Toolbox.",

    // Content script: tooltips & toasts
    "tooltip.thisTrack": "esta pista",
    "tooltip.searchYoutube": "Buscar {subject} en YouTube",
    "tooltip.searchAndPick": "Buscar {subject} en YouTube y elegir el video",
    "tooltip.searchAndConvert": "Buscar {subject} en YouTube y abrir descarga MP3",
    "tooltip.openingSearch": "Abriendo la búsqueda de YouTube",
    "tooltip.ready": "Listo",
    "tooltip.fromMemory": "Desde memoria · ",
    "tooltip.matchPercent": " · {percent}% de coincidencia",
    "tooltip.openingVideo": "{prefix}Abriendo: {title}{percent}",

    "toast.alreadyProcessed": "Esta pista ya la habías procesado antes.",
    "toast.processFailed": "No se pudo procesar la pista.",
    "toast.youtubeLinkCopied": "Link de YouTube copiado",
    "toast.youtubeLinkCopyFailed": "No se pudo copiar el link",
    "toast.trackInfoMissing": "No pude detectar la info de la pista.",
    "toast.copiedTrack": "Copiado: {text}",
    "toast.clipboardFailed": "No se pudo copiar al portapapeles.",
    "toast.untitledTrack": "Pista sin título",
    "toast.ratingSaved": "Calificación {rating}/5 · {label}",
    "toast.ratingCleared": "Calificación quitada · {label}",
    "toast.metaSaved": "Etiquetas/nota guardadas · {label}",
    "toast.focusOn": "Foco en favoritos: {min}+ estrellas · f para salir",
    "toast.focusOff": "Foco en favoritos desactivado",
    "toast.queueEnter": "Modo cola: clic en las filas para agregarlas. q para salir.",
    "toast.queueFinished": "Cola terminada: {done} al conversor · {search} a búsqueda · {failed} con error",
    "toast.noVisibleTracks": "No encontré pistas visibles para exportar.",
    "toast.csvBuildFailed": "No se pudo generar el CSV.",
    "toast.csvExported": "CSV exportado: {count} pistas",

    // Content script: Candidate picker
    "picker.ariaLabel": "Elegir video de YouTube",
    "picker.headingVeto": "La duración no coincide con Artlist. Verificá y elegí el video (1–5):",
    "picker.headingDefault": "Elegí el video correcto (1–5):",
    "picker.untitled": "Video sin título",
    "picker.usedBefore": "Usada antes",
    "picker.topicBadge": "Topic",
    "picker.previewYoutube": "Previsualizar en YouTube",
    "picker.searchYoutube": "Buscar en YouTube",
    "picker.cancel": "Cancelar",

    // Content script: Rating HUD & inline editor
    "hud.ariaLabel": "Calificar pista",
    "hud.starOne": "1 estrella",
    "hud.starMany": "{count} estrellas",
    "hud.editMeta": "Etiquetas y nota (t)",
    "hud.clear": "Quitar",
    "hud.tagsPlaceholder": "Etiquetas (separadas por coma, ej. intro, reel)",
    "hud.notePlaceholder": "Nota breve (ej. corte en 1:14)…",
    "hud.save": "Guardar",
    "hud.close": "Cerrar",

    // Content script: Focus favorites pill
    "focusPill.label": "Foco: {min}+ ★",
    "focusPill.labelFive": "Foco: solo 5 ★",
    "focusPill.cycleTitle": "Cambiar filtro mínimo de estrellas",
    "focusPill.exitTitle": "Salir de Foco en favoritos (f)",

    // Content script: Queue bar
    "queue.stopping": "Deteniendo…",
    "queue.processing": "Procesando…",
    "queue.processingItem": "Procesando {index}/{total}: {title}",
    "queue.trackFallback": "pista",
    "queue.selectedOne": "1 pista en cola",
    "queue.selectedMany": "{count} pistas en cola",
    "queue.selectPrompt": "Seleccioná pistas para la cola",
    "queue.process": "Procesar",
    "queue.stop": "Detener",
    "queue.clear": "Vaciar",
    "queue.exit": "Salir",

    // Popup
    "popup.subtitle": "Herramientas de biblioteca para Artlist.",
    "popup.sidePanel": "Abrir panel lateral de Rankings",
    "popup.rankings": "Rankings",
    "popup.settings": "Ajustes",
    "popup.openArtlist": "Abrir Artlist Music",
    "popup.enableDownloader": "Activar descargador",
    "popup.enableDownloaderHint": "Controla el flujo de descarga.",
    "popup.downloadFlow": "Flujo de descarga",
    "popup.modeAuto": "Auto",
    "popup.modeAsk": "Preguntar",
    "popup.modeSearch": "Solo buscar",
    "popup.flowHintAuto": "Buscar en YouTube y abrir el conversor automáticamente.",
    "popup.flowHintAsk": "Mostrar las mejores coincidencias para elegir.",
    "popup.flowHintSearch": "Abrir únicamente la búsqueda en YouTube.",
    "popup.matchThreshold": "Umbral de coincidencia",
    "popup.hidePromo": "Ocultar banner promo",
    "popup.hidePromoHint": "Quita el banner promocional grande en la biblioteca.",
    "popup.compactRows": "Filas compactas",
    "popup.compactRowsHint": "Filas más ajustadas para ver más pistas en pantalla.",
    "popup.trackRankings": "Calificación de pistas",
    "popup.trackRankingsHint": "Calificá con 1–5 · t etiquetas/nota · f foco en favoritos.",
    "popup.openInBackground": "Abrir en segundo plano",
    "popup.openInBackgroundHint": "No enfocar la pestaña nueva.",
    "popup.exportCsv": "Exportar pistas visibles (CSV)",
    "popup.openArtlistFirst": "Abrí primero una pestaña de Artlist.",
    "popup.exportingTracks": "Exportando {count} pistas…",
    "popup.noVisibleTracks": "No hay pistas visibles para exportar.",
    "popup.reloadAndRetry": "No se pudo conectar con la página. Recargá la pestaña.",
    "popup.recentDownloads": "Descargas recientes",
    "popup.clear": "Borrar",
    "popup.noRecent": "Sin descargas recientes.",
    "popup.statsLineOne": "1 descarga en total · {week} en los últimos 7 días",
    "popup.statsLineMany": "{total} descargas en total · {week} en los últimos 7 días",
    "popup.developedBy": "desarrollado por",
    "popup.shortcutsTitle": "Atajos de teclado",
    "popup.shortcutRate": "Calificar",
    "popup.shortcutTags": "Etiquetas / Nota",
    "popup.shortcutFocus": "Foco favoritos",
    "popup.shortcutDownload": "Descargar",
    "popup.shortcutCopy": "Copiar info",
    "popup.shortcutQueue": "Modo cola",
    "popup.shortcutSearch": "Buscar",

    // Rankings & Side Panel
    "rankings.title": "Rankings de pistas",
    "rankings.subtitle": "Tus selecciones de 5 estrellas, etiquetas y notas de Artlist. Guardado localmente.",
    "rankings.openFullTab": "Abrir en pestaña completa",
    "rankings.searchPlaceholder": "Buscar título, artista, etiqueta o nota…",
    "rankings.sortLabel": "Orden",
    "rankings.sortRating": "Estrellas",
    "rankings.sortRecent": "Recientes",
    "rankings.sortTitle": "Título",
    "rankings.filterLabel": "Filtro",
    "rankings.filterAll": "Todas",
    "rankings.filter5": "5 estrellas",
    "rankings.filter4": "4 estrellas",
    "rankings.filter3": "3 estrellas",
    "rankings.filter2": "2 estrellas",
    "rankings.filter1": "1 estrella",
    "rankings.tagFilterLabel": "Etiqueta",
    "rankings.tagFilterAll": "Todas",
    "rankings.kindFilterLabel": "Tipo",
    "rankings.kindAll": "Todos",
    "rankings.kindMusic": "Música",
    "rankings.kindSfx": "SFX",
    "rankings.summaryEmpty": "Todavía no hay pistas calificadas.",
    "rankings.summaryOne": "Mostrando {shown} de 1 pista calificada.",
    "rankings.summaryMany": "Mostrando {shown} de {total} pistas calificadas.",
    "rankings.emptyFiltered": "Ninguna pista coincide con esta búsqueda o filtro.",
    "rankings.emptyInitial": "Todavía no calificaste pistas. Pasá el cursor sobre una pista en Artlist y presioná 1–5.",
    "rankings.rateStarOne": "Calificar 1 estrella",
    "rankings.rateStarMany": "Calificar {count} estrellas",
    "rankings.unknownTrack": "Pista desconocida",
    "rankings.ratedOn": "calificada {date}",
    "rankings.openTrack": "Abrir",
    "rankings.edit": "Editar",
    "rankings.remove": "Quitar",
    "rankings.save": "Guardar",
    "rankings.cancel": "Cancelar",
    "rankings.exportCsv": "Exportar CSV",
    "rankings.exportJson": "Exportar JSON",
    "rankings.importJson": "Importar JSON",
    "rankings.clearAll": "Borrar todo",
    "rankings.settingsLink": "Ajustes",
    "rankings.saveError": "No se pudo guardar la calificación.",
    "rankings.noExport": "No hay rankings para exportar.",
    "rankings.exportedCsv": "CSV de rankings exportado.",
    "rankings.exportedJson": "JSON de rankings exportado.",
    "rankings.importedJson": "Se combinaron {count} pistas calificadas.",
    "rankings.importError": "No se pudieron importar rankings de ese archivo.",
    "rankings.nothingToClear": "No hay rankings para borrar.",
    "rankings.confirmClear": "¿Borrar las {total} pistas calificadas? Esta acción no se puede deshacer.",
    "rankings.clearError": "No se pudieron borrar los rankings.",
    "rankings.cleared": "Se borraron {count} rankings.",

    // Options
    "options.title": "Artlist Toolbox — Ajustes",
    "options.subtitle": "Todo es configurable. El flujo de descarga viene desactivado por defecto; las herramientas de biblioteca funcionan de forma independiente.",
    "options.sectionDownload": "Flujo de descarga",
    "options.enableFlow": "Activar flujo de descarga",
    "options.enableFlowHint": "Activa la búsqueda en YouTube desde los botones de descarga de Artlist. Desactivado por defecto.",
    "options.defaultBehavior": "Comportamiento por defecto",
    "options.defaultBehaviorHint": "Qué ocurre al hacer clic sin teclas modificadoras.",
    "options.flowHintAuto": "Buscar en YouTube y abrir el conversor automáticamente (respeta memoria y veto de duración).",
    "options.flowHintAsk": "Mostrar las mejores coincidencias para elegir manualmente cada vez.",
    "options.flowHintSearch": "Abrir únicamente la búsqueda de YouTube; nunca elegir automáticamente.",
    "options.matchThreshold": "Umbral de coincidencia",
    "options.matchThresholdHint": "Puntaje mínimo para elegir un video automáticamente en modo Auto.",
    "options.openBackground": "Abrir en segundo plano",
    "options.openBackgroundHint": "No cambiar el foco a la pestaña nueva.",
    "options.durationVeto": "Veto por duración",
    "options.durationVetoHint": "En modo Auto, mostrar el selector manual si la duración difiere de la pista en Artlist.",
    "options.vetoTolerance": "Tolerancia de duración",
    "options.vetoToleranceHint": "Segundos de diferencia permitidos antes de preguntar.",
    "options.secondsUnit": "seg",
    "options.converterTemplate": "Plantilla URL del conversor",
    "options.converterTemplateHint": "Soporta {videoId}, {youtubeUrl} (codificado) y {rawYoutubeUrl}. Debe iniciar con https:// o http://.",
    "options.converterReset": "Restablecer URL",
    "options.converterInvalid": "Plantilla inválida. Incluí https:// y {videoId} o {youtubeUrl}.",
    "options.converterSaved": "URL del conversor guardada.",

    "options.sectionKeywords": "Palabras clave",
    "options.keywordsHint": "Un término por línea. Se comparan palabras completas (sin importar mayúsculas o acentos). Vaciar para desactivar.",
    "options.penalizedTerms": "Términos penalizados",
    "options.penalizedHint": "Los videos con estos términos pierden puntaje (salvo que la pista de Artlist también los incluya).",
    "options.preferredTerms": "Términos preferidos",
    "options.preferredHint": "Los videos con estos términos reciben un pequeño bonus (máx. +10%).",
    "options.restoreDefaultsBtn": "Restaurar valores",

    "options.sectionMemory": "Memoria de coincidencias",
    "options.rememberPicks": "Recordar mis elecciones",
    "options.rememberPicksHint": "En modo Auto, reutilizar el video elegido anteriormente para la misma pista (omite la búsqueda).",
    "options.memoryCountEmpty": "Todavía no hay coincidencias guardadas. Elegí un video del selector y aparecerá acá.",
    "options.memoryCountOne": "1 coincidencia recordada (máx. 500).",
    "options.memoryCountMany": "{count} coincidencias recordadas (máx. 500).",
    "options.clearMemory": "Borrar memoria de coincidencias",
    "options.confirmClearMemory": "¿Borrar todas las coincidencias recordadas? Las próximas descargas volverán a buscar en YouTube.",

    "options.sectionProcessed": "Historial procesado",
    "options.processedHint": "Pistas que pasaron por el flujo al menos una vez. Se usa para atenuar filas y avisar repetidos.",
    "options.processedCountEmpty": "Todavía no hay pistas procesadas.",
    "options.processedCountOne": "1 pista procesada (máx. 1000).",
    "options.processedCountMany": "{count} pistas procesadas (máx. 1000).",
    "options.clearProcessed": "Borrar historial procesado",
    "options.confirmClearProcessed": "¿Borrar el historial procesado? Las filas dejarán de mostrarse atenuadas.",

    "options.sectionPage": "Página y biblioteca",
    "options.language": "Idioma",
    "options.languageHint": "Se aplica al popup, ajustes, rankings, menús y controles en Artlist.",
    "options.langAuto": "Automático (Navegador)",
    "options.langEn": "English",
    "options.langEs": "Español",
    "options.hidePromo": "Ocultar banner promocional",
    "options.hidePromoHint": "Oculta el banner promocional grande antes del primer render.",
    "options.compactRows": "Filas compactas",
    "options.compactRowsHint": "Reduce el alto de las filas de música y efectos de sonido (SFX).",
    "options.dimProcessed": "Atenuar filas procesadas",
    "options.dimProcessedHint": "Atenúa suavemente las pistas que ya procesaste.",
    "options.shortcuts": "Atajos de teclado",
    "options.shortcutsHint": "d = descargar · c = copiar info · 1–5 = calificar · 0 = quitar · t = etiquetas/nota · f = foco favoritos · / = buscar · q = cola.",

    "options.sectionRankings": "Calificación de pistas",
    "options.enableRankings": "Activar calificación de pistas",
    "options.enableRankingsHint": "Calificá música y SFX con 1–5, agregá etiquetas/notas y destacá favoritos. Funciona sin el flujo de descarga.",
    "options.rankingsCountEmpty": "Todavía no hay pistas calificadas. Pasá el cursor sobre una pista en Artlist y presioná 1–5.",
    "options.rankingsCountOne": "1 pista calificada. Calificá pistas en Artlist con 1–5.",
    "options.rankingsCountMany": "{count} pistas calificadas. Calificá pistas en Artlist con 1–5.",
    "options.openRankings": "Abrir página de rankings",
    "options.openSidePanel": "Abrir en panel lateral",
    "options.clearRankings": "Borrar todos los rankings",
    "options.confirmClearRankings": "¿Borrar todas las pistas calificadas? Esta acción no se puede deshacer.",

    "options.sectionAdvanced": "Avanzado",
    "options.showPopupCsv": "Mostrar botón de exportar CSV en el popup",
    "options.showPopupCsvHint": "Agrega el botón \"Exportar pistas visibles (CSV)\" al popup. El menú contextual sigue disponible siempre.",

    "options.sectionModifiers": "Clics con teclas y menús",
    "options.modAlt": " — mostrar siempre el selector para esa pista.",
    "options.modShift": " — abrir solo la búsqueda en YouTube para esa pista.",
    "options.modCtrl": " — copiar el link de YouTube resuelto (sin abrir pestaña).",
    "options.modRightTrack": "Clic derecho en una pista — copiar su información desde el menú contextual.",
    "options.modRightPage": "Clic derecho en la página — exportar pistas visibles a CSV o abrir el panel lateral de Rankings.",

    "options.sectionStats": "Estadísticas",
    "options.statsEmpty": "Todavía no se registraron descargas.",
    "options.statsTotalOne": "1 descarga registrada (historial de {days} días).",
    "options.statsTotalMany": "{count} descargas registradas (historial de {days} días).",
    "options.statsDayOne": "1 descarga",
    "options.statsDayMany": "{count} descargas",
    "options.resetStats": "Reiniciar estadísticas",
    "options.confirmResetStats": "¿Reiniciar las estadísticas de descarga?",

    "options.sectionBackup": "Respaldo y configuración",
    "options.backupHint": "El respaldo completo incluye ajustes, rankings (estrellas, etiquetas, notas), memoria de coincidencias, historial y estadísticas.",
    "options.mergeOnImport": "Combinar datos importados con rankings e historial actuales",
    "options.mergeOnImportHint": "Conserva los elementos existentes y actualiza duplicados según la fecha más reciente. Desactivá para reemplazar.",
    "options.exportFullBackup": "Exportar respaldo completo (JSON)",
    "options.exportSettingsOnly": "Exportar solo ajustes (JSON)",
    "options.importBackup": "Importar respaldo / config",
    "options.exportRecentCsv": "Exportar recientes (CSV)",
    "options.restoreAllDefaults": "Restaurar ajustes por defecto",
    "options.confirmRestoreDefaults": "¿Restaurar todos los ajustes a sus valores por defecto? Memoria, historial, estadísticas y rankings NO se borran.",
    "options.backupExported": "Respaldo completo exportado.",
    "options.configExported": "Ajustes exportados.",
    "options.importInvalid": "Ese archivo no parece un respaldo o configuración de Artlist Toolbox.",
    "options.importParseError": "No se pudo leer ese archivo como JSON.",
    "options.importSuccess": "Importado: {summary}. Recargando…",
    "options.defaultsRestored": "Ajustes restaurados. Recargando…",
    "options.noRecentExport": "No hay descargas recientes para exportar.",
    "options.recentExported": "Descargas recientes exportadas.",

    "options.sectionDiagnostics": "Diagnóstico",
    "options.diagnosticsLoading": "Cargando…",
    "options.copyDiagnostics": "Copiar diagnóstico",
    "options.githubRepo": "Repositorio GitHub",
    "options.diagnosticsCopied": "Diagnóstico copiado al portapapeles.",
    "options.diagnosticsCopyError": "No se pudo copiar el diagnóstico.",
    "options.removeEntry": "Quitar",
    "options.summarySettings": "{count} ajustes",
    "options.summaryRankings": "{count} rankings",
    "options.summaryMemory": "{count} en memoria",
    "options.summaryProcessed": "{count} procesadas",
    "options.summaryRecent": "{count} recientes",
    "options.summaryBackup": "respaldo"
  }
};
function detectBrowserLanguage() {
  try {
    if (globalThis.chrome?.i18n?.getUILanguage) {
      return String(globalThis.chrome.i18n.getUILanguage() || "");
    }
  } catch (_error) {
    // Fall back to navigator.language
  }
  return String(globalThis.navigator?.language || "");
}
function resolveLanguage(preference = "auto", uiLanguage = detectBrowserLanguage()) {
  if (preference === "en" || preference === "es") {
    return preference;
  }
  return /^es\b/i.test(String(uiLanguage || "").trim()) ? "es" : "en";
}
function t(key, params = {}, lang = "en") {
  const activeLang = lang === "es" ? "es" : "en";
  const template = MESSAGES[activeLang]?.[key] ?? MESSAGES.en[key] ?? key;

  if (!params || typeof params !== "object") {
    return template;
  }

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (full, token) =>
    token in params && params[token] !== undefined && params[token] !== null
      ? String(params[token])
      : full
  );
}
function applyDomTranslations(root, lang = "en") {
  if (!root?.querySelectorAll) {
    return;
  }

  const activeLang = lang === "es" ? "es" : "en";
  if (root.documentElement) {
    root.documentElement.lang = activeLang;
  }

  root.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.getAttribute("data-i18n");
    if (key) {
      node.textContent = t(key, {}, activeLang);
    }
  });

  root.querySelectorAll("[data-i18n-title]").forEach((node) => {
    const key = node.getAttribute("data-i18n-title");
    if (key) {
      node.setAttribute("title", t(key, {}, activeLang));
    }
  });

  root.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    const key = node.getAttribute("data-i18n-placeholder");
    if (key) {
      node.setAttribute("placeholder", t(key, {}, activeLang));
    }
  });

  root.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
    const key = node.getAttribute("data-i18n-aria-label");
    if (key) {
      node.setAttribute("aria-label", t(key, {}, activeLang));
    }
  });
}

  // ---- src/content-main.js ----
const ENHANCED_DOWNLOAD_CLASS = "artlist-youtube-mp3-download";
const ACTIVE_DOWNLOAD_CLASS = "artlist-youtube-mp3-download-active";
const DOWNLOAD_ATTR = "data-artlist-youtube-mp3-download";
const PICKER_ID = "artlist-y2mate-picker";
const PICKER_HEADING_ID = "artlist-y2mate-picker-heading";
const HIDE_HERO_ATTR = "data-artlist-toolbox-hide-hero";
const HIDE_HERO_CACHE_KEY = "artlistToolbox:hideHeroBanner";
const COMPACT_ATTR = "data-artlist-toolbox-compact";
const DIM_PROCESSED_ATTR = "data-artlist-toolbox-dim";
const SELECT_ATTR = "data-artlist-toolbox-select";
const KIND_ATTR = "data-artlist-toolbox-kind";
const PROCESSED_ATTR = "data-artlist-toolbox-processed";
const QUEUED_ATTR = "data-artlist-toolbox-queued";
const QUEUE_STATE_ATTR = "data-artlist-toolbox-queue-state";
const QUEUE_BAR_ID = "artlist-toolbox-queue-bar";
const FOCUS_PILL_ID = "artlist-toolbox-focus-pill";
const TOAST_ID = "artlist-toolbox-toast";
const RATING_ATTR = "data-artlist-toolbox-rating";
const RATING_STARS_ATTR = "data-artlist-toolbox-stars";
const RANKINGS_ATTR = "data-artlist-toolbox-rankings";
const FOCUS_RANKED_ATTR = "data-artlist-toolbox-focus-ranked";
const FOCUS_MIN_ATTR = "data-artlist-toolbox-focus-min";
const RATING_HUD_ID = "artlist-toolbox-rating-hud";

const SCAN_DEBOUNCE_MS = 180;
const BOOTSTRAP_SCAN_COUNT = 12;
const BOOTSTRAP_SCAN_INTERVAL_MS = 850;
const MAX_ROOTS_PER_SCAN = 40;
const DECORATION_BATCH_SIZE = 30;
const QUEUE_DELAY_MS = 2200;
const RATING_HUD_DELAY_MS = 320;
const RATING_HUD_HIDE_MS = 160;
const SCROLL_COOLDOWN_MS = 260;

const SUPPORTS_POPOVER =
  typeof HTMLElement !== "undefined" && "popover" in HTMLElement.prototype;

let scanTimer = null;
let bootstrapTimer = null;
let bootstrapScansRemaining = BOOTSTRAP_SCAN_COUNT;
const pendingRoots = new Set();
const dirtyRows = new Set();
let decorationLoopRunning = false;
let lastKnownHref = window.location.href;

let langPref = "auto";
let currentLang = resolveLanguage("auto");
let extensionEnabled = false;
let flowMode = "auto";
let hideHeroBanner = false;
let compactRows = false;
let processedDim = true;
let keyboardShortcuts = true;
let rankingsEnabled = true;
let focusRanked = false;
let focusMinRating = FOCUS_MIN_RATING;

let processedMap = {};
let rankingsMap = {};

let pickerCleanup = null;
let pickerContext = null;
let pickerTriggerAnchor = null;

let lastHoveredRow = null;
let lastContextRow = null;

let queueSelectMode = false;
let queueRunning = false;
let queueStopRequested = false;
let queueStatusText = "";
const queuedRows = new Set();

const pendingRatings = new WeakMap();
let ratingHudRow = null;
let ratingHudEditorOpen = false;
let ratingHudDraftRating = 0;
let ratingHudShowTimer = null;
let ratingHudHideTimer = null;
let lastScrollAt = 0;
let toastTimer = null;

void boot();

async function boot() {
  if (!document.body) {
    window.setTimeout(() => void boot(), 80);
    return;
  }

  const items = await chrome.storage.local.get({
    language: "auto",
    enabled: false,
    flowMode: null,
    searchOnly: false,
    hideHeroBanner: false,
    compactRows: false,
    processedDim: true,
    keyboardShortcuts: true,
    rankingsEnabled: true,
    processed: {},
    rankings: {}
  });

  langPref = items.language || "auto";
  currentLang = resolveLanguage(langPref);
  extensionEnabled = Boolean(items.enabled);
  flowMode = items.flowMode || (items.searchOnly ? "search" : "auto");
  hideHeroBanner = Boolean(items.hideHeroBanner);
  compactRows = Boolean(items.compactRows);
  processedDim = items.processedDim !== false;
  keyboardShortcuts = items.keyboardShortcuts !== false;
  rankingsEnabled = items.rankingsEnabled !== false;
  processedMap = items.processed && typeof items.processed === "object" ? items.processed : {};
  rankingsMap = items.rankings && typeof items.rankings === "object" ? items.rankings : {};

  applyPageTweaks();
  startBootstrapScans();

  chrome.storage.onChanged.addListener(handleStorageChange);
  document.addEventListener("click", handleDocumentClick, true);
  document.addEventListener("mouseover", handleDocumentMouseOver, true);
  document.addEventListener("keydown", handleKeyDown, true);
  document.addEventListener("contextmenu", handleContextMenu, true);
  window.addEventListener("scroll", handleWindowScroll, true);
  window.addEventListener("resize", handleWindowResize);
  window.addEventListener("popstate", () => startBootstrapScans());
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  observePageChanges();
  exposeDebugHelper();
}

function handleStorageChange(changes, area) {
  if (area !== "local") {
    return;
  }

  if (changes.language !== undefined) {
    langPref = changes.language.newValue || "auto";
    currentLang = resolveLanguage(langPref);
    refreshLiveUiStrings();
  }

  if (changes.flowMode !== undefined) {
    flowMode = changes.flowMode.newValue || "auto";
    refreshDownloadButtonTooltips();
  } else if (changes.searchOnly !== undefined) {
    flowMode = changes.searchOnly.newValue ? "search" : "auto";
    refreshDownloadButtonTooltips();
  }

  if (changes.hideHeroBanner !== undefined) {
    hideHeroBanner = Boolean(changes.hideHeroBanner.newValue);
    applyPageTweaks();
  }

  if (changes.compactRows !== undefined) {
    compactRows = Boolean(changes.compactRows.newValue);
    applyPageTweaks();
  }

  if (changes.processedDim !== undefined) {
    processedDim = changes.processedDim.newValue !== false;
    applyPageTweaks();
    queueAllRowsForDecoration();
  }

  if (changes.processed !== undefined) {
    processedMap =
      changes.processed.newValue && typeof changes.processed.newValue === "object"
        ? changes.processed.newValue
        : {};
    queueAllRowsForDecoration();
  }

  if (changes.keyboardShortcuts !== undefined) {
    keyboardShortcuts = changes.keyboardShortcuts.newValue !== false;
  }

  if (changes.rankingsEnabled !== undefined) {
    rankingsEnabled = changes.rankingsEnabled.newValue !== false;
    applyPageTweaks();
    if (rankingsEnabled) {
      queueAllRowsForDecoration();
    } else {
      clearRatingMarks();
      closeRatingHud();
      renderFocusPill();
    }
  }

  if (changes.rankings !== undefined) {
    rankingsMap =
      changes.rankings.newValue && typeof changes.rankings.newValue === "object"
        ? changes.rankings.newValue
        : {};
    queueAllRowsForDecoration();
    if (ratingHudRow && !ratingHudEditorOpen) {
      updateRatingHud(ratingHudRow);
    }
  }

  if (changes.enabled !== undefined) {
    extensionEnabled = Boolean(changes.enabled.newValue);
    if (extensionEnabled) {
      startBootstrapScans();
    } else {
      stopQueue();
      exitQueueSelectMode();
      removeEnhancements();
    }
  }
}

function startBootstrapScans() {
  bootstrapScansRemaining = BOOTSTRAP_SCAN_COUNT;
  window.clearTimeout(bootstrapTimer);
  scheduleScan(document);
  scheduleNextBootstrapScan();
}

function scheduleNextBootstrapScan() {
  if (bootstrapScansRemaining <= 0) {
    return;
  }
  bootstrapScansRemaining -= 1;
  bootstrapTimer = window.setTimeout(() => {
    scheduleScan(document);
    scheduleNextBootstrapScan();
  }, BOOTSTRAP_SCAN_INTERVAL_MS);
}

function observePageChanges() {
  const observer = new MutationObserver((mutations) => {
    if (window.location.href !== lastKnownHref) {
      lastKnownHref = window.location.href;
      startBootstrapScans();
      return;
    }

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          pendingRoots.add(node);
        }
      }
    }

    if (pendingRoots.size) {
      scheduleScan();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function scheduleScan(root = null) {
  if (root) {
    pendingRoots.add(root);
  }

  window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => {
    const run = () => flushScanQueue();
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(run, { timeout: 600 });
      return;
    }
    window.requestAnimationFrame(run);
  }, SCAN_DEBOUNCE_MS);
}

function flushScanQueue() {
  const roots = [...pendingRoots].slice(0, MAX_ROOTS_PER_SCAN);
  roots.forEach((root) => pendingRoots.delete(root));

  const discoveredRows = [];
  roots.forEach((root) => {
    tagTrackRows(root, discoveredRows);
    enhanceDownloadButtons(root);
  });

  queueRowsForDecoration(discoveredRows);
  decorateDetailPage();

  if (pendingRoots.size) {
    scheduleScan();
  }
}

function tagTrackRows(root = document, collector = []) {
  // Clean up any container that may have been previously marked but is not an actual single track row.
  queryWithinRoot(root, `[${ROW_ATTR}]`).forEach((el) => {
    if (!isTrackRow(el, document)) {
      el.removeAttribute(ROW_ATTR);
      el.removeAttribute(PROCESSED_ATTR);
      el.removeAttribute(RATING_ATTR);
      el.removeAttribute(RATING_STARS_ATTR);
    }
  });

  queryWithinRoot(root, KNOWN_ROW_SELECTOR).forEach((row) => {
    markRowElement(row, collector);
  });

  queryWithinRoot(root, TRACK_LINK_SELECTOR).forEach((link) => {
    const row = findTrackRowFromElement(link, document);
    if (row) {
      markRowElement(row, collector);
    }
  });

  if (root?.nodeType === Node.ELEMENT_NODE && isTrackRow(root, document)) {
    markRowElement(root, collector);
  }
}

function markRowElement(row, collector) {
  if (!isTrackRow(row, document)) {
    return;
  }
  row.setAttribute(ROW_ATTR, "true");
  collector.push(row);
}

function queueAllRowsForDecoration() {
  queueRowsForDecoration([...document.querySelectorAll(`[${ROW_ATTR}]`)]);
}

function queueRowsForDecoration(rows) {
  rows.forEach((row) => {
    if (row?.isConnected) {
      dirtyRows.add(row);
    }
  });

  if (dirtyRows.size && !decorationLoopRunning) {
    void processRowDecorationBatches();
  }
}

// Batches DOM attribute writes via requestAnimationFrame so infinite-scroll
// lists of hundreds of rows never block the main thread.
async function processRowDecorationBatches() {
  if (decorationLoopRunning) {
    return;
  }
  decorationLoopRunning = true;

  try {
    while (dirtyRows.size > 0) {
      const batch = [];
      for (const row of dirtyRows) {
        dirtyRows.delete(row);
        if (row.isConnected) {
          batch.push(row);
        }
        if (batch.length >= DECORATION_BATCH_SIZE) {
          break;
        }
      }

      if (!batch.length) {
        break;
      }

      await new Promise((resolve) => {
        window.requestAnimationFrame(() => {
          batch.forEach((row) => decorateSingleRow(row));
          resolve();
        });
      });

      if (dirtyRows.size > 0 && globalThis.scheduler?.yield) {
        await globalThis.scheduler.yield();
      }
    }
  } finally {
    decorationLoopRunning = false;
  }
}

function decorateSingleRow(row) {
  const track = extractTrackFromRow(row);
  if (track.kind) {
    row.setAttribute(KIND_ATTR, track.kind);
  }

  const fingerprint = buildFingerprint(track);
  if (!fingerprint) {
    row.removeAttribute(PROCESSED_ATTR);
    syncRowDownloadedButton(row, false);
    if (!pendingRatings.has(row)) {
      applyRowRatingAttributes(row, 0);
    }
    return;
  }

  const isProcessed = Boolean(processedMap[fingerprint]);
  if (isProcessed) {
    row.setAttribute(PROCESSED_ATTR, String(processedMap[fingerprint]?.at || "1"));
  } else {
    row.removeAttribute(PROCESSED_ATTR);
  }
  syncRowDownloadedButton(row, isProcessed);

  if (!rankingsEnabled) {
    applyRowRatingAttributes(row, 0);
    return;
  }

  if (pendingRatings.has(row)) {
    return;
  }

  const entry = rankingsMap[fingerprint] || null;
  const rating = normalizeRating(entry?.rating);
  applyRowRatingAttributes(row, rating, entry?.tags, entry?.note);
}

function applyRowRatingAttributes(row, rating, tags = [], note = "") {
  const value = normalizeRating(rating);
  if (value) {
    row.setAttribute(RATING_ATTR, String(value));
    row.setAttribute(RATING_STARS_ATTR, formatRowBadgeText(value, tags));
    const cleanedNote = cleanNote(note);
    if (cleanedNote) {
      row.dataset.artlistToolboxNote = cleanedNote;
    } else {
      delete row.dataset.artlistToolboxNote;
    }
  } else {
    row.removeAttribute(RATING_ATTR);
    row.removeAttribute(RATING_STARS_ATTR);
    delete row.dataset.artlistToolboxNote;
  }
}

let cachedNativeDownloadedSvgHtml = null;

function isNativeDownloadedButton(button) {
  if (!button) {
    return false;
  }
  if (button.querySelector("[data-testid='DownloadedButton']")) {
    return true;
  }
  const svg = button.querySelector("svg:not(.artlist-toolbox-downloaded-icon)");
  if (svg && svg.getAttribute("data-icon") === "circle-arrow-down") {
    return true;
  }
  return false;
}

function scanForNativeDownloadedSvg() {
  if (cachedNativeDownloadedSvgHtml) {
    return cachedNativeDownloadedSvgHtml;
  }
  const native = document.querySelector("[data-testid='DownloadedButton']");
  if (native && !native.classList.contains("artlist-toolbox-downloaded-icon")) {
    cachedNativeDownloadedSvgHtml = native.outerHTML;
    return cachedNativeDownloadedSvgHtml;
  }
  return null;
}

function getArtlistDownloadedSvgHtml() {
  const nativeHtml = scanForNativeDownloadedSvg();
  if (nativeHtml) {
    return nativeHtml;
  }
  return `<svg aria-hidden="true" focusable="false" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" data-icon="circle-arrow-down" class="svg-inline--fa fa-circle-arrow-down h-4 w-4 text-accent artlist-toolbox-downloaded-icon" data-testid="DownloadedButton" style="width: 16px; height: 16px; color: var(--color-accent, #ffcf00); fill: currentColor; display: block;"><path fill="currentColor" d="M256 0a256 256 0 1 0 0 512A256 256 0 1 0 256 0zM127 281c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l71 71L232 136c0-13.3 10.7-24 24-24s24 10.7 24 24l0 182.1 71-71c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9L273 393c-9.4 9.4-24.6 9.4-33.9 0L127 281z"></path></svg>`;
}

function syncRowDownloadedButton(row, isProcessed) {
  const button = findRowDownloadButton(row);
  if (!button) {
    return;
  }

  // If Artlist's native React code already rendered its native downloaded icon (has circle/yellow),
  // leave it alone — and save its exact SVG HTML as our golden standard for other rows!
  if (isNativeDownloadedButton(button)) {
    if (!cachedNativeDownloadedSvgHtml) {
      const svg = button.querySelector("svg:not(.artlist-toolbox-downloaded-icon)");
      if (svg) {
        cachedNativeDownloadedSvgHtml = svg.outerHTML;
      }
    }
    button.removeAttribute("data-artlist-toolbox-downloaded");
    return;
  }

  button.toggleAttribute("data-artlist-toolbox-downloaded", Boolean(isProcessed));

  let downloadedWrapper = button.querySelector(".artlist-toolbox-downloaded-wrapper");
  if (isProcessed) {
    if (!downloadedWrapper) {
      downloadedWrapper = document.createElement("span");
      downloadedWrapper.className = "artlist-toolbox-downloaded-wrapper";
      downloadedWrapper.innerHTML = getArtlistDownloadedSvgHtml();
      button.append(downloadedWrapper);
    }
    downloadedWrapper.style.setProperty("display", "inline-flex", "important");

    // Hide all original button siblings directly on the DOM
    for (const child of button.children) {
      if (child !== downloadedWrapper) {
        child.style.setProperty("display", "none", "important");
      }
    }
  } else {
    if (downloadedWrapper) {
      downloadedWrapper.style.setProperty("display", "none", "important");
    }
    // Restore all original button siblings
    for (const child of button.children) {
      if (child !== downloadedWrapper) {
        child.style.removeProperty("display");
      }
    }
  }
}

function decorateDetailPage() {
  if (!isDetailPagePath(window.location.pathname)) {
    return;
  }
  const track = extractTrackFromDetailPage(document, window.location);
  const fingerprint = buildFingerprint(track);
  const isProcessed = Boolean(fingerprint && processedMap[fingerprint]);
  const [button] = findOfficialDownloadButtons(document);
  if (button) {
    if (isNativeDownloadedButton(button)) {
      if (!cachedNativeDownloadedSvgHtml) {
        const svg = button.querySelector("svg:not(.artlist-toolbox-downloaded-icon)");
        if (svg) {
          cachedNativeDownloadedSvgHtml = svg.outerHTML;
        }
      }
      button.removeAttribute("data-artlist-toolbox-downloaded");
      return;
    }
    button.toggleAttribute("data-artlist-toolbox-downloaded", isProcessed);
    let downloadedWrapper = button.querySelector(".artlist-toolbox-downloaded-wrapper");
    if (isProcessed) {
      if (!downloadedWrapper) {
        downloadedWrapper = document.createElement("span");
        downloadedWrapper.className = "artlist-toolbox-downloaded-wrapper";
        downloadedWrapper.innerHTML = getArtlistDownloadedSvgHtml();
        button.append(downloadedWrapper);
      }
      downloadedWrapper.style.setProperty("display", "inline-flex", "important");
      for (const child of button.children) {
        if (child !== downloadedWrapper) {
          child.style.setProperty("display", "none", "important");
        }
      }
    } else {
      if (downloadedWrapper) {
        downloadedWrapper.style.setProperty("display", "none", "important");
      }
      for (const child of button.children) {
        if (child !== downloadedWrapper) {
          child.style.removeProperty("display");
        }
      }
    }
  }
}

function formatTooltipTitle(track) {
  const subject =
    track && (track.title || track.artist)
      ? `"${[track.title, track.artist ? `(${track.artist})` : ""].filter(Boolean).join(" ")}"`
      : t("tooltip.thisTrack", {}, currentLang);

  const key =
    flowMode === "search"
      ? "tooltip.searchYoutube"
      : flowMode === "ask"
        ? "tooltip.searchAndPick"
        : "tooltip.searchAndConvert";

  return t(key, { subject }, currentLang);
}

function formatResultTooltip(response) {
  if (response.mode === "search") {
    return t("tooltip.openingSearch", {}, currentLang);
  }

  const video = response.video;
  if (!video) {
    return t("tooltip.ready", {}, currentLang);
  }

  const prefix = response.remembered ? t("tooltip.fromMemory", {}, currentLang) : "";
  const percent =
    typeof video.score === "number"
      ? t("tooltip.matchPercent", { percent: Math.round(video.score * 100) }, currentLang)
      : "";
  return t("tooltip.openingVideo", { prefix, title: video.title, percent }, currentLang);
}

function refreshLiveUiStrings() {
  refreshDownloadButtonTooltips();
  renderFocusPill();
  renderQueueBar();
  if (ratingHudRow) {
    closeRatingHud();
  }
}

function refreshDownloadButtonTooltips() {
  if (!extensionEnabled) {
    return;
  }
  document.querySelectorAll(`[${DOWNLOAD_ATTR}]`).forEach((button) => {
    const track = resolveTrackForButton(button);
    button.title = formatTooltipTitle(track);
  });
}

function handleWindowScroll() {
  lastScrollAt = Date.now();
  if (!ratingHudEditorOpen) {
    closeRatingHud();
  }
}

function handleWindowResize() {
  closeRatingHud();
  const picker = document.getElementById(PICKER_ID);
  if (picker && pickerTriggerAnchor?.isConnected) {
    positionPicker(picker, pickerTriggerAnchor);
  }
}

function handleDocumentMouseOver(event) {
  if (event.target?.closest?.(`#${RATING_HUD_ID}`)) {
    cancelRatingHudHide();
    return;
  }

  let hoveredRow = event.target?.closest?.(`[${ROW_ATTR}]`);
  if (hoveredRow && !isTrackRow(hoveredRow, document)) {
    hoveredRow.removeAttribute(ROW_ATTR);
    hoveredRow = null;
  }
  if (!hoveredRow && event.target?.nodeType === Node.ELEMENT_NODE) {
    hoveredRow = findTrackRowFromElement(event.target, document);
    if (hoveredRow) {
      hoveredRow.setAttribute(ROW_ATTR, "true");
      queueRowsForDecoration([hoveredRow]);
    }
  }

  if (hoveredRow) {
    lastHoveredRow = hoveredRow;
    if (!ratingHudEditorOpen && Date.now() - lastScrollAt >= SCROLL_COOLDOWN_MS) {
      scheduleRatingHud(hoveredRow);
    }
    if (extensionEnabled) {
      enhanceDownloadButtons(hoveredRow);
    }
  } else if (ratingHudRow && !ratingHudEditorOpen) {
    scheduleRatingHudHide();
  }

  if (!extensionEnabled) {
    return;
  }

  const downloadButton = findOfficialDownloadButtonFromTarget(event.target);
  if (!downloadButton) {
    return;
  }

  if (!downloadButton.hasAttribute(DOWNLOAD_ATTR) && isActionableDownloadButton(downloadButton)) {
    downloadButton.setAttribute("data-original-title", downloadButton.title || "");
    downloadButton.classList.add(ENHANCED_DOWNLOAD_CLASS);
    downloadButton.setAttribute(DOWNLOAD_ATTR, "true");
  }

  if (!downloadButton.hasAttribute(DOWNLOAD_ATTR)) {
    return;
  }

  const track = resolveTrackForButton(downloadButton, hoveredRow);
  if (track.title || track.artist) {
    downloadButton.title = formatTooltipTitle(track);
  }
}

function enhanceDownloadButtons(root = document) {
  if (!extensionEnabled) {
    return;
  }

  findOfficialDownloadButtons(root).forEach((button) => {
    if (isActionableDownloadButton(button)) {
      if (!button.hasAttribute(DOWNLOAD_ATTR)) {
        button.setAttribute("data-original-title", button.title || "");
      }
      button.classList.add(ENHANCED_DOWNLOAD_CLASS);
      button.setAttribute(DOWNLOAD_ATTR, "true");

      const track = resolveTrackForButton(button);
      button.title = formatTooltipTitle(track);
    }
  });
}

function resolveTrackForButton(downloadButton, knownRow = null) {
  const row = knownRow || findTrackRowFromElement(downloadButton, document);
  if (row) {
    const track = extractTrackFromRow(row, downloadButton);
    if (track.title || track.artist) {
      return track;
    }
  }

  if (isDetailPagePath(window.location.pathname)) {
    return extractTrackFromDetailPage(document, window.location);
  }

  return { title: "", artist: "", duration: null, url: "", kind: "music" };
}

function isActionableDownloadButton(button) {
  if (!button) {
    return false;
  }
  if (findTrackRowFromElement(button, document)) {
    return true;
  }
  return isDetailPagePath(window.location.pathname);
}

function applyPageTweaks() {
  const shouldHideHero = Boolean(hideHeroBanner);
  document.documentElement.toggleAttribute(HIDE_HERO_ATTR, shouldHideHero);
  document.documentElement.toggleAttribute(COMPACT_ATTR, Boolean(compactRows));
  document.documentElement.toggleAttribute(DIM_PROCESSED_ATTR, Boolean(processedDim));
  document.documentElement.toggleAttribute(RANKINGS_ATTR, Boolean(rankingsEnabled));
  if (!rankingsEnabled) {
    document.documentElement.removeAttribute(FOCUS_RANKED_ATTR);
    document.documentElement.removeAttribute(FOCUS_MIN_ATTR);
    focusRanked = false;
  } else if (focusRanked) {
    document.documentElement.setAttribute(FOCUS_MIN_ATTR, String(focusMinRating));
  }
  try {
    window.localStorage.setItem(HIDE_HERO_CACHE_KEY, shouldHideHero ? "1" : "0");
  } catch (_error) {
    // localStorage unavailable: early-guard.js will skip pre-hiding.
  }
}

function removeEnhancements() {
  closePicker();
  document.querySelectorAll(".artlist-toolbox-downloaded-wrapper, .artlist-toolbox-downloaded-icon").forEach((el) => {
    const parent = el.parentElement;
    el.remove();
    if (parent) {
      for (const child of parent.children) {
        child.style.removeProperty("display");
      }
    }
  });
  document.querySelectorAll(`.${ENHANCED_DOWNLOAD_CLASS}, [${DOWNLOAD_ATTR}]`).forEach((button) => {
    button.classList.remove(ENHANCED_DOWNLOAD_CLASS);
    button.classList.remove(ACTIVE_DOWNLOAD_CLASS);
    button.removeAttribute(DOWNLOAD_ATTR);
    button.removeAttribute("data-artlist-toolbox-downloaded");
    delete button.dataset.artlistYoutubeMp3State;
    if (button.hasAttribute("data-original-title")) {
      button.title = button.getAttribute("data-original-title") || "";
      button.removeAttribute("data-original-title");
    }
  });
}

function handleDocumentClick(event) {
  if (queueSelectMode && !queueRunning) {
    const isToolboxUi = event.target?.closest?.(
      `#${QUEUE_BAR_ID}, #${TOAST_ID}, #${RATING_HUD_ID}, #${FOCUS_PILL_ID}, #${PICKER_ID}`
    );
    const row = isToolboxUi ? null : event.target?.closest?.(`[${ROW_ATTR}]`);
    if (row) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      toggleQueuedRow(row);
      return;
    }
  }

  if (!extensionEnabled) {
    return;
  }

  const downloadButton = findOfficialDownloadButtonFromTarget(event.target);
  if (!downloadButton) {
    return;
  }

  if (
    !downloadButton.classList.contains(ENHANCED_DOWNLOAD_CLASS) &&
    !isActionableDownloadButton(downloadButton)
  ) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  void startDownloadForButton(downloadButton, {
    ask: Boolean(event.altKey),
    search: Boolean(event.shiftKey),
    copy: Boolean(event.metaKey || event.ctrlKey)
  });
}

async function startDownloadForButton(downloadButton, modifiers = {}) {
  const row = findTrackRowFromElement(downloadButton, document);
  const track = resolveTrackForButton(downloadButton, row);

  if (!track.title && !track.artist) {
    console.warn("[Artlist Toolbox] Track metadata missing", {
      button: downloadButton,
      row
    });
    markButtonState(downloadButton, "error");
    window.setTimeout(() => markButtonState(downloadButton, "ready"), 2200);
    return;
  }

  const fingerprint = buildFingerprint(track);
  if (row?.hasAttribute(PROCESSED_ATTR) || (fingerprint && processedMap[fingerprint])) {
    showToast(t("toast.alreadyProcessed", {}, currentLang));
  }

  const options = {};
  if (modifiers.ask) {
    options.override = "ask";
  } else if (modifiers.search) {
    options.override = "search";
  }
  if (modifiers.copy) {
    options.copyOnly = true;
  }

  markButtonState(downloadButton, "loading");
  const response = await sendMessageAsync({
    type: "ARTLIST_DOWNLOAD_TRACK",
    payload: track,
    options
  });

  if (!response?.ok) {
    console.warn("[Artlist Toolbox]", response?.error, track);
    showToast(response?.error || t("toast.processFailed", {}, currentLang), "warn");
    markButtonState(downloadButton, "error");
    window.setTimeout(() => markButtonState(downloadButton, "ready"), 2200);
    return;
  }

  if (response.mode === "copied" && response.url) {
    markButtonState(downloadButton, "ready");
    const ok = await copyTextToClipboard(response.url);
    showToast(
      t(ok ? "toast.youtubeLinkCopied" : "toast.youtubeLinkCopyFailed", {}, currentLang),
      ok ? "info" : "warn"
    );
    return;
  }

  if (response.mode === "ask" && response.candidates?.length) {
    markButtonState(downloadButton, "ready");
    renderCandidatePicker({
      candidates: response.candidates,
      searchUrl: response.searchUrl,
      anchor: downloadButton,
      veto: Boolean(response.veto),
      memoryVideoId: response.memoryVideoId || null,
      track
    });
    return;
  }

  markButtonState(downloadButton, "done");
  downloadButton.title = formatResultTooltip(response);
  window.setTimeout(() => markButtonState(downloadButton, "ready"), 2200);
}

function findOfficialDownloadButtonFromTarget(target) {
  const button = target?.closest?.("button, [role='button'], a, div, span");
  if (!button) {
    return null;
  }

  const directButton = button.matches?.(OFFICIAL_DOWNLOAD_SELECTOR)
    ? button
    : button.closest?.(OFFICIAL_DOWNLOAD_SELECTOR);

  if (directButton && directButton.matches("button, [role='button'], a, div, span")) {
    return normalizeDownloadButton(directButton);
  }

  const tooltipWrapper = button.closest?.(
    "[data-testid='Tooltip'][aria-label='Download' i], [aria-label='Download' i]"
  );
  if (tooltipWrapper) {
    const nestedButton = tooltipWrapper.querySelector("button, [role='button'], a");
    return nestedButton || tooltipWrapper;
  }

  return null;
}

function findOfficialDownloadButtons(root = document) {
  return uniqueElements(
    queryWithinRoot(root, OFFICIAL_DOWNLOAD_SELECTOR)
      .map(normalizeDownloadButton)
      .filter(Boolean)
      .filter(isElementVisible)
  );
}

function normalizeDownloadButton(element) {
  if (!element) {
    return null;
  }
  if (element.matches("button, [role='button'], a")) {
    return element;
  }
  return element.querySelector?.("button, [role='button'], a") || element;
}

function markButtonState(button, state) {
  button.dataset.artlistYoutubeMp3State = state;
  button.classList.toggle(ACTIVE_DOWNLOAD_CLASS, state === "loading");
}

function renderCandidatePicker({
  candidates,
  searchUrl,
  anchor,
  veto = false,
  memoryVideoId = null,
  track = null
}) {
  closePicker({ restoreFocus: false });

  pickerContext = { track };
  pickerTriggerAnchor = anchor || null;

  const picker = document.createElement("div");
  picker.id = PICKER_ID;
  picker.className = "artlist-y2mate-picker";
  picker.setAttribute("role", "dialog");
  picker.setAttribute("aria-labelledby", PICKER_HEADING_ID);
  if (SUPPORTS_POPOVER) {
    picker.setAttribute("popover", "auto");
  }
  picker.addEventListener("click", (event) => event.stopPropagation());

  const heading = document.createElement("p");
  heading.id = PICKER_HEADING_ID;
  heading.className = "artlist-y2mate-picker-heading";
  heading.textContent = t(
    veto ? "picker.headingVeto" : "picker.headingDefault",
    {},
    currentLang
  );
  picker.append(heading);

  const list = document.createElement("ul");
  list.className = "artlist-y2mate-picker-list";
  candidates.forEach((candidate, index) => {
    list.append(buildCandidateCard(candidate, index, memoryVideoId));
  });
  picker.append(list);

  const footer = document.createElement("div");
  footer.className = "artlist-y2mate-picker-footer";

  const searchLink = document.createElement("a");
  searchLink.href = searchUrl;
  searchLink.target = "_blank";
  searchLink.rel = "noopener";
  searchLink.textContent = t("picker.searchYoutube", {}, currentLang);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "artlist-y2mate-picker-close";
  closeButton.textContent = t("picker.cancel", {}, currentLang);
  closeButton.addEventListener("click", () => closePicker());

  footer.append(searchLink, closeButton);
  picker.append(footer);

  document.body.append(picker);
  if (SUPPORTS_POPOVER) {
    try {
      picker.showPopover();
    } catch (_error) {
      picker.classList.add("is-open");
    }
  } else {
    picker.classList.add("is-open");
  }

  positionPicker(picker, anchor);
  bindPickerInteractions(picker, candidates);

  const firstCandidateBtn = picker.querySelector(".artlist-y2mate-candidate");
  firstCandidateBtn?.focus({ preventScroll: true });
}

function buildCandidateCard(candidate, index, memoryVideoId = null) {
  const item = document.createElement("li");
  item.className = "artlist-y2mate-candidate-row";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "artlist-y2mate-candidate";
  button.addEventListener("click", () => openY2mate(candidate));

  const shortcut = document.createElement("span");
  shortcut.className = "artlist-y2mate-candidate-index";
  shortcut.textContent = String(index + 1);
  shortcut.setAttribute("aria-hidden", "true");
  button.append(shortcut);

  const thumb = document.createElement("img");
  thumb.alt = "";
  thumb.loading = "lazy";
  thumb.src = candidate.thumbnail || "";
  thumb.addEventListener("error", () => thumb.remove());
  button.append(thumb);

  const info = document.createElement("span");
  info.className = "artlist-y2mate-candidate-info";

  const title = document.createElement("span");
  title.className = "artlist-y2mate-candidate-title";
  title.textContent = candidate.title || t("picker.untitled", {}, currentLang);

  const meta = document.createElement("span");
  meta.className = "artlist-y2mate-candidate-meta";
  meta.textContent = [
    candidate.artist,
    candidate.duration ? formatDurationLabel(candidate.duration) : "",
    typeof candidate.score === "number" ? `${Math.round(candidate.score * 100)}%` : ""
  ]
    .filter(Boolean)
    .join(" · ");

  info.append(title, meta);

  const badges = document.createElement("span");
  badges.className = "artlist-y2mate-candidate-badges";

  if (memoryVideoId && candidate.videoId === memoryVideoId) {
    const badge = document.createElement("span");
    badge.className = "artlist-y2mate-candidate-badge";
    badge.textContent = t("picker.usedBefore", {}, currentLang);
    badges.append(badge);
  }

  if (candidate.isTopic) {
    const topicBadge = document.createElement("span");
    topicBadge.className = "artlist-y2mate-candidate-badge topic";
    topicBadge.textContent = t("picker.topicBadge", {}, currentLang);
    badges.append(topicBadge);
  }

  if (badges.childElementCount > 0) {
    info.append(badges);
  }

  button.append(info);
  item.append(button);

  if (candidate.url) {
    const previewLink = document.createElement("a");
    previewLink.href = candidate.url;
    previewLink.target = "_blank";
    previewLink.rel = "noopener";
    previewLink.className = "artlist-y2mate-candidate-preview";
    previewLink.title = t("picker.previewYoutube", {}, currentLang);
    previewLink.setAttribute("aria-label", t("picker.previewYoutube", {}, currentLang));
    previewLink.textContent = "↗";
    item.append(previewLink);
  }

  return item;
}

function openY2mate(candidate) {
  if (!candidate?.videoId) {
    return;
  }

  void sendMessageAsync({
    type: "ARTLIST_OPEN_Y2MATE",
    payload: {
      videoId: candidate.videoId,
      title: candidate.title || "",
      artist: candidate.artist || "",
      track: pickerContext?.track || null
    }
  });
  closePicker({ restoreFocus: false });
}

function positionPicker(picker, anchor) {
  if (!anchor?.getBoundingClientRect) {
    return;
  }
  const margin = 8;
  const rect = anchor.getBoundingClientRect();
  const width = picker.offsetWidth || 368;
  const height = picker.offsetHeight || 280;

  const left = Math.min(
    Math.max(margin, rect.left),
    Math.max(margin, window.innerWidth - width - margin)
  );
  let top = rect.bottom + margin;
  if (top + height > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - height - margin);
  }

  picker.style.left = `${left}px`;
  picker.style.top = `${top}px`;
}

function bindPickerInteractions(picker, candidates) {
  const onKeyDown = (event) => {
    if (!document.getElementById(PICKER_ID)) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closePicker();
      return;
    }

    if (!event.altKey && !event.ctrlKey && !event.metaKey && /^[1-5]$/.test(event.key)) {
      const idx = Number(event.key) - 1;
      if (candidates[idx]) {
        event.preventDefault();
        event.stopPropagation();
        openY2mate(candidates[idx]);
      }
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const buttons = [...picker.querySelectorAll(".artlist-y2mate-candidate")];
      if (!buttons.length) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const currentIdx = buttons.indexOf(document.activeElement);
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const nextIdx =
        currentIdx === -1 ? 0 : (currentIdx + delta + buttons.length) % buttons.length;
      buttons[nextIdx]?.focus({ preventScroll: true });
    }
  };

  const onDocumentClick = (event) => {
    if (!event.target?.closest?.(`#${PICKER_ID}`)) {
      closePicker({ restoreFocus: false });
    }
  };

  const onPopoverToggle = (event) => {
    if (event.newState === "closed") {
      closePicker();
    }
  };

  document.addEventListener("keydown", onKeyDown, true);
  if (SUPPORTS_POPOVER) {
    picker.addEventListener("toggle", onPopoverToggle);
  } else {
    document.addEventListener("click", onDocumentClick, true);
  }

  pickerCleanup = () => {
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("click", onDocumentClick, true);
    picker.removeEventListener("toggle", onPopoverToggle);
  };
}

function closePicker({ restoreFocus = true } = {}) {
  if (pickerCleanup) {
    const cleanup = pickerCleanup;
    pickerCleanup = null;
    cleanup();
  }

  const picker = document.getElementById(PICKER_ID);
  if (picker) {
    picker.remove();
  }

  const trigger = pickerTriggerAnchor;
  pickerContext = null;
  pickerTriggerAnchor = null;

  if (restoreFocus && trigger?.isConnected && typeof trigger.focus === "function") {
    trigger.focus({ preventScroll: true });
  }
}

function handleKeyDown(event) {
  if (event.defaultPrevented) {
    return;
  }

  // Let the candidate picker handle its own shortcuts while open.
  if (document.getElementById(PICKER_ID)) {
    return;
  }

  if (event.key === "Escape" && ratingHudRow) {
    event.preventDefault();
    closeRatingHud();
    return;
  }

  if (!keyboardShortcuts) {
    return;
  }
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  const target = event.target;
  if (
    target &&
    (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName || ""))
  ) {
    return;
  }

  const row = lastHoveredRow && document.contains(lastHoveredRow) ? lastHoveredRow : null;
  const onDetailPage = !row && isDetailPagePath(window.location.pathname);

  if (rankingsEnabled && /^[0-5]$/.test(event.key) && !event.shiftKey && !event.repeat) {
    if (row) {
      event.preventDefault();
      void setRowRating(row, Number(event.key));
      return;
    }
    if (onDetailPage) {
      event.preventDefault();
      void setDetailPageRating(Number(event.key));
      return;
    }
  }

  if (
    rankingsEnabled &&
    (event.key === "t" || event.key === "T") &&
    !event.shiftKey &&
    !event.repeat &&
    row
  ) {
    event.preventDefault();
    openRatingHudEditor(row);
    return;
  }

  if (
    rankingsEnabled &&
    (event.key === "f" || event.key === "F") &&
    !event.shiftKey &&
    !event.repeat
  ) {
    event.preventDefault();
    toggleFocusRanked();
    return;
  }

  if (event.key === "/") {
    const input = findSearchInput();
    if (input) {
      event.preventDefault();
      input.focus();
    }
    return;
  }

  if ((event.key === "c" || event.key === "C") && !event.shiftKey) {
    if (row) {
      event.preventDefault();
      void copyTrackInfoFromRow(row);
      return;
    }
    if (onDetailPage) {
      event.preventDefault();
      void copyTrackInfoObject(extractTrackFromDetailPage(document, window.location));
      return;
    }
  }

  if ((event.key === "d" || event.key === "D") && !event.shiftKey && extensionEnabled) {
    if (row) {
      const button = findRowDownloadButton(row);
      if (button) {
        event.preventDefault();
        void startDownloadForButton(button, {});
      }
      return;
    }
    if (onDetailPage) {
      const [button] = findOfficialDownloadButtons(document);
      if (button) {
        event.preventDefault();
        void startDownloadForButton(button, {});
      }
      return;
    }
  }

  if ((event.key === "q" || event.key === "Q") && !event.shiftKey && extensionEnabled) {
    event.preventDefault();
    toggleQueueSelectMode();
  }
}

function findSearchInput() {
  return document.querySelector(
    "[data-testid='SearchContainer'] input, input[type='search'], input[placeholder*='Search' i]"
  );
}

function findRowDownloadButton(row) {
  const [button] = findOfficialDownloadButtons(row);
  return button || null;
}

function handleContextMenu(event) {
  const row = event.target?.closest?.(`[${ROW_ATTR}]`);
  if (row) {
    lastContextRow = row;
  }
}

function handleRuntimeMessage(message, _sender, sendResponse) {
  if (message?.type === "ARTLIST_CONTEXT_COPY") {
    const row = findActionableRow();
    if (row) {
      void copyTrackInfoFromRow(row);
      sendResponse({ ok: true });
      return false;
    }
    if (isDetailPagePath(window.location.pathname)) {
      void copyTrackInfoObject(extractTrackFromDetailPage(document, window.location));
      sendResponse({ ok: true });
      return false;
    }
    showToast(t("toast.trackInfoMissing", {}, currentLang), "warn");
    sendResponse({ ok: false });
    return false;
  }

  if (message?.type === "ARTLIST_EXPORT_CSV") {
    sendResponse(exportVisibleTracksCsv());
    return false;
  }

  return false;
}

function findActionableRow() {
  if (lastContextRow && document.contains(lastContextRow)) {
    return lastContextRow;
  }
  if (lastHoveredRow && document.contains(lastHoveredRow)) {
    return lastHoveredRow;
  }
  return null;
}

async function copyTrackInfoFromRow(row) {
  await copyTrackInfoObject(extractTrackFromRow(row));
}

async function copyTrackInfoObject(track) {
  if (!track?.title && !track?.artist) {
    showToast(t("toast.trackInfoMissing", {}, currentLang), "warn");
    return;
  }

  const text = buildTrackInfoText(track);
  const ok = await copyTextToClipboard(text);
  showToast(
    ok
      ? t("toast.copiedTrack", { text }, currentLang)
      : t("toast.clipboardFailed", {}, currentLang),
    ok ? "info" : "warn"
  );
}

function buildTrackInfoText(track) {
  const title = track.title || t("toast.untitledTrack", {}, currentLang);
  let text = track.artist ? `${track.artist} - ${title}` : title;
  if (track.duration) {
    text += ` (${formatDurationLabel(track.duration)})`;
  }
  return text;
}

async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_error) {
    // Fall through to legacy textarea copy.
  }
  return fallbackCopyText(text);
}

function fallbackCopyText(text) {
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  } catch (_error) {
    return false;
  }
}

function showToast(message, tone = "info") {
  if (!document.body) {
    return;
  }

  let toast = document.getElementById(TOAST_ID);
  if (!toast) {
    toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.className = "artlist-toolbox-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.append(toast);
  }

  toast.dataset.tone = tone;
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("visible");
  }, 2800);
}

async function setDetailPageRating(rating) {
  const track = extractTrackFromDetailPage(document, window.location);
  if (!track.title && !track.artist) {
    showToast(t("toast.trackInfoMissing", {}, currentLang), "warn");
    return;
  }

  const value = normalizeRating(rating);
  const label = `${track.artist ? `${track.artist} — ` : ""}${track.title}`;
  const response = await sendMessageAsync({
    type: "ARTLIST_SET_RATING",
    payload: { track, rating: value, kind: track.kind }
  });

  if (!response?.ok) {
    showToast(response?.error || t("error.ratingSaveFailed", {}, currentLang), "warn");
    return;
  }

  showToast(
    value
      ? t("toast.ratingSaved", { rating: value, label }, currentLang)
      : t("toast.ratingCleared", { label }, currentLang)
  );
}

async function setRowRating(row, rating, extraMeta = null) {
  if (!row || !document.contains(row)) {
    return;
  }

  const value = normalizeRating(rating);
  const previousRating = normalizeRating(row.getAttribute(RATING_ATTR));
  const track = extractTrackFromRow(row);
  if (!track.title && !track.artist) {
    showToast(t("toast.trackInfoMissing", {}, currentLang), "warn");
    return;
  }

  const fingerprint = buildFingerprint(track);
  const previousEntry = fingerprint ? rankingsMap[fingerprint] : null;
  const nextTags =
    extraMeta?.tags !== undefined ? normalizeTags(extraMeta.tags) : previousEntry?.tags || [];
  const nextNote =
    extraMeta?.note !== undefined ? cleanNote(extraMeta.note) : previousEntry?.note || "";

  applyRowRatingAttributes(row, value, nextTags, nextNote);
  pendingRatings.set(row, value);
  if (ratingHudRow === row) {
    updateRatingHud(row);
  }

  const label = `${track.artist ? `${track.artist} — ` : ""}${track.title}`;
  if (extraMeta) {
    showToast(t("toast.metaSaved", { label }, currentLang));
  } else {
    showToast(
      value
        ? t("toast.ratingSaved", { rating: value, label }, currentLang)
        : t("toast.ratingCleared", { label }, currentLang)
    );
  }

  const payload = {
    track,
    rating: value,
    kind: track.kind
  };
  if (extraMeta?.tags !== undefined) {
    payload.tags = nextTags;
  }
  if (extraMeta?.note !== undefined) {
    payload.note = nextNote;
  }

  const response = await sendMessageAsync({
    type: "ARTLIST_SET_RATING",
    payload
  });
  pendingRatings.delete(row);

  if (!response?.ok) {
    applyRowRatingAttributes(
      row,
      previousRating,
      previousEntry?.tags || [],
      previousEntry?.note || ""
    );
    showToast(response?.error || t("error.ratingSaveFailed", {}, currentLang), "warn");
    return;
  }

  if (ratingHudRow === row && !ratingHudEditorOpen) {
    updateRatingHud(row);
  }
}

function clearRatingMarks() {
  document.querySelectorAll(`[${RATING_ATTR}]`).forEach((row) => {
    applyRowRatingAttributes(row, 0);
  });
}

function toggleFocusRanked(nextValue = !focusRanked) {
  if (!rankingsEnabled) {
    return;
  }

  focusRanked = Boolean(nextValue);
  document.documentElement.toggleAttribute(FOCUS_RANKED_ATTR, focusRanked);
  if (focusRanked) {
    document.documentElement.setAttribute(FOCUS_MIN_ATTR, String(focusMinRating));
  } else {
    document.documentElement.removeAttribute(FOCUS_MIN_ATTR);
  }
  renderFocusPill();
  showToast(
    focusRanked
      ? t("toast.focusOn", { min: focusMinRating }, currentLang)
      : t("toast.focusOff", {}, currentLang)
  );
}

function cycleFocusMinRating() {
  focusMinRating = focusMinRating === 4 ? 5 : 4;
  if (focusRanked) {
    document.documentElement.setAttribute(FOCUS_MIN_ATTR, String(focusMinRating));
    renderFocusPill();
  }
}

function renderFocusPill() {
  const existing = document.getElementById(FOCUS_PILL_ID);
  if (!rankingsEnabled || !focusRanked) {
    existing?.remove();
    return;
  }

  let pill = existing;
  if (!pill) {
    pill = document.createElement("div");
    pill.id = FOCUS_PILL_ID;
    pill.className = "artlist-toolbox-focus-pill";

    const cycleButton = document.createElement("button");
    cycleButton.type = "button";
    cycleButton.className = "artlist-toolbox-focus-cycle";
    cycleButton.dataset.role = "cycle";
    cycleButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      cycleFocusMinRating();
    });

    const exitButton = document.createElement("button");
    exitButton.type = "button";
    exitButton.className = "artlist-toolbox-focus-exit";
    exitButton.dataset.role = "exit";
    exitButton.textContent = "×";
    exitButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleFocusRanked(false);
    });

    pill.append(cycleButton, exitButton);
    document.body.append(pill);
  }

  const cycleButton = pill.querySelector("button[data-role='cycle']");
  const exitButton = pill.querySelector("button[data-role='exit']");
  cycleButton.textContent =
    focusMinRating === 5
      ? t("focusPill.labelFive", {}, currentLang)
      : t("focusPill.label", { min: focusMinRating }, currentLang);
  cycleButton.title = t("focusPill.cycleTitle", {}, currentLang);
  exitButton.title = t("focusPill.exitTitle", {}, currentLang);
  exitButton.setAttribute("aria-label", t("focusPill.exitTitle", {}, currentLang));
}

function scheduleRatingHud(row) {
  if (!rankingsEnabled) {
    return;
  }
  window.clearTimeout(ratingHudHideTimer);
  window.clearTimeout(ratingHudShowTimer);
  ratingHudShowTimer = window.setTimeout(() => showRatingHud(row), RATING_HUD_DELAY_MS);
}

function showRatingHud(row) {
  if (!rankingsEnabled || !row || !document.contains(row)) {
    return;
  }

  if (ratingHudRow && ratingHudRow !== row) {
    ratingHudRow.removeAttribute("data-artlist-toolbox-hud-open");
  }

  const hud = ensureRatingHud();
  ratingHudRow = row;
  ratingHudRow.setAttribute("data-artlist-toolbox-hud-open", "true");
  ratingHudEditorOpen = false;
  hud.classList.remove("expanded");
  const editor = hud.querySelector(".artlist-toolbox-rating-editor");
  if (editor) {
    editor.hidden = true;
  }
  updateRatingHud(row);
  positionRatingHud(hud, row);
  hud.classList.add("visible");
}

function openRatingHudEditor(row) {
  if (!rankingsEnabled || !row || !document.contains(row)) {
    return;
  }

  cancelRatingHudHide();
  if (ratingHudRow && ratingHudRow !== row) {
    ratingHudRow.removeAttribute("data-artlist-toolbox-hud-open");
  }
  const hud = ensureRatingHud();
  ratingHudRow = row;
  ratingHudRow.setAttribute("data-artlist-toolbox-hud-open", "true");
  ratingHudEditorOpen = true;

  const track = extractTrackFromRow(row);
  const fingerprint = buildFingerprint(track);
  const entry = fingerprint ? rankingsMap[fingerprint] : null;
  const currentRating = normalizeRating(row.getAttribute(RATING_ATTR)) || normalizeRating(entry?.rating);
  ratingHudDraftRating = currentRating || FOCUS_MIN_RATING;

  hud.classList.add("expanded", "visible");
  const editor = hud.querySelector(".artlist-toolbox-rating-editor");
  const tagsInput = hud.querySelector("input[data-role='tags']");
  const noteInput = hud.querySelector("input[data-role='note']");
  const suggestionsWrap = hud.querySelector(".artlist-toolbox-tag-suggestions");

  editor.hidden = false;
  tagsInput.value = normalizeTags(entry?.tags).join(", ");
  noteInput.value = cleanNote(entry?.note);

  renderTagSuggestions(suggestionsWrap, tagsInput);
  updateRatingHud(row, ratingHudDraftRating);
  positionRatingHud(hud, row);
  tagsInput.focus({ preventScroll: true });
}

function renderTagSuggestions(container, tagsInput) {
  if (!container) {
    return;
  }
  container.textContent = "";
  const topTags = collectAllTags(rankingsMap).slice(0, 6);
  container.hidden = topTags.length === 0;

  topTags.forEach(({ tag }) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "artlist-toolbox-tag-chip";
    chip.textContent = `#${tag}`;
    chip.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const existing = normalizeTags(tagsInput.value);
      const next = existing.includes(tag)
        ? existing.filter((item) => item !== tag)
        : [...existing, tag];
      tagsInput.value = next.join(", ");
      syncSuggestionChipStates(container, next);
      tagsInput.focus({ preventScroll: true });
    });
    container.append(chip);
  });

  syncSuggestionChipStates(container, normalizeTags(tagsInput.value));
}

function syncSuggestionChipStates(container, activeTags) {
  container.querySelectorAll(".artlist-toolbox-tag-chip").forEach((chip) => {
    const tag = chip.textContent.replace(/^#/, "");
    chip.classList.toggle("active", activeTags.includes(tag));
  });
}

function ensureRatingHud() {
  let hud = document.getElementById(RATING_HUD_ID);
  if (hud) {
    return hud;
  }

  hud = document.createElement("div");
  hud.id = RATING_HUD_ID;
  hud.className = "artlist-toolbox-rating-hud";
  hud.setAttribute("role", "group");
  hud.setAttribute("aria-label", t("hud.ariaLabel", {}, currentLang));

  const bar = document.createElement("div");
  bar.className = "artlist-toolbox-rating-bar";

  const stars = document.createElement("span");
  stars.className = "artlist-toolbox-rating-stars";

  for (let value = 1; value <= 5; value += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "artlist-toolbox-rating-star";
    button.dataset.rating = String(value);
    button.textContent = "★";
    const starLabel =
      value === 1
        ? t("hud.starOne", {}, currentLang)
        : t("hud.starMany", { count: value }, currentLang);
    button.title = starLabel;
    button.setAttribute("aria-label", starLabel);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!ratingHudRow) {
        return;
      }
      if (ratingHudEditorOpen) {
        ratingHudDraftRating = value;
        updateRatingHud(ratingHudRow, ratingHudDraftRating);
        return;
      }
      void setRowRating(ratingHudRow, value);
    });
    stars.append(button);
  }

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "artlist-toolbox-rating-edit";
  editButton.textContent = "✎";
  editButton.title = t("hud.editMeta", {}, currentLang);
  editButton.setAttribute("aria-label", t("hud.editMeta", {}, currentLang));
  editButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!ratingHudRow) {
      return;
    }
    if (ratingHudEditorOpen) {
      closeRatingHud();
    } else {
      openRatingHudEditor(ratingHudRow);
    }
  });

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "artlist-toolbox-rating-clear";
  clearButton.textContent = "×";
  clearButton.title = t("hud.clear", {}, currentLang);
  clearButton.setAttribute("aria-label", t("hud.clear", {}, currentLang));
  clearButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (ratingHudRow) {
      void setRowRating(ratingHudRow, 0);
      if (ratingHudEditorOpen) {
        closeRatingHud();
      }
    }
  });

  bar.append(stars, editButton, clearButton);

  const editor = document.createElement("form");
  editor.className = "artlist-toolbox-rating-editor";
  editor.hidden = true;

  const tagsInput = document.createElement("input");
  tagsInput.type = "text";
  tagsInput.dataset.role = "tags";
  tagsInput.placeholder = t("hud.tagsPlaceholder", {}, currentLang);
  tagsInput.autocomplete = "off";

  const suggestions = document.createElement("div");
  suggestions.className = "artlist-toolbox-tag-suggestions";
  suggestions.hidden = true;

  tagsInput.addEventListener("input", () => {
    syncSuggestionChipStates(suggestions, normalizeTags(tagsInput.value));
  });

  const noteInput = document.createElement("input");
  noteInput.type = "text";
  noteInput.dataset.role = "note";
  noteInput.maxLength = MAX_NOTE_LENGTH;
  noteInput.placeholder = t("hud.notePlaceholder", {}, currentLang);
  noteInput.autocomplete = "off";

  const editorActions = document.createElement("div");
  editorActions.className = "artlist-toolbox-editor-actions";

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.className = "artlist-toolbox-editor-save";
  saveButton.textContent = t("hud.save", {}, currentLang);

  const closeEditorButton = document.createElement("button");
  closeEditorButton.type = "button";
  closeEditorButton.className = "artlist-toolbox-editor-cancel";
  closeEditorButton.textContent = t("hud.close", {}, currentLang);
  closeEditorButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeRatingHud();
  });

  editorActions.append(saveButton, closeEditorButton);
  editor.append(tagsInput, suggestions, noteInput, editorActions);

  editor.addEventListener("submit", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!ratingHudRow) {
      return;
    }
    const targetRow = ratingHudRow;
    const chosenRating =
      normalizeRating(ratingHudDraftRating) ||
      normalizeRating(targetRow.getAttribute(RATING_ATTR)) ||
      FOCUS_MIN_RATING;
    const tags = normalizeTags(tagsInput.value);
    const note = cleanNote(noteInput.value);
    closeRatingHud();
    void setRowRating(targetRow, chosenRating, { tags, note });
  });

  hud.append(bar, editor);
  hud.addEventListener("click", (event) => event.stopPropagation());
  hud.addEventListener("mouseenter", cancelRatingHudHide);
  hud.addEventListener("mouseleave", () => {
    if (!ratingHudEditorOpen) {
      scheduleRatingHudHide();
    }
  });

  document.body.append(hud);
  return hud;
}

function updateRatingHud(row, overrideRating = null) {
  const hud = document.getElementById(RATING_HUD_ID);
  if (!hud) {
    return;
  }

  const rating =
    overrideRating !== null
      ? normalizeRating(overrideRating)
      : normalizeRating(row.getAttribute(RATING_ATTR));

  hud.querySelectorAll(".artlist-toolbox-rating-star").forEach((button) => {
    const active = Number(button.dataset.rating) <= rating;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  const clearButton = hud.querySelector(".artlist-toolbox-rating-clear");
  if (clearButton) {
    clearButton.hidden = rating === 0;
  }
}

function positionRatingHud(hud, row) {
  const margin = 6;
  const rect = row.getBoundingClientRect();
  const width = hud.offsetWidth || 105;
  const height = hud.offsetHeight || 20;

  const left = Math.min(
    Math.max(margin, Math.round(rect.left + 4)),
    Math.max(margin, window.innerWidth - width - margin)
  );
  // Position at the top edge of the track row so it stays out of the middle/bottom scroll path.
  let top = Math.max(margin, Math.round(rect.top + 2));
  if (top + height > window.innerHeight - margin) {
    top = Math.max(margin, window.innerHeight - height - margin);
  }

  hud.style.left = `${left}px`;
  hud.style.top = `${top}px`;
}

function scheduleRatingHudHide() {
  if (ratingHudEditorOpen) {
    return;
  }
  window.clearTimeout(ratingHudShowTimer);
  if (!ratingHudRow) {
    return;
  }
  window.clearTimeout(ratingHudHideTimer);
  ratingHudHideTimer = window.setTimeout(closeRatingHud, RATING_HUD_HIDE_MS);
}

function cancelRatingHudHide() {
  window.clearTimeout(ratingHudShowTimer);
  window.clearTimeout(ratingHudHideTimer);
}

function closeRatingHud() {
  window.clearTimeout(ratingHudShowTimer);
  window.clearTimeout(ratingHudHideTimer);
  if (ratingHudRow) {
    ratingHudRow.removeAttribute("data-artlist-toolbox-hud-open");
  }
  ratingHudRow = null;
  ratingHudEditorOpen = false;
  ratingHudDraftRating = 0;
  document.getElementById(RATING_HUD_ID)?.remove();
}

function toggleQueueSelectMode() {
  if (queueRunning) {
    return;
  }

  if (queueSelectMode) {
    exitQueueSelectMode();
    return;
  }

  queueSelectMode = true;
  document.documentElement.setAttribute(SELECT_ATTR, "true");
  renderQueueBar();
  showToast(t("toast.queueEnter", {}, currentLang));
}

function exitQueueSelectMode() {
  if (queueRunning) {
    return;
  }

  queuedRows.forEach((row) => {
    row.removeAttribute(QUEUED_ATTR);
    row.removeAttribute(QUEUE_STATE_ATTR);
  });
  queuedRows.clear();
  queueSelectMode = false;
  document.documentElement.removeAttribute(SELECT_ATTR);
  renderQueueBar();
}

function stopQueue() {
  if (queueRunning) {
    queueStopRequested = true;
    queueStatusText = t("queue.stopping", {}, currentLang);
    renderQueueBar();
  }
}

function toggleQueuedRow(row) {
  if (queuedRows.has(row)) {
    queuedRows.delete(row);
    row.removeAttribute(QUEUED_ATTR);
    row.removeAttribute(QUEUE_STATE_ATTR);
  } else {
    row.setAttribute(ROW_ATTR, "true");
    row.setAttribute(QUEUED_ATTR, "true");
    queuedRows.add(row);
  }
  renderQueueBar();
}

function ensureQueueBar() {
  let bar = document.getElementById(QUEUE_BAR_ID);
  if (bar) {
    return bar;
  }

  bar = document.createElement("div");
  bar.id = QUEUE_BAR_ID;
  bar.className = "artlist-toolbox-queue-bar";

  const status = document.createElement("span");
  status.className = "artlist-toolbox-queue-status";

  const runButton = document.createElement("button");
  runButton.type = "button";
  runButton.className = "artlist-toolbox-queue-button primary";
  runButton.dataset.role = "run";
  runButton.addEventListener("click", () => {
    if (queueRunning) {
      stopQueue();
      return;
    }
    void startQueueProcessing();
  });

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "artlist-toolbox-queue-button";
  clearButton.dataset.role = "clear";
  clearButton.addEventListener("click", () => {
    if (queueRunning) {
      return;
    }
    queuedRows.forEach((row) => {
      row.removeAttribute(QUEUED_ATTR);
      row.removeAttribute(QUEUE_STATE_ATTR);
    });
    queuedRows.clear();
    renderQueueBar();
  });

  const exitButton = document.createElement("button");
  exitButton.type = "button";
  exitButton.className = "artlist-toolbox-queue-button";
  exitButton.dataset.role = "exit";
  exitButton.addEventListener("click", () => {
    if (queueRunning) {
      stopQueue();
      return;
    }
    exitQueueSelectMode();
  });

  bar.append(status, runButton, clearButton, exitButton);
  document.body.append(bar);
  return bar;
}

function renderQueueBar() {
  const visible = queueSelectMode || queueRunning;
  const existing = document.getElementById(QUEUE_BAR_ID);
  if (!visible) {
    existing?.remove();
    return;
  }

  const bar = ensureQueueBar();
  const status = bar.querySelector(".artlist-toolbox-queue-status");
  const runButton = bar.querySelector("button[data-role='run']");
  const clearButton = bar.querySelector("button[data-role='clear']");
  const exitButton = bar.querySelector("button[data-role='exit']");

  clearButton.textContent = t("queue.clear", {}, currentLang);
  exitButton.textContent = t("queue.exit", {}, currentLang);

  if (queueRunning) {
    status.textContent = queueStatusText || t("queue.processing", {}, currentLang);
    runButton.textContent = t("queue.stop", {}, currentLang);
    runButton.disabled = queueStopRequested;
    clearButton.hidden = true;
    return;
  }

  const count = queuedRows.size;
  status.textContent = count
    ? count === 1
      ? t("queue.selectedOne", {}, currentLang)
      : t("queue.selectedMany", { count }, currentLang)
    : t("queue.selectPrompt", {}, currentLang);
  runButton.textContent = t("queue.process", {}, currentLang);
  runButton.disabled = count === 0;
  clearButton.hidden = count === 0;
}

async function startQueueProcessing() {
  if (queueRunning || !queuedRows.size) {
    return;
  }

  queueRunning = true;
  queueStopRequested = false;
  const rows = [...queuedRows];
  let done = 0;
  let search = 0;
  let failed = 0;

  renderQueueBar();

  for (let index = 0; index < rows.length; index += 1) {
    if (queueStopRequested) {
      break;
    }

    const row = rows[index];
    if (!document.contains(row)) {
      queuedRows.delete(row);
      failed += 1;
      continue;
    }

    const track = extractTrackFromRow(row);
    row.setAttribute(QUEUE_STATE_ATTR, "processing");
    queueStatusText = t(
      "queue.processingItem",
      {
        index: index + 1,
        total: rows.length,
        title: track.title || t("queue.trackFallback", {}, currentLang)
      },
      currentLang
    );
    renderQueueBar();

    let outcome = "error";
    const response = await sendMessageAsync({
      type: "ARTLIST_DOWNLOAD_TRACK",
      payload: track,
      options: { override: "auto", forceBackground: true, queueMode: true }
    });
    if (response?.ok) {
      outcome = response.mode === "search" ? "search" : "done";
    }

    row.removeAttribute(QUEUED_ATTR);
    row.setAttribute(QUEUE_STATE_ATTR, outcome);
    queuedRows.delete(row);
    if (outcome === "done") {
      done += 1;
    } else if (outcome === "search") {
      search += 1;
    } else {
      failed += 1;
    }

    renderQueueBar();

    if (!queueStopRequested && index < rows.length - 1) {
      await sleep(QUEUE_DELAY_MS);
    }
  }

  queueRunning = false;
  queueStopRequested = false;
  queueStatusText = "";
  if (extensionEnabled) {
    renderQueueBar();
  } else {
    exitQueueSelectMode();
  }
  showToast(
    t("toast.queueFinished", { done, search, failed }, currentLang),
    failed ? "warn" : "ok"
  );
}

function exportVisibleTracksCsv() {
  const rows = [...document.querySelectorAll(`[${ROW_ATTR}]`)].filter(isElementVisible).slice(0, 500);
  let tracks = rows
    .map((row) => extractTrackFromRow(row))
    .filter((track) => track.title || track.artist);

  if (!tracks.length && isDetailPagePath(window.location.pathname)) {
    const single = extractTrackFromDetailPage(document, window.location);
    if (single.title || single.artist) {
      tracks = [single];
    }
  }

  if (!tracks.length) {
    showToast(t("toast.noVisibleTracks", {}, currentLang), "warn");
    return { ok: false };
  }

  void (async () => {
    const response = await sendMessageAsync({ type: "ARTLIST_BUILD_CSV", payload: { tracks } });
    if (!response?.ok || typeof response.csv !== "string") {
      showToast(t("toast.csvBuildFailed", {}, currentLang), "warn");
      return;
    }
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`\ufeff${response.csv}`, `artlist-tracks-${dateStamp}.csv`);
    showToast(t("toast.csvExported", { count: response.count || tracks.length }, currentLang));
  })();

  return { ok: true, count: tracks.length };
}

function downloadTextFile(text, filename) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function sendMessageAsync(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response);
      });
    } catch (error) {
      resolve({ ok: false, error: String(error) });
    }
  });
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function exposeDebugHelper() {
  window.artlistYoutubeMp3Debug = () => {
    const buttons = findOfficialDownloadButtons(document);
    return {
      settings: {
        currentLang,
        extensionEnabled,
        flowMode,
        hideHeroBanner,
        compactRows,
        processedDim,
        keyboardShortcuts,
        rankingsEnabled,
        focusRanked,
        focusMinRating,
        queueSelectMode,
        queueRunning,
        queuedCount: queuedRows.size
      },
      rows: document.querySelectorAll(`[${ROW_ATTR}]`).length,
      processedRows: document.querySelectorAll(`[${PROCESSED_ATTR}]`).length,
      ratedRows: document.querySelectorAll(`[${RATING_ATTR}]`).length,
      buttons: buttons.map((button) => {
        const row = findTrackRowFromElement(button, document);
        return {
          button,
          row,
          track: resolveTrackForButton(button, row),
          rowText: row ? cleanText(row.textContent).slice(0, 240) : ""
        };
      })
    };
  };
}

function queryWithinRoot(root, selector) {
  if (!root) {
    return [];
  }
  const nodes = root.querySelectorAll ? [...root.querySelectorAll(selector)] : [];
  if (root.matches?.(selector)) {
    nodes.unshift(root);
  }
  return nodes;
}

function uniqueElements(elements) {
  return [...new Set(elements)];
}
})();
