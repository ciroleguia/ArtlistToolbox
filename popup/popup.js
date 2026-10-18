// Popup UI. Loaded as an ES module so the defaults stay in sync with the
// background service worker and the options page.
import { DEFAULT_SETTINGS } from "../src/lib/defaults.js";

const ARTLIST_MUSIC_URL = "https://artlist.io/royalty-free-music";
const Y2MATE_BASE_URL = "https://y2mate.gs/#";
const ARTLIST_TAB_PATTERN = /^https:\/\/([a-z0-9-]+\.)?artlist\.io\//i;

const FLOW_HINTS = {
  auto: "Search YouTube and open y2mate automatically.",
  ask: "Show the top matches and let me pick one.",
  search: "Only open the YouTube search."
};

const POPUP_KEYS = [
  "enabled",
  "flowMode",
  "searchOnly",
  "openInBackground",
  "hideHeroBanner",
  "compactRows",
  "minScore",
  "recent",
  "stats"
];

const toggleCheckbox = document.getElementById("toggle-extension");
const backgroundCheckbox = document.getElementById("toggle-background");
const hideHeroCheckbox = document.getElementById("toggle-hide-hero");
const compactCheckbox = document.getElementById("toggle-compact");
const minScoreInput = document.getElementById("min-score");
const thresholdValue = document.getElementById("threshold-value");
const flowModes = document.getElementById("flow-modes");
const flowHint = document.getElementById("flow-hint");
const recentList = document.getElementById("recent-list");
const recentEmpty = document.getElementById("recent-empty");
const statsLine = document.getElementById("stats-line");
const popupStatus = document.getElementById("popup-status");
const exportButton = document.getElementById("export-csv");

let flowMode = "auto";
let statusTimer = null;

const popupDefaults = Object.fromEntries(POPUP_KEYS.map((key) => [key, DEFAULT_SETTINGS[key]]));

chrome.storage.local.get(popupDefaults, (items) => {
  toggleCheckbox.checked = Boolean(items.enabled);
  backgroundCheckbox.checked = Boolean(items.openInBackground);
  hideHeroCheckbox.checked = Boolean(items.hideHeroBanner);
  compactCheckbox.checked = Boolean(items.compactRows);
  minScoreInput.value = Math.round(items.minScore * 100);
  thresholdValue.textContent = `${Math.round(items.minScore * 100)}%`;

  flowMode = items.flowMode || (items.searchOnly ? "search" : "auto");
  if (!items.flowMode) {
    chrome.storage.local.set({ flowMode, searchOnly: false });
  }

  renderFlowMode();
  renderRecent(items.recent);
  renderStats(items.stats);
});

toggleCheckbox.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: toggleCheckbox.checked });
});

backgroundCheckbox.addEventListener("change", () => {
  chrome.storage.local.set({ openInBackground: backgroundCheckbox.checked });
});

hideHeroCheckbox.addEventListener("change", () => {
  chrome.storage.local.set({ hideHeroBanner: hideHeroCheckbox.checked });
});

compactCheckbox.addEventListener("change", () => {
  chrome.storage.local.set({ compactRows: compactCheckbox.checked });
});

minScoreInput.addEventListener("input", () => {
  thresholdValue.textContent = `${minScoreInput.value}%`;
});

minScoreInput.addEventListener("change", () => {
  chrome.storage.local.set({ minScore: Number(minScoreInput.value) / 100 });
});

flowModes.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mode]");
  if (!button) {
    return;
  }

  flowMode = button.dataset.mode;
  chrome.storage.local.set({ flowMode, searchOnly: false });
  renderFlowMode();
});

document.getElementById("open-artlist").addEventListener("click", () => {
  chrome.tabs.create({ url: ARTLIST_MUSIC_URL });
  window.close();
});

exportButton.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !ARTLIST_TAB_PATTERN.test(tab.url || "")) {
    setStatus("Open an Artlist tab first.", true);
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "ARTLIST_EXPORT_CSV" });
    if (response?.ok) {
      setStatus(`Exporting ${response.count || 0} tracks...`);
      window.setTimeout(() => window.close(), 900);
    } else {
      setStatus("No visible tracks to export.", true);
    }
  } catch (error) {
    setStatus("Could not reach the page. Reload the tab and retry.", true);
  }
});

document.getElementById("open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

document.getElementById("clear-recent").addEventListener("click", () => {
  chrome.storage.local.set({ recent: [] }, () => renderRecent([]));
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.recent) {
    renderRecent(changes.recent.newValue || []);
  }
  if (changes.stats) {
    renderStats(changes.stats.newValue);
  }
});

function renderFlowMode() {
  flowModes.querySelectorAll("button[data-mode]").forEach((button) => {
    const active = button.dataset.mode === flowMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  });

  flowHint.textContent = FLOW_HINTS[flowMode] || FLOW_HINTS.auto;
}

function renderRecent(items = []) {
  recentList.textContent = "";
  recentEmpty.hidden = items.length > 0;

  items.forEach((item) => {
    const listItem = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.title = item.title || "Video";

    const title = document.createElement("span");
    title.className = "recent-title";
    title.textContent = item.title || "Video";

    const meta = document.createElement("span");
    meta.className = "recent-meta";
    meta.textContent = item.artist || "";

    button.append(title, meta);
    button.addEventListener("click", () => {
      chrome.tabs.create({ url: `${Y2MATE_BASE_URL}${item.videoId}/mp3` });
      window.close();
    });

    listItem.append(button);
    recentList.append(listItem);
  });
}

function renderStats(stats = {}) {
  const total = Number(stats?.total) || 0;
  if (!total) {
    // The Recent downloads section already has its own empty state; keep a
    // single message instead of two stacked variants.
    statsLine.textContent = "";
    statsLine.hidden = true;
    return;
  }

  statsLine.hidden = false;

  const daily = stats?.daily || {};
  const cutoff = localDateKey(new Date(Date.now() - 6 * 86400000));
  const week = Object.entries(daily)
    .filter(([date]) => date >= cutoff)
    .reduce((sum, [, count]) => sum + (Number(count) || 0), 0);

  statsLine.textContent = `${total} download${total === 1 ? "" : "s"} total · ${week} in the last 7 days`;
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setStatus(message, isError = false) {
  popupStatus.hidden = false;
  popupStatus.textContent = message;
  popupStatus.classList.toggle("error", isError);
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    popupStatus.hidden = true;
  }, isError ? 4200 : 2500);
}

document.getElementById("version").textContent = `v${chrome.runtime.getManifest().version}`;
