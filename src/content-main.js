import { buildFingerprint, cleanText } from "./lib/matcher.js";
import { formatDurationLabel } from "./lib/csv.js";
import {
  FOCUS_MIN_RATING,
  MAX_NOTE_LENGTH,
  cleanNote,
  collectAllTags,
  formatRowBadgeText,
  normalizeRating,
  normalizeTags
} from "./lib/rankings.js";
import {
  KNOWN_ROW_SELECTOR,
  OFFICIAL_DOWNLOAD_SELECTOR,
  ROW_ATTR,
  TRACK_LINK_SELECTOR,
  extractTrackFromDetailPage,
  extractTrackFromRow,
  findTrackRowFromElement,
  isDetailPagePath,
  isElementVisible,
  isTrackRow
} from "./lib/dom-extract.js";
import { resolveLanguage, t } from "./lib/i18n.js";

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
