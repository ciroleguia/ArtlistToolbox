const Y2MATE_BASE_URL = "https://v3.y2mate.nu/#";
const YOUTUBE_SEARCH_URL = "https://www.youtube.com/results?search_query=";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "ARTLIST_DOWNLOAD_TRACK") {
    return false;
  }

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
});

async function handleTrackDownload(track) {
  const normalizedTrack = normalizeTrack(track);
  if (!normalizedTrack.title && !normalizedTrack.artist) {
    throw new Error("No pude detectar el nombre de la cancion ni el artista.");
  }

  const candidates = await searchYouTube(normalizedTrack);
  const bestMatch = pickBestMatch(normalizedTrack, candidates);

  if (!bestMatch) {
    await openTab(`${YOUTUBE_SEARCH_URL}${encodeURIComponent(buildSearchQuery(normalizedTrack))}`);
    throw new Error("No encontre un video suficientemente parecido. Abri la busqueda de YouTube para revisar manualmente.");
  }

  await openTab(`${Y2MATE_BASE_URL}${bestMatch.videoId}`);
  return { video: bestMatch };
}

function normalizeTrack(track = {}) {
  return {
    title: cleanText(track.title),
    artist: cleanText(track.artist)
  };
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, "\"")
    .replace(/[’]/g, "'")
    .trim();
}

function buildSearchQuery(track) {
  return [track.title, track.artist].filter(Boolean).join(" ");
}

async function searchYouTube(track) {
  const query = buildSearchQuery(track);
  const response = await fetch(`${YOUTUBE_SEARCH_URL}${encodeURIComponent(query)}`, {
    credentials: "omit",
    headers: {
      "Accept-Language": "en-US,en;q=0.9"
    }
  });

  if (!response.ok) {
    throw new Error(`YouTube respondio con HTTP ${response.status}.`);
  }

  const html = await response.text();
  return extractVideoCandidates(html).slice(0, 20);
}

function extractVideoCandidates(html) {
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

    const title = runsToText(renderer.title?.runs) || renderer.title?.simpleText;
    const artist =
      runsToText(renderer.ownerText?.runs) ||
      runsToText(renderer.longBylineText?.runs) ||
      runsToText(renderer.shortBylineText?.runs);

    if (title) {
      videos.push({
        videoId: renderer.videoId,
        title: cleanText(title),
        artist: cleanText(artist),
        url: `https://www.youtube.com/watch?v=${renderer.videoId}`
      });
    }
  });

  return dedupeByVideoId(videos);
}

function extractYtInitialData(html) {
  const marker = "var ytInitialData = ";
  const start = html.indexOf(marker);
  if (start === -1) {
    return null;
  }

  const jsonStart = start + marker.length;
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

function findJsonObjectEnd(text, startIndex) {
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

function extractVideoCandidatesFromHtml(html) {
  const matches = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)];
  return dedupeByVideoId(
    matches.map((match) => ({
      videoId: match[1],
      title: "",
      artist: "",
      url: `https://www.youtube.com/watch?v=${match[1]}`
    }))
  );
}

function walkObject(value, visitor) {
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

function runsToText(runs) {
  if (!Array.isArray(runs)) {
    return "";
  }

  return runs.map((run) => run?.text || "").join("");
}

function dedupeByVideoId(videos) {
  const seen = new Set();
  return videos.filter((video) => {
    if (!video.videoId || seen.has(video.videoId)) {
      return false;
    }
    seen.add(video.videoId);
    return true;
  });
}

function pickBestMatch(track, candidates) {
  const scored = candidates
    .map((candidate, index) => ({
      ...candidate,
      score: scoreCandidate(track, candidate, index)
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 0.42) {
    return null;
  }

  return best;
}

function scoreCandidate(track, candidate, index) {
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

  const rankPenalty = Math.min(index, 10) * 0.015;
  return titleScore * 0.66 + artistScore * 0.34 - rankPenalty;
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

function openTab(url) {
  return chrome.tabs.create({ url });
}
