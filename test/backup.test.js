import test from "node:test";
import assert from "node:assert/strict";

import {
  BACKUP_APP_ID,
  BACKUP_SCHEMA_VERSION,
  buildBackupPayload,
  parseImportPayload,
  sanitizeSettingsPatch
} from "../src/lib/backup.js";
import { DEFAULT_CONVERTER_TEMPLATE, DEFAULT_SETTINGS } from "../src/lib/defaults.js";

test("buildBackupPayload exports full v1 bundle or settings-only config", () => {
  const storage = {
    ...DEFAULT_SETTINGS,
    enabled: true,
    language: "es",
    rankings: {
      "midnight drive::the midnight": {
        title: "Midnight Drive",
        artist: "The Midnight",
        kind: "music",
        rating: 5,
        tags: ["intro"],
        note: "Opener",
        url: "https://artlist.io/song/1",
        duration: 225,
        createdAt: 1000,
        updatedAt: 2000
      },
      invalid: { rating: 0 }
    },
    matchMemory: {
      "midnight drive::the midnight": {
        videoId: "dQw4w9WgXcQ",
        title: "Midnight Drive",
        artist: "The Midnight",
        at: 3000,
        remembered: true
      },
      badVideo: { videoId: "nope", title: "Bad" }
    }
  };

  const full = buildBackupPayload(storage, "0.8.0", { includeData: true, now: 5000 });
  assert.equal(full.app, BACKUP_APP_ID);
  assert.equal(full.schemaVersion, BACKUP_SCHEMA_VERSION);
  assert.equal(full.extensionVersion, "0.8.0");
  assert.equal(full.settings.enabled, true);
  assert.equal(full.settings.language, "es");
  assert.equal(Object.keys(full.rankings).length, 1);
  assert.equal(Object.keys(full.matchMemory).length, 1);

  const settingsOnly = buildBackupPayload(storage, "0.8.0", { includeData: false });
  assert.equal(settingsOnly.app, undefined);
  assert.equal(settingsOnly.enabled, true);
  assert.equal(settingsOnly.language, "es");
});

test("sanitizeSettingsPatch validates converterUrlTemplate, language and bounds", () => {
  const clean = sanitizeSettingsPatch({
    enabled: true,
    language: "es",
    minScore: 0.55,
    converterUrlTemplate: "https://cobalt.example/?u={youtubeUrl}",
    unknownKey: "ignored"
  });

  assert.deepEqual(clean, {
    enabled: true,
    language: "es",
    minScore: 0.55,
    converterUrlTemplate: "https://cobalt.example/?u={youtubeUrl}"
  });

  // Unsafe URL template is rejected; blank string resets to default template.
  assert.deepEqual(
    sanitizeSettingsPatch({ converterUrlTemplate: "javascript:alert({videoId})" }),
    {}
  );
  assert.deepEqual(sanitizeSettingsPatch({ converterUrlTemplate: "   " }), {
    converterUrlTemplate: DEFAULT_CONVERTER_TEMPLATE
  });
});

test("parseImportPayload accepts legacy v0.7.0 flat settings JSON", () => {
  const parsed = parseImportPayload({
    enabled: true,
    flowMode: "ask",
    minScore: 0.5,
    compactRows: true
  });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.kind, "settings");
  assert.equal(parsed.counts.settings, 4);
  assert.equal(parsed.patch.flowMode, "ask");
  assert.equal(parsed.patch.compactRows, true);
});

test("parseImportPayload merges or replaces rankings, memory, processed, recent and stats", () => {
  const current = {
    rankings: {
      "song a::artist a": {
        title: "Song A",
        artist: "Artist A",
        rating: 3,
        tags: ["old"],
        note: "Older",
        updatedAt: 1000,
        createdAt: 1000
      },
      "song keep::artist k": {
        title: "Song Keep",
        artist: "Artist K",
        rating: 5,
        tags: ["keep"],
        note: "",
        updatedAt: 2000,
        createdAt: 2000
      }
    },
    recent: [{ videoId: "11111111111", title: "Old Recent", artist: "A", at: 1000 }],
    stats: { total: 4, daily: { "2026-11-01": 2 } }
  };

  const incoming = {
    app: BACKUP_APP_ID,
    schemaVersion: 1,
    settings: { language: "es" },
    rankings: {
      "song a::artist a": {
        title: "Song A",
        artist: "Artist A",
        rating: 5,
        tags: ["updated"],
        note: "Newer",
        updatedAt: 5000,
        createdAt: 1000
      }
    },
    recent: [{ videoId: "22222222222", title: "New Recent", artist: "B", at: 5000 }],
    stats: { total: 7, daily: { "2026-11-01": 1, "2026-11-02": 3 } }
  };

  const merged = parseImportPayload(incoming, current, { merge: true });
  assert.equal(merged.ok, true);
  assert.equal(merged.kind, "full");
  assert.equal(merged.patch.language, "es");
  assert.equal(Object.keys(merged.patch.rankings).length, 2);
  assert.equal(merged.patch.rankings["song a::artist a"].rating, 5);
  assert.deepEqual(merged.patch.rankings["song a::artist a"].tags, ["updated"]);
  assert.equal(merged.patch.rankings["song keep::artist k"].rating, 5);
  assert.equal(merged.patch.recent.length, 2);
  assert.equal(merged.patch.stats.total, 7);
  assert.equal(merged.patch.stats.daily["2026-11-01"], 2);
  assert.equal(merged.patch.stats.daily["2026-11-02"], 3);

  const replaced = parseImportPayload(incoming, current, { merge: false });
  assert.equal(replaced.ok, true);
  assert.equal(Object.keys(replaced.patch.rankings).length, 1);
  assert.equal(replaced.patch.recent.length, 1);
  assert.equal(replaced.patch.stats.daily["2026-11-01"], 1);
});

test("parseImportPayload rejects invalid payloads", () => {
  assert.equal(parseImportPayload(null).ok, false);
  assert.equal(parseImportPayload([]).ok, false);
  assert.equal(parseImportPayload({ foo: "bar" }).ok, false);
});
