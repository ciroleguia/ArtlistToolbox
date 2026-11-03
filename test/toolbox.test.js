import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PREFERRED_TERMS,
  buildFingerprint,
  durationMismatch,
  scoreCandidate,
  scoreCandidates
} from "../src/lib/matcher.js";
import {
  buildCsv,
  escapeCsvValue,
  formatDurationLabel,
  sanitizeCsvCell
} from "../src/lib/csv.js";
import { createSerialQueue } from "../src/lib/storage-queue.js";

const TRACK = { title: "Midnight Drive", artist: "The Midnight", duration: 225 };

test("custom negative terms penalize matching candidates", () => {
  const candidate = {
    title: "Midnight Drive (Live at Coachella)",
    artist: "The Midnight",
    duration: 225
  };

  // "live" is already a built-in negative term; a custom one behaves the same.
  const custom = scoreCandidate(TRACK, candidate, 0, { negativeTerms: ["coachella"] });
  const none = scoreCandidate(TRACK, candidate, 0, { negativeTerms: [] });
  assert.ok(custom < none);
});

test("custom negative terms do not penalize the target itself", () => {
  // 0.7 = title 0.55 + duration 0.15 (no artist in this fixture).
  const track = { title: "Coachella Nights", artist: "", duration: 200 };
  const candidate = { title: "Coachella Nights", artist: "", duration: 200 };
  const score = scoreCandidate(track, candidate, 0, { negativeTerms: ["coachella"] });
  assert.equal(score, 0.7);
});

test("preferred terms add a capped bonus", () => {
  const plain = scoreCandidate(TRACK, {
    title: "Midnight Drive",
    artist: "The Midnight",
    duration: 225
  });
  const preferred = scoreCandidate(TRACK, {
    title: "Midnight Drive (Official Audio)",
    artist: "The Midnight",
    duration: 225
  });

  assert.equal(plain, 1);
  assert.equal(preferred, 1); // clamped to 1, never above
  assert.ok(DEFAULT_PREFERRED_TERMS.includes("official audio"));
});

test("preferred terms can lift a penalized candidate", () => {
  const candidate = {
    title: "Midnight Drive (Live at Coachella)",
    artist: "The Midnight",
    duration: 225
  };
  const base = scoreCandidate(TRACK, candidate); // 1 - 0.12 "live" penalty
  const boosted = scoreCandidate(TRACK, candidate, 0, { preferredTerms: ["coachella"] });
  assert.equal(base, 0.88);
  assert.ok(boosted > base);
});

test("scoreCandidates forwards custom terms", () => {
  const ranked = scoreCandidates(
    TRACK,
    [
      { title: "Midnight Drive (Karaoke)", artist: "The Midnight", duration: 225 },
      { title: "Midnight Drive", artist: "The Midnight", duration: 225 }
    ],
    { negativeTerms: ["karaoke"] }
  );
  assert.equal(ranked[0].title, "Midnight Drive");
});

test("durationMismatch only vetoes when both durations are known", () => {
  const candidate = { videoId: "x".repeat(11), duration: 260 };
  assert.equal(durationMismatch(TRACK, candidate, 15), true);
  assert.equal(durationMismatch(TRACK, { ...candidate, duration: 230 }, 15), false);
  assert.equal(durationMismatch(TRACK, { ...candidate, duration: null }, 15), false);
  assert.equal(durationMismatch({ ...TRACK, duration: null }, candidate, 15), false);
});

test("buildFingerprint is stable and ignores case and accents", () => {
  const a = buildFingerprint({ title: "Café Solaire", artist: "Måns" });
  const b = buildFingerprint({ title: "cafe  solaire", artist: "mans" });
  assert.equal(a, b);
  assert.ok(a.includes("::"));
  assert.equal(buildFingerprint({}), "");
});

test("sanitizeCsvCell and escapeCsvValue guard against spreadsheet formula injection", () => {
  assert.equal(sanitizeCsvCell("=CMD|' /C calc'!A0"), "'=CMD|' /C calc'!A0");
  assert.equal(sanitizeCsvCell("@SUM(1+1)"), "'@SUM(1+1)");
  assert.equal(sanitizeCsvCell("+1+1"), "'+1+1");
  assert.equal(sanitizeCsvCell("-A1+B1"), "'-A1+B1");
  // Signed plain numbers and normal text stay untouched.
  assert.equal(sanitizeCsvCell("-12.5"), "-12.5");
  assert.equal(sanitizeCsvCell("+42"), "+42");
  assert.equal(escapeCsvValue("=HYPERLINK(\"https://evil.example\",\"click\")"), "\"'=HYPERLINK(\"\"https://evil.example\"\",\"\"click\"\")\"");
});

test("escapeCsvValue quotes when needed", () => {
  assert.equal(escapeCsvValue("plain"), "plain");
  assert.equal(escapeCsvValue('He said "hi", then left'), '"He said ""hi"", then left"');
  assert.equal(escapeCsvValue("line\nbreak"), '"line\nbreak"');
  assert.equal(escapeCsvValue(null), "");
});

test("buildCsv renders header and rows with CRLF", () => {
  const csv = buildCsv(
    ["Title", "Artist"],
    [
      ["Song, One", "A"],
      ["Song Two", 'B "The" C']
    ]
  );

  assert.equal(
    csv,
    ["Title,Artist", '"Song, One",A', 'Song Two,"B ""The"" C"'].join("\r\n")
  );
});

test("formatDurationLabel formats minutes and seconds", () => {
  assert.equal(formatDurationLabel(225), "3:45");
  assert.equal(formatDurationLabel(59), "0:59");
  assert.equal(formatDurationLabel(null), "");
  assert.equal(formatDurationLabel(-4), "");
});

test("createSerialQueue serializes async tasks and recovers after errors", async () => {
  const queue = createSerialQueue();
  const order = [];

  const first = queue.enqueue(async () => {
    await new Promise((resolve) => setTimeout(resolve, 15));
    order.push(1);
    return "one";
  });

  const failing = queue.enqueue(async () => {
    order.push(2);
    throw new Error("boom");
  });

  const third = queue.enqueue(async () => {
    order.push(3);
    return "three";
  });

  assert.equal(await first, "one");
  await assert.rejects(failing, /boom/);
  assert.equal(await third, "three");
  assert.deepEqual(order, [1, 2, 3]);
});
