import test from "node:test";
import assert from "node:assert/strict";

import {
  MESSAGES,
  SUPPORTED_LANGUAGES,
  applyDomTranslations,
  resolveLanguage,
  t
} from "../src/lib/i18n.js";

test("resolveLanguage supports explicit en/es and auto browser locale fallback", () => {
  assert.deepEqual(SUPPORTED_LANGUAGES, ["auto", "en", "es"]);
  assert.equal(resolveLanguage("en", "es-AR"), "en");
  assert.equal(resolveLanguage("es", "en-US"), "es");
  assert.equal(resolveLanguage("auto", "es-419"), "es");
  assert.equal(resolveLanguage("auto", "es"), "es");
  assert.equal(resolveLanguage("auto", "en-GB"), "en");
  assert.equal(resolveLanguage("auto", "fr-FR"), "en");
  assert.equal(resolveLanguage("unknown", "es-ES"), "es");
});

test("MESSAGES.en and MESSAGES.es have identical key sets and non-empty strings", () => {
  const enKeys = Object.keys(MESSAGES.en).sort();
  const esKeys = Object.keys(MESSAGES.es).sort();

  assert.ok(enKeys.length > 100);
  assert.deepEqual(esKeys, enKeys);

  for (const key of enKeys) {
    assert.equal(typeof MESSAGES.en[key], "string", `en missing string for ${key}`);
    assert.equal(typeof MESSAGES.es[key], "string", `es missing string for ${key}`);
    assert.ok(MESSAGES.en[key].length > 0, `en empty for ${key}`);
    assert.ok(MESSAGES.es[key].length > 0, `es empty for ${key}`);

    // Verify placeholder parity ({count}, {min}, etc.) between en and es.
    const enTokens = [...MESSAGES.en[key].matchAll(/\{([a-zA-Z0-9_]+)\}/g)]
      .map((m) => m[1])
      .sort();
    const esTokens = [...MESSAGES.es[key].matchAll(/\{([a-zA-Z0-9_]+)\}/g)]
      .map((m) => m[1])
      .sort();
    assert.deepEqual(esTokens, enTokens, `Placeholder mismatch on key ${key}`);
  }
});

test("t interpolates parameters and falls back cleanly for unknown keys", () => {
  assert.equal(
    t("toast.ratingSaved", { rating: 5, label: "Artist - Song" }, "en"),
    "Rated 5/5 · Artist - Song"
  );
  assert.equal(
    t("toast.ratingSaved", { rating: 5, label: "Artist - Song" }, "es"),
    "Calificación 5/5 · Artist - Song"
  );
  assert.equal(t("nonexistent.key", {}, "es"), "nonexistent.key");
});

test("applyDomTranslations updates textContent, title, placeholder, aria-label and documentElement.lang", () => {
  const makeNode = (attrs) => {
    const map = new Map(Object.entries(attrs));
    return {
      textContent: "",
      getAttribute: (name) => map.get(name) ?? null,
      setAttribute: (name, value) => map.set(name, value)
    };
  };

  const textNode = makeNode({ "data-i18n": "popup.rankings" });
  const titleNode = makeNode({ "data-i18n-title": "popup.sidePanel" });
  const placeholderNode = makeNode({ "data-i18n-placeholder": "rankings.searchPlaceholder" });
  const ariaNode = makeNode({ "data-i18n-aria-label": "options.language" });

  const mockDoc = {
    documentElement: { lang: "en" },
    querySelectorAll(selector) {
      if (selector === "[data-i18n]") return [textNode];
      if (selector === "[data-i18n-title]") return [titleNode];
      if (selector === "[data-i18n-placeholder]") return [placeholderNode];
      if (selector === "[data-i18n-aria-label]") return [ariaNode];
      return [];
    }
  };

  applyDomTranslations(mockDoc, "es");
  assert.equal(mockDoc.documentElement.lang, "es");
  assert.equal(textNode.textContent, MESSAGES.es["popup.rankings"]);
  assert.equal(titleNode.getAttribute("title"), MESSAGES.es["popup.sidePanel"]);
  assert.equal(placeholderNode.getAttribute("placeholder"), MESSAGES.es["rankings.searchPlaceholder"]);
  assert.equal(ariaNode.getAttribute("aria-label"), MESSAGES.es["options.language"]);
});
