// Full settings page. Loaded as an ES module so defaults and CSV helpers
// stay shared with the background service worker.
import {
  CONFIG_KEYS,
  DEFAULT_PREFERRED_TERMS,
  DEFAULT_SETTINGS,
  NEGATIVE_TERMS,
  RECENT_LIMIT,
  STATS_DAYS
} from "../src/lib/defaults.js";
import { buildCsv } from "../src/lib/csv.js";

const FLOW_HINTS = {
  auto: "Search YouTube and open y2mate automatically (memory and duration veto still apply).",
  ask: "Show the top matches and let me pick one every time.",
  search: "Only open the YouTube search; never auto-pick."
};

const els = {
  enabled: document.getElementById("opt-enabled"),
  flowModes: document.getElementById("opt-flow-modes"),
  flowHint: document.getElementById("opt-flow-hint"),
  minScore: document.getElementById("opt-min-score"),
  minScoreValue: document.getElementById("opt-min-score-value"),
  background: document.getElementById("opt-background"),
  veto: document.getElementById("opt-veto"),
  vetoTolerance: document.getElementById("opt-veto-tolerance"),
  negativeTerms: document.getElementById("opt-negative-terms"),
  negativeReset: document.getElementById("opt-negative-reset"),
  preferredTerms: document.getElementById("opt-preferred-terms"),
  preferredReset: document.getElementById("opt-preferred-reset"),
  memoryEnabled: document.getElementById("opt-memory-enabled"),
  memoryCount: document.getElementById("opt-memory-count"),
  memoryList: document.getElementById("opt-memory-list"),
  memoryClear: document.getElementById("opt-memory-clear"),
  processedCount: document.getElementById("opt-processed-count"),
  processedList: document.getElementById("opt-processed-list"),
  processedClear: document.getElementById("opt-processed-clear"),
  hideHero: document.getElementById("opt-hide-hero"),
  compact: document.getElementById("opt-compact"),
  processedDim: document.getElementById("opt-processed-dim"),
  shortcuts: document.getElementById("opt-shortcuts"),
  popupExport: document.getElementById("opt-popup-export"),
  statsTotal: document.getElementById("opt-stats-total"),
  statsList: document.getElementById("opt-stats-list"),
  statsReset: document.getElementById("opt-stats-reset"),
  exportConfig: document.getElementById("opt-export-config"),
  importConfig: document.getElementById("opt-import-config"),
  exportRecent: document.getElementById("opt-export-recent"),
  restoreDefaults: document.getElementById("opt-restore-defaults"),
  configStatus: document.getElementById("opt-config-status"),
  diagnostics: document.getElementById("opt-diagnostics"),
  copyDiagnostics: document.getElementById("opt-copy-diagnostics")
};

let flowMode = "auto";
let state = { ...DEFAULT_SETTINGS };
let termsSaveTimer = null;

init();

async function init() {
  state = await chrome.storage.local.get(DEFAULT_SETTINGS);
  applyToUi();
  renderMemory();
  renderProcessed();
  renderStats();
  renderDiagnostics();
  bindEvents();

  const version = chrome.runtime.getManifest().version;
  document.getElementById("version").textContent = `v${version}`;
  document.getElementById("footer-version").textContent = `v${version}`;
}

function applyToUi() {
  els.enabled.checked = Boolean(state.enabled);
  els.background.checked = Boolean(state.openInBackground);
  els.veto.checked = state.durationVeto !== false;
  els.vetoTolerance.value = Number(state.durationTolerance) || DEFAULT_SETTINGS.durationTolerance;
  els.memoryEnabled.checked = state.memoryEnabled !== false;
  els.hideHero.checked = Boolean(state.hideHeroBanner);
  els.compact.checked = Boolean(state.compactRows);
  els.processedDim.checked = state.processedDim !== false;
  els.shortcuts.checked = state.keyboardShortcuts !== false;
  els.popupExport.checked = Boolean(state.popupExportButton);

  const percent = Math.round((Number(state.minScore) || DEFAULT_SETTINGS.minScore) * 100);
  els.minScore.value = percent;
  els.minScoreValue.textContent = `${percent}%`;

  writeTerms(els.negativeTerms, Array.isArray(state.negativeTerms) ? state.negativeTerms : NEGATIVE_TERMS);
  writeTerms(
    els.preferredTerms,
    Array.isArray(state.preferredTerms) ? state.preferredTerms : DEFAULT_PREFERRED_TERMS
  );

  flowMode = state.flowMode || (state.searchOnly ? "search" : "auto");
  renderFlowMode();
}

function bindEvents() {
  bindToggle("opt-enabled", "enabled");
  bindToggle("opt-background", "openInBackground");
  bindToggle("opt-veto", "durationVeto");
  bindToggle("opt-memory-enabled", "memoryEnabled");
  bindToggle("opt-hide-hero", "hideHeroBanner");
  bindToggle("opt-compact", "compactRows");
  bindToggle("opt-processed-dim", "processedDim");
  bindToggle("opt-shortcuts", "keyboardShortcuts");
  bindToggle("opt-popup-export", "popupExportButton");

  els.minScore.addEventListener("input", () => {
    els.minScoreValue.textContent = `${els.minScore.value}%`;
  });
  els.minScore.addEventListener("change", () => {
    save({ minScore: Number(els.minScore.value) / 100 });
  });

  els.vetoTolerance.addEventListener("change", () => {
    const value = Number(els.vetoTolerance.value);
    save({
      durationTolerance:
        Number.isFinite(value) && value >= 5 ? Math.min(value, 120) : DEFAULT_SETTINGS.durationTolerance
    });
  });

  els.flowModes.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-mode]");
    if (!button) {
      return;
    }
    flowMode = button.dataset.mode;
    renderFlowMode();
    save({ flowMode, searchOnly: false });
  });

  const scheduleTermsSave = () => {
    window.clearTimeout(termsSaveTimer);
    termsSaveTimer = window.setTimeout(() => {
      save({
        negativeTerms: readTerms(els.negativeTerms),
        preferredTerms: readTerms(els.preferredTerms)
      });
    }, 700);
  };
  els.negativeTerms.addEventListener("input", scheduleTermsSave);
  els.preferredTerms.addEventListener("input", scheduleTermsSave);

  els.negativeReset.addEventListener("click", () => {
    writeTerms(els.negativeTerms, NEGATIVE_TERMS);
    save({ negativeTerms: [...NEGATIVE_TERMS] });
  });
  els.preferredReset.addEventListener("click", () => {
    writeTerms(els.preferredTerms, DEFAULT_PREFERRED_TERMS);
    save({ preferredTerms: [...DEFAULT_PREFERRED_TERMS] });
  });

  els.memoryClear.addEventListener("click", async () => {
    if (!window.confirm("Clear every remembered match? The searches will run again.")) {
      return;
    }
    await chrome.storage.local.set({ matchMemory: {} });
    state.matchMemory = {};
    renderMemory();
  });

  els.processedClear.addEventListener("click", async () => {
    if (!window.confirm("Clear the processed history? Rows will stop being dimmed.")) {
      return;
    }
    await chrome.storage.local.set({ processed: {} });
    state.processed = {};
    renderProcessed();
  });

  els.statsReset.addEventListener("click", async () => {
    if (!window.confirm("Reset the download stats?")) {
      return;
    }
    await chrome.storage.local.set({ stats: { total: 0, daily: {} } });
    state.stats = { total: 0, daily: {} };
    renderStats();
  });

  els.exportConfig.addEventListener("click", exportConfig);
  els.importConfig.addEventListener("change", importConfigFile);
  els.exportRecent.addEventListener("click", exportRecentCsv);
  els.restoreDefaults.addEventListener("click", restoreDefaults);
  els.copyDiagnostics.addEventListener("click", copyDiagnostics);
}

function bindToggle(id, key) {
  const input = document.getElementById(id);
  input.addEventListener("change", () => {
    state[key] = input.checked;
    save({ [key]: input.checked });
  });
}

function renderFlowMode() {
  els.flowModes.querySelectorAll("button[data-mode]").forEach((button) => {
    const active = button.dataset.mode === flowMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  });
  els.flowHint.textContent = FLOW_HINTS[flowMode] || FLOW_HINTS.auto;
}

function readTerms(textarea) {
  return textarea.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 100);
}

function writeTerms(textarea, terms) {
  textarea.value = terms.join("\n");
}

function renderMemory() {
  const entries = Object.entries(state.matchMemory || {}).sort(
    (a, b) => (b[1]?.at || 0) - (a[1]?.at || 0)
  );

  els.memoryCount.textContent = entries.length
    ? `${entries.length} remembered match${entries.length === 1 ? "" : "es"} (max 500).`
    : "Nothing remembered yet. Pick a video from the ask picker and it will show up here.";

  els.memoryList.textContent = "";
  entries.slice(0, 50).forEach(([fingerprint, entry]) => {
    els.memoryList.append(
      buildEntryRow({
        title: formatEntryTitle(entry),
        meta: buildEntryMeta(entry),
        onDelete: async () => {
          const { matchMemory } = await chrome.storage.local.get({ matchMemory: {} });
          delete matchMemory[fingerprint];
          await chrome.storage.local.set({ matchMemory });
          state.matchMemory = matchMemory;
          renderMemory();
        }
      })
    );
  });
}

function renderProcessed() {
  const entries = Object.entries(state.processed || {}).sort(
    (a, b) => (b[1]?.at || 0) - (a[1]?.at || 0)
  );

  els.processedCount.textContent = entries.length
    ? `${entries.length} processed track${entries.length === 1 ? "" : "s"} (max 1000).`
    : "No processed tracks yet.";

  els.processedList.textContent = "";
  entries.slice(0, 30).forEach(([fingerprint, entry]) => {
    els.processedList.append(
      buildEntryRow({
        title: formatEntryTitle(entry),
        meta: buildEntryMeta(entry, entry.count ? `${entry.count}x` : ""),
        onDelete: async () => {
          const { processed } = await chrome.storage.local.get({ processed: {} });
          delete processed[fingerprint];
          await chrome.storage.local.set({ processed });
          state.processed = processed;
          renderProcessed();
        }
      })
    );
  });
}

function renderStats() {
  const stats = state.stats || {};
  const total = Number(stats.total) || 0;
  els.statsTotal.textContent = total
    ? `${total} download${total === 1 ? "" : "s"} recorded (history kept for ${STATS_DAYS} days).`
    : "No downloads recorded yet.";

  els.statsList.textContent = "";
  Object.entries(stats.daily || {})
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .forEach(([date, count]) => {
      const item = document.createElement("li");
      const main = document.createElement("div");
      main.className = "entry-main";
      const title = document.createElement("span");
      title.className = "entry-title";
      title.textContent = date;
      const meta = document.createElement("span");
      meta.className = "entry-meta";
      meta.textContent = `${count} download${Number(count) === 1 ? "" : "s"}`;
      main.append(title, meta);
      item.append(main);
      els.statsList.append(item);
    });
}

function formatEntryTitle(entry = {}) {
  const artist = String(entry.artist || "").trim();
  const title = String(entry.title || "").trim() || "Unknown track";
  return artist ? `${artist} — ${title}` : title;
}

function buildEntryMeta(entry = {}, extra = "") {
  const parts = [];
  if (extra) {
    parts.push(extra);
  }
  const videoId = String(entry.videoId || "");
  if (/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    parts.push(`youtu.be/${videoId}`);
  }
  if (entry.at) {
    parts.push(new Date(entry.at).toLocaleDateString());
  }
  return parts.join(" · ");
}

function buildEntryRow({ title, meta, onDelete }) {
  const item = document.createElement("li");

  const main = document.createElement("div");
  main.className = "entry-main";

  const titleEl = document.createElement("span");
  titleEl.className = "entry-title";
  titleEl.textContent = title;
  titleEl.title = title;

  const metaEl = document.createElement("span");
  metaEl.className = "entry-meta";
  metaEl.textContent = meta;
  metaEl.title = meta;

  main.append(titleEl, metaEl);

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "entry-delete";
  deleteButton.textContent = "Remove";
  deleteButton.addEventListener("click", onDelete);

  item.append(main, deleteButton);
  return item;
}

async function renderDiagnostics() {
  const text = await getStateWithBytes();
  els.diagnostics.textContent = text;
}

async function getStateWithBytes() {
  const items = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const bytes = await chrome.storage.local.getBytesInUse(null);
  const memoryCount = Object.keys(items.matchMemory || {}).length;
  const processedCount = Object.keys(items.processed || {}).length;
  const diagnostics = {
    version: chrome.runtime.getManifest().version,
    bytesInUse: bytes,
    memoryCount,
    processedCount,
    recentCount: (items.recent || []).length,
    enabled: Boolean(items.enabled),
    flowMode: items.flowMode || "auto",
    minScore: items.minScore,
    durationVeto: items.durationVeto !== false,
    durationTolerance: items.durationTolerance
  };
  return `v${diagnostics.version} · ${bytes} bytes used · ${memoryCount} memory · ${processedCount} processed · ${diagnostics.recentCount} recent · flow: ${diagnostics.enabled ? "on" : "off"}/${diagnostics.flowMode} · threshold ${Math.round((Number(diagnostics.minScore) || 0.42) * 100)}% · veto ${diagnostics.durationVeto ? `${diagnostics.durationTolerance}s` : "off"}`;
}

async function copyDiagnostics() {
  const text = await getStateWithBytes();
  try {
    await navigator.clipboard.writeText(text);
    setConfigStatus("Diagnostics copied to the clipboard.");
  } catch (error) {
    setConfigStatus("Could not copy diagnostics.", true);
  }
}

async function exportConfig() {
  const items = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const config = {};
  CONFIG_KEYS.forEach((key) => {
    config[key] = items[key];
  });

  downloadTextFile(
    JSON.stringify(config, null, 2),
    "artlist-toolbox-config.json",
    "application/json"
  );
  setConfigStatus("Config exported.");
}

async function importConfigFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) {
    return;
  }

  try {
    const raw = JSON.parse(await file.text());
    const clean = sanitizeImportedConfig(raw);
    const keys = Object.keys(clean);
    if (!keys.length) {
      setConfigStatus("That file does not look like an Artlist Toolbox config.", true);
      return;
    }

    await chrome.storage.local.set(clean);
    setConfigStatus(`Imported ${keys.length} setting${keys.length === 1 ? "" : "s"}. Reloading...`);
    window.setTimeout(() => window.location.reload(), 900);
  } catch (error) {
    setConfigStatus("Could not parse that file as JSON.", true);
  }
}

function sanitizeImportedConfig(raw) {
  const clean = {};
  if (!raw || typeof raw !== "object") {
    return clean;
  }

  CONFIG_KEYS.forEach((key) => {
    if (!(key in raw)) {
      return;
    }
    const value = raw[key];

    switch (key) {
      case "flowMode":
        if (value === null || ["auto", "ask", "search"].includes(value)) {
          clean[key] = value;
        }
        break;

      case "minScore": {
        const num = Number(value);
        if (Number.isFinite(num) && num > 0 && num <= 1) {
          clean[key] = num;
        }
        break;
      }

      case "durationTolerance": {
        const num = Number(value);
        if (Number.isFinite(num) && num >= 1 && num <= 300) {
          clean[key] = num;
        }
        break;
      }

      case "negativeTerms":
      case "preferredTerms":
        if (value === null) {
          clean[key] = null;
        } else if (Array.isArray(value)) {
          clean[key] = value
            .map((term) => String(term).trim())
            .filter(Boolean)
            .slice(0, 100);
        }
        break;

      default:
        if (typeof value === "boolean") {
          clean[key] = value;
        }
    }
  });

  return clean;
}

async function restoreDefaults() {
  if (!window.confirm("Restore every setting on this page to its default? Memory, history and stats are NOT touched.")) {
    return;
  }

  const defaults = {};
  CONFIG_KEYS.forEach((key) => {
    defaults[key] = DEFAULT_SETTINGS[key];
  });

  await chrome.storage.local.set(defaults);
  setConfigStatus("Defaults restored. Reloading...");
  window.setTimeout(() => window.location.reload(), 900);
}

async function exportRecentCsv() {
  const { recent } = await chrome.storage.local.get({ recent: [] });
  if (!recent.length) {
    setConfigStatus("No recent downloads to export.", true);
    return;
  }

  const rows = recent.slice(0, RECENT_LIMIT).map((item) => [
    item.title || "",
    item.artist || "",
    item.videoId ? `https://www.youtube.com/watch?v=${item.videoId}` : "",
    item.at ? new Date(item.at).toLocaleString() : ""
  ]);

  const csv = buildCsv(["Title", "Artist", "YouTube URL", "Date"], rows);
  downloadTextFile(`\ufeff${csv}`, "artlist-recent.csv", "text/csv");
  setConfigStatus("Recent downloads exported.");
}

function downloadTextFile(text, filename, mime = "text/plain") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function setConfigStatus(message, isError = false) {
  els.configStatus.hidden = false;
  els.configStatus.textContent = message;
  els.configStatus.classList.toggle("error", isError);
}

function save(patch) {
  chrome.storage.local.set(patch, () => {
    state = { ...state, ...patch };
  });
}
