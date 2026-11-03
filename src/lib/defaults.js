// Central defaults for chrome.storage.local.
// Imported by the background service worker, content script, popup, rankings
// and options page (all ES modules).

import { DEFAULT_PREFERRED_TERMS, NEGATIVE_TERMS } from "./matcher.js";
import { DEFAULT_CONVERTER_TEMPLATE } from "./youtube.js";

export const DEFAULT_SETTINGS = {
  // Localization
  language: "auto", // "auto" | "en" | "es"

  // Download flow
  enabled: false, // opt-in: the YouTube MP3 flow ships disabled
  flowMode: null,
  searchOnly: false,
  openInBackground: false,
  minScore: 0.42,
  durationVeto: true,
  durationTolerance: 15,
  converterUrlTemplate: DEFAULT_CONVERTER_TEMPLATE,
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

  // Track rankings (page tool, independent of the download flow)
  rankingsEnabled: true,
  rankings: {},

  // Popup UI
  popupExportButton: false // CSV export button in the popup (advanced opt-in)
};

export const RECENT_LIMIT = 10;
export const MEMORY_LIMIT = 500;
export const PROCESSED_LIMIT = 1000;
export const STATS_DAYS = 14;

// Settings that the options page can export/import as a config file.
export const CONFIG_KEYS = [
  "language",
  "enabled",
  "flowMode",
  "openInBackground",
  "minScore",
  "durationVeto",
  "durationTolerance",
  "converterUrlTemplate",
  "negativeTerms",
  "preferredTerms",
  "memoryEnabled",
  "hideHeroBanner",
  "compactRows",
  "keyboardShortcuts",
  "processedDim",
  "rankingsEnabled",
  "popupExportButton"
];

export { DEFAULT_CONVERTER_TEMPLATE, DEFAULT_PREFERRED_TERMS, NEGATIVE_TERMS };
