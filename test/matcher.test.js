import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_MIN_SCORE,
  buildSearchQuery,
  cleanText,
  normalizeForMatch,
  normalizeTrack,
  pickBestMatch,
  scoreCandidate,
  scoreCandidates,
  similarity
} from "../src/lib/matcher.js";

const TRACK = { title: "Midnight Drive", artist: "The Midnight", duration: 225 };

test("cleanText collapses whitespace and normalizes typographic quotes", () => {
  assert.equal(cleanText("  Hello   “world”  "), "Hello \"world\"");
  assert.equal(cleanText(null), "");
});

test("normalizeTrack trims text and clamps the duration", () => {
  assert.deepEqual(normalizeTrack({ title: "  A  ", duration: "225" }), {
    title: "A",
    artist: "",
    duration: 225
  });
  assert.equal(normalizeTrack({ title: "A", duration: "abc" }).duration, null);
  assert.equal(normalizeTrack({ title: "A", duration: -5 }).duration, null);
});

test("buildSearchQuery joins title and artist", () => {
  assert.equal(buildSearchQuery(TRACK), "Midnight Drive The Midnight");
  assert.equal(buildSearchQuery({ title: "Only Title" }), "Only Title");
});

test("normalizeForMatch strips accents, brackets and marketing words", () => {
  assert.equal(normalizeForMatch("Café (Official Video)"), "cafe");
  assert.equal(normalizeForMatch("Song [Remastered 2011]"), "song");
  assert.equal(normalizeForMatch("Track feat. Someone"), "track someone");
});

test("similarity scores identical strings as 1", () => {
  assert.equal(similarity("midnight drive", "midnight drive"), 1);
  assert.ok(similarity("midnight drive", "midnight driv") > 0.9);
  assert.equal(similarity("", "anything"), 0);
});

test("a perfect candidate with matching duration scores 1", () => {
  const score = scoreCandidate(TRACK, {
    title: "Midnight Drive",
    artist: "The Midnight",
    duration: 225
  });
  assert.equal(score, 1);
});

test("duration mismatch only costs the duration weight", () => {
  const score = scoreCandidate(TRACK, {
    title: "Midnight Drive",
    artist: "The Midnight",
    duration: 265
  });
  assert.equal(score, 0.85);
});

test("missing durations fall back to the title/artist weights", () => {
  const score = scoreCandidate(
    { ...TRACK, duration: null },
    { title: "Midnight Drive", artist: "The Midnight", duration: 225 }
  );
  assert.equal(score, 1);
});

test("karaoke/cover versions are penalized unless the target asks for them", () => {
  const karaoke = scoreCandidate(TRACK, {
    title: "Midnight Drive (Karaoke Version)",
    artist: "The Midnight",
    duration: 225
  });
  assert.equal(karaoke, 0.88);

  const wanted = scoreCandidate(
    { ...TRACK, title: "Midnight Drive (Karaoke Version)" },
    { title: "Midnight Drive (Karaoke Version)", artist: "The Midnight", duration: 225 }
  );
  assert.equal(wanted, 1);
});

test("negative terms match whole words only", () => {
  // 0.7 = title 0.55 + duration 0.15; no "live" penalty from "Olive".
  const score = scoreCandidate(
    { title: "Olive Deliver", artist: "", duration: 200 },
    { title: "Olive Deliver", artist: "", duration: 200 }
  );
  assert.equal(score, 0.7);
});

test("lower ranked duplicates score slightly worse", () => {
  const first = scoreCandidate(TRACK, { title: "Midnight Drive", artist: "The Midnight" }, 0);
  const second = scoreCandidate(TRACK, { title: "Midnight Drive", artist: "The Midnight" }, 1);
  assert.ok(second < first);
  assert.ok(first - second <= 0.015 + 1e-9);
});

test("scoreCandidates sorts by descending score", () => {
  const ranked = scoreCandidates(TRACK, [
    { title: "Some Other Song", artist: "Nobody", duration: 60 },
    { title: "Midnight Drive", artist: "The Midnight", duration: 225 }
  ]);

  assert.equal(ranked[0].title, "Midnight Drive");
  assert.ok(ranked[0].score > ranked[1].score);
});

test("pickBestMatch respects the confidence threshold", () => {
  const candidates = [{ title: "Totally Different", artist: "Someone", duration: 100 }];
  assert.equal(pickBestMatch(TRACK, candidates), null);
  assert.equal(pickBestMatch(TRACK, candidates, 0.05).title, "Totally Different");
});

test("pickBestMatch returns null without candidates", () => {
  assert.equal(pickBestMatch(TRACK, []), null);
  assert.ok(DEFAULT_MIN_SCORE > 0 && DEFAULT_MIN_SCORE < 1);
});
