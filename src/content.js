const ENHANCED_DOWNLOAD_CLASS = "artlist-youtube-mp3-download";
const ACTIVE_DOWNLOAD_CLASS = "artlist-youtube-mp3-download-active";
const DOWNLOAD_ATTR = "data-artlist-youtube-mp3-download";
const PICKER_ID = "artlist-y2mate-picker";
const HIDE_HERO_ATTR = "data-artlist-toolbox-hide-hero";
const SCAN_DEBOUNCE_MS = 250;
const BOOTSTRAP_SCAN_COUNT = 12;
const MAX_ROOTS_PER_SCAN = 30;

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
let extensionEnabled = true;
let flowMode = "auto";
let hideHeroBanner = false;
let pickerDismissListeners = null;

boot();

function boot() {
  if (!document.body) {
    window.setTimeout(boot, 100);
    return;
  }

  // Load initial extension state
  chrome.storage.local.get(
    { enabled: true, flowMode: null, searchOnly: false, hideHeroBanner: false },
    (items) => {
      extensionEnabled = items.enabled;
      flowMode = items.flowMode || (items.searchOnly ? "search" : "auto");
      hideHeroBanner = Boolean(items.hideHeroBanner);
      applyPageTweaks();
      if (extensionEnabled) {
        scheduleScan(document);
        scheduleBootstrapScans();
      }
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

    if (changes.enabled !== undefined) {
      extensionEnabled = changes.enabled.newValue;
      applyPageTweaks();
      if (extensionEnabled) {
        bootstrapScansRemaining = BOOTSTRAP_SCAN_COUNT;
        scheduleScan(document);
        scheduleBootstrapScans();
      } else {
        removeEnhancements();
      }
    }
  });

  document.addEventListener("click", handleDocumentClick, true);
  document.addEventListener("mouseover", handleDocumentMouseOver, true);
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
  roots.forEach((root) => enhanceDownloadButtons(root));

  if (pendingRoots.size) {
    scheduleScan();
  }
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

  const percent =
    typeof video.score === "number" ? ` · ${Math.round(video.score * 100)}% de coincidencia` : "";
  return `Abriendo: ${video.title}${percent}`;
}

function handleDocumentMouseOver(event) {
  if (!extensionEnabled) {
    return;
  }

  const downloadButton = findOfficialDownloadButtonFromTarget(event.target);
  if (!downloadButton || !downloadButton.hasAttribute(DOWNLOAD_ATTR)) {
    return;
  }

  const row = findTrackContainer(downloadButton);
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
  const shouldHideHero = extensionEnabled && hideHeroBanner;
  document.documentElement.toggleAttribute(HIDE_HERO_ATTR, shouldHideHero);
}

function removeEnhancements() {
  closePicker();
  document.documentElement.removeAttribute(HIDE_HERO_ATTR);
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

  const row = findTrackContainer(downloadButton);
  const track = row ? extractTrackInfo(row, downloadButton) : { title: "", artist: "" };

  if (!track.title && !track.artist) {
    console.warn("[Artlist Downloader] No pude detectar titulo/artista", {
      button: downloadButton,
      row
    });
    markButtonState(downloadButton, "error");
    window.setTimeout(() => markButtonState(downloadButton, "ready"), 2200);
    return;
  }

  markButtonState(downloadButton, "loading");
  chrome.runtime.sendMessage(
    {
      type: "ARTLIST_DOWNLOAD_TRACK",
      payload: track
    },
    (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        console.warn("[Artlist Downloader]", chrome.runtime.lastError || response?.error, track);
        markButtonState(downloadButton, "error");
        window.setTimeout(() => markButtonState(downloadButton, "ready"), 2200);
        return;
      }

      if (response.mode === "ask" && response.candidates?.length) {
        markButtonState(downloadButton, "ready");
        renderCandidatePicker({
          candidates: response.candidates,
          searchUrl: response.searchUrl,
          anchor: downloadButton
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

  const labels = getTrackLabels(row, downloadButton);

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

function renderCandidatePicker({ candidates, searchUrl, anchor }) {
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
  heading.textContent = "Elegi el video correcto:";
  picker.append(heading);

  const list = document.createElement("ul");
  list.className = "artlist-y2mate-picker-list";
  candidates.forEach((candidate) => list.append(buildCandidateCard(candidate)));
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

function buildCandidateCard(candidate) {
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
      artist: candidate.artist || ""
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
  if (pickerDismissListeners) {
    pickerDismissListeners();
    pickerDismissListeners = null;
  }
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
    return buttons.map((button) => {
      const row = findTrackContainer(button);
      return {
        button,
        row,
        track: row ? extractTrackInfo(row, button) : null,
        rowText: row ? cleanText(row.textContent).slice(0, 240) : ""
      };
    });
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
