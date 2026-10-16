import test from "node:test";
import assert from "node:assert/strict";

import {
  buildY2mateUrl,
  buildYoutubeSearchUrl,
  extractVideoCandidates,
  extractVideoCandidatesFromHtml,
  extractYtInitialData,
  findJsonObjectEnd,
  isValidVideoId,
  parseDuration
} from "../src/lib/youtube.js";

function htmlWithInitialData(data, marker = "var ytInitialData = ") {
  return `<html><body><script>${marker}${JSON.stringify(data)};</script></body></html>`;
}

const SEARCH_RESULTS_DATA = {
  contents: {
    twoColumnSearchResultsRenderer: {
      primaryContents: {
        sectionListRenderer: {
          contents: [
            {
              itemSectionRenderer: {
                contents: [
                  {
                    videoRenderer: {
                      videoId: "dQw4w9WgXcQ",
                      title: { runs: [{ text: "Rick Astley - Never Gonna Give You Up" }] },
                      ownerText: { runs: [{ text: "Rick Astley" }] },
                      lengthText: { simpleText: "3:33" }
                    }
                  },
                  {
                    videoRenderer: {
                      videoId: "dQw4w9WgXcQ",
                      title: { runs: [{ text: "Duplicate entry" }] },
                      lengthText: { simpleText: "3:33" }
                    }
                  },
                  {
                    videoRenderer: {
                      videoId: "abcdefghijk",
                      title: { simpleText: "Plain Title" },
                      shortBylineText: { runs: [{ text: "Some Channel" }] },
                      lengthText: { simpleText: "1:02:03" }
                    }
                  }
                ]
              }
            }
          ]
        }
      }
    }
  }
};

test("parseDuration handles mm:ss and h:mm:ss", () => {
  assert.equal(parseDuration("3:45"), 225);
  assert.equal(parseDuration("1:02:33"), 3753);
  assert.equal(parseDuration(" 0:59 "), 59);
  assert.equal(parseDuration("not a time"), null);
  assert.equal(parseDuration(""), null);
  assert.equal(parseDuration("3:75"), 255);
});

test("isValidVideoId accepts only 11-char YouTube ids", () => {
  assert.equal(isValidVideoId("dQw4w9WgXcQ"), true);
  assert.equal(isValidVideoId("short"), false);
  assert.equal(isValidVideoId("dQw4w9WgXcQ<script>"), false);
  assert.equal(isValidVideoId(undefined), false);
});

test("URL builders produce the expected targets", () => {
  assert.equal(buildY2mateUrl("dQw4w9WgXcQ"), "https://y2mate.gs/#dQw4w9WgXcQ/mp3");
  assert.equal(
    buildYoutubeSearchUrl("AC/DC Thunderstruck"),
    "https://www.youtube.com/results?search_query=AC%2FDC%20Thunderstruck&hl=en&gl=US"
  );
});

test("extractYtInitialData parses the var marker", () => {
  const data = { value: "ok" };
  assert.deepEqual(extractYtInitialData(htmlWithInitialData(data)), data);
});

test("extractYtInitialData parses the window[...] marker", () => {
  const data = { value: "ok" };
  const html = htmlWithInitialData(data, "window[\"ytInitialData\"] = ");
  assert.deepEqual(extractYtInitialData(html), data);
});

test("extractYtInitialData falls back to a loose assignment match", () => {
  const data = { value: "ok" };
  const html = `<script>ytInitialData = ${JSON.stringify(data)};</script>`;
  assert.deepEqual(extractYtInitialData(html), data);
});

test("extractYtInitialData returns null when absent or malformed", () => {
  assert.equal(extractYtInitialData("<html>nothing here</html>"), null);
  assert.equal(extractYtInitialData("var ytInitialData = {broken"), null);
});

test("findJsonObjectEnd ignores braces inside strings", () => {
  const json = "{\"text\":\"a } b { c\",\"nested\":{\"a\":1}}";
  const end = findJsonObjectEnd(json, 0);
  assert.equal(json.slice(0, end + 1), json);
});

test("extractVideoCandidates reads titles, channels and durations", () => {
  const candidates = extractVideoCandidates(htmlWithInitialData(SEARCH_RESULTS_DATA));

  assert.equal(candidates.length, 2);

  assert.deepEqual(candidates[0], {
    videoId: "dQw4w9WgXcQ",
    title: "Rick Astley - Never Gonna Give You Up",
    artist: "Rick Astley",
    duration: 213,
    lengthText: "3:33",
    thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  });

  assert.equal(candidates[1].title, "Plain Title");
  assert.equal(candidates[1].artist, "Some Channel");
  assert.equal(candidates[1].duration, 3723);
});

test("extractVideoCandidates falls back to raw videoId scraping", () => {
  const html = '<script>var player = {"videoId":"dQw4w9WgXcQ"};</script>';
  const candidates = extractVideoCandidatesFromHtml(html);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].videoId, "dQw4w9WgXcQ");
  assert.equal(candidates[0].duration, null);
});
