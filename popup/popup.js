const ARTLIST_MUSIC_URL = "https://artlist.io/royalty-free-music";
const Y2MATE_BASE_URL = "https://y2mate.gs/#";

const FLOW_HINTS = {
  auto: "Search YouTube and open y2mate automatically.",
  ask: "Show the top matches and let me pick one.",
  search: "Only open the YouTube search."
};

const toggleCheckbox = document.getElementById("toggle-extension");
const backgroundCheckbox = document.getElementById("toggle-background");
const hideHeroCheckbox = document.getElementById("toggle-hide-hero");
const minScoreInput = document.getElementById("min-score");
const thresholdValue = document.getElementById("threshold-value");
const flowModes = document.getElementById("flow-modes");
const flowHint = document.getElementById("flow-hint");
const recentList = document.getElementById("recent-list");
const recentEmpty = document.getElementById("recent-empty");

let flowMode = "auto";

// Load settings
chrome.storage.local.get(
  {
    enabled: true,
    flowMode: null,
    searchOnly: false,
    openInBackground: false,
    hideHeroBanner: false,
    minScore: 0.42,
    recent: []
  },
  (items) => {
    toggleCheckbox.checked = items.enabled;
    backgroundCheckbox.checked = items.openInBackground;
    hideHeroCheckbox.checked = items.hideHeroBanner;
    minScoreInput.value = Math.round(items.minScore * 100);
    thresholdValue.textContent = `${Math.round(items.minScore * 100)}%`;

    flowMode = items.flowMode || (items.searchOnly ? "search" : "auto");
    if (!items.flowMode) {
      chrome.storage.local.set({ flowMode });
    }

    renderFlowMode();
    renderRecent(items.recent);
  }
);

// Save settings on change
toggleCheckbox.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: toggleCheckbox.checked });
});

backgroundCheckbox.addEventListener("change", () => {
  chrome.storage.local.set({ openInBackground: backgroundCheckbox.checked });
});

hideHeroCheckbox.addEventListener("change", () => {
  chrome.storage.local.set({ hideHeroBanner: hideHeroCheckbox.checked });
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

document.getElementById("clear-recent").addEventListener("click", () => {
  chrome.storage.local.set({ recent: [] }, () => renderRecent([]));
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

document.getElementById("version").textContent = `v${chrome.runtime.getManifest().version}`;
