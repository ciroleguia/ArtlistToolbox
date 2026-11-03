// DOM extraction helpers for Artlist Music rows, Sound Effects (SFX) rows, and
// standalone track detail pages. Written against standard DOM Element methods
// so it can be exercised directly in Node unit tests with lightweight mocks.

import { cleanText } from "./matcher.js";

export const OFFICIAL_DOWNLOAD_SELECTOR = [
  "button[aria-label='download' i]",
  "button[aria-label*='download' i]",
  "[data-testid='Tooltip' i][aria-label='Download' i] button",
  "[aria-label='Download' i] button",
  "[title*='download' i]",
  "[data-testid*='download' i]"
].join(",");

export const KNOWN_ROW_SELECTOR = "[data-testid='music-row'], [data-testid='AudioRow']";

export const TRACK_LINK_SELECTOR = [
  "a[href*='/royalty-free-music/song/']",
  "a[href*='/song/']",
  "a[href*='/sfx/track/']",
  "a[href*='/sound-effects/track/']"
].join(",");

export const ARTIST_LINK_SELECTOR = [
  "a[href*='/royalty-free-music/artist/']",
  "a[href*='/artist/']",
  "a[href*='/sfx/artist/']",
  "a[href*='/creator/']"
].join(",");

export const ROW_ATTR = "data-artlist-toolbox-row";

export function detectTrackKind(target) {
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

export function isDetailPagePath(pathname) {
  return /\/(?:royalty-free-music\/song|song|sfx\/track|sound-effects\/track)\//i.test(
    String(pathname || "")
  );
}

export function isTrackRow(element, doc = globalThis.document) {
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

export function findTrackRowFromElement(element, doc = globalThis.document) {
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

export function extractTrackFromRow(row, downloadButton = null) {
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

export function extractTrackFromDetailPage(doc = globalThis.document, locationObj = globalThis.location) {
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

export function extractTrackDuration(container) {
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

export function parseTimeLabel(label) {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(label || "").trim());
  if (!match) {
    return null;
  }

  const [, first, second, third] = match;
  return third !== undefined
    ? Number(first) * 3600 + Number(second) * 60 + Number(third)
    : Number(first) * 60 + Number(second);
}

export function isElementVisible(element) {
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
