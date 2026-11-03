import test from "node:test";
import assert from "node:assert/strict";

import {
  FOCUS_MIN_RATING,
  MAX_NOTE_LENGTH,
  MAX_TAGS_PER_TRACK,
  RANKING_CSV_COLUMNS,
  RATING_MAX,
  buildRankingCsvRows,
  buildRankingEntry,
  cleanNote,
  collectAllTags,
  countRankings,
  filterRankingEntries,
  formatRowBadgeText,
  normalizeKind,
  normalizeRating,
  normalizeTags,
  ratingToStars,
  sortRankingEntries
} from "../src/lib/rankings.js";

test("normalizeRating accepts 1..5 and clamps everything else to 0", () => {
  assert.equal(RATING_MAX, 5);
  assert.equal(FOCUS_MIN_RATING, 4);
  assert.equal(normalizeRating(5), 5);
  assert.equal(normalizeRating("4"), 4);
  assert.equal(normalizeRating(2.6), 3);
  assert.equal(normalizeRating(0), 0);
  assert.equal(normalizeRating(6), 0);
  assert.equal(normalizeRating(-2), 0);
  assert.equal(normalizeRating(null), 0);
  assert.equal(normalizeRating("nope"), 0);
});

test("normalizeKind normalizes sfx vs music", () => {
  assert.equal(normalizeKind("SFX"), "sfx");
  assert.equal(normalizeKind("sfx"), "sfx");
  assert.equal(normalizeKind("music"), "music");
  assert.equal(normalizeKind(""), "music");
});

test("normalizeTags deduplicates, lowercases, strips leading # and enforces limits", () => {
  assert.deepEqual(normalizeTags(" #Intro, Reel ; INTRO\nclient-acme "), [
    "intro",
    "reel",
    "client-acme"
  ]);
  const many = Array.from({ length: 20 }, (_, idx) => `tag-${idx}`);
  assert.equal(normalizeTags(many).length, MAX_TAGS_PER_TRACK);
});

test("cleanNote collapses whitespace and enforces max length", () => {
  assert.equal(cleanNote("  drop   at 1:14  "), "drop at 1:14");
  assert.equal(cleanNote("x".repeat(400)).length, MAX_NOTE_LENGTH);
});

test("ratingToStars and formatRowBadgeText render star and tag summaries", () => {
  assert.equal(ratingToStars(5), "★★★★★");
  assert.equal(ratingToStars(3), "★★★☆☆");
  assert.equal(ratingToStars(0), "☆☆☆☆☆");
  assert.equal(ratingToStars("2"), "★★☆☆☆");
  assert.equal(formatRowBadgeText(5, []), "★★★★★");
  assert.equal(formatRowBadgeText(5, ["intro", "reel"]), "★★★★★ · intro, reel");
  assert.equal(formatRowBadgeText(4, ["intro", "reel", "client"]), "★★★★☆ · intro, reel +1");
});

test("buildRankingEntry stores normalized track metadata including kind, tags and note", () => {
  const entry = buildRankingEntry({
    track: {
      title: "  Midnight   Drive ",
      artist: "The Midnight",
      duration: 225.4,
      url: "https://artlist.io/song/1"
    },
    rating: 4,
    tags: "Intro, #Synth",
    note: "  Great   opener ",
    kind: "music",
    now: 2000
  });

  assert.deepEqual(entry, {
    title: "Midnight Drive",
    artist: "The Midnight",
    kind: "music",
    rating: 4,
    tags: ["intro", "synth"],
    note: "Great opener",
    url: "https://artlist.io/song/1",
    duration: 225,
    createdAt: 2000,
    updatedAt: 2000
  });
});

test("buildRankingEntry returns null for a cleared rating", () => {
  assert.equal(buildRankingEntry({ track: { title: "Song" }, rating: 0 }), null);
});

test("buildRankingEntry preserves createdAt, tags, note and fills missing fields from previous", () => {
  const entry = buildRankingEntry({
    track: { title: "Whoosh Hit", artist: "" },
    rating: 5,
    previous: {
      title: "Old title",
      artist: "Sound Designer",
      kind: "sfx",
      tags: ["transition", "trailer"],
      note: "Use on title card",
      url: "https://artlist.io/sfx/track/2",
      duration: 4,
      createdAt: 1000,
      updatedAt: 1500
    },
    now: 2000
  });

  assert.equal(entry.title, "Whoosh Hit");
  assert.equal(entry.artist, "Sound Designer");
  assert.equal(entry.kind, "sfx");
  assert.deepEqual(entry.tags, ["transition", "trailer"]);
  assert.equal(entry.note, "Use on title card");
  assert.equal(entry.url, "https://artlist.io/sfx/track/2");
  assert.equal(entry.duration, 4);
  assert.equal(entry.createdAt, 1000);
  assert.equal(entry.updatedAt, 2000);
});

test("countRankings and collectAllTags aggregate only valid rated entries", () => {
  const rankings = {
    a: { rating: 5, tags: ["intro", "reel"] },
    b: { rating: "3", tags: ["intro"] },
    c: { rating: 0, tags: ["ignored"] },
    d: {}
  };
  assert.equal(countRankings(rankings), 2);
  assert.deepEqual(collectAllTags(rankings), [
    { tag: "intro", count: 2 },
    { tag: "reel", count: 1 }
  ]);
});

test("sortRankingEntries sorts by rating, recency and title", () => {
  const rankings = {
    low: { title: "Alpha", artist: "A", rating: 2, updatedAt: 300 },
    highOld: { title: "Beta", artist: "B", rating: 5, updatedAt: 100 },
    highNew: { title: "Gamma", artist: "C", rating: 5, updatedAt: 400 }
  };

  assert.deepEqual(
    sortRankingEntries(rankings, "rating").map(([key]) => key),
    ["highNew", "highOld", "low"]
  );
  assert.deepEqual(
    sortRankingEntries(rankings, "recent").map(([key]) => key),
    ["highNew", "low", "highOld"]
  );
  assert.deepEqual(
    sortRankingEntries(rankings, "title").map(([key]) => key),
    ["low", "highOld", "highNew"]
  );
});

test("filterRankingEntries matches text (including tags & note), rating range, tag and kind", () => {
  const entries = sortRankingEntries({
    a: {
      title: "Midnight Drive",
      artist: "The Midnight",
      kind: "music",
      rating: 5,
      tags: ["intro", "synth"],
      note: "Drop at 1:14",
      updatedAt: 1
    },
    b: {
      title: "Café Solaire",
      artist: "Måns",
      kind: "music",
      rating: 4,
      tags: ["vlog"],
      note: "",
      updatedAt: 2
    },
    c: {
      title: "Cinematic Riser",
      artist: "Boom Library",
      kind: "sfx",
      rating: 5,
      tags: ["intro", "hit"],
      note: "Transition cue",
      updatedAt: 3
    }
  });

  assert.deepEqual(
    filterRankingEntries(entries, { query: "midnight" }).map(([key]) => key),
    ["a"]
  );
  assert.deepEqual(
    filterRankingEntries(entries, { query: "1:14" }).map(([key]) => key),
    ["a"]
  );
  assert.deepEqual(
    filterRankingEntries(entries, { query: "cafe" }).map(([key]) => key),
    ["b"]
  );
  assert.deepEqual(
    filterRankingEntries(entries, { minRating: 4, maxRating: 4 }).map(([key]) => key),
    ["b"]
  );
  assert.deepEqual(
    filterRankingEntries(entries, { tag: "intro", kind: "sfx" }).map(([key]) => key),
    ["c"]
  );
});

test("buildRankingCsvRows emits the documented 9 columns", () => {
  assert.deepEqual(RANKING_CSV_COLUMNS, [
    "Title",
    "Artist",
    "Kind",
    "Rating",
    "Tags",
    "Note",
    "Duration",
    "Artlist URL",
    "Updated"
  ]);

  const rows = buildRankingCsvRows({
    a: {
      title: "Song",
      artist: "Artist",
      kind: "music",
      rating: 4,
      tags: ["intro", "reel"],
      note: "Warm synth",
      duration: 225,
      url: "https://artlist.io/song/1",
      updatedAt: 2000
    }
  });

  assert.deepEqual(rows, [
    [
      "Song",
      "Artist",
      "music",
      "4",
      "intro, reel",
      "Warm synth",
      "3:45",
      "https://artlist.io/song/1",
      "1970-01-01T00:00:02.000Z"
    ]
  ]);
});
