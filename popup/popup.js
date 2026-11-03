// Popup UI. Loaded as an ES module so defaults, converter URLs, rankings count
// and bilingual strings stay in sync across all extension contexts.
import { DEFAULT_CONVERTER_TEMPLATE, DEFAULT_SETTINGS } from "../src/lib/defaults.js";
import { applyDomTranslations, resolveLanguage, t } from "../src/lib/i18n.js";
import { countRankings } from "../src/lib/rankings.js";
import { buildConverterUrl } from "../src/lib/youtube.js";

const ARTLIST_MUSIC_URL = "https://artlist.io/royalty-free-music";
const ARTLIST_URL_PATTERNS = ["https://artlist.io/*", "https://*.artlist.io/*"];

const FLOW_HINT_KEYS = {
  auto: "popup.flowHintAuto",
  ask: "popup.flowHintAsk",
  search: "popup.flowHintSearch"
};

const POPUP_KEYS = [
  "language",
  "enabled",
  "flowMode",
  "searchOnly",
  "openInBackground",
  "hideHeroBanner",
  "compactRows",
  "rankingsEnabled",
  "rankings",
  "popupExportButton",
  "converterUrlTemplate",
  "recent",
  "stats"
];

const toggleCheckbox = document.getElementById("toggle-extension");
const backgroundCheckbox = document.getElementById("toggle-background");
const hideHeroCheckbox = document.getElementById("toggle-hide-hero");
const compactCheckbox = document.getElementById("toggle-compact");
const rankingsCheckbox = document.getElementById("toggle-rankings");
const rankingsCount = document.getElementById("rankings-count");
const flowModes = document.getElementById("flow-modes");
const flowHint = document.getElementById("flow-hint");
const recentList = document.getElementById("recent-list");
const recentEmpty = document.getElementById("recent-empty");
const statsLine = document.getElementById("stats-line");
const popupStatus = document.getElementById("popup-status");
const exportButton = document.getElementById("export-csv");
const sidePanelButton = document.getElementById("open-sidepanel");

let currentLang = resolveLanguage("auto");
let flowMode = "auto";
let converterUrlTemplate = DEFAULT_CONVERTER_TEMPLATE;
let openInBackground = false;
let latestRecent = [];
let latestStats = {};
let currentWindowId = null;
let statusTimer = null;

const popupDefaults = Object.fromEntries(POPUP_KEYS.map((key) => [key, DEFAULT_SETTINGS[key]]));

void init();

async function init() {
  if (!chrome.sidePanel?.open) {
    sidePanelButton.hidden = true;
  } else {
    try {
      const win = await chrome.windows.getCurrent();
      currentWindowId = win?.id ?? null;
    } catch (_error) {
      currentWindowId = null;
    }
  }

  const items = await chrome.storage.local.get(popupDefaults);
  currentLang = resolveLanguage(items.language);
  applyDomTranslations(document, currentLang);

  toggleCheckbox.checked = Boolean(items.enabled);
  openInBackground = Boolean(items.openInBackground);
  backgroundCheckbox.checked = openInBackground;
  hideHeroCheckbox.checked = Boolean(items.hideHeroBanner);
  compactCheckbox.checked = Boolean(items.compactRows);
  rankingsCheckbox.checked = items.rankingsEnabled !== false;
  converterUrlTemplate = items.converterUrlTemplate || DEFAULT_CONVERTER_TEMPLATE;
  renderRankingsCount(items.rankings);
  exportButton.hidden = !items.popupExportButton;

  flowMode = items.flowMode || (items.searchOnly ? "search" : "auto");
  if (!items.flowMode) {
    await chrome.storage.local.set({ flowMode, searchOnly: false });
  }

  latestRecent = items.recent || [];
  latestStats = items.stats || {};

  renderFlowMode();
  renderRecent(latestRecent);
  renderStats(latestStats);
}

toggleCheckbox.addEventListener("change", () => {
  void chrome.storage.local.set({ enabled: toggleCheckbox.checked });
});

backgroundCheckbox.addEventListener("change", () => {
  openInBackground = backgroundCheckbox.checked;
  void chrome.storage.local.set({ openInBackground });
});

hideHeroCheckbox.addEventListener("change", () => {
  void chrome.storage.local.set({ hideHeroBanner: hideHeroCheckbox.checked });
});

compactCheckbox.addEventListener("change", () => {
  void chrome.storage.local.set({ compactRows: compactCheckbox.checked });
});

rankingsCheckbox.addEventListener("change", () => {
  void chrome.storage.local.set({ rankingsEnabled: rankingsCheckbox.checked });
});

flowModes.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mode]");
  if (!button) {
    return;
  }

  flowMode = button.dataset.mode;
  void chrome.storage.local.set({ flowMode, searchOnly: false });
  renderFlowMode();
});

document.getElementById("open-artlist").addEventListener("click", () => {
  void chrome.tabs.create({ url: ARTLIST_MUSIC_URL });
  window.close();
});

exportButton.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  if (!tab?.id || !/^https:\/\/([a-z0-9-]+\.)?artlist\.io\//i.test(tab.url || "")) {
    setStatus(t("popup.openArtlistFirst", {}, currentLang), true);
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "ARTLIST_EXPORT_CSV" });
    if (response?.ok) {
      setStatus(t("popup.exportingTracks", { count: response.count || 0 }, currentLang));
      window.setTimeout(() => window.close(), 900);
    } else {
      setStatus(t("popup.noVisibleTracks", {}, currentLang), true);
    }
  } catch (_error) {
    setStatus(t("popup.reloadAndRetry", {}, currentLang), true);
  }
});

sidePanelButton.addEventListener("click", async () => {
  // Call chrome.sidePanel.open synchronously before awaiting to preserve the user gesture.
  if (currentWindowId !== null && chrome.sidePanel?.open) {
    try {
      await chrome.sidePanel.open({ windowId: currentWindowId });
      window.close();
      return;
    } catch (_error) {
      // Fall back to opening Rankings in a tab if sidePanel.open is unsupported.
    }
  }
  await chrome.tabs.create({ url: chrome.runtime.getURL("rankings/rankings.html") });
  window.close();
});

document.getElementById("open-options").addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
  window.close();
});

document.getElementById("open-rankings").addEventListener("click", () => {
  void chrome.tabs.create({ url: chrome.runtime.getURL("rankings/rankings.html") });
  window.close();
});

document.getElementById("clear-recent").addEventListener("click", async () => {
  await chrome.storage.local.set({ recent: [] });
  latestRecent = [];
  renderRecent([]);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") {
    return;
  }

  if (changes.language) {
    currentLang = resolveLanguage(changes.language.newValue);
    applyDomTranslations(document, currentLang);
    renderFlowMode();
    renderStats(latestStats);
  }
  if (changes.enabled) {
    toggleCheckbox.checked = Boolean(changes.enabled.newValue);
  }
  if (changes.flowMode) {
    flowMode = changes.flowMode.newValue || "auto";
    renderFlowMode();
  }
  if (changes.openInBackground) {
    openInBackground = Boolean(changes.openInBackground.newValue);
    backgroundCheckbox.checked = openInBackground;
  }
  if (changes.hideHeroBanner) {
    hideHeroCheckbox.checked = Boolean(changes.hideHeroBanner.newValue);
  }
  if (changes.compactRows) {
    compactCheckbox.checked = Boolean(changes.compactRows.newValue);
  }
  if (changes.minScore) {
    const percent = Math.round(
      (Number(changes.minScore.newValue) || DEFAULT_SETTINGS.minScore) * 100
    );
    minScoreInput.value = percent;
    thresholdValue.textContent = `${percent}%`;
  }
  if (changes.converterUrlTemplate) {
    converterUrlTemplate = changes.converterUrlTemplate.newValue || DEFAULT_CONVERTER_TEMPLATE;
  }
  if (changes.popupExportButton) {
    exportButton.hidden = !changes.popupExportButton.newValue;
  }
  if (changes.rankingsEnabled) {
    rankingsCheckbox.checked = changes.rankingsEnabled.newValue !== false;
  }
  if (changes.rankings) {
    renderRankingsCount(changes.rankings.newValue);
  }
  if (changes.recent) {
    latestRecent = changes.recent.newValue || [];
    renderRecent(latestRecent);
  }
  if (changes.stats) {
    latestStats = changes.stats.newValue || {};
    renderStats(latestStats);
  }
});

function renderFlowMode() {
  flowModes.querySelectorAll("button[data-mode]").forEach((button) => {
    const active = button.dataset.mode === flowMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  });

  const hintKey = FLOW_HINT_KEYS[flowMode] || FLOW_HINT_KEYS.auto;
  flowHint.textContent = t(hintKey, {}, currentLang);
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
      void chrome.tabs.create({
        url: buildConverterUrl(item.videoId, converterUrlTemplate),
        active: !openInBackground
      });
      if (!openInBackground) {
        window.close();
      }
    });

    listItem.append(button);
    recentList.append(listItem);
  });
}

function renderStats(stats = {}) {
  const total = Number(stats?.total) || 0;
  if (!total) {
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

  const key = total === 1 ? "popup.statsLineOne" : "popup.statsLineMany";
  statsLine.textContent = t(key, { total, week }, currentLang);
}

function renderRankingsCount(rankings = {}) {
  const count = countRankings(rankings);
  rankingsCount.hidden = count === 0;
  rankingsCount.textContent = count > 99 ? "99+" : String(count);
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
  statusTimer = window.setTimeout(
    () => {
      popupStatus.hidden = true;
    },
    isError ? 4200 : 2500
  );
}

document.getElementById("version").textContent = `v${chrome.runtime.getManifest().version}`;
