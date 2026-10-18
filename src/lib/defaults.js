// Central defaults for chrome.storage.local.
// Imported by the background service worker, popup and options page (all ES
// modules). The content script keeps an inline mirror of the keys it uses.

import { DEFAULT_PREFERRED_TERMS, NEGATIVE_TERMS } from "./matcher.js";

export const DEFAULT_SETTINGS = {
  // Download flow
  enabled: false, // opt-in: the YouTube MP3 flow ships disabled
  flowMode: null,
  searchOnly: false,
  openInBackground: false,
  minScore: 0.42,
  durationVeto: true,
  durationTolerance: 15,
  negativeTerms: null, // null -> matcher's NEGATIVE_TERMS
  preferredTerms: null, // null -> matcher's DEFAULT_PREFERRED_TERMS

  // Match memory
  memoryEnabled: true,
  matchMemory: {},

  // History and stats
  recent: [],
  processed: {},
  stats: { total: 0, daily: {} },

  // Page tweaks / library QoL
  hideHeroBanner: false,
  compactRows: false,
  keyboardShortcuts: true,
  processedDim: true,

  // Popup UI
  popupExportButton: false // CSV export button in the popup (advanced opt-in)
};

export const RECENT_LIMIT = 10;
export const MEMORY_LIMIT = 500;
export const PROCESSED_LIMIT = 1000;
export const STATS_DAYS = 14;

// Settings that the options page can export/import as a config file.
export const CONFIG_KEYS = [
  "enabled",
  "flowMode",
  "openInBackground",
  "minScore",
  "durationVeto",
  "durationTolerance",
  "negativeTerms",
  "preferredTerms",
  "memoryEnabled",
  "hideHeroBanner",
  "compactRows",
  "keyboardShortcuts",
  "processedDim",
  "popupExportButton"
];

export { DEFAULT_PREFERRED_TERMS, NEGATIVE_TERMS };
