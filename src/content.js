const ENHANCED_DOWNLOAD_CLASS = "artlist-youtube-mp3-download";
const ACTIVE_DOWNLOAD_CLASS = "artlist-youtube-mp3-download-active";
const DOWNLOAD_ATTR = "data-artlist-youtube-mp3-download";
const PICKER_ID = "artlist-y2mate-picker";
const HIDE_HERO_ATTR = "data-artlist-toolbox-hide-hero";
const HIDE_HERO_CACHE_KEY = "artlistToolbox:hideHeroBanner";
const COMPACT_ATTR = "data-artlist-toolbox-compact";
const DIM_PROCESSED_ATTR = "data-artlist-toolbox-dim";
const SELECT_ATTR = "data-artlist-toolbox-select";
const ROW_ATTR = "data-artlist-toolbox-row";
const PROCESSED_ATTR = "data-artlist-toolbox-processed";
const QUEUED_ATTR = "data-artlist-toolbox-queued";
const QUEUE_STATE_ATTR = "data-artlist-toolbox-queue-state";
const QUEUE_BAR_ID = "artlist-toolbox-queue-bar";
const TOAST_ID = "artlist-toolbox-toast";
const SCAN_DEBOUNCE_MS = 250;
const BOOTSTRAP_SCAN_COUNT = 12;
const MAX_ROOTS_PER_SCAN = 30;
const PROCESSED_CHECK_LIMIT = 80;
const PROCESSED_CHECK_DEBOUNCE_MS = 700;
const QUEUE_DELAY_MS = 2200;

const OFFICIAL_DOWNLOAD_SELECTOR = [
  "button[aria-label='download' i]",
  "button[aria-label*='download' i]",
  "[data-testid='Tooltip' i][aria-label='Download' i] button",
  "[aria-label='Download' i] button",
  "[title*='download' i]",
  "[data-testid*='download' i]"
].join(",");

let scanTimer = null;
let bootstrapScansRemaining = BOOTSTRAP_SCAN_COUNT;
const pendingRoots = new Set();
let extensionEnabled = false;
let flowMode = "auto";
let hideHeroBanner = false;
let compactRows = false;
let processedDim = true;
let keyboardShortcuts = true;
let pickerDismissListeners = null;
let pickerContext = null;
let lastHoveredRow = null;
let lastContextRow = null;
let queueSelectMode = false;
let queueRunning = false;
let queueStopRequested = false;
let queueStatusText = "";
const queuedRows = new Set();
let processedCheckTimer = null;
let processedCheckPending = false;
let toastTimer = null;

boot();

function boot() {
  if (!document.body) {
    window.setTimeout(boot, 100);
    return;
  }

  // Load initial extension state (the download flow ships disabled; page
  // tweaks and library tools work regardless of it).
  chrome.storage.local.get(
    {
      enabled: false,
      flowMode: null,
      searchOnly: false,
      hideHeroBanner: false,
      compactRows: false,
      processedDim: true,
      keyboardShortcuts: true
    },
    (items) => {
      extensionEnabled = Boolean(items.enabled);
      flowMode = items.flowMode || (items.searchOnly ? "search" : "auto");
      hideHeroBanner = Boolean(items.hideHeroBanner);
      compactRows = Boolean(items.compactRows);
      processedDim = items.processedDim !== false;
      keyboardShortcuts = items.keyboardShortcuts !== false;
      applyPageTweaks();
      bootstrapScansRemaining = BOOTSTRAP_SCAN_COUNT;
      scheduleScan(document);
      scheduleBootstrapScans();
    }
  );

  // Listen for state changes from popup
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") {
      return;
    }

    if (changes.flowMode !== undefined) {
      flowMode = changes.flowMode.newValue || "auto";
    } else if (changes.searchOnly !== undefined) {
      flowMode = changes.searchOnly.newValue ? "search" : "auto";
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
      scheduleProcessedRefresh();
    }

    if (changes.keyboardShortcuts !== undefined) {
      keyboardShortcuts = changes.keyboardShortcuts.newValue !== false;
    }

    if (changes.enabled !== undefined) {
      extensionEnabled = changes.enabled.newValue;
      if (extensionEnabled) {
        bootstrapScansRemaining = BOOTSTRAP_SCAN_COUNT;
        scheduleScan(document);
        scheduleBootstrapScans();
      } else {
        stopQueue();
        exitQueueSelectMode();
        removeEnhancements();
      }
    }
  });

  document.addEventListener("click", handleDocumentClick, true);
  document.addEventListener("mouseover", handleDocumentMouseOver, true);
  document.addEventListener("keydown", handleKeyDown, true);
  document.addEventListener("contextmenu", handleContextMenu, true);
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  observePageChanges();
  exposeDebugHelper();
}

function scheduleBootstrapScans() {
  if (bootstrapScansRemaining <= 0) {
    return;
  }

  bootstrapScansRemaining -= 1;
  window.setTimeout(() => {
    scheduleScan(document);
    scheduleBootstrapScans();
  }, 850);
}

function observePageChanges() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          pendingRoots.add(node);
        }
      });
    });

    scheduleScan();
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
      window.requestIdleCallback(run, { timeout: 900 });
      return;
    }

    window.requestAnimationFrame(run);
  }, SCAN_DEBOUNCE_MS);
}

function flushScanQueue() {
  const roots = [...pendingRoots].slice(0, MAX_ROOTS_PER_SCAN);
  roots.forEach((root) => pendingRoots.delete(root));
  roots.forEach((root) => tagTrackRows(root));
  roots.forEach((root) => enhanceDownloadButtons(root));
  scheduleProcessedRefresh();

  if (pendingRoots.size) {
    scheduleScan();
  }
}

function tagTrackRows(root = document) {
  queryWithinRoot(root, "a[href*='/royalty-free-music/song/'], a[href*='/song/']").forEach((link) => {
    const row = findTrackRowFromElement(link);
    if (row) {
      row.setAttribute(ROW_ATTR, "true");
    }
  });

  if (root?.nodeType === Node.ELEMENT_NODE && isSongRow(root)) {
    root.setAttribute(ROW_ATTR, "true");
  }
}

function findTrackRowFromElement(element) {
  let current = element;

  while (current && current !== document.body) {
    if (current.hasAttribute?.(ROW_ATTR)) {
      return current;
    }
    if (isSongRow(current)) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}

function formatTooltipTitle(track) {
  const suffix =
    flowMode === "search"
      ? "en YouTube"
      : flowMode === "ask"
        ? "en YouTube y elegir el video"
        : "en YouTube y abrir descarga MP3";
  const subject =
    track && (track.title || track.artist)
      ? `"${[track.title, track.artist ? `(${track.artist})` : ""].filter(Boolean).join(" ")}"`
      : "esta cancion";
  return `Buscar ${subject} ${suffix}`;
}

function formatResultTooltip(response) {
  if (response.mode === "search") {
    return "Abriendo la busqueda de YouTube";
  }

  const video = response.video;
  if (!video) {
    return "Listo";
  }

  const prefix = response.remembered ? "Desde memoria · " : "";
  const percent =
    typeof video.score === "number" ? ` · ${Math.round(video.score * 100)}% de coincidencia` : "";
  return `${prefix}Abriendo: ${video.title}${percent}`;
}

function handleDocumentMouseOver(event) {
  const hoveredRow = event.target?.closest?.(`[${ROW_ATTR}]`);
  if (hoveredRow) {
    lastHoveredRow = hoveredRow;
  }

  if (!extensionEnabled) {
    return;
  }

  const downloadButton = findOfficialDownloadButtonFromTarget(event.target);
  if (!downloadButton || !downloadButton.hasAttribute(DOWNLOAD_ATTR)) {
    return;
  }

  const row = hoveredRow || findTrackContainer(downloadButton);
  if (row) {
    const track = extractTrackInfo(row, downloadButton);
    if (track.title || track.artist) {
      downloadButton.title = formatTooltipTitle(track);
    }
  }
}

function enhanceDownloadButtons(root = document) {
  if (!extensionEnabled) {
    return;
  }

  findOfficialDownloadButtons(root).forEach((button) => {
    if (isSongDownloadButton(button)) {
      if (!button.hasAttribute(DOWNLOAD_ATTR)) {
        button.setAttribute("data-original-title", button.title || "");
      }
      button.classList.add(ENHANCED_DOWNLOAD_CLASS);
      button.setAttribute(DOWNLOAD_ATTR, "true");
      
      const row = findTrackContainer(button);
      const track = row ? extractTrackInfo(row, button) : null;
      button.title = formatTooltipTitle(track);
    }
  });
}

function applyPageTweaks() {
  const shouldHideHero = Boolean(hideHeroBanner);
  document.documentElement.toggleAttribute(HIDE_HERO_ATTR, shouldHideHero);
  document.documentElement.toggleAttribute(COMPACT_ATTR, Boolean(compactRows));
  document.documentElement.toggleAttribute(DIM_PROCESSED_ATTR, Boolean(processedDim));
  try {
    window.localStorage.setItem(HIDE_HERO_CACHE_KEY, shouldHideHero ? "1" : "0");
  } catch (error) {
    // localStorage unavailable: early-guard.js will simply skip pre-hiding.
  }
}

function removeEnhancements() {
  closePicker();
  document.querySelectorAll(`.${ENHANCED_DOWNLOAD_CLASS}, [${DOWNLOAD_ATTR}]`).forEach((button) => {
    button.classList.remove(ENHANCED_DOWNLOAD_CLASS);
    button.classList.remove(ACTIVE_DOWNLOAD_CLASS);
    button.removeAttribute(DOWNLOAD_ATTR);
    delete button.dataset.artlistYoutubeMp3State;
    if (button.hasAttribute("data-original-title")) {
      button.title = button.getAttribute("data-original-title") || "";
      button.removeAttribute("data-original-title");
    }
  });
}

function handleDocumentClick(event) {
  // Queue selection mode turns row clicks into selection toggles (so tracks
  // do not start playing while building a batch).
  if (queueSelectMode && !queueRunning) {
    const isToolboxUi = event.target?.closest?.(`#${QUEUE_BAR_ID}, #${TOAST_ID}`);
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

  if (!downloadButton.classList.contains(ENHANCED_DOWNLOAD_CLASS) && !isSongDownloadButton(downloadButton)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  startDownloadForButton(downloadButton, {
    ask: Boolean(event.altKey),
    search: Boolean(event.shiftKey),
    copy: Boolean(event.metaKey || event.ctrlKey)
  });
}

function startDownloadForButton(downloadButton, modifiers = {}) {
  const row = findTrackContainer(downloadButton);
  const track = row ? extractTrackInfo(row, downloadButton) : { title: "", artist: "" };

  if (!track.title && !track.artist) {
    console.warn("[Artlist Toolbox] No pude detectar titulo/artista", {
      button: downloadButton,
      row
    });
    markButtonState(downloadButton, "error");
    window.setTimeout(() => markButtonState(downloadButton, "ready"), 2200);
    return;
  }

  if (row?.hasAttribute(PROCESSED_ATTR)) {
    showToast("Esta pista ya la habias procesado antes.");
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
  chrome.runtime.sendMessage(
    {
      type: "ARTLIST_DOWNLOAD_TRACK",
      payload: track,
      options
    },
    (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        const error = chrome.runtime.lastError?.message || response?.error;
        console.warn("[Artlist Toolbox]", error, track);
        showToast(error || "No se pudo procesar la pista.", "warn");
        markButtonState(downloadButton, "error");
        window.setTimeout(() => markButtonState(downloadButton, "ready"), 2200);
        return;
      }

      if (response.mode === "copied" && response.url) {
        markButtonState(downloadButton, "ready");
        copyTextToClipboard(response.url).then((ok) => {
          showToast(ok ? "Link de YouTube copiado" : "No se pudo copiar el link", ok ? "info" : "warn");
        });
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
  );
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

  const tooltipWrapper = button.closest?.("[data-testid='Tooltip'][aria-label='Download'], [aria-label='Download']");
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
      .filter(isVisible)
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

function findTrackContainer(downloadButton) {
  let current = downloadButton;

  while (current && current !== document.body) {
    if (isSongRow(current)) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function extractTrackInfo(row, downloadButton) {
  const songLink = row.querySelector("a[href*='/royalty-free-music/song/'], a[href*='/song/']");
  const artistLinks = [...row.querySelectorAll("a[href*='/royalty-free-music/artist/'], a[href*='/artist/']")];

  const title = cleanText(songLink?.textContent);
  const artists = artistLinks
    .map((link) => cleanText(link.textContent))
    .filter(Boolean)
    .filter(uniqueText)
    .join(" ");
  const duration = extractTrackDuration(row);

  if (title || artists) {
    return {
      title,
      artist: artists,
      duration
    };
  }

  const labels = downloadButton ? getTrackLabels(row, downloadButton) : [];

  return {
    title: labels[0] || "",
    artist: labels[1] || "",
    duration
  };
}

function extractTrackDuration(row) {
  const timeNodes = queryWithinRoot(row, "span, div, p, time")
    .filter(isVisible)
    .map((node) => cleanText(node.textContent))
    .filter((text) => /^\d{1,2}:\d{2}(?::\d{2})?$/.test(text));

  if (timeNodes.length) {
    return parseTimeLabel(timeNodes[0]);
  }

  const match = cleanText(row.textContent).match(/\b\d{1,2}:\d{2}\b/);
  return match ? parseTimeLabel(match[0]) : null;
}

function parseTimeLabel(label) {
  const parts = String(label || "")
    .split(":")
    .map((part) => Number(part));

  if (!parts.length || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  return parts.length === 3
    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts[0] * 60 + parts[1];
}

function isSongRow(element) {
  if (element === document.body || element === document.documentElement) {
    return false;
  }

  const hasSongLink = Boolean(element.querySelector("a[href*='/royalty-free-music/song/'], a[href*='/song/']"));
  const hasDownload = Boolean(element.querySelector(OFFICIAL_DOWNLOAD_SELECTOR));

  return hasSongLink && hasDownload;
}

function isSongDownloadButton(button) {
  if (!button) {
    return false;
  }

  // Check if it resides inside a song row
  const row = findTrackContainer(button);
  if (row) {
    return true;
  }

  // Fallback: Check if the page URL represents a song page
  const path = window.location.pathname;
  if (path.includes("/song/") || path.includes("/royalty-free-music/song/")) {
    return true;
  }

  return false;
}

function getTrackLabels(row, downloadButton) {
  const rowRect = row.getBoundingClientRect();
  const downloadRect = downloadButton.getBoundingClientRect();
  const maxLeft = Math.min(downloadRect.left, rowRect.left + Math.max(430, rowRect.width * 0.55));

  return queryWithinRoot(row, "a, span, p, strong, h1, h2, h3, h4, div")
    .filter(isVisible)
    .map((node) => ({
      node,
      rect: node.getBoundingClientRect(),
      text: cleanText(node.textContent)
    }))
    .filter(({ node, rect, text }) => {
      if (!isUsefulTrackLabel(text) || node.contains(downloadButton)) {
        return false;
      }

      const startsInLeftMetadata = rect.left >= rowRect.left + 40 && rect.left < maxLeft;
      const compactLabel = rect.width <= Math.max(320, rowRect.width * 0.46);
      return startsInLeftMetadata && compactLabel;
    })
    .filter(({ node, text }) => {
      return ![...node.children].some((child) => cleanText(child.textContent) === text);
    })
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)
    .map(({ text }) => text)
    .filter(uniqueText);
}

function markButtonState(button, state) {
  button.dataset.artlistYoutubeMp3State = state;
  button.classList.toggle(ACTIVE_DOWNLOAD_CLASS, state === "loading");
}

function renderCandidatePicker({ candidates, searchUrl, anchor, veto = false, memoryVideoId = null, track = null }) {
  pickerContext = { track };

  // The overlay can only render in the top frame; inside iframes fall back to the best match.
  if (window.top !== window) {
    if (candidates[0]) {
      openY2mate(candidates[0]);
    }
    return;
  }

  closePicker();

  const picker = document.createElement("div");
  picker.id = PICKER_ID;
  picker.className = "artlist-y2mate-picker";
  picker.setAttribute("role", "dialog");
  picker.setAttribute("aria-label", "Elegir video de YouTube");
  picker.addEventListener("click", (event) => event.stopPropagation());

  const heading = document.createElement("p");
  heading.className = "artlist-y2mate-picker-heading";
  heading.textContent = veto
    ? "La duracion no coincide con la de Artlist. Verifica y elegi el video:"
    : "Elegi el video correcto:";
  picker.append(heading);

  const list = document.createElement("ul");
  list.className = "artlist-y2mate-picker-list";
  candidates.forEach((candidate) => list.append(buildCandidateCard(candidate, memoryVideoId)));
  picker.append(list);

  const footer = document.createElement("div");
  footer.className = "artlist-y2mate-picker-footer";

  const searchLink = document.createElement("a");
  searchLink.href = searchUrl;
  searchLink.target = "_blank";
  searchLink.rel = "noopener";
  searchLink.textContent = "Buscar en YouTube";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "artlist-y2mate-picker-close";
  closeButton.textContent = "Cancelar";
  closeButton.addEventListener("click", () => closePicker());

  footer.append(searchLink, closeButton);
  picker.append(footer);

  document.body.append(picker);
  positionPicker(picker, anchor);
  bindPickerDismiss();
}

function buildCandidateCard(candidate, memoryVideoId = null) {
  const item = document.createElement("li");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "artlist-y2mate-candidate";
  button.addEventListener("click", () => openY2mate(candidate));

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
  title.textContent = candidate.title || "Video sin titulo";

  const meta = document.createElement("span");
  meta.className = "artlist-y2mate-candidate-meta";
  meta.textContent = [
    candidate.artist,
    candidate.duration ? formatDuration(candidate.duration) : "",
    typeof candidate.score === "number" ? `${Math.round(candidate.score * 100)}%` : ""
  ]
    .filter(Boolean)
    .join(" · ");

  info.append(title, meta);

  if (memoryVideoId && candidate.videoId === memoryVideoId) {
    const badge = document.createElement("span");
    badge.className = "artlist-y2mate-candidate-badge";
    badge.textContent = "Usada antes";
    info.append(badge);
  }

  button.append(info);
  item.append(button);
  return item;
}

function openY2mate(candidate) {
  if (!candidate?.videoId) {
    return;
  }

  chrome.runtime.sendMessage({
    type: "ARTLIST_OPEN_Y2MATE",
    payload: {
      videoId: candidate.videoId,
      title: candidate.title || "",
      artist: candidate.artist || "",
      track: pickerContext?.track || null
    }
  });
  closePicker();
}

function positionPicker(picker, anchor) {
  const margin = 8;
  const rect = anchor.getBoundingClientRect();
  const width = picker.offsetWidth;
  const height = picker.offsetHeight;

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

function bindPickerDismiss() {
  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      closePicker();
    }
  };
  const onDocumentClick = (event) => {
    if (!event.target?.closest?.(`#${PICKER_ID}`)) {
      closePicker();
    }
  };

  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("click", onDocumentClick, true);

  pickerDismissListeners = () => {
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("click", onDocumentClick, true);
  };
}

function closePicker() {
  document.getElementById(PICKER_ID)?.remove();
  pickerContext = null;
  if (pickerDismissListeners) {
    pickerDismissListeners();
    pickerDismissListeners = null;
  }
}

function handleKeyDown(event) {
  if (!keyboardShortcuts || event.defaultPrevented) {
    return;
  }
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  const target = event.target;
  if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName || ""))) {
    return;
  }

  const row = lastHoveredRow && document.contains(lastHoveredRow) ? lastHoveredRow : null;

  if (event.key === "/") {
    const input = findSearchInput();
    if (input) {
      event.preventDefault();
      input.focus();
    }
    return;
  }

  if (event.key === "c" && row) {
    event.preventDefault();
    copyTrackInfo(row);
    return;
  }

  if (event.key === "d" && row && extensionEnabled) {
    event.preventDefault();
    const button = findRowDownloadButton(row);
    if (button) {
      startDownloadForButton(button, {});
    }
    return;
  }

  if (event.key === "q" && extensionEnabled) {
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
  // Only the top frame answers; iframes would race the response.
  if (window.top !== window) {
    return false;
  }

  if (message?.type === "ARTLIST_CONTEXT_COPY") {
    const row = findActionableRow();
    if (row) {
      copyTrackInfo(row);
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false });
    }
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

function copyTrackInfo(row) {
  const track = extractTrackInfo(row);
  if (!track.title && !track.artist) {
    showToast("No pude detectar la info de la pista.", "warn");
    return;
  }

  const text = buildTrackInfoText(track);
  copyTextToClipboard(text).then((ok) => {
    showToast(ok ? `Copiado: ${text}` : "No se pudo copiar al portapapeles.", ok ? "info" : "warn");
  });
}

function buildTrackInfoText(track) {
  const title = track.title || "Pista sin titulo";
  let text = track.artist ? `${track.artist} - ${title}` : title;
  if (track.duration) {
    text += ` (${formatDuration(track.duration)})`;
  }
  return text;
}

function copyTextToClipboard(text) {
  return new Promise((resolve) => {
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(
          () => resolve(true),
          () => resolve(fallbackCopyText(text))
        );
        return;
      }
    } catch (error) {
      // Fall through to the legacy path.
    }
    resolve(fallbackCopyText(text));
  });
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
  } catch (error) {
    return false;
  }
}

function showToast(message, tone = "info") {
  if (window.top !== window || !document.body) {
    return;
  }

  let toast = document.getElementById(TOAST_ID);
  if (!toast) {
    toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.className = "artlist-toolbox-toast";
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

function scheduleProcessedRefresh() {
  if (!processedDim) {
    return;
  }
  window.clearTimeout(processedCheckTimer);
  processedCheckTimer = window.setTimeout(refreshProcessedMarks, PROCESSED_CHECK_DEBOUNCE_MS);
}

async function refreshProcessedMarks() {
  if (!processedDim || processedCheckPending) {
    return;
  }

  const rows = [...document.querySelectorAll(`[${ROW_ATTR}]`)].slice(0, PROCESSED_CHECK_LIMIT);
  if (!rows.length) {
    return;
  }

  const tracks = rows.map((row) => {
    const track = extractTrackInfo(row);
    return { title: track.title, artist: track.artist };
  });

  processedCheckPending = true;
  const response = await sendMessageAsync({ type: "ARTLIST_CHECK_PROCESSED", payload: { tracks } });
  processedCheckPending = false;

  if (!response?.ok || !Array.isArray(response.results)) {
    return;
  }

  rows.forEach((row, index) => {
    const hit = response.results[index];
    if (hit?.processed) {
      row.setAttribute(PROCESSED_ATTR, String(hit.at || "1"));
    } else {
      row.removeAttribute(PROCESSED_ATTR);
    }
  });
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
  showToast("Modo cola: clic en las filas para agregarlas. q para salir.");
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
    queueStatusText = "Deteniendo...";
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
    startQueueProcessing();
  });

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "artlist-toolbox-queue-button";
  clearButton.dataset.role = "clear";
  clearButton.textContent = "Vaciar";
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
  exitButton.textContent = "Salir";
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
  if (window.top !== window) {
    return;
  }

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

  if (queueRunning) {
    status.textContent = queueStatusText || "Procesando...";
    runButton.textContent = "Detener";
    runButton.disabled = queueStopRequested;
    clearButton.hidden = true;
    return;
  }

  const count = queuedRows.size;
  status.textContent = count
    ? `${count} pista${count === 1 ? "" : "s"} en cola`
    : "Selecciona pistas para la cola";
  runButton.textContent = "Procesar";
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

    const track = extractTrackInfo(row);
    row.setAttribute(QUEUE_STATE_ATTR, "processing");
    queueStatusText = `Procesando ${index + 1}/${rows.length}: ${track.title || "pista"}`;
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
    // The flow was disabled while the queue was running; leave selection mode.
    exitQueueSelectMode();
  }
  showToast(
    `Cola terminada: ${done} al conversor · ${search} a busqueda · ${failed} con error`,
    failed ? "warn" : "ok"
  );
}

function exportVisibleTracksCsv() {
  if (window.top !== window) {
    return { ok: false };
  }

  const rows = [...document.querySelectorAll(`[${ROW_ATTR}]`)].filter(isVisible).slice(0, 300);
  const tracks = rows
    .map((row) => {
      const track = extractTrackInfo(row);
      const link = row.querySelector("a[href*='/royalty-free-music/song/'], a[href*='/song/']");
      return {
        title: track.title,
        artist: track.artist,
        duration: track.duration,
        url: link?.href || ""
      };
    })
    .filter((track) => track.title || track.artist);

  if (!tracks.length) {
    showToast("No encontre pistas visibles para exportar.", "warn");
    return { ok: false };
  }

  sendMessageAsync({ type: "ARTLIST_BUILD_CSV", payload: { tracks } }).then((response) => {
    if (!response?.ok || typeof response.csv !== "string") {
      showToast("No se pudo generar el CSV.", "warn");
      return;
    }
    downloadTextFile(`\ufeff${response.csv}`, "artlist-tracks.csv");
    showToast(`CSV exportado: ${response.count || tracks.length} pistas`);
  });

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

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function exposeDebugHelper() {
  window.artlistYoutubeMp3Debug = () => {
    const buttons = findOfficialDownloadButtons(document);
    return {
      settings: {
        extensionEnabled,
        flowMode,
        hideHeroBanner,
        compactRows,
        processedDim,
        keyboardShortcuts,
        queueSelectMode,
        queueRunning,
        queuedCount: queuedRows.size
      },
      rows: document.querySelectorAll(`[${ROW_ATTR}]`).length,
      processedRows: document.querySelectorAll(`[${PROCESSED_ATTR}]`).length,
      buttons: buttons.map((button) => {
        const row = findTrackContainer(button);
        return {
          button,
          row,
          track: row ? extractTrackInfo(row, button) : null,
          rowText: row ? cleanText(row.textContent).slice(0, 240) : ""
        };
      })
    };
  };
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

function isVisible(element) {
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
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

function uniqueText(value, index, values) {
  return values.indexOf(value) === index;
}
