import test from "node:test";
import assert from "node:assert/strict";

import {
  FOCUS_MIN_RATING,
  RANKING_CSV_COLUMNS,
  RATING_MAX,
  buildRankingCsvRows,
  buildRankingEntry,
  countRankings,
  filterRankingEntries,
  normalizeRating,
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

test("ratingToStars renders filled and empty stars", () => {
  assert.equal(ratingToStars(5), "★★★★★");
  assert.equal(ratingToStars(3), "★★★☆☆");
  assert.equal(ratingToStars(0), "☆☆☆☆☆");
  assert.equal(ratingToStars("2"), "★★☆☆☆");
});

test("buildRankingEntry stores normalized track metadata", () => {
  const entry = buildRankingEntry({
    track: {
      title: "  Midnight   Drive ",
      artist: "The Midnight",
      duration: 225.4,
      url: "https://artlist.io/song/1"
    },
    rating: 4,
    now: 2000
  });

  assert.deepEqual(entry, {
    title: "Midnight Drive",
    artist: "The Midnight",
    rating: 4,
    url: "https://artlist.io/song/1",
    duration: 225,
    createdAt: 2000,
    updatedAt: 2000
  });
});

test("buildRankingEntry returns null for a cleared rating", () => {
  assert.equal(buildRankingEntry({ track: { title: "Song" }, rating: 0 }), null);
});

test("buildRankingEntry preserves createdAt and fills missing fields from previous", () => {
  const entry = buildRankingEntry({
    track: { title: "Song", artist: "" },
    rating: 5,
    previous: {
      title: "Old title",
      artist: "Artist",
      url: "https://artlist.io/song/2",
      duration: 180,
      createdAt: 1000,
      updatedAt: 1500
    },
    now: 2000
  });

  assert.equal(entry.title, "Song");
  assert.equal(entry.artist, "Artist");
  assert.equal(entry.url, "https://artlist.io/song/2");
  assert.equal(entry.duration, 180);
  assert.equal(entry.createdAt, 1000);
  assert.equal(entry.updatedAt, 2000);
});

test("countRankings counts only valid rated entries", () => {
  assert.equal(
    countRankings({
      a: { rating: 5 },
      b: { rating: "3" },
      c: { rating: 0 },
      d: {}
    }),
    2
  );
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

test("filterRankingEntries matches text and an exact rating range", () => {
  const entries = sortRankingEntries({
    a: { title: "Midnight Drive", artist: "The Midnight", rating: 5, updatedAt: 1 },
    b: { title: "Café Solaire", artist: "Måns", rating: 4, updatedAt: 2 },
    c: { title: "Other", artist: "Someone", rating: 2, updatedAt: 3 }
  });

  assert.deepEqual(
    filterRankingEntries(entries, { query: "midnight" }).map(([key]) => key),
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
});

test("buildRankingCsvRows emits the documented columns", () => {
  assert.deepEqual(RANKING_CSV_COLUMNS, [
    "Title",
    "Artist",
    "Rating",
    "Duration",
    "Artlist URL",
    "Updated"
  ]);

  const rows = buildRankingCsvRows({
    a: {
      title: "Song",
      artist: "Artist",
      rating: 4,
      duration: 225,
      url: "https://artlist.io/song/1",
      updatedAt: 2000
    }
  });

  assert.deepEqual(rows, [
    [
      "Song",
      "Artist",
      "4",
      "3:45",
      "https://artlist.io/song/1",
      "1970-01-01T00:00:02.000Z"
    ]
  ]);
});
