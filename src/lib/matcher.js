// Matching logic shared by the background service worker and the test suite.
// Pure functions only: no chrome.* or DOM APIs in this file.

export const DEFAULT_MIN_SCORE = 0.42;

// Terms that usually mean "this is not the original track". They only penalize
// candidates when the target title/artist does not mention them itself.
export const NEGATIVE_TERMS = [
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

export function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, "\"")
    .replace(/[’]/g, "'")
    .trim();
}

export function normalizeTrack(track = {}) {
  const duration = Number(track.duration);
  return {
    title: cleanText(track.title),
    artist: cleanText(track.artist),
    duration: Number.isFinite(duration) && duration > 0 ? duration : null
  };
}

export function buildSearchQuery(track) {
  return [track.title, track.artist].filter(Boolean).join(" ");
}

export function normalizeForMatch(value) {
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

export function containsScore(needle, haystack) {
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

export function similarity(a, b) {
  if (!a || !b) {
    return 0;
  }

  const distance = levenshteinDistance(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

export function levenshteinDistance(a, b) {
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

export function scoreCandidate(track, candidate, index = 0) {
  const targetTitle = normalizeForMatch(track.title);
  const targetArtist = normalizeForMatch(track.artist);
  const candidateTitle = normalizeForMatch(candidate.title);
  const candidateArtist = normalizeForMatch(candidate.artist);
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
  return clamp01(round3(score - rankPenalty - negativeTermPenalty(track, rawCombined)));
}

export function scoreCandidates(track, candidates = []) {
  return candidates
    .map((candidate, index) => ({
      ...candidate,
      score: scoreCandidate(track, candidate, index)
    }))
    .sort((a, b) => b.score - a.score);
}

export function pickBestMatch(track, candidates = [], minScore = DEFAULT_MIN_SCORE) {
  const [best] = scoreCandidates(track, candidates);
  if (!best || best.score < minScore) {
    return null;
  }

  return best;
}

function negativeTermPenalty(track, candidateSource) {
  // Keep bracket contents (e.g. "(Karaoke Version)") so penalties still apply.
  const target = normalizeForTerms([track.title, track.artist].filter(Boolean).join(" "));
  const candidateText = normalizeForTerms(candidateSource);
  let hits = 0;

  NEGATIVE_TERMS.forEach((term) => {
    if (containsTerm(candidateText, term) && !containsTerm(target, term)) {
      hits += 1;
    }
  });

  return Math.min(hits * 0.12, 0.35);
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
