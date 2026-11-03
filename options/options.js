// Full settings page. Loaded as an ES module so defaults, backup, i18n, and CSV
// helpers stay shared with the background service worker.
import {
  CONFIG_KEYS,
  DEFAULT_CONVERTER_TEMPLATE,
  DEFAULT_PREFERRED_TERMS,
  DEFAULT_SETTINGS,
  NEGATIVE_TERMS,
  RECENT_LIMIT,
  STATS_DAYS
} from "../src/lib/defaults.js";
import { buildBackupPayload } from "../src/lib/backup.js";
import { buildCsv } from "../src/lib/csv.js";
import { applyDomTranslations, resolveLanguage, SUPPORTED_LANGUAGES, t } from "../src/lib/i18n.js";
import {
  countRankings,
  normalizeTags,
  ratingToStars,
  sortRankingEntries
} from "../src/lib/rankings.js";
import { isValidConverterTemplate } from "../src/lib/youtube.js";

const FLOW_HINT_KEYS = {
  auto: "options.flowHintAuto",
  ask: "options.flowHintAsk",
  search: "options.flowHintSearch"
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
  converterTemplate: document.getElementById("opt-converter-template"),
  converterReset: document.getElementById("opt-converter-reset"),
  converterStatus: document.getElementById("opt-converter-status"),
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
  language: document.getElementById("opt-language"),
  hideHero: document.getElementById("opt-hide-hero"),
  compact: document.getElementById("opt-compact"),
  processedDim: document.getElementById("opt-processed-dim"),
  shortcuts: document.getElementById("opt-shortcuts"),
  rankingsEnabled: document.getElementById("opt-rankings-enabled"),
  rankingsCount: document.getElementById("opt-rankings-count"),
  rankingsList: document.getElementById("opt-rankings-list"),
  rankingsClear: document.getElementById("opt-rankings-clear"),
  openRankings: document.getElementById("opt-open-rankings"),
  openSidePanel: document.getElementById("opt-open-sidepanel"),
  popupExport: document.getElementById("opt-popup-export"),
  statsTotal: document.getElementById("opt-stats-total"),
  statsList: document.getElementById("opt-stats-list"),
  statsReset: document.getElementById("opt-stats-reset"),
  importMerge: document.getElementById("opt-import-merge"),
  exportBackup: document.getElementById("opt-export-backup"),
  exportConfig: document.getElementById("opt-export-config"),
  importConfig: document.getElementById("opt-import-config"),
  exportRecent: document.getElementById("opt-export-recent"),
  restoreDefaults: document.getElementById("opt-restore-defaults"),
  configStatus: document.getElementById("opt-config-status"),
  diagnostics: document.getElementById("opt-diagnostics"),
  copyDiagnostics: document.getElementById("opt-copy-diagnostics")
};

let flowMode = "auto";
let currentLang = "en";
let currentWindowId = null;
let state = { ...DEFAULT_SETTINGS };
let termsSaveTimer = null;

void init();

async function init() {
  state = await chrome.storage.local.get(DEFAULT_SETTINGS);
  currentLang = resolveLanguage(state.language);

  try {
    const win = await chrome.windows.getCurrent();
    currentWindowId = win?.id ?? null;
  } catch (_error) {
    currentWindowId = null;
  }

  if (!chrome.sidePanel?.open || currentWindowId === null) {
    els.openSidePanel.hidden = true;
  }

  applyTranslations();
  applyToUi();
  renderAllDynamicSections();
  bindEvents();

  const version = chrome.runtime.getManifest().version;
  document.getElementById("version").textContent = `v${version}`;
  document.getElementById("footer-version").textContent = `v${version}`;
}

function applyTranslations() {
  applyDomTranslations(document, currentLang);
  document.title = t("options.title", {}, currentLang);
}

function renderAllDynamicSections() {
  renderFlowMode();
  renderMemory();
  renderProcessed();
  renderRankings();
  renderStats();
  void renderDiagnostics();
}

function applyToUi() {
  els.enabled.checked = Boolean(state.enabled);
  els.background.checked = Boolean(state.openInBackground);
  els.veto.checked = state.durationVeto !== false;
  els.vetoTolerance.value = Number(state.durationTolerance) || DEFAULT_SETTINGS.durationTolerance;
  els.converterTemplate.value = isValidConverterTemplate(state.converterUrlTemplate)
    ? state.converterUrlTemplate.trim()
    : DEFAULT_CONVERTER_TEMPLATE;
  els.memoryEnabled.checked = state.memoryEnabled !== false;
  els.language.value = SUPPORTED_LANGUAGES.includes(state.language) ? state.language : "auto";
  els.hideHero.checked = Boolean(state.hideHeroBanner);
  els.compact.checked = Boolean(state.compactRows);
  els.processedDim.checked = state.processedDim !== false;
  els.shortcuts.checked = state.keyboardShortcuts !== false;
  els.rankingsEnabled.checked = state.rankingsEnabled !== false;
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
  bindToggle("opt-rankings-enabled", "rankingsEnabled");
  bindToggle("opt-popup-export", "popupExportButton");

  els.minScore.addEventListener("input", () => {
    els.minScoreValue.textContent = `${els.minScore.value}%`;
  });
  els.minScore.addEventListener("change", () => {
    void save({ minScore: Number(els.minScore.value) / 100 });
  });

  els.vetoTolerance.addEventListener("change", () => {
    const value = Number(els.vetoTolerance.value);
    void save({
      durationTolerance:
        Number.isFinite(value) && value >= 5 ? Math.min(value, 120) : DEFAULT_SETTINGS.durationTolerance
    });
  });

  els.converterTemplate.addEventListener("change", () => {
    const trimmed = els.converterTemplate.value.trim();
    if (!trimmed) {
      els.converterTemplate.value = DEFAULT_CONVERTER_TEMPLATE;
      void save({ converterUrlTemplate: DEFAULT_CONVERTER_TEMPLATE });
      setConverterStatus(t("options.converterSaved", {}, currentLang));
      return;
    }

    if (!isValidConverterTemplate(trimmed)) {
      setConverterStatus(t("options.converterInvalid", {}, currentLang), true);
      return;
    }

    els.converterTemplate.value = trimmed;
    void save({ converterUrlTemplate: trimmed });
    setConverterStatus(t("options.converterSaved", {}, currentLang));
  });

  els.converterReset.addEventListener("click", () => {
    els.converterTemplate.value = DEFAULT_CONVERTER_TEMPLATE;
    void save({ converterUrlTemplate: DEFAULT_CONVERTER_TEMPLATE });
    setConverterStatus(t("options.converterSaved", {}, currentLang));
  });

  els.language.addEventListener("change", async () => {
    const language = SUPPORTED_LANGUAGES.includes(els.language.value)
      ? els.language.value
      : "auto";
    currentLang = resolveLanguage(language);
    await save({ language });
    applyTranslations();
    renderAllDynamicSections();
  });

  els.flowModes.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-mode]");
    if (!button) {
      return;
    }
    flowMode = button.dataset.mode;
    renderFlowMode();
    void save({ flowMode, searchOnly: false });
  });

  const scheduleTermsSave = () => {
    window.clearTimeout(termsSaveTimer);
    termsSaveTimer = window.setTimeout(() => {
      void save({
        negativeTerms: readTerms(els.negativeTerms),
        preferredTerms: readTerms(els.preferredTerms)
      });
    }, 700);
  };
  els.negativeTerms.addEventListener("input", scheduleTermsSave);
  els.preferredTerms.addEventListener("input", scheduleTermsSave);

  els.negativeReset.addEventListener("click", () => {
    writeTerms(els.negativeTerms, NEGATIVE_TERMS);
    void save({ negativeTerms: [...NEGATIVE_TERMS] });
  });
  els.preferredReset.addEventListener("click", () => {
    writeTerms(els.preferredTerms, DEFAULT_PREFERRED_TERMS);
    void save({ preferredTerms: [...DEFAULT_PREFERRED_TERMS] });
  });

  els.memoryClear.addEventListener("click", async () => {
    if (!window.confirm(t("options.confirmClearMemory", {}, currentLang))) {
      return;
    }
    await chrome.storage.local.set({ matchMemory: {} });
    state.matchMemory = {};
    renderMemory();
  });

  els.processedClear.addEventListener("click", async () => {
    if (!window.confirm(t("options.confirmClearProcessed", {}, currentLang))) {
      return;
    }
    await chrome.storage.local.set({ processed: {} });
    state.processed = {};
    renderProcessed();
  });

  els.rankingsClear.addEventListener("click", async () => {
    if (!window.confirm(t("options.confirmClearRankings", {}, currentLang))) {
      return;
    }
    const response = await chrome.runtime.sendMessage({ type: "ARTLIST_CLEAR_RATINGS" });
    if (!response?.ok) {
      setConfigStatus(t("rankings.clearError", {}, currentLang), true);
      return;
    }
    state.rankings = {};
    renderRankings();
  });

  els.openRankings.addEventListener("click", () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL("rankings/rankings.html") });
  });

  els.openSidePanel.addEventListener("click", async () => {
    if (chrome.sidePanel?.open && currentWindowId !== null) {
      try {
        // Call synchronously before awaiting to preserve the user gesture.
        await chrome.sidePanel.open({ windowId: currentWindowId });
        return;
      } catch (_error) {
        // Fall back to opening Rankings in a tab if sidePanel.open fails.
      }
    }
    await chrome.tabs.create({ url: chrome.runtime.getURL("rankings/rankings.html") });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") {
      return;
    }

    if (changes.language) {
      state.language = changes.language.newValue || "auto";
      els.language.value = SUPPORTED_LANGUAGES.includes(state.language) ? state.language : "auto";
      currentLang = resolveLanguage(state.language);
      applyTranslations();
      renderAllDynamicSections();
      return;
    }

    if (changes.rankings) {
      state.rankings = changes.rankings.newValue || {};
      renderRankings();
    }
    if (changes.matchMemory) {
      state.matchMemory = changes.matchMemory.newValue || {};
      renderMemory();
    }
    if (changes.processed) {
      state.processed = changes.processed.newValue || {};
      renderProcessed();
    }
    if (changes.stats) {
      state.stats = changes.stats.newValue || { total: 0, daily: {} };
      renderStats();
    }
    void renderDiagnostics();
  });

  els.statsReset.addEventListener("click", async () => {
    if (!window.confirm(t("options.confirmResetStats", {}, currentLang))) {
      return;
    }
    await chrome.storage.local.set({ stats: { total: 0, daily: {} } });
    state.stats = { total: 0, daily: {} };
    renderStats();
  });

  els.exportBackup.addEventListener("click", () => void exportFullBackup());
  els.exportConfig.addEventListener("click", () => void exportSettingsOnly());
  els.importConfig.addEventListener("change", (event) => void importBackupFile(event));
  els.exportRecent.addEventListener("click", () => void exportRecentCsv());
  els.restoreDefaults.addEventListener("click", () => void restoreDefaults());
  els.copyDiagnostics.addEventListener("click", () => void copyDiagnostics());
}

function bindToggle(id, key) {
  const input = document.getElementById(id);
  input.addEventListener("change", () => {
    state[key] = input.checked;
    void save({ [key]: input.checked });
  });
}

function renderFlowMode() {
  els.flowModes.querySelectorAll("button[data-mode]").forEach((button) => {
    const active = button.dataset.mode === flowMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  });
  const hintKey = FLOW_HINT_KEYS[flowMode] || FLOW_HINT_KEYS.auto;
  els.flowHint.textContent = t(hintKey, {}, currentLang);
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

  if (!entries.length) {
    els.memoryCount.textContent = t("options.memoryCountEmpty", {}, currentLang);
  } else if (entries.length === 1) {
    els.memoryCount.textContent = t("options.memoryCountOne", {}, currentLang);
  } else {
    els.memoryCount.textContent = t(
      "options.memoryCountMany",
      { count: entries.length },
      currentLang
    );
  }

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

  if (!entries.length) {
    els.processedCount.textContent = t("options.processedCountEmpty", {}, currentLang);
  } else if (entries.length === 1) {
    els.processedCount.textContent = t("options.processedCountOne", {}, currentLang);
  } else {
    els.processedCount.textContent = t(
      "options.processedCountMany",
      { count: entries.length },
      currentLang
    );
  }

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

function renderRankings() {
  const rankings = state.rankings || {};
  const entries = sortRankingEntries(rankings, "rating");
  const total = countRankings(rankings);

  if (!total) {
    els.rankingsCount.textContent = t("options.rankingsCountEmpty", {}, currentLang);
  } else if (total === 1) {
    els.rankingsCount.textContent = t("options.rankingsCountOne", {}, currentLang);
  } else {
    els.rankingsCount.textContent = t(
      "options.rankingsCountMany",
      { count: total },
      currentLang
    );
  }

  els.rankingsList.textContent = "";
  entries.slice(0, 20).forEach(([, entry]) => {
    const date = entry.updatedAt ? new Date(entry.updatedAt).toLocaleDateString() : "";
    const tags = normalizeTags(entry.tags)
      .map((tag) => `#${tag}`)
      .join(" ");
    const kindLabel = entry.kind === "sfx" ? "SFX" : "";
    els.rankingsList.append(
      buildEntryRow({
        title: formatEntryTitle(entry),
        meta: [ratingToStars(entry.rating), kindLabel, tags, date].filter(Boolean).join(" · "),
        onDelete: async () => {
          const response = await chrome.runtime.sendMessage({
            type: "ARTLIST_SET_RATING",
            payload: {
              track: {
                title: entry.title,
                artist: entry.artist,
                duration: entry.duration,
                url: entry.url,
                kind: entry.kind
              },
              rating: 0
            }
          });
          if (!response?.ok) {
            setConfigStatus(t("rankings.saveError", {}, currentLang), true);
            return;
          }
          const { rankings: next } = await chrome.storage.local.get({ rankings: {} });
          state.rankings = next;
          renderRankings();
        }
      })
    );
  });
}

function renderStats() {
  const stats = state.stats || {};
  const total = Number(stats.total) || 0;
  if (!total) {
    els.statsTotal.textContent = t("options.statsEmpty", {}, currentLang);
  } else if (total === 1) {
    els.statsTotal.textContent = t("options.statsTotalOne", { days: STATS_DAYS }, currentLang);
  } else {
    els.statsTotal.textContent = t(
      "options.statsTotalMany",
      { count: total, days: STATS_DAYS },
      currentLang
    );
  }

  els.statsList.textContent = "";
  Object.entries(stats.daily || {})
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .forEach(([date, count]) => {
      const numCount = Number(count) || 0;
      const item = document.createElement("li");
      const main = document.createElement("div");
      main.className = "entry-main";
      const title = document.createElement("span");
      title.className = "entry-title";
      title.textContent = date;
      const meta = document.createElement("span");
      meta.className = "entry-meta";
      meta.textContent =
        numCount === 1
          ? t("options.statsDayOne", {}, currentLang)
          : t("options.statsDayMany", { count: numCount }, currentLang);
      main.append(title, meta);
      item.append(main);
      els.statsList.append(item);
    });
}

function formatEntryTitle(entry = {}) {
  const artist = String(entry.artist || "").trim();
  const title = String(entry.title || "").trim() || t("toast.untitledTrack", {}, currentLang);
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
  deleteButton.textContent = t("options.removeEntry", {}, currentLang);
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
  const rankingsCount = countRankings(items.rankings || {});
  const diagnostics = {
    version: chrome.runtime.getManifest().version,
    lang: resolveLanguage(items.language),
    bytesInUse: bytes,
    memoryCount,
    processedCount,
    rankingsCount,
    recentCount: (items.recent || []).length,
    enabled: Boolean(items.enabled),
    flowMode: items.flowMode || "auto",
    minScore: items.minScore,
    durationVeto: items.durationVeto !== false,
    durationTolerance: items.durationTolerance
  };
  return `v${diagnostics.version} (${diagnostics.lang}) · ${bytes} bytes · ${memoryCount} memory · ${processedCount} processed · ${rankingsCount} ranked · ${diagnostics.recentCount} recent · flow: ${diagnostics.enabled ? "on" : "off"}/${diagnostics.flowMode} · threshold ${Math.round((Number(diagnostics.minScore) || 0.42) * 100)}% · veto ${diagnostics.durationVeto ? `${diagnostics.durationTolerance}s` : "off"}`;
}

async function copyDiagnostics() {
  const text = await getStateWithBytes();
  try {
    await navigator.clipboard.writeText(text);
    setConfigStatus(t("options.diagnosticsCopied", {}, currentLang));
  } catch (_error) {
    setConfigStatus(t("options.diagnosticsCopyError", {}, currentLang), true);
  }
}

async function exportFullBackup() {
  const items = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const version = chrome.runtime.getManifest().version;
  const payload = buildBackupPayload(items, version, { includeData: true });
  const stamp = new Date().toISOString().slice(0, 10);

  downloadTextFile(
    JSON.stringify(payload, null, 2),
    `artlist-toolbox-backup-${stamp}.json`,
    "application/json"
  );
  setConfigStatus(t("options.backupExported", {}, currentLang));
}

async function exportSettingsOnly() {
  const items = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const version = chrome.runtime.getManifest().version;
  const payload = buildBackupPayload(items, version, { includeData: false });

  downloadTextFile(
    JSON.stringify(payload, null, 2),
    "artlist-toolbox-config.json",
    "application/json"
  );
  setConfigStatus(t("options.configExported", {}, currentLang));
}

async function importBackupFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) {
    return;
  }

  let raw;
  try {
    raw = JSON.parse(await file.text());
  } catch (_error) {
    setConfigStatus(t("options.importParseError", {}, currentLang), true);
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: "ARTLIST_IMPORT_BACKUP",
    payload: {
      raw,
      merge: Boolean(els.importMerge.checked)
    }
  });

  if (!response?.ok) {
    setConfigStatus(response?.error || t("options.importInvalid", {}, currentLang), true);
    return;
  }

  const summary = formatImportSummary(response.counts);
  setConfigStatus(t("options.importSuccess", { summary }, currentLang));
  window.setTimeout(() => window.location.reload(), 900);
}

function formatImportSummary(counts = {}) {
  const parts = [];
  if (counts.settings) {
    parts.push(t("options.summarySettings", { count: counts.settings }, currentLang));
  }
  if (counts.rankings) {
    parts.push(t("options.summaryRankings", { count: counts.rankings }, currentLang));
  }
  if (counts.matchMemory) {
    parts.push(t("options.summaryMemory", { count: counts.matchMemory }, currentLang));
  }
  if (counts.processed) {
    parts.push(t("options.summaryProcessed", { count: counts.processed }, currentLang));
  }
  if (counts.recent) {
    parts.push(t("options.summaryRecent", { count: counts.recent }, currentLang));
  }
  return parts.length ? parts.join(", ") : t("options.summaryBackup", {}, currentLang);
}

async function restoreDefaults() {
  if (!window.confirm(t("options.confirmRestoreDefaults", {}, currentLang))) {
    return;
  }

  const defaults = {};
  CONFIG_KEYS.forEach((key) => {
    defaults[key] = DEFAULT_SETTINGS[key];
  });

  await chrome.storage.local.set(defaults);
  setConfigStatus(t("options.defaultsRestored", {}, currentLang));
  window.setTimeout(() => window.location.reload(), 900);
}

async function exportRecentCsv() {
  const { recent } = await chrome.storage.local.get({ recent: [] });
  if (!recent.length) {
    setConfigStatus(t("options.noRecentExport", {}, currentLang), true);
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
  setConfigStatus(t("options.recentExported", {}, currentLang));
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

function setConverterStatus(message, isError = false) {
  els.converterStatus.hidden = false;
  els.converterStatus.textContent = message;
  els.converterStatus.classList.toggle("error", isError);
}

function setConfigStatus(message, isError = false) {
  els.configStatus.hidden = false;
  els.configStatus.textContent = message;
  els.configStatus.classList.toggle("error", isError);
}

async function save(patch) {
  state = { ...state, ...patch };
  await chrome.storage.local.set(patch);
}
