import { BACKUP_APP_ID, BACKUP_SCHEMA_VERSION, sanitizeRankingsMap } from "../src/lib/backup.js";
import { buildCsv, formatDurationLabel } from "../src/lib/csv.js";
import { DEFAULT_SETTINGS } from "../src/lib/defaults.js";
import { applyDomTranslations, resolveLanguage, t } from "../src/lib/i18n.js";
import {
  MAX_NOTE_LENGTH,
  RANKING_CSV_COLUMNS,
  buildRankingCsvRows,
  cleanNote,
  collectAllTags,
  countRankings,
  filterRankingEntries,
  normalizeKind,
  normalizeRating,
  normalizeTags,
  sortRankingEntries
} from "../src/lib/rankings.js";

const els = {
  openTab: document.getElementById("rankings-open-tab"),
  search: document.getElementById("rankings-search"),
  sort: document.getElementById("rankings-sort"),
  filter: document.getElementById("rankings-filter"),
  tagFilter: document.getElementById("rankings-tag-filter"),
  kindFilter: document.getElementById("rankings-kind-filter"),
  summary: document.getElementById("rankings-summary"),
  list: document.getElementById("rankings-list"),
  empty: document.getElementById("rankings-empty"),
  exportCsv: document.getElementById("rankings-export"),
  exportJson: document.getElementById("rankings-export-json"),
  importJson: document.getElementById("rankings-import-json"),
  clear: document.getElementById("rankings-clear"),
  status: document.getElementById("rankings-status"),
  version: document.getElementById("version"),
  footerVersion: document.getElementById("footer-version")
};

let currentLang = resolveLanguage("auto");
let rankings = {};
let searchQuery = "";
let sortMode = "rating";
let filterMode = "all";
let tagFilter = "";
let kindFilter = "all";
let editingKey = null;
let statusTimer = null;

void init();

async function init() {
  const items = await chrome.storage.local.get({
    rankings: {},
    language: DEFAULT_SETTINGS.language
  });
  currentLang = resolveLanguage(items.language);
  rankings = items.rankings || {};

  applyDomTranslations(document, currentLang);
  updatePopoutVisibility();
  bindEvents();
  render();

  const version = chrome.runtime.getManifest().version;
  els.version.textContent = `v${version}`;
  els.footerVersion.textContent = `v${version}`;
}

function updatePopoutVisibility() {
  els.openTab.hidden = window.innerWidth >= 560;
}

function bindEvents() {
  window.addEventListener("resize", updatePopoutVisibility);

  els.openTab.addEventListener("click", () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL("rankings/rankings.html") });
  });

  els.search.addEventListener("input", () => {
    searchQuery = els.search.value;
    render();
  });

  els.sort.addEventListener("change", () => {
    sortMode = els.sort.value;
    render();
  });

  els.filter.addEventListener("change", () => {
    filterMode = els.filter.value;
    render();
  });

  els.tagFilter.addEventListener("change", () => {
    tagFilter = els.tagFilter.value;
    render();
  });

  els.kindFilter.addEventListener("change", () => {
    kindFilter = els.kindFilter.value;
    render();
  });

  els.exportCsv.addEventListener("click", exportCsv);
  els.exportJson.addEventListener("click", exportJson);
  els.importJson.addEventListener("change", importJsonFile);
  els.clear.addEventListener("click", () => void clearAll());

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") {
      return;
    }
    if (changes.language) {
      currentLang = resolveLanguage(changes.language.newValue);
      applyDomTranslations(document, currentLang);
      render();
    }
    if (changes.rankings) {
      rankings = changes.rankings.newValue || {};
      render();
    }
  });
}

function syncTagDropdown() {
  const allTags = collectAllTags(rankings);
  if (tagFilter && !allTags.some((item) => item.tag === tagFilter)) {
    tagFilter = "";
  }

  els.tagFilter.textContent = "";
  const allOpt = document.createElement("option");
  allOpt.value = "";
  allOpt.textContent = t("rankings.tagFilterAll", {}, currentLang);
  els.tagFilter.append(allOpt);

  allTags.forEach(({ tag, count }) => {
    const opt = document.createElement("option");
    opt.value = tag;
    opt.textContent = `#${tag} (${count})`;
    els.tagFilter.append(opt);
  });

  els.tagFilter.value = tagFilter;
}

function getVisibleEntries() {
  const entries = sortRankingEntries(rankings, sortMode);
  const range =
    filterMode === "all"
      ? {}
      : { minRating: Number(filterMode), maxRating: Number(filterMode) };
  return filterRankingEntries(entries, {
    query: searchQuery,
    tag: tagFilter,
    kind: kindFilter,
    ...range
  });
}

function render() {
  syncTagDropdown();
  const entries = getVisibleEntries();
  const total = countRankings(rankings);

  if (!total) {
    els.summary.textContent = t("rankings.summaryEmpty", {}, currentLang);
  } else if (total === 1) {
    els.summary.textContent = t("rankings.summaryOne", { shown: entries.length }, currentLang);
  } else {
    els.summary.textContent = t(
      "rankings.summaryMany",
      { shown: entries.length, total },
      currentLang
    );
  }

  els.list.textContent = "";
  entries.forEach(([key, entry]) => els.list.append(buildRow(key, entry)));

  els.empty.hidden = entries.length > 0;
  els.empty.textContent = total
    ? t("rankings.emptyFiltered", {}, currentLang)
    : t("rankings.emptyInitial", {}, currentLang);
}

function buildRow(key, entry) {
  const item = document.createElement("li");
  item.className = "ranking-item";

  const topRow = document.createElement("div");
  topRow.className = "ranking-row-top";

  const stars = document.createElement("div");
  stars.className = "ranking-stars";
  for (let value = 1; value <= 5; value += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ranking-star";
    button.textContent = "★";
    const label =
      value === 1
        ? t("rankings.rateStarOne", {}, currentLang)
        : t("rankings.rateStarMany", { count: value }, currentLang);
    button.title = label;
    button.setAttribute("aria-label", label);
    button.classList.toggle("active", value <= normalizeRating(entry.rating));
    button.addEventListener("click", () => void saveEntry(key, entry, { rating: value }));
    stars.append(button);
  }

  const main = document.createElement("div");
  main.className = "ranking-main";

  const titleLine = document.createElement("div");
  titleLine.className = "ranking-title-line";

  const title = document.createElement("span");
  title.className = "ranking-title";
  const fallbackTitle = t("rankings.unknownTrack", {}, currentLang);
  title.textContent = entry.artist
    ? `${entry.artist} — ${entry.title || fallbackTitle}`
    : entry.title || fallbackTitle;
  title.title = title.textContent;
  titleLine.append(title);

  if (normalizeKind(entry.kind) === "sfx") {
    const kindBadge = document.createElement("span");
    kindBadge.className = "ranking-kind-badge";
    kindBadge.textContent = "SFX";
    titleLine.append(kindBadge);
  }

  const meta = document.createElement("span");
  meta.className = "ranking-meta";
  meta.textContent = [
    formatDurationLabel(entry.duration),
    entry.updatedAt
      ? t(
          "rankings.ratedOn",
          { date: new Date(entry.updatedAt).toLocaleDateString() },
          currentLang
        )
      : ""
  ]
    .filter(Boolean)
    .join(" · ");

  main.append(titleLine, meta);

  const tags = normalizeTags(entry.tags);
  if (tags.length) {
    const tagRow = document.createElement("div");
    tagRow.className = "ranking-tags";
    tags.forEach((tag) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ranking-tag-pill";
      chip.classList.toggle("active", tagFilter === tag);
      chip.textContent = `#${tag}`;
      chip.addEventListener("click", () => {
        tagFilter = tagFilter === tag ? "" : tag;
        render();
      });
      tagRow.append(chip);
    });
    main.append(tagRow);
  }

  const note = cleanNote(entry.note);
  if (note) {
    const noteEl = document.createElement("p");
    noteEl.className = "ranking-note";
    noteEl.textContent = note;
    main.append(noteEl);
  }

  const actions = document.createElement("div");
  actions.className = "ranking-actions";

  if (entry.url) {
    const link = document.createElement("a");
    link.className = "ranking-link";
    link.href = entry.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = t("rankings.openTrack", {}, currentLang);
    actions.append(link);
  }

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "ranking-edit";
  editBtn.textContent = t("rankings.edit", {}, currentLang);
  editBtn.addEventListener("click", () => {
    editingKey = editingKey === key ? null : key;
    render();
  });
  actions.append(editBtn);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "ranking-remove";
  remove.textContent = t("rankings.remove", {}, currentLang);
  remove.addEventListener("click", () => void saveEntry(key, entry, { rating: 0 }));
  actions.append(remove);

  topRow.append(stars, main, actions);
  item.append(topRow);

  if (editingKey === key) {
    item.append(buildInlineEditor(key, entry));
  }

  return item;
}

function buildInlineEditor(key, entry) {
  const form = document.createElement("form");
  form.className = "ranking-inline-editor";

  const tagsInput = document.createElement("input");
  tagsInput.type = "text";
  tagsInput.value = normalizeTags(entry.tags).join(", ");
  tagsInput.placeholder = t("hud.tagsPlaceholder", {}, currentLang);

  const noteInput = document.createElement("input");
  noteInput.type = "text";
  noteInput.maxLength = MAX_NOTE_LENGTH;
  noteInput.value = cleanNote(entry.note);
  noteInput.placeholder = t("hud.notePlaceholder", {}, currentLang);

  const btnGroup = document.createElement("div");
  btnGroup.className = "ranking-editor-buttons";

  const saveBtn = document.createElement("button");
  saveBtn.type = "submit";
  saveBtn.className = "secondary";
  saveBtn.textContent = t("rankings.save", {}, currentLang);

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "secondary";
  cancelBtn.textContent = t("rankings.cancel", {}, currentLang);
  cancelBtn.addEventListener("click", () => {
    editingKey = null;
    render();
  });

  btnGroup.append(saveBtn, cancelBtn);
  form.append(tagsInput, noteInput, btnGroup);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    editingKey = null;
    void saveEntry(key, entry, {
      rating: normalizeRating(entry.rating),
      tags: normalizeTags(tagsInput.value),
      note: cleanNote(noteInput.value)
    });
  });

  return form;
}

async function saveEntry(key, entry, { rating, tags, note }) {
  const value = normalizeRating(rating);
  const payload = {
    track: {
      title: entry.title,
      artist: entry.artist,
      duration: entry.duration,
      url: entry.url,
      kind: entry.kind
    },
    rating: value,
    kind: entry.kind
  };
  if (tags !== undefined) {
    payload.tags = tags;
  }
  if (note !== undefined) {
    payload.note = note;
  }

  const response = await sendMessage({
    type: "ARTLIST_SET_RATING",
    payload
  });

  if (!response?.ok) {
    setStatus(t("rankings.saveError", {}, currentLang), true);
    return;
  }

  const next = { ...rankings };
  if (value) {
    next[key] = response.entry || {
      ...entry,
      rating: value,
      tags: tags !== undefined ? normalizeTags(tags) : normalizeTags(entry.tags),
      note: note !== undefined ? cleanNote(note) : cleanNote(entry.note),
      updatedAt: Date.now()
    };
  } else {
    delete next[key];
  }
  rankings = next;
  render();
}

function exportCsv() {
  if (!countRankings(rankings)) {
    setStatus(t("rankings.noExport", {}, currentLang), true);
    return;
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  const csv = buildCsv(RANKING_CSV_COLUMNS, buildRankingCsvRows(rankings));
  downloadTextFile(`\ufeff${csv}`, `artlist-rankings-${dateStamp}.csv`, "text/csv");
  setStatus(t("rankings.exportedCsv", {}, currentLang));
}

function exportJson() {
  if (!countRankings(rankings)) {
    setStatus(t("rankings.noExport", {}, currentLang), true);
    return;
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  const payload = {
    app: BACKUP_APP_ID,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    extensionVersion: chrome.runtime.getManifest().version,
    exportedAt: new Date().toISOString(),
    rankings: sanitizeRankingsMap(rankings)
  };
  downloadTextFile(
    JSON.stringify(payload, null, 2),
    `artlist-rankings-${dateStamp}.json`,
    "application/json"
  );
  setStatus(t("rankings.exportedJson", {}, currentLang));
}

async function importJsonFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) {
    return;
  }

  try {
    const raw = JSON.parse(await file.text());
    const response = await sendMessage({
      type: "ARTLIST_IMPORT_BACKUP",
      payload: { raw, merge: true }
    });
    if (!response?.ok) {
      setStatus(response?.error || t("rankings.importError", {}, currentLang), true);
      return;
    }
    const items = await chrome.storage.local.get({ rankings: {} });
    rankings = items.rankings || {};
    render();
    setStatus(
      t("rankings.importedJson", { count: response.counts?.rankings || 0 }, currentLang)
    );
  } catch (_error) {
    setStatus(t("rankings.importError", {}, currentLang), true);
  }
}

async function clearAll() {
  const total = countRankings(rankings);
  if (!total) {
    setStatus(t("rankings.nothingToClear", {}, currentLang), true);
    return;
  }

  if (!window.confirm(t("rankings.confirmClear", { total }, currentLang))) {
    return;
  }

  const response = await sendMessage({ type: "ARTLIST_CLEAR_RATINGS" });
  if (!response?.ok) {
    setStatus(t("rankings.clearError", {}, currentLang), true);
    return;
  }

  rankings = {};
  editingKey = null;
  render();
  const removed = Number(response.removed) || total;
  setStatus(t("rankings.cleared", { count: removed }, currentLang));
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });
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

function setStatus(message, isError = false) {
  els.status.hidden = false;
  els.status.textContent = message;
  els.status.classList.toggle("error", isError);
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(
    () => {
      els.status.hidden = true;
    },
    isError ? 4200 : 2500
  );
}
