import test from "node:test";
import assert from "node:assert/strict";

import {
  detectTrackKind,
  extractTrackFromDetailPage,
  extractTrackFromRow,
  isDetailPagePath,
  parseTimeLabel
} from "../src/lib/dom-extract.js";

// Minimal DOM Element mock supporting tag/attribute/href-contains selectors used
// by dom-extract.js so extraction logic runs deterministically under `node --test`.
function h(tag, attrs = {}, children = []) {
  const attrMap = new Map(Object.entries(attrs));
  const childElements = [];
  const textParts = [];

  for (const child of children) {
    if (typeof child === "string") {
      textParts.push(child);
    } else if (child) {
      childElements.push(child);
    }
  }

  const node = {
    tagName: tag.toUpperCase(),
    parentElement: null,
    children: childElements,
    href: attrMap.get("href") || "",
    get textContent() {
      return [...textParts, ...childElements.map((c) => c.textContent)].join(" ");
    },
    getAttribute(name) {
      return attrMap.has(name) ? String(attrMap.get(name)) : null;
    },
    hasAttribute(name) {
      return attrMap.has(name);
    },
    matches(selector) {
      return selector
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .some((part) => matchesSingleSelector(node, part));
    },
    closest(selector) {
      let cur = node;
      while (cur) {
        if (cur.matches(selector)) {
          return cur;
        }
        cur = cur.parentElement;
      }
      return null;
    },
    querySelectorAll(selector) {
      const results = [];
      const visit = (target) => {
        for (const child of target.children) {
          if (child.matches(selector)) {
            results.push(child);
          }
          visit(child);
        }
      };
      visit(node);
      return results;
    },
    querySelector(selector) {
      return node.querySelectorAll(selector)[0] || null;
    }
  };

  for (const child of childElements) {
    child.parentElement = node;
  }

  return node;
}

function matchesSingleSelector(node, selector) {
  // Handle descendant selector like "main h1" or "#app-root h1"
  if (selector.includes(" ")) {
    const parts = selector.split(/\s+/);
    const leaf = parts.pop();
    if (!matchesAtom(node, leaf)) {
      return false;
    }
    let ancestor = node.parentElement;
    while (ancestor) {
      if (matchesAtom(ancestor, parts[parts.length - 1])) {
        return true;
      }
      ancestor = ancestor.parentElement;
    }
    return false;
  }
  return matchesAtom(node, selector);
}

function matchesAtom(node, atom) {
  if (atom.startsWith("#")) {
    return node.getAttribute("id") === atom.slice(1);
  }

  const attrOnly = /^\[([a-zA-Z0-9_-]+)(?:(\*=|=)['"]([^'"]+)['"](?:\s*i)?)?\]$/.exec(atom);
  if (attrOnly) {
    const [, attrName, op, expected] = attrOnly;
    if (!op) {
      return node.hasAttribute(attrName);
    }
    const actual = node.getAttribute(attrName) || "";
    return op === "*="
      ? actual.toLowerCase().includes(expected.toLowerCase())
      : actual.toLowerCase() === expected.toLowerCase();
  }

  const tagAndAttr = /^([a-zA-Z0-9]+)\[([a-zA-Z0-9_-]+)(?:(\*=|=)['"]([^'"]+)['"](?:\s*i)?)?\]$/.exec(
    atom
  );
  if (tagAndAttr) {
    const [, tag, attrName, op, expected] = tagAndAttr;
    if (node.tagName !== tag.toUpperCase()) {
      return false;
    }
    if (!op) {
      return node.hasAttribute(attrName);
    }
    const actual = node.getAttribute(attrName) || "";
    return op === "*="
      ? actual.toLowerCase().includes(expected.toLowerCase())
      : actual.toLowerCase() === expected.toLowerCase();
  }

  return node.tagName === atom.toUpperCase();
}

test("detectTrackKind and isDetailPagePath classify Music vs SFX URLs and rows", () => {
  assert.equal(detectTrackKind("https://artlist.io/royalty-free-music/song/123"), "music");
  assert.equal(detectTrackKind("https://artlist.io/sfx/track/whoosh-456"), "sfx");
  assert.equal(detectTrackKind(h("div", { "data-testid": "AudioRow" })), "sfx");
  assert.equal(detectTrackKind(h("div", { "data-testid": "music-row" })), "music");

  assert.equal(isDetailPagePath("/royalty-free-music/song/midnight-drive/123"), true);
  assert.equal(isDetailPagePath("/sfx/track/cinematic-hit/999"), true);
  assert.equal(isDetailPagePath("/royalty-free-music"), false);
  assert.equal(parseTimeLabel("3:45"), 225);
  assert.equal(parseTimeLabel("1:02:05"), 3725);
});

test("extractTrackFromRow extracts Music rows and deduplicates repeated artist links", () => {
  const row = h("div", { "data-testid": "music-row" }, [
    h("a", { href: "https://artlist.io/royalty-free-music/song/midnight-drive/10" }, [
      "  Midnight Drive "
    ]),
    h("a", { href: "https://artlist.io/royalty-free-music/artist/the-midnight" }, [
      "The Midnight"
    ]),
    h("a", { href: "https://artlist.io/royalty-free-music/artist/the-midnight" }, [
      "The Midnight"
    ]),
    h("span", {}, ["3:45"]),
    h("button", { "aria-label": "Download" }, [])
  ]);

  assert.deepEqual(extractTrackFromRow(row), {
    title: "Midnight Drive",
    artist: "The Midnight",
    duration: 225,
    url: "https://artlist.io/royalty-free-music/song/midnight-drive/10",
    kind: "music"
  });
});

test("extractTrackFromRow extracts SFX AudioRow items including fallback non-artist anchors", () => {
  const sfxRow = h("div", { "data-testid": "AudioRow" }, [
    h("a", { href: "https://artlist.io/sfx/item/cinematic-whoosh" }, ["Cinematic Whoosh"]),
    h("a", { href: "https://artlist.io/sfx/creator/boom-library" }, ["Boom Library"]),
    h("span", {}, ["0:07"]),
    h("button", { "aria-label": "Download" }, [])
  ]);

  assert.deepEqual(extractTrackFromRow(sfxRow), {
    title: "Cinematic Whoosh",
    artist: "Boom Library",
    duration: 7,
    url: "https://artlist.io/sfx/item/cinematic-whoosh",
    kind: "sfx"
  });
});

test("extractTrackFromDetailPage reads hero metadata while ignoring nested similar-track rows", () => {
  const doc = h("div", { id: "app-root" }, [
    h("main", {}, [
      h("h1", {}, ["Neon Horizon"]),
      h("a", { href: "https://artlist.io/royalty-free-music/artist/timecop1983" }, [
        "Timecop1983"
      ]),
      h("span", {}, ["0:00"]),
      h("span", {}, ["4:12"]),
      // Nested similar-tracks row that must NOT pollute the detail page extraction:
      h("div", { "data-testid": "music-row" }, [
        h("h1", {}, ["Other Similar Song"]),
        h("a", { href: "https://artlist.io/royalty-free-music/artist/other-artist" }, [
          "Other Artist"
        ]),
        h("span", {}, ["2:00"])
      ])
    ])
  ]);

  const extracted = extractTrackFromDetailPage(doc, {
    pathname: "/royalty-free-music/song/neon-horizon/777",
    href: "https://artlist.io/royalty-free-music/song/neon-horizon/777"
  });

  assert.deepEqual(extracted, {
    title: "Neon Horizon",
    artist: "Timecop1983",
    duration: 252,
    url: "https://artlist.io/royalty-free-music/song/neon-horizon/777",
    kind: "music"
  });
});
