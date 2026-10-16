// YouTube search-result parsing and URL helpers.
// Pure functions only: no chrome.* or DOM APIs in this file.

import { cleanText } from "./matcher.js";

export const Y2MATE_BASE_URL = "https://y2mate.gs/#";
export const Y2MATE_MP3_PATH = "/mp3";

const YOUTUBE_SEARCH_URL = "https://www.youtube.com/results?search_query=";
const YOUTUBE_SEARCH_PARAMS = "&hl=en&gl=US";

const INITIAL_DATA_MARKERS = [
  "var ytInitialData = ",
  "window[\"ytInitialData\"] = "
];

export function buildYoutubeSearchUrl(query) {
  return `${YOUTUBE_SEARCH_URL}${encodeURIComponent(query)}${YOUTUBE_SEARCH_PARAMS}`;
}

export function buildY2mateUrl(videoId) {
  return `${Y2MATE_BASE_URL}${videoId}${Y2MATE_MP3_PATH}`;
}

export function isValidVideoId(videoId) {
  return typeof videoId === "string" && /^[a-zA-Z0-9_-]{11}$/.test(videoId);
}

export function parseDuration(label) {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(label || "").trim());
  if (!match) {
    return null;
  }

  const [, first, second, third] = match;
  return third !== undefined
    ? Number(first) * 3600 + Number(second) * 60 + Number(third)
    : Number(first) * 60 + Number(second);
}

export function extractYtInitialData(html) {
  const marker = INITIAL_DATA_MARKERS.find((candidate) => html.includes(candidate));

  let jsonStart;
  if (marker) {
    jsonStart = html.indexOf(marker) + marker.length;
  } else {
    const match = html.match(/ytInitialData\s*=\s*/);
    if (!match) {
      return null;
    }
    jsonStart = match.index + match[0].length;
  }

  const jsonEnd = findJsonObjectEnd(html, jsonStart);
  if (jsonEnd === -1) {
    return null;
  }

  try {
    return JSON.parse(html.slice(jsonStart, jsonEnd + 1));
  } catch (_error) {
    return null;
  }
}

export function findJsonObjectEnd(text, startIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

export function extractVideoCandidates(html) {
  const data = extractYtInitialData(html);
  if (!data) {
    return extractVideoCandidatesFromHtml(html);
  }

  const videos = [];
  walkObject(data, (node) => {
    const renderer = node?.videoRenderer;
    if (!renderer?.videoId) {
      return;
    }

    const candidate = rendererToCandidate(renderer);
    if (candidate.title) {
      videos.push(candidate);
    }
  });

  return dedupeByVideoId(videos);
}

export function extractVideoCandidatesFromHtml(html) {
  const matches = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)];
  return dedupeByVideoId(
    matches.map((match) => ({
      videoId: match[1],
      title: "",
      artist: "",
      duration: null,
      lengthText: "",
      thumbnail: buildThumbnailUrl(match[1]),
      url: buildWatchUrl(match[1])
    }))
  );
}

export function buildThumbnailUrl(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

export function buildWatchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function rendererToCandidate(renderer) {
  const videoId = renderer.videoId;
  const lengthText =
    renderer.lengthText?.simpleText || runsToText(renderer.lengthText?.runs) || "";

  return {
    videoId,
    title: cleanText(runsToText(renderer.title?.runs) || renderer.title?.simpleText),
    artist: cleanText(
      runsToText(renderer.ownerText?.runs) ||
        runsToText(renderer.longBylineText?.runs) ||
        runsToText(renderer.shortBylineText?.runs)
    ),
    duration: parseDuration(lengthText),
    lengthText,
    thumbnail: buildThumbnailUrl(videoId),
    url: buildWatchUrl(videoId)
  };
}

export function walkObject(value, visitor) {
  if (!value || typeof value !== "object") {
    return;
  }

  visitor(value);

  if (Array.isArray(value)) {
    value.forEach((item) => walkObject(item, visitor));
    return;
  }

  Object.values(value).forEach((item) => walkObject(item, visitor));
}

export function runsToText(runs) {
  if (!Array.isArray(runs)) {
    return "";
  }

  return runs.map((run) => run?.text || "").join("");
}

export function dedupeByVideoId(videos) {
  const seen = new Set();
  return videos.filter((video) => {
    if (!video.videoId || seen.has(video.videoId)) {
      return false;
    }
    seen.add(video.videoId);
    return true;
  });
}
