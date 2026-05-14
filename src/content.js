const ENHANCED_DOWNLOAD_CLASS = "artlist-youtube-mp3-download";
const ACTIVE_DOWNLOAD_CLASS = "artlist-youtube-mp3-download-active";
const DOWNLOAD_ATTR = "data-artlist-youtube-mp3-download";
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

boot();

function boot() {
  if (!document.body) {
    window.setTimeout(boot, 100);
    return;
  }

  document.addEventListener("click", handleDocumentClick, true);
  scheduleScan(document);
  scheduleBootstrapScans();
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

function enhanceDownloadButtons(root = document) {
  findOfficialDownloadButtons(root).forEach((button) => {
    button.classList.add(ENHANCED_DOWNLOAD_CLASS);
    button.setAttribute(DOWNLOAD_ATTR, "true");
    button.title = "Buscar esta cancion en YouTube y abrir descarga MP3";
  });
}

function handleDocumentClick(event) {
  const downloadButton = findOfficialDownloadButtonFromTarget(event.target);
  if (!downloadButton) {
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

      markButtonState(downloadButton, "done");
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

  if (title || artists) {
    return {
      title,
      artist: artists
    };
  }

  const labels = getTrackLabels(row, downloadButton);

  return {
    title: labels[0] || "",
    artist: labels[1] || ""
  };
}

function isSongRow(element) {
  const rect = element.getBoundingClientRect();
  if (rect.width < 420 || rect.height < 32 || rect.height > 220) {
    return false;
  }

  const hasSongLink = Boolean(element.querySelector("a[href*='/royalty-free-music/song/'], a[href*='/song/']"));
  const hasDownload = Boolean(element.querySelector(OFFICIAL_DOWNLOAD_SELECTOR));

  return hasSongLink && hasDownload;
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
