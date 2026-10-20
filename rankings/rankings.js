import { buildCsv, formatDurationLabel } from "../src/lib/csv.js";
import {
  RANKING_CSV_COLUMNS,
  buildRankingCsvRows,
  countRankings,
  filterRankingEntries,
  normalizeRating,
  sortRankingEntries
} from "../src/lib/rankings.js";

const els = {
  search: document.getElementById("rankings-search"),
  sort: document.getElementById("rankings-sort"),
  filter: document.getElementById("rankings-filter"),
  summary: document.getElementById("rankings-summary"),
  list: document.getElementById("rankings-list"),
  empty: document.getElementById("rankings-empty"),
  exportCsv: document.getElementById("rankings-export"),
  clear: document.getElementById("rankings-clear"),
  status: document.getElementById("rankings-status"),
  version: document.getElementById("version"),
  footerVersion: document.getElementById("footer-version")
};

let rankings = {};
let searchQuery = "";
let sortMode = "rating";
let filterMode = "all";
let statusTimer = null;

init();

async function init() {
  const items = await chrome.storage.local.get({ rankings: {} });
  rankings = items.rankings || {};
  bindEvents();
  render();

  const version = chrome.runtime.getManifest().version;
  els.version.textContent = `v${version}`;
  els.footerVersion.textContent = `v${version}`;
}

function bindEvents() {
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

  els.exportCsv.addEventListener("click", exportCsv);
  els.clear.addEventListener("click", clearAll);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.rankings) {
      rankings = changes.rankings.newValue || {};
      render();
    }
  });
}

function getVisibleEntries() {
  const entries = sortRankingEntries(rankings, sortMode);
  const range =
    filterMode === "all"
      ? {}
      : { minRating: Number(filterMode), maxRating: Number(filterMode) };
  return filterRankingEntries(entries, { query: searchQuery, ...range });
}

function render() {
  const entries = getVisibleEntries();
  const total = countRankings(rankings);

  els.summary.textContent = total
    ? `${entries.length} of ${total} ranked track${total === 1 ? "" : "s"} shown.`
    : "No ranked tracks yet.";

  els.list.textContent = "";
  entries.forEach(([key, entry]) => els.list.append(buildRow(key, entry)));

  els.empty.hidden = entries.length > 0;
  els.empty.textContent = total
    ? "No ranked tracks match this search or filter."
    : "No ranked tracks yet. Hover a track on Artlist and press 1–5.";
}

function buildRow(key, entry) {
  const item = document.createElement("li");
  item.className = "ranking-item";

  const stars = document.createElement("div");
  stars.className = "ranking-stars";
  for (let value = 1; value <= 5; value += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ranking-star";
    button.textContent = "★";
    button.title = `Rate ${value}`;
    button.setAttribute("aria-label", `Rate ${value} star${value === 1 ? "" : "s"}`);
    button.classList.toggle("active", value <= normalizeRating(entry.rating));
    button.addEventListener("click", () => setRating(key, entry, value));
    stars.append(button);
  }

  const main = document.createElement("div");
  main.className = "ranking-main";

  const title = document.createElement("span");
  title.className = "ranking-title";
  title.textContent = entry.artist ? `${entry.artist} — ${entry.title}` : entry.title || "Unknown track";
  title.title = title.textContent;

  const meta = document.createElement("span");
  meta.className = "ranking-meta";
  meta.textContent = [
    formatDurationLabel(entry.duration),
    entry.updatedAt ? `rated ${new Date(entry.updatedAt).toLocaleDateString()}` : ""
  ]
    .filter(Boolean)
    .join(" · ");

  main.append(title, meta);

  const actions = document.createElement("div");
  actions.className = "ranking-actions";

  if (entry.url) {
    const link = document.createElement("a");
    link.className = "ranking-link";
    link.href = entry.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Open";
    actions.append(link);
  }

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "ranking-remove";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => setRating(key, entry, 0));
  actions.append(remove);

  item.append(stars, main, actions);
  return item;
}

async function setRating(key, entry, rating) {
  const value = normalizeRating(rating);
  const response = await sendMessage({
    type: "ARTLIST_SET_RATING",
    payload: {
      track: {
        title: entry.title,
        artist: entry.artist,
        duration: entry.duration,
        url: entry.url
      },
      rating: value
    }
  });

  if (!response?.ok) {
    setStatus("Could not save that rating.", true);
    return;
  }

  const next = { ...rankings };
  if (value) {
    next[key] = { ...entry, rating: value, updatedAt: Date.now() };
  } else {
    delete next[key];
  }
  rankings = next;
  render();
}

function exportCsv() {
  if (!countRankings(rankings)) {
    setStatus("No rankings to export.", true);
    return;
  }

  const csv = buildCsv(RANKING_CSV_COLUMNS, buildRankingCsvRows(rankings));
  downloadTextFile(`\ufeff${csv}`, "artlist-rankings.csv", "text/csv");
  setStatus("Rankings exported.");
}

async function clearAll() {
  const total = countRankings(rankings);
  if (!total) {
    setStatus("There are no rankings to clear.", true);
    return;
  }

  if (
    !window.confirm(
      `Clear all ${total} ranked track${total === 1 ? "" : "s"}? This cannot be undone.`
    )
  ) {
    return;
  }

  const response = await sendMessage({ type: "ARTLIST_CLEAR_RATINGS" });
  if (!response?.ok) {
    setStatus("Could not clear rankings.", true);
    return;
  }

  rankings = {};
  render();
  const removed = Number(response.removed) || total;
  setStatus(`Cleared ${removed} ranking${removed === 1 ? "" : "s"}.`);
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
  statusTimer = window.setTimeout(() => {
    els.status.hidden = true;
  }, isError ? 4200 : 2500);
}
